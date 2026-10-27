import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';
import { verifierSession } from '@/lib/auth';
import { scrapeUrlSecurisee, UrlScrapeRefusee } from '@/lib/validationUrlScrape';
import { extrairePrixCandidats } from '@/lib/scrapePrix';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  const { searchParams } = new URL(request.url);
  const urlToScrape = searchParams.get('url');

  if (!urlToScrape) {
    return NextResponse.json({ error: 'Missing URL parameter', code: 'URL_INVALIDE' }, { status: 400 });
  }

  try {
    const html = await scrapeUrlSecurisee(urlToScrape);
    const $ = cheerio.load(html);

    // 1. Titre
    let title = $('title').text().trim();
    const h1 = $('h1').first().text().trim();
    if (h1 && h1.length > 5) {
      title = h1; // H1 est souvent plus précis que la balise title
    }

    // 2. Marque / Fabricant
    let brand = '';
    const metaBrand = $('meta[property="product:brand"], meta[itemprop="brand"], meta[name="brand"]').attr('content');
    if (metaBrand) {
      brand = metaBrand.trim();
    }

    // 3. Prix : renvoyer des candidats qualifiés, sans leur inventer une unité
    // ou une base fiscale. Le formulaire décide si un candidat est mappable.
    const prix_candidats = extrairePrixCandidats($);

    // 4. Déduire le fournisseur depuis l'URL
    let fournisseur = '';
    const lowerUrl = urlToScrape.toLowerCase();
    if (lowerUrl.includes('leroymerlin')) fournisseur = 'Leroy Merlin';
    else if (lowerUrl.includes('castorama')) fournisseur = 'Castorama';
    else if (lowerUrl.includes('bricoman')) fournisseur = 'Bricoman';
    else if (lowerUrl.includes('pointp')) fournisseur = 'Point.P';
    else if (lowerUrl.includes('dispano')) fournisseur = 'Dispano';
    else if (lowerUrl.includes('manomano')) fournisseur = 'ManoMano';

    // 5. Déduire les dimensions (depuis l'URL ou le Titre)
    let longueur_mm: number | null = null;
    let largeur_mm: number | null = null;
    let epaisseur_mm: number | null = null;

    const textToSearch = `${lowerUrl} ${title.toLowerCase()}`;
    
    // Pattern 1: L x W x Epaisseur (ex: 2500x1250x12 ou 2500 x 1250 x 12)
    const dim3 = textToSearch.match(/(\d+[.,]?\d*)\s*[x*-]\s*(\d+[.,]?\d*)\s*[x*-]\s*(\d+[.,]?\d*)/);
    if (dim3) {
      const v1 = parseFloat(dim3[1].replace(',', '.'));
      const v2 = parseFloat(dim3[2].replace(',', '.'));
      const v3 = parseFloat(dim3[3].replace(',', '.'));
      // On trie pour deviner: la plus petite est l'épaisseur, la plus grande la longueur
      const sorted = [v1, v2, v3].sort((a, b) => a - b);
      epaisseur_mm = sorted[0];
      largeur_mm = sorted[1];
      longueur_mm = sorted[2];
    } else {
      // Pattern 2: L x W (ex: 2500x1250)
      const dim2 = textToSearch.match(/(\d+[.,]?\d*)\s*[x*]\s*(\d+[.,]?\d*)/);
      if (dim2) {
        const v1 = parseFloat(dim2[1].replace(',', '.'));
        const v2 = parseFloat(dim2[2].replace(',', '.'));
        longueur_mm = Math.max(v1, v2);
        largeur_mm = Math.min(v1, v2);
      }
      
      // Pattern 3: Epaisseur seule (ex: ep-12mm, epaisseur 12, 12mm)
      const epMatch = textToSearch.match(/(?:ep|epaisseur|ép|épaisseur)\s*[-_:]?\s*(\d+[.,]?\d*)/);
      if (epMatch) {
        epaisseur_mm = parseFloat(epMatch[1].replace(',', '.'));
      } else if (!epaisseur_mm) {
         // Si on voit "12mm" tout seul qui n'est pas dans un LxW
         const mmMatch = textToSearch.match(/(?<![x*\d])(\d+[.,]?\d*)\s*mm/);
         if (mmMatch) epaisseur_mm = parseFloat(mmMatch[1].replace(',', '.'));
      }
    }

    // Normalisation basique (si on lit "2.5x1.25", ce sont des mètres -> mm)
    if (longueur_mm !== null && longueur_mm > 0 && longueur_mm < 10) longueur_mm *= 1000;
    if (largeur_mm !== null && largeur_mm > 0 && largeur_mm < 10) largeur_mm *= 1000;
    // Si c'est en cm (entre 10 et 100) -> mm
    if (longueur_mm !== null && longueur_mm >= 10 && longueur_mm <= 100) longueur_mm *= 10;
    if (largeur_mm !== null && largeur_mm >= 10 && largeur_mm <= 100) largeur_mm *= 10;

    
    // 6. Extraction de la description (Résumé court)
    let description = $('meta[name="description"], meta[property="og:description"]').attr('content') || '';
    description = description.trim();

    // 7. Enrichissement de la designation_devis (Normes, DTU, ACERMI...)
    const allText = $('body').text().replace(/\s+/g, ' ');
    const dtuMatch = allText.match(/(DTU\s*\d+\.\d+)/gi);
    const acermiMatch = allText.match(/(ACERMI\s*[\w-]+)/gi);
    const classeMatch = allText.match(/(classe\s*d['']?emploi\s*\S+|classe\s*\d(?:\.\d)?)/gi);
    const normeMatch = allText.match(/(NF\s*EN\s*\S+|norme\s*\S+)/gi);

    const specs = [
      ...(dtuMatch || []),
      ...(acermiMatch || []),
      ...(classeMatch || []),
      ...(normeMatch || [])
    ].map(s => s.trim().toUpperCase());
    
    const uniqueSpecs = [...new Set(specs)];
    
    let designation_devis = title + (brand ? ` de marque ${brand}` : '') + '.';
    if (uniqueSpecs.length > 0) {
      designation_devis += ` Caractéristiques techniques et normes conformes : ${uniqueSpecs.join(', ')}.`;
    }

    // 8. Extraction du code RAL
    let code_ral = null;
    const ralMatch = allText.match(/RAL\s*\d{4}/i);
    if (ralMatch) {
      code_ral = ralMatch[0].toUpperCase();
    } else {
      const searchColorText = (title + " " + description).toLowerCase();
      if (searchColorText.includes('gris anthracite') || searchColorText.includes('anthracite')) {
        code_ral = 'RAL 7016';
      } else if (searchColorText.includes('blanc pur') || searchColorText.includes('blanc')) {
        code_ral = 'RAL 9016';
      } else if (searchColorText.includes('noir profond') || searchColorText.includes('noir')) {
        code_ral = 'RAL 9005';
      }
    }

    // Page lue mais sans donnée produit exploitable (page rendue en JavaScript,
    // page de vérification, etc.) : signalé sans présumer de la cause.
    const avertissements: string[] = [];
    if (!h1 && !brand && prix_candidats.length === 0) {
      avertissements.push('PAGE_SANS_DONNEES_PRODUIT');
    }

    return NextResponse.json({
      avertissements,
      designation: title,
      fabricant: brand,
      fournisseur: fournisseur,
      prix_candidats,
      longueur_mm,
      largeur_mm,
      epaisseur_mm,
      description,
      designation_devis,
      code_ral
    });

  } catch (error) {
    if (error instanceof UrlScrapeRefusee) {
      console.warn('[SSRF Scrape] Requête refusée :', {
        statut: error.statut,
        raison: error.messageTechnique,
      });
      return NextResponse.json({ error: error.message, code: error.code }, { status: error.statut });
    }
    console.error('Scraping error:', error instanceof Error ? error.message : 'Erreur inconnue');
    return NextResponse.json(
      { error: 'An error occurred during scraping', code: 'ERREUR_INTERNE' },
      { status: 500 },
    );
  }
}

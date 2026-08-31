import { NextResponse } from 'next/server';
import * as cheerio from 'cheerio';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const urlToScrape = searchParams.get('url');

  if (!urlToScrape) {
    return NextResponse.json({ error: 'Missing URL parameter' }, { status: 400 });
  }

  try {
    const res = await fetch(urlToScrape, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/115.0.0.0 Safari/537.36',
        'Accept-Language': 'fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7',
      },
    });

    if (!res.ok) {
      return NextResponse.json({ error: 'Failed to fetch the URL' }, { status: 500 });
    }

    const html = await res.text();
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

    // 3. Prix
    let price: number | null = null;
    
    // A) Chercher dans les données structurées JSON-LD (Standard E-commerce SEO)
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html() || '{}');
        // Parfois c'est un tableau de JSON-LD
        const items = Array.isArray(json) ? json : [json];
        for (const item of items) {
          if (item['@type'] === 'Product' && item.offers) {
            if (item.offers.price) {
              price = parseFloat(item.offers.price);
              break;
            } else if (item.offers[0] && item.offers[0].price) {
              price = parseFloat(item.offers[0].price);
              break;
            }
          }
        }
      } catch (e) {
        // Ignorer les erreurs de parse JSON
      }
    });

    // B) Si pas trouvé, chercher dans les meta balises standard
    if (!price) {
      const metaPrice = $('meta[property="product:price:amount"]').attr('content');
      if (metaPrice) price = parseFloat(metaPrice.replace(',', '.'));
    }
    
    // C) Si toujours pas, chercher dans d'autres meta courantes
    if (!price) {
      const metaPrice2 = $('meta[itemprop="price"]').attr('content');
      if (metaPrice2) price = parseFloat(metaPrice2.replace(',', '.'));
    }

    // D) Fallback heuristique avancé (Leroy Merlin, Casto, etc...)
    if (!price) {
      // Cherche dans des classes de prix typiques (ex: 'price', 'prix', 'amount')
      const priceTexts: string[] = [];
      $('[class*="price"], [class*="prix"], [data-price]').each((_, el) => {
        const text = $(el).text().trim();
        const dataPrice = $(el).attr('data-price');
        if (dataPrice) priceTexts.push(dataPrice);
        if (text) priceTexts.push(text);
      });
      
      // On fouille les textes trouvés pour un format de prix avec euro
      for (const text of priceTexts) {
        // Ex: 15,99 € ou 15.99 ou 15€99
        const match = text.match(/(\d+)\s*[.,€]\s*(\d{2})/);
        if (match) {
           // Reconstruit le nombre
           price = parseFloat(`${match[1]}.${match[2]}`);
           break;
        }
      }
    }

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

    return NextResponse.json({
      designation: title,
      fabricant: brand,
      fournisseur: fournisseur,
      prix_ttc: price,
      longueur_mm,
      largeur_mm,
      epaisseur_mm
    });

  } catch (error) {
    console.error('Scraping error:', error);
    return NextResponse.json({ error: 'An error occurred during scraping' }, { status: 500 });
  }
}

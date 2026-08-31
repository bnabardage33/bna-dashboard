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
    // Recherche heuristique d'un prix dans la page (très basique)
    let price: number | null = null;
    
    // On cherche d'abord dans les balises meta de type produit
    const metaPrice = $('meta[property="product:price:amount"]').attr('content');
    if (metaPrice) {
      price = parseFloat(metaPrice.replace(',', '.'));
    } else {
      // Sinon on cherche dans le texte visible
      const bodyText = $('body').text();
      // Cherche par ex: " 15,99 €" ou " 15.99€"
      const priceMatch = bodyText.match(/(\d+[.,]\d{2})\s*€/);
      if (priceMatch) {
        price = parseFloat(priceMatch[1].replace(',', '.'));
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

    return NextResponse.json({
      designation: title,
      fabricant: brand,
      fournisseur: fournisseur,
      prix_ttc: price, // On suppose souvent que les prix publics sont TTC
    });

  } catch (error) {
    console.error('Scraping error:', error);
    return NextResponse.json({ error: 'An error occurred during scraping' }, { status: 500 });
  }
}

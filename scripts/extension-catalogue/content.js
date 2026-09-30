// Script de page (isolated world) : extrait les données de la fiche produit.
//
// Il ne fait QUE lire le DOM et répondre au popup. Il n'écrit rien en base :
// la sauvegarde passe par la page catalogue de l'app, qui connaît la session
// et la ligne à créer. C'est la même cible que le favori, donc le RLS est
// respecté par construction.

function texteMeta(selecteurs) {
  for (const sel of selecteurs) {
    const el = document.querySelector(sel);
    const t = el && (el.getAttribute('content') || el.innerText || '');
    if (t && t.trim()) return t.trim();
  }
  return '';
}

// Le prix fiable est presque toujours dans le JSON-LD (schema.org Product).
// Surveiller chaque élément pour un "€" — l'ancienne méthode — prend le
// premier prix rencontré sur la page : un prix barré, un prix de livraison,
// ou le prix d'un article recommandé.
function prixDepuisJsonLd() {
  const scripts = document.querySelectorAll('script[type="application/ld+json"]');
  for (const s of scripts) {
    let data;
    try { data = JSON.parse(s.textContent); } catch { continue; }
    const piles = Array.isArray(data) ? data : [data];
    for (const noeud of piles) {
      const trouve = chercherOffre(noeud);
      if (trouve) return trouve;
    }
  }
  return '';
}

function chercherOffre(noeud, profondeur = 0) {
  if (!noeud || typeof noeud !== 'object' || profondeur > 6) return '';
  for (const cle of ['offers', 'priceSpecification', 'lowPrice']) {
    if (noeud[cle]) {
      const o = noeud[cle];
      const valeur = typeof o === 'object' ? (o.price ?? o.lowPrice) : o;
      if (typeof valeur === 'string' && /\d/.test(valeur)) return valeur.replace(',', '.');
      if (typeof valeur === 'number') return String(valeur);
    }
  }
  // parcours en profondeur (@graph, nested)
  for (const v of Object.values(noeud)) {
    if (Array.isArray(v)) {
      for (const item of v) {
        const r = chercherOffre(item, profondeur + 1);
        if (r) return r;
      }
    } else if (v && typeof v === 'object') {
      const r = chercherOffre(v, profondeur + 1);
      if (r) return r;
    }
  }
  return '';
}

// Repli : métadonnées meta, puis le texte du body (le chemin de ton favori).
function prixParRepli() {
  const meta = texteMeta([
    'meta[property="product:price:amount"]',
    'meta[itemprop="price"]',
    'meta[property="og:price:amount"]',
  ]);
  if (meta) return meta.replace(',', '.');
  const m = document.body && document.body.innerText.match(/(\d+[.,]\d{2})\s*€/);
  return m ? m[1].replace(',', '.') : '';
}

function description() {
  const meta = texteMeta([
    'meta[name="description"]',
    'meta[property="og:description"]',
  ]);
  if (meta) return meta;
  // description courte = souvent le format "Laine de roche 100 mm - 1,20 m²"
  for (const sel of ['[itemprop="description"]', '.product-description', '#description']) {
    const el = document.querySelector(sel);
    if (el && el.innerText && el.innerText.trim().length < 400) return el.innerText.trim();
  }
  return '';
}

function reference() {
  return texteMeta([
    'meta[itemprop="sku"]',
    'meta[property="product:retailer_item_id"]',
    'meta[name="reference"]',
  ]);
}

function image() {
  return texteMeta(['meta[property="og:image"]', 'meta[itemprop="image"]']);
}

function fabricant() {
  return texteMeta([
    'meta[property="product:brand"]',
    'meta[itemprop="brand"]',
    'meta[name="manufacturer"]',
  ]);
}

function unite() {
  // Détecte l'unité de vente pour ne pas tout mettre en "U".
  const corps = (document.body && document.body.innerText) || '';
  if (/\b(m²|m2)\b/i.test(corps)) return 'm²';
  if (/\b(ml|mètre linéaire)\b/i.test(corps)) return 'ml';
  if (/\b(pièce|pièce|sachet|rouleau|panneau|plaque|lame|barre)\b/i.test(corps)) return 'Pièce';
  if (/\b(kg|kilo)\b/i.test(corps)) return 'kg';
  if (/\b(litre|l)\b/i.test(corps)) return 'L';
  return 'U';
}

function fournisseurDepuisUrl(url) {
  const u = (url || '').toLowerCase();
  if (u.includes('leroymerlin')) return 'Leroy Merlin';
  if (u.includes('castorama')) return 'Castorama';
  if (u.includes('bricoman')) return 'Bricoman';
  if (u.includes('bricomarche')) return 'BricoMarché';
  if (u.includes('pointp')) return 'Point.P';
  if (u.includes('dispano') || u.includes('panofrance')) return 'Dispano / Panofrance';
  if (u.includes('manomano')) return 'ManoMano';
  if (u.includes('barillet')) return 'Barillet';
  if (u.includes('gedimat')) return 'Gedimat';
  if (u.includes('systov')) return 'Systov';
  if (u.includes('laboutiquedubricoleur') || u.includes('lacoop')) return 'La Coopérative du Bricoleur';
  if (u.includes('cetim') || u.includes('cetim.fr')) return 'Cetim';
  return '';
}

function extractData() {
  // Désignation : h1 > og:title > title. h1 gagne car og:title est
  // souvent pollué par le suffixe de marque.
  let designation = '';
  const h1 = document.querySelector('h1');
  if (h1 && h1.innerText.trim()) designation = h1.innerText.trim();
  if (!designation) designation = texteMeta(['meta[property="og:title"]', 'meta[name="twitter:title"]']);
  if (!designation) designation = (document.title || '').trim();

  const prix = prixDepuisJsonLd() || prixParRepli();

  return {
    designation,
    prix,
    fabricant: fabricant(),
    description: description(),
    reference: reference(),
    image: image(),
    unite: unite(),
    fournisseur: fournisseurDepuisUrl(window.location.href),
    url: window.location.href,
    host: window.location.hostname,
  };
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'extract') {
    try {
      sendResponse(extractData());
    } catch (e) {
      sendResponse({ error: String(e && e.message ? e.message : e) });
    }
  }
});

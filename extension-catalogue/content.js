// Ce script s'exécute sur la page web active

function extractData() {
  // 1. Essayer de récupérer le titre/désignation
  let title = document.title;
  const h1 = document.querySelector('h1');
  if (h1) {
    title = h1.innerText.trim();
  }

  // 2. Essayer de trouver un prix (heuristique basique)
  // Cherche des éléments contenant "€"
  let price = "";
  const allElements = document.querySelectorAll('*');
  for (let el of allElements) {
    // Si l'élément contient le symbole euro et a peu de texte (pour cibler les prix)
    if (el.innerText && el.innerText.includes('€') && el.innerText.length < 15) {
        // On vérifie que c'est bien un format de prix
        const match = el.innerText.match(/(\d+[\.,]\d{1,2})/);
        if (match) {
            price = match[1];
            break; // On prend le premier trouvé
        }
    }
  }

  // 3. Essayer de déduire le fabricant/marque (très basique)
  let brand = "";
  const metaBrand = document.querySelector('meta[property="product:brand"], meta[itemprop="brand"]');
  if (metaBrand) {
      brand = metaBrand.getAttribute('content') || "";
  }

  // Retourner les données trouvées
  return {
    designation: title,
    pu_ht: price,
    fabricant: brand,
    url: window.location.href
  };
}

// Écouter les messages venant du popup
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "extract") {
    const data = extractData();
    sendResponse(data);
  }
});

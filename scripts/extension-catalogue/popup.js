// POPUP — pré-remplit un formulaire de relecture, puis ouvre la page
// catalogue de l'app pour l'enregistrement.
//
// IMPORTANT — pourquoi on n'écrit plus dans Supabase ici :
// une écriture directe depuis le navigateur utilise la clé anon, et
// `catalogue_ouvrages` n'a pas de colonne `entreprise_id`. Depuis la mise en
// place du RLS multi-entreprise (22/09), tout insert anon est refusé :
//     42501 — new row violates row-level security policy
// L'extension échouait donc sur TOUS les sites, pas seulement ceux qui
// bloquent le scraping. On délègue l'enregistrement à l'app, qui possède la
// session et la ligne à créer. C'est exactement le chemin du favori.

const APP_URL = 'https://bna-dashboard.vercel.app';
const CLE_APPLICATION = 'catalogue_ouvrages';

function el(id) {
  return document.getElementById(id);
}

function afficherStatut(texte, classe = '') {
  const s = el('status');
  if (!s) return;
  s.textContent = texte;
  s.className = classe;
}

// Remplit le formulaire avec ce que la page a donné.
function remplir(d) {
  if (el('designation')) el('designation').value = d.designation || '';
  if (el('fabricant')) el('fabricant').value = d.fabricant || '';
  if (el('fournisseur')) el('fournisseur').value = d.fournisseur || '';
  if (el('reference')) el('reference').value = d.reference || '';
  if (el('description')) el('description').value = d.description || '';
  if (el('unite') && d.unite && d.unite !== 'U') {
    // n'écrase la valeur que si l'option existe dans le <select>
    const existe = [...el('unite').options].some((o) => o.value === d.unite);
    if (existe) el('unite').value = d.unite;
  }
  if (el('unite_note')) {
    el('unite_note').textContent = d.unite === 'U'
      ? 'Unité inconnue : « U » est la valeur de repli de l’extracteur et n’est pas transmise.'
      : 'Unité candidate issue de la fiche — à vérifier.';
  }

  if (el('prix_candidat')) el('prix_candidat').value = d.prix || '';

  // Dimensions trouvées dans le titre ou la description.
  if (el('epaisseur_mm')) {
    const texte = `${d.designation || ''} ${d.description || ''}`;
    const m = texte.match(/(?:ep|epaisseur|ép|épaisseur)\s*[-_:]?\s*(\d+[.,]?\d*)/i)
      || texte.match(/(?<![x*\d])(\d+[.,]?\d*)\s*mm/i);
    el('epaisseur_mm').value = m ? m[1].replace(',', '.') : '';
  }

  afficherStatut(
    d.prix ? 'Données trouvées — vérifie puis ouvre l\'application.' : 'Prix non trouvé — vérifie à la main.',
    d.prix ? 'ok' : 'warn'
  );
}

// Demande les données à la page active et pré-remplit.
function auDemarrage() {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (!tabs || !tabs[0]) {
      afficherStatut('Aucun onglet actif.', 'error');
      return;
    }
    chrome.tabs.sendMessage(tabs[0].id, { action: 'extract' }, (reponse) => {
      const err = chrome.runtime.lastError;
      if (err || !reponse) {
        // Cause la plus fréquente : la page était déjà ouverte avant
        // l'installation de l'extension, donc content.js n'y a jamais été
        // injecté. Recharger la page règle le problème.
        afficherStatut(
          'Extension inactive sur cet onglet — recharge la page (F5) puis réessaie.',
          'error'
        );
        return;
      }
      if (reponse.error) {
        afficherStatut('Erreur de lecture : ' + reponse.error, 'error');
        return;
      }
      remplir(reponse);
    });
  });
}

// Ouvre l'app avec les valeurs du formulaire.
// On passe par les memes paramètres que le favori (page.tsx:217-219) :
// l'app refait la conversion TTC/HT, détecte les dimensions et le
// fournisseur, puis ouvre sa modale de saisie pour validation.
function ouvrirDansLApp(catalogue) {
  const designation = el('designation') ? el('designation').value.trim() : '';
  if (!designation) {
    afficherStatut('La désignation est obligatoire.', 'error');
    return;
  }
  const params = new URLSearchParams({
    importUrl: currentUrl || '',
    importTitle: designation,
  });
  const candidats = {
    importPrice: el('prix_candidat')?.value.trim() || '',
    importFabricant: el('fabricant')?.value.trim() || '',
    importReference: el('reference')?.value.trim() || '',
    importUnite: el('unite')?.value.trim() || '',
    importFournisseur: el('fournisseur')?.value.trim() || '',
  };
  for (const [cle, valeur] of Object.entries(candidats)) {
    if (valeur) params.set(cle, valeur);
  }
  const chemin = catalogue === 'terrasse'
    ? '/bureau/catalogue-terrasse'
    : '/bureau/catalogue';
  chrome.tabs.create({ url: `${APP_URL}${chemin}?${params.toString()}` });
  afficherStatut('Ouverture de l\'application…', 'ok');
}

let currentUrl = '';
chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
  if (tabs && tabs[0]) currentUrl = tabs[0].url || '';
});
auDemarrage();

el('importBardageBtn')?.addEventListener('click', () => ouvrirDansLApp('bardage'));
el('importTerrasseBtn')?.addEventListener('click', () => ouvrirDansLApp('terrasse'));

document.addEventListener('DOMContentLoaded', auDemarrage);

// Remplacez ces valeurs par celles de votre fichier .env.local
const SUPABASE_URL = "https://onhygmsxfdjkcjjnhabo.supabase.co";
const SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im9uaHlnbXN4ZmRqa2Nqam5oYWJvIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODY0MzA4MTksImV4cCI6MjEwMjAwNjgxOX0._s08ESsY5jVNkCBUaJxTAt-IaupseSmRhOa4YVA6MS4";

// Quand le popup s'ouvre, on demande au script de la page de nous envoyer les données trouvées
chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
  chrome.tabs.sendMessage(tabs[0].id, {action: "extract"}, function(response) {
    if (response) {
      document.getElementById('designation').value = response.designation || "";
      document.getElementById('pu_ht').value = response.pu_ht || "";
      document.getElementById('fabricant').value = response.fabricant || "";
      
      // On peut aussi essayer de deviner le fournisseur en fonction de l'URL
      if (response.url) {
        if (response.url.includes("dispano")) document.getElementById('fournisseur').value = "Dispano";
        else if (response.url.includes("pointp")) document.getElementById('fournisseur').value = "Point.P";
        else if (response.url.includes("barillet")) document.getElementById('fournisseur').value = "Barillet";
      }
    }
  });
});

document.getElementById('saveBtn').addEventListener('click', async () => {
  const statusEl = document.getElementById('status');
  statusEl.textContent = "Enregistrement...";
  statusEl.className = "";

  const pu_ht_str = document.getElementById('pu_ht').value.replace(',', '.');
  const pu_ht = parseFloat(pu_ht_str) || 0;
  const prix_ttc = parseFloat((pu_ht * 1.2).toFixed(2));
  const epaisseur = document.getElementById('epaisseur_mm').value;

  const payload = {
    categorie: document.getElementById('categorie').value,
    famille_label: document.getElementById('famille_label').value || "Import Web",
    designation: document.getElementById('designation').value,
    fabricant: document.getElementById('fabricant').value || null,
    fournisseur: document.getElementById('fournisseur').value || null,
    code_decor: document.getElementById('code_decor').value || null,
    unite: document.getElementById('unite').value,
    pu_ht: pu_ht,
    prix_ttc: prix_ttc,
    // On met l'épaisseur dans le nouveau format ou l'ancien si besoin
    epaisseur_mm: epaisseur ? parseFloat(epaisseur) : null,
    dimensions_disponibles: epaisseur ? [{ epaisseur_mm: parseFloat(epaisseur) }] : []
  };

  try {
    const response = await fetch(`${SUPABASE_URL}/rest/v1/catalogue_ouvrages`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'apikey': SUPABASE_KEY,
        'Authorization': `Bearer ${SUPABASE_KEY}`,
        'Prefer': 'return=minimal'
      },
      body: JSON.stringify(payload)
    });

    if (response.ok) {
      statusEl.textContent = "✔ Ajouté avec succès !";
      statusEl.className = "success";
      setTimeout(() => window.close(), 1500);
    } else {
      const errorData = await response.json();
      console.error(errorData);
      statusEl.textContent = "Erreur: " + (errorData.message || "Impossible d'ajouter");
      statusEl.className = "error";
    }
  } catch (error) {
    console.error("Erreur réseau:", error);
    statusEl.textContent = "Erreur de connexion";
    statusEl.className = "error";
  }
});

const fs = require('fs');
const path = 'app/bureau/sav/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

// Update fetch to include client_id and adresse_chantier
content = content.replace('select("id, nom, clients(nom)")', 'select("id, nom, client_id, adresse_chantier, clients(id, nom, societe)")');
content = content.replace('chantiers(nom, clients(nom))', 'chantiers(nom, client_id, adresse_chantier, clients(id, nom, societe))');

// Find the generation logic inside the component
const fnToAdd = `
  const handleGenerateDevis = async () => {
    if (!ticket.chantiers) return alert("Veuillez sélectionner et enregistrer le chantier d'abord.");
    
    const client_id = ticket.chantiers.client_id || ticket.chantiers.clients?.id;
    if (!client_id) return alert("Client introuvable sur ce chantier.");

    setSaving(true);
    const numero = "SAV-" + Math.floor(1000 + Math.random() * 9000);
    
    // Matériel + 37% de marge (indicatif)
    const lignes = [
      {
        designation: "Intervention SAV Hors Garantie (" + (ticket.type_sinistre || "Divers") + ")",
        description: ticket.description || "Travaux de reprise et main d'oeuvre",
        qte: 1,
        unite: "Forfait",
        pu_ht: 0 // Le tarif exact avec la marge sera à saisir par l'utilisateur
      }
    ];

    const payload = {
      numero,
      client_id,
      chantier_id: ticket.chantier_id,
      objet: "Intervention SAV - " + (ticket.chantiers.nom || ""),
      adresse_chantier: ticket.chantiers.adresse_chantier || "",
      type_travaux: "SAV",
      validite_jours: 30,
      delai_jours: 15,
      acompte_pct: 30,
      tva_pct: 20,
      statut: "brouillon",
      lignes
    };

    const { data, error } = await supabase.from("devis").insert(payload).select().single();
    setSaving(false);

    if (error) {
      console.error(error);
      alert("Erreur lors de la création du devis.");
    } else {
      alert("Devis brouillon " + numero + " créé avec succès ! Retrouvez-le dans l'onglet Devis.");
      router.push("/bureau/devis-factures");
    }
  };
`;

content = content.replace('const saveTicket = async () => {', fnToAdd + '\n\n  const saveTicket = async () => {');

// Attach to button
const oldBtn = '<button className="bg-amber-500 hover:bg-amber-400 text-slate-900 px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2">\n                <FileCheck size={18} /> Générer Devis (+37%)\n              </button>';
const newBtn = '<button onClick={handleGenerateDevis} disabled={saving} className="bg-amber-500 hover:bg-amber-400 text-slate-900 px-5 py-2.5 rounded-xl text-sm font-bold shadow-lg shadow-amber-500/20 transition-all flex items-center gap-2 disabled:opacity-50">\n                {saving ? <Loader2 size={18} className="animate-spin" /> : <FileCheck size={18} />} Générer Devis (+37%)\n              </button>';

content = content.replace(oldBtn, newBtn);

fs.writeFileSync(path, content);

// ⚠️ ARCHIVÉ le 2026-09-24 — décision produit (PLAN_EXECUTION_A_G.md, §A)
// Ne plus exécuter. Cible la table legacy `articles` (0 ligne, doublon de
// `catalogue_ouvrages`). Décision : aucune colonne `reference` ne sera créée
// dans `catalogue_ouvrages` pour maintenir ce flux. Un futur import vers le
// catalogue actif devra être réécrit (mapping designation, pu_ht, fournisseur…)
// et validé séparément.

import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import fs from 'fs';

dotenv.config({ path: '.env.local' });

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseKey) {
  console.error("❌ Variables d'environnement Supabase manquantes dans .env.local");
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function importArticles() {
  if (!fs.existsSync('dispano.json')) {
    console.error("❌ Fichier dispano.json introuvable. Colle ton JSON dedans !");
    process.exit(1);
  }

  const rawData = fs.readFileSync('dispano.json', 'utf-8');
  const articles = JSON.parse(rawData);

  console.log(`📦 Injection de ${articles.length} articles Dispano / Panofrance dans Supabase...`);

  // Structuration des données pour la table articles/catalogue
  const formattedData = articles.map(a => {
    // Conversion TTC -> HT (TVA 20%)
    const prixHT = a.prix_ttc ? Number((a.prix_ttc / 1.20).toFixed(2)) : null;

    // Parsing rapide de l'épaisseur et dimensions depuis la désignation
    const epaisseur = a.designation.match(/(\d+([.,]\d+)?)\s*mm/i)?.[1] || null;
    const dimensions = a.designation.match(/(\d+x\d+([.,]\d+)?(cm|mm)?)/i)?.[0] || null;

    return {
      reference: a.reference,
      designation: a.designation,
      prix_ht: prixHT,
      prix_ttc: a.prix_ttc,
      epaisseur_mm: epaisseur ? parseFloat(epaisseur.replace(',', '.')) : null,
      dimensions: dimensions,
      fournisseur: 'Dispano / Panofrance',
      updated_at: new Date().toISOString()
    };
  });

  const { data, error } = await supabase
    .from('articles') // Remplace par le nom de ta table (ex: catalogue_articles)
    .upsert(formattedData, { onConflict: 'reference' });

  if (error) {
    console.error("❌ Erreur Supabase :", error.message);
  } else {
    console.log(`✅ Importation réussie ! ${formattedData.length} articles insérés ou mis à jour.`);
  }
}

importArticles();

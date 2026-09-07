import { supabase } from "@/lib/supabase";
import type { FactureFinance, CommandeFinance, DepenseFinance } from "@/types/finance";
const getMonthRange = (mois: string) => {
  const [year, month] = mois.split("-").map(Number);
  const startDate = `${mois}-01T00:00:00.000Z`;
  const lastDay = new Date(year, month, 0).getDate();
  const endDate = `${mois}-${lastDay.toString().padStart(2, "0")}T23:59:59.999Z`;
  return { startDate, endDate };
};

function formatCSV(rows: (string | number)[][]): string {
  return rows
    .map(row => 
      row.map(v => `"${(v || "").toString().replace(/"/g, '""')}"`).join(";")
    )
    .join("\n");
}

export async function genererExportComptaCSV(mois: string) {
  const { startDate, endDate } = getMonthRange(mois);

  // 1. Fetch Ventes (Factures)
  const { data: factures } = await supabase
    .from("factures")
    .select("*, clients(nom)")
    .gte("date_emission", startDate)
    .lte("date_emission", endDate)
    .neq("statut", "annulee");

  // 2. Fetch Achats (Commandes)
  const { data: achats } = await supabase
    .from("commandes")
    .select("*, fournisseurs(nom)")
    .gte("date", startDate)
    .lte("date", endDate);
    
  // 3. Fetch Dépenses Chantier (depenses_chantier)
  const { data: depenses } = await supabase
    .from("depenses_chantier")
    .select("*, fournisseurs(nom)")
    .gte("date", startDate)
    .lte("date", endDate);

  // Map to common format
  const rows: (string | number)[][] = [];
  rows.push([
    "Date",
    "Journal",
    "Référence",
    "Tiers",
    "Libellé",
    "Montant HT",
    "Montant TVA",
    "Montant TTC",
    "Taux TVA (%)"
  ]);

const facturesList = (factures ?? []) as (FactureFinance & { clients?: { nom: string } })[];
  const achatsList = (achats ?? []) as (CommandeFinance & { fournisseurs?: { nom: string } })[];
  const depensesList = (depenses ?? []) as (DepenseFinance & { fournisseurs?: { nom: string } })[];

  // Map to common format
  const rows: (string | number)[][] = [];
  rows.push([
    "Date",
    "Journal",
    "Référence",
    "Tiers",
    "Libellé",
    "Montant HT",
    "Montant TVA",
    "Montant TTC",
    "Taux TVA (%)"
  ]);

  facturesList.forEach((f) => {
    rows.push([
      new Date(f.date_emission).toLocaleDateString("fr-FR"),
      "VENTES",
      f.numero || f.id.substring(0, 8),
      f.clients?.nom || "Client Divers",
      `Facture ${f.statut}`,
      (f.montant_ht || 0).toFixed(2),
      (f.montant_tva || ((f.montant_ht || 0) * (f.taux_tva || 20) / 100)).toFixed(2),
      (f.montant_ttc || ((f.montant_ht || 0) * (1 + (f.taux_tva || 20) / 100))).toFixed(2),
      f.taux_tva || 20
    ]);
  });

  if (achatsList) {
    achatsList.forEach((a) => {
      rows.push([
        new Date(a.date).toLocaleDateString("fr-FR"),
        "ACHATS",
        a.numero || a.id.substring(0, 8),
        a.fournisseurs?.nom || "Fournisseur Divers",
        "Commande Fournisseur",
        (a.montant_ht || 0).toFixed(2),
        (a.montant_tva || 0).toFixed(2),
        (a.montant_ttc || a.montant_ht || 0).toFixed(2),
        a.taux_tva || 20
      ]);
    });
  }
   
  depensesList.forEach((d) => {
    const ht = d.montant_ht || 0;
    const tvaPct = d.taux_tva || 20;
    const tva = ht * (tvaPct / 100);
    const ttc = ht + tva;
    
    rows.push([
      new Date(d.date).toLocaleDateString("fr-FR"),
      "ACHATS",
      d.id.substring(0, 8),
      d.fournisseurs?.nom || "Autre",
      `Dépense ${d.nature.replace("_", " ")}`,
      ht.toFixed(2),
      tva.toFixed(2),
      ttc.toFixed(2),
      tvaPct
    ]);
  });

  // BOM for Excel to recognize UTF-8 correctly
  const BOM = "\uFEFF";
  const csvContent = BOM + formatCSV(rows);
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  
  const link = document.createElement("a");
  link.href = url;
  link.setAttribute("download", `Export_Compta_BNA_${mois}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

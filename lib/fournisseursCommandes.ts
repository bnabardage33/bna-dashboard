export type MetierChantier = "bardage" | "terrasse" | "cloture";

export const SPECIALITES_FOURNISSEUR = [
  "Bardage / ITE",
  "Terrasse & Mobile",
  "Clôture / Portillons",
  "Quincaillerie / Visserie",
  "Métal / Alu",
  "Bois / Composite",
  "Autre",
] as const;

export type LigneImportQuantitatif = {
  designation: string;
  quantite: number;
  unite: string;
  pu_ht?: number;
};

export function normaliserMetier(metier: string | null | undefined): MetierChantier {
  if (metier === "terrasse" || metier === "cloture") return metier;
  return "bardage";
}

export function badgeMetierConfig(metier: string | null | undefined): {
  metier: MetierChantier;
  label: string;
  badgeClass: string;
} {
  const m = normaliserMetier(metier);
  if (m === "terrasse") {
    return {
      metier: m,
      label: "Terrasse",
      badgeClass: "border-amber-200 bg-amber-50 text-amber-800",
    };
  }
  if (m === "cloture") {
    return {
      metier: m,
      label: "Clôture",
      badgeClass: "border-[#B85B2B]/30 bg-[#B85B2B]/10 text-[#B85B2B]",
    };
  }
  return {
    metier: m,
    label: "Bardage",
    badgeClass: "border-slate-300 bg-slate-100 text-slate-700",
  };
}

export function correspondMetierSpecialite(
  specialite: string | null | undefined,
  filtreMetier: "tous" | MetierChantier
): boolean {
  if (filtreMetier === "tous") return true;
  const s = (specialite ?? "").toLowerCase();
  if (!s) return false;

  // Spécialités transversales aux 3 corps d'état
  if (
    s.includes("quincaillerie") ||
    s.includes("visserie") ||
    s.includes("bois") ||
    s.includes("composite") ||
    s.includes("métal") ||
    s.includes("metal") ||
    s.includes("alu")
  ) {
    // Cas historique "Métal / Bac acier" plutôt bardage/clôture mais reste utile
    if (s.includes("bac acier") && filtreMetier === "terrasse") return false;
    return true;
  }

  if (filtreMetier === "bardage") {
    return s.includes("bardage") || s.includes("ite") || s.includes("isolation");
  }
  if (filtreMetier === "terrasse") {
    return s.includes("terrasse");
  }
  if (filtreMetier === "cloture") {
    return s.includes("clôture") || s.includes("cloture") || s.includes("portillon");
  }
  return false;
}

export interface ZoneBardageBrute {
  id: string;
  nom: string;
  materiau?: string | null;
  largeur?: number | null;
  hauteur_mur?: number | null;
  resultats_techniques?: Record<string, unknown> | null;
}

export function extraireFournituresDepuisZonesBardage(
  zones: ZoneBardageBrute[]
): LigneImportQuantitatif[] {
  const lignes: LigneImportQuantitatif[] = [];

  for (const zone of zones) {
    const rt = (zone.resultats_techniques ?? {}) as Record<string, unknown>;
    const surfaceACommander =
      typeof rt.surfaceACommander === "number"
        ? rt.surfaceACommander
        : typeof rt.surfaceNette === "number"
          ? rt.surfaceNette * 1.1
          : Number(zone.largeur ?? 0) * Number(zone.hauteur_mur ?? 0) * 1.1;

    if (surfaceACommander > 0) {
      lignes.push({
        designation: `${zone.materiau || "Bardage"} — ${zone.nom}`,
        quantite: Math.round(surfaceACommander * 100) / 100,
        unite: "m²",
      });
    }

    const pose = rt.pose as Record<string, unknown> | undefined;
    if (pose && typeof pose === "object") {
      const isolant = pose.isolant as Record<string, unknown> | undefined;
      if (isolant?.actif && typeof isolant.nbPaquetsACommander === "number" && isolant.nbPaquetsACommander > 0) {
        lignes.push({
          designation: `Isolant ITE ${String(isolant.typeIsolant ?? "")} ép. ${String(isolant.epaisseurMm ?? "")}mm — ${zone.nom}`.trim(),
          quantite: isolant.nbPaquetsACommander,
          unite: "paquets",
        });
      }
      if (typeof pose.nbSegmentsChevrons === "number" && pose.nbSegmentsChevrons > 0) {
        lignes.push({
          designation: `Chevrons / Montants ossature — ${zone.nom}`,
          quantite: pose.nbSegmentsChevrons,
          unite: "pièces",
        });
      }
      if (typeof pose.nbFixationsTotal === "number" && pose.nbFixationsTotal > 0) {
        lignes.push({
          designation: `Équerres de fixation — ${zone.nom}`,
          quantite: pose.nbFixationsTotal,
          unite: "équerres",
        });
      }
      if (typeof pose.nbChevillesMurales === "number" && pose.nbChevillesMurales > 0) {
        lignes.push({
          designation: `Chevilles maçonnerie — ${zone.nom}`,
          quantite: pose.nbChevillesMurales,
          unite: "chevilles",
        });
      }
      if (typeof pose.lineaireBandeEPDMM === "number" && pose.lineaireBandeEPDMM > 0) {
        lignes.push({
          designation: `Bande EPDM — ${zone.nom}`,
          quantite: Math.ceil(pose.lineaireBandeEPDMM),
          unite: "ml",
        });
      }
      if (typeof pose.nbVisParement === "number" && pose.nbVisParement > 0) {
        lignes.push({
          designation: `Vis / Clips parement — ${zone.nom}`,
          quantite: pose.nbVisParement,
          unite: "vis",
        });
      }
    }
  }

  return lignes;
}

export function estLigneMainOeuvre(l: {
  categorie?: string | null;
  code?: string | null;
  unite?: string | null;
  type_cout?: string | null;
}): boolean {
  if (l.type_cout === "main_oeuvre") return true;
  const cat = (l.categorie || "").toLowerCase();
  const code = (l.code || "").toUpperCase();
  const unite = (l.unite || "").toLowerCase();
  if (
    cat.includes("main") ||
    cat.includes("oeuvre") ||
    cat.includes("pose") ||
    cat.includes("prestation")
  ) {
    return true;
  }
  if (code.startsWith("MO-") || code.startsWith("PREST-")) return true;
  if (unite === "h" || unite === "heure" || unite === "heures") return true;
  return false;
}

export function extraireFournituresDepuisTerrasse(
  terrasseRow: { resultats_techniques?: unknown } | null | undefined
): LigneImportQuantitatif[] {
  if (!terrasseRow?.resultats_techniques || typeof terrasseRow.resultats_techniques !== "object") {
    return [];
  }
  const rt = terrasseRow.resultats_techniques as {
    chiffrage?: {
      lignes?: Array<{
        designation?: string;
        quantite?: number;
        unite?: string;
        prixUnitaireHt?: number;
        categorie?: string;
        code?: string;
      }>;
    };
  };
  const rawLignes = rt.chiffrage?.lignes ?? [];
  return rawLignes
    .filter((l) => !estLigneMainOeuvre(l) && Number(l.quantite ?? 0) > 0)
    .map((l) => ({
      designation: String(l.designation ?? "Fourniture terrasse"),
      quantite: Number(l.quantite ?? 0),
      unite: String(l.unite ?? "u"),
      pu_ht: typeof l.prixUnitaireHt === "number" ? l.prixUnitaireHt : undefined,
    }));
}

export function extraireFournituresDepuisCloture(
  clotureRow: { resultats_techniques?: unknown } | null | undefined
): LigneImportQuantitatif[] {
  if (!clotureRow?.resultats_techniques || typeof clotureRow.resultats_techniques !== "object") {
    return [];
  }
  const rt = clotureRow.resultats_techniques as {
    lignesFournitures?: Array<{
      designation?: string;
      qte?: number;
      quantite?: number;
      unite?: string;
      pu_ht?: number;
      pu_revient?: number;
      type_cout?: string;
    }>;
  };
  const rawLignes = rt.lignesFournitures ?? [];
  return rawLignes
    .filter((l) => !estLigneMainOeuvre(l) && Number(l.qte ?? l.quantite ?? 0) > 0)
    .map((l) => ({
      designation: String(l.designation ?? "Fourniture clôture"),
      quantite: Number(l.qte ?? l.quantite ?? 0),
      unite: String(l.unite ?? "u"),
      pu_ht:
        typeof l.pu_revient === "number"
          ? l.pu_revient
          : typeof l.pu_ht === "number"
            ? l.pu_ht
            : undefined,
    }));
}

export interface ChantierAnalyseInput {
  id: string;
  nom: string | null;
  metier?: string | null;
  clients?: { nom: string } | null;
}

export interface DevisAnalyseInput {
  id: string;
  chantier_id: string | null;
  statut: string;
  total_ht: number | null;
  cout_matiere_ht: number | null;
  cout_main_oeuvre_ht: number | null;
}

export interface CommandeAnalyseInput {
  id: string;
  chantier_id: string | null;
  montant_ht: number | null;
  statut: string;
}

export interface LigneAnalyseChantier {
  chantierId: string;
  chantierNom: string;
  clientNom: string | null;
  metier: MetierChantier;
  ventesMateriauxHt: number;
  achatsEngagesHt: number;
  achatsLivresHt: number;
  margeBruteHt: number;
  margeBrutePct: number;
  nbCommandes: number;
}

export interface ResumeAnalyseMarges {
  totalVentesMateriauxHt: number;
  totalAchatsEngagesHt: number;
  totalAchatsLivresHt: number;
  margeBruteHt: number;
  margeBrutePct: number;
  lignes: LigneAnalyseChantier[];
  parMetier: Record<
    MetierChantier,
    {
      ventesMateriauxHt: number;
      achatsEngagesHt: number;
      margeBruteHt: number;
      margeBrutePct: number;
      nbChantiers: number;
    }
  >;
}

export function calculerAnalyseMarges(
  chantiers: ChantierAnalyseInput[],
  devisList: DevisAnalyseInput[],
  commandesList: CommandeAnalyseInput[]
): ResumeAnalyseMarges {
  const chantiersMap = new Map<string, ChantierAnalyseInput>();
  for (const ch of chantiers) {
    chantiersMap.set(ch.id, ch);
  }

  const ventesParChantier = new Map<string, number>();
  for (const d of devisList) {
    if (!d.chantier_id) continue;
    if (d.statut === "refuse" || d.statut === "annule") continue;
    const matiere =
      (d.cout_matiere_ht ?? 0) > 0
        ? Number(d.cout_matiere_ht ?? 0)
        : Math.max(0, Number(d.total_ht ?? 0) - Number(d.cout_main_oeuvre_ht ?? 0));
    ventesParChantier.set(
      d.chantier_id,
      (ventesParChantier.get(d.chantier_id) ?? 0) + matiere
    );
  }

  const achatsEngagesParChantier = new Map<string, number>();
  const achatsLivresParChantier = new Map<string, number>();
  const nbCmdParChantier = new Map<string, number>();

  for (const cmd of commandesList) {
    if (!cmd.chantier_id || cmd.statut === "annulee") continue;
    const montant = Number(cmd.montant_ht ?? 0);
    achatsEngagesParChantier.set(
      cmd.chantier_id,
      (achatsEngagesParChantier.get(cmd.chantier_id) ?? 0) + montant
    );
    nbCmdParChantier.set(
      cmd.chantier_id,
      (nbCmdParChantier.get(cmd.chantier_id) ?? 0) + 1
    );
    if (cmd.statut === "livree") {
      achatsLivresParChantier.set(
        cmd.chantier_id,
        (achatsLivresParChantier.get(cmd.chantier_id) ?? 0) + montant
      );
    }
  }

  const chantierIds = new Set<string>([
    ...ventesParChantier.keys(),
    ...achatsEngagesParChantier.keys(),
  ]);

  const lignes: LigneAnalyseChantier[] = [];
  const parMetier: ResumeAnalyseMarges["parMetier"] = {
    bardage: { ventesMateriauxHt: 0, achatsEngagesHt: 0, margeBruteHt: 0, margeBrutePct: 0, nbChantiers: 0 },
    terrasse: { ventesMateriauxHt: 0, achatsEngagesHt: 0, margeBruteHt: 0, margeBrutePct: 0, nbChantiers: 0 },
    cloture: { ventesMateriauxHt: 0, achatsEngagesHt: 0, margeBruteHt: 0, margeBrutePct: 0, nbChantiers: 0 },
  };

  for (const chId of chantierIds) {
    const ch = chantiersMap.get(chId);
    const metier = normaliserMetier(ch?.metier);
    const ventes = ventesParChantier.get(chId) ?? 0;
    const engages = achatsEngagesParChantier.get(chId) ?? 0;
    const livres = achatsLivresParChantier.get(chId) ?? 0;
    const marge = ventes - engages;
    const margePct = ventes > 0 ? (marge / ventes) * 100 : 0;

    lignes.push({
      chantierId: chId,
      chantierNom: ch?.nom || ch?.clients?.nom || "Chantier sans nom",
      clientNom: ch?.clients?.nom ?? null,
      metier,
      ventesMateriauxHt: ventes,
      achatsEngagesHt: engages,
      achatsLivresHt: livres,
      margeBruteHt: marge,
      margeBrutePct: margePct,
      nbCommandes: nbCmdParChantier.get(chId) ?? 0,
    });

    parMetier[metier].ventesMateriauxHt += ventes;
    parMetier[metier].achatsEngagesHt += engages;
    parMetier[metier].margeBruteHt += marge;
    parMetier[metier].nbChantiers += 1;
  }

  for (const m of ["bardage", "terrasse", "cloture"] as const) {
    const p = parMetier[m];
    p.margeBrutePct = p.ventesMateriauxHt > 0 ? (p.margeBruteHt / p.ventesMateriauxHt) * 100 : 0;
  }

  lignes.sort((a, b) => b.achatsEngagesHt + b.ventesMateriauxHt - (a.achatsEngagesHt + a.ventesMateriauxHt));

  const totalVentesMateriauxHt = lignes.reduce((s, l) => s + l.ventesMateriauxHt, 0);
  const totalAchatsEngagesHt = lignes.reduce((s, l) => s + l.achatsEngagesHt, 0);
  const totalAchatsLivresHt = lignes.reduce((s, l) => s + l.achatsLivresHt, 0);
  const margeBruteHt = totalVentesMateriauxHt - totalAchatsEngagesHt;
  const margeBrutePct =
    totalVentesMateriauxHt > 0 ? (margeBruteHt / totalVentesMateriauxHt) * 100 : 0;

  return {
    totalVentesMateriauxHt,
    totalAchatsEngagesHt,
    totalAchatsLivresHt,
    margeBruteHt,
    margeBrutePct,
    lignes,
    parMetier,
  };
}

/**
 * Moteur métier SAV & Garanties légales (Multi-métiers : Bardage, Terrasse, Clôture)
 * Gère :
 *   - Les catalogues de sinistres adaptés par métier et leur régime de garantie par défaut
 *   - Le calcul automatique de l'échéance (GPA 1 an, Biennale 2 ans, Décennale 10 ans)
 *     à partir de `pv_receptions.date_reception` (ou repli `chantiers.date_fin`)
 *   - Le forçage Hors Garantie / Facturable pour les clients externes (hors chantier BNA)
 */

export type MetierSav = "bardage" | "terrasse" | "cloture";

export type OrigineSav = "chantier_bna" | "client_externe";

export type TypeGarantieSav =
  | "gpa_1an"
  | "biennale_2ans"
  | "decennale_10ans"
  | "hors_garantie_externe";

export interface SinistreSavOption {
  label: string;
  garantieDefaut: Exclude<TypeGarantieSav, "hors_garantie_externe">;
}

export const REFERENTIELS_NORMATIFS_SAV: Record<
  MetierSav,
  {
    libelleMetier: string;
    titreDiagnostic: string;
    labelNorme: string;
    placeholderLocalisation: string;
    placeholderMateriel: string;
  }
> = {
  bardage: {
    libelleMetier: "Bardage",
    titreDiagnostic: "2. Diagnostic DTU 41.2 / 45.4",
    labelNorme: "Respect des normes DTU 41.2 / 45.4",
    placeholderLocalisation: "Ex: Façade Sud, pignon gauche...",
    placeholderMateriel: "Ex: 3 lames Red Cedar 3600, 2 tasseaux 22x45, vis inox A2...",
  },
  terrasse: {
    libelleMetier: "Terrasse & Mobile",
    titreDiagnostic: "2. Diagnostic NF DTU 51.4 / NF P90-308",
    labelNorme: "Respect des normes NF DTU 51.4 / NF P90-308",
    placeholderLocalisation: "Ex: Plage piscine Nord, rail terrasse mobile, escalier...",
    placeholderMateriel: "Ex: 2 lames pin Cl4, 4 plots réglables, 1 fin de course moteur...",
  },
  cloture: {
    libelleMetier: "Clôture",
    titreDiagnostic: "2. Diagnostic Clôture & Scellements",
    labelNorme: "Respect des tolérances de pose & fabricant",
    placeholderLocalisation: "Ex: Côté A rue, poteau d'angle, portillon principal...",
    placeholderMateriel: "Ex: 1 poteau alu 2.30m, 1 gâche portillon, 2 sacs béton 35kg...",
  },
};

export const SINISTRES_PAR_METIER: Record<MetierSav, readonly SinistreSavOption[]> = {
  bardage: [
    { label: "Infiltration / Étanchéité", garantieDefaut: "decennale_10ans" },
    { label: "Ossature / Fixations", garantieDefaut: "decennale_10ans" },
    { label: "Lame voilée / fissurée", garantieDefaut: "gpa_1an" },
    { label: "Problème encadrement / Grille anti-rongeur", garantieDefaut: "gpa_1an" },
    { label: "Autre", garantieDefaut: "gpa_1an" },
  ],
  terrasse: [
    { label: "Affaissement plots / structure", garantieDefaut: "decennale_10ans" },
    { label: "Lame fendue / clip", garantieDefaut: "gpa_1an" },
    { label: "Motorisation / Solaire / Fin de course", garantieDefaut: "biennale_2ans" },
    { label: "Réglage rail / châssis terrasse mobile", garantieDefaut: "biennale_2ans" },
    { label: "Autre", garantieDefaut: "gpa_1an" },
  ],
  cloture: [
    { label: "Poteau descellé / muret", garantieDefaut: "decennale_10ans" },
    { label: "Portillon / Serrure / Gâche", garantieDefaut: "biennale_2ans" },
    { label: "Lame / Plaque soubassement", garantieDefaut: "gpa_1an" },
    { label: "Autre", garantieDefaut: "gpa_1an" },
  ],
};

export const LIBELLES_GARANTIE: Record<TypeGarantieSav, string> = {
  gpa_1an: "GPA (1 an)",
  biennale_2ans: "Biennale (2 ans)",
  decennale_10ans: "Décennale (10 ans)",
  hors_garantie_externe: "Intervention externe — Hors garantie BNA",
};

export function getDureeAnneesGarantie(typeGarantie: TypeGarantieSav): number {
  switch (typeGarantie) {
    case "gpa_1an":
      return 1;
    case "biennale_2ans":
      return 2;
    case "decennale_10ans":
      return 10;
    case "hors_garantie_externe":
      return 0;
  }
}

export function resoudreTypeGarantieParSinistre(
  metier: MetierSav,
  typeSinistre: string
): Exclude<TypeGarantieSav, "hors_garantie_externe"> {
  const options = SINISTRES_PAR_METIER[metier] ?? SINISTRES_PAR_METIER.bardage;
  const trouve = options.find((o) => o.label === typeSinistre);
  return trouve ? trouve.garantieDefaut : "decennale_10ans";
}

export interface ParamsCalculGarantie {
  typeOrigine: OrigineSav;
  typeGarantie: TypeGarantieSav;
  dateReception?: string | null;
  dateSinistre?: string | null;
}

export interface ResultatStatutGarantie {
  sousGarantie: boolean;
  typeGarantieEffectif: TypeGarantieSav;
  facturable: boolean;
  dateReceptionUtilisee: string | null;
  dateExpiration: string | null;
  joursRestants: number | null;
  libelleStatut: string;
}

/**
 * Calcule automatiquement le statut de garantie et de facturation d'un ticket SAV.
 */
export function calculerStatutGarantie(
  params: ParamsCalculGarantie
): ResultatStatutGarantie {
  if (params.typeOrigine === "client_externe") {
    return {
      sousGarantie: false,
      typeGarantieEffectif: "hors_garantie_externe",
      facturable: true,
      dateReceptionUtilisee: null,
      dateExpiration: null,
      joursRestants: null,
      libelleStatut: LIBELLES_GARANTIE.hors_garantie_externe,
    };
  }

  const regime =
    params.typeGarantie === "hors_garantie_externe"
      ? "decennale_10ans"
      : params.typeGarantie;

  if (!params.dateReception) {
    return {
      sousGarantie: true,
      typeGarantieEffectif: regime,
      facturable: false,
      dateReceptionUtilisee: null,
      dateExpiration: null,
      joursRestants: null,
      libelleStatut: `${LIBELLES_GARANTIE[regime]} — Date de réception non renseignée`,
    };
  }

  const reception = new Date(params.dateReception.slice(0, 10) + "T00:00:00Z");
  if (Number.isNaN(reception.getTime())) {
    return {
      sousGarantie: true,
      typeGarantieEffectif: regime,
      facturable: false,
      dateReceptionUtilisee: null,
      dateExpiration: null,
      joursRestants: null,
      libelleStatut: LIBELLES_GARANTIE[regime],
    };
  }

  const annees = getDureeAnneesGarantie(regime);
  const expiration = new Date(reception);
  expiration.setUTCFullYear(expiration.getUTCFullYear() + annees);

  const refDate = params.dateSinistre
    ? new Date(params.dateSinistre.slice(0, 10) + "T00:00:00Z")
    : new Date();
  const refTime = Number.isNaN(refDate.getTime()) ? Date.now() : refDate.getTime();

  const joursRestants = Math.ceil((expiration.getTime() - refTime) / 86400000);
  const sousGarantie = joursRestants >= 0;

  return {
    sousGarantie,
    typeGarantieEffectif: regime,
    facturable: !sousGarantie,
    dateReceptionUtilisee: reception.toISOString().slice(0, 10),
    dateExpiration: expiration.toISOString().slice(0, 10),
    joursRestants,
    libelleStatut: sousGarantie
      ? `${LIBELLES_GARANTIE[regime]} — Couverte jusqu'au ${expiration.toLocaleDateString("fr-FR")}`
      : `${LIBELLES_GARANTIE[regime]} expirée le ${expiration.toLocaleDateString("fr-FR")}`,
  };
}

/**
 * Convertit un champ texte `temps_estime` ("1h30", "2h", "45min", "1.5") en heures décimales.
 */
export function parserHeuresEstimees(tempsEstime?: string | null): number {
  if (!tempsEstime) return 1;
  const s = tempsEstime.trim().toLowerCase().replace(",", ".");
  const matchHM = s.match(/^(\d+(?:\.\d+)?)\s*h\s*(\d+)?$/);
  if (matchHM) {
    const h = parseFloat(matchHM[1]) || 0;
    const m = matchHM[2] ? parseInt(matchHM[2], 10) || 0 : 0;
    return Math.max(0.25, Math.round((h + m / 60) * 100) / 100);
  }
  const matchMin = s.match(/^(\d+)\s*min/);
  if (matchMin) {
    return Math.max(0.25, Math.round((parseInt(matchMin[1], 10) / 60) * 100) / 100);
  }
  const num = parseFloat(s);
  return Number.isFinite(num) && num > 0 ? num : 1;
}

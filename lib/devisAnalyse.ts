// Module devis_ia — ÉTAPE 1.
// Bibliothèque PUR (aucune dépendance Supabase/React, AUCUN moteur de métré
// importé) : utilisable côté serveur (route /api/devis/[devis_id]/analyse) et
// testable unitairement.
//
// Rôles :
//  - Verrou de concurrence : deux POST simultanés d'un même devis ne doivent
//    pas lancer deux analyses. La décision (pure) est prise ici ; l'atomicité
//    est garantie en base par la contrainte UNIQUE(devis_id) + une commande
//    conditionnelle (voir route).
//  - Construction du contexte BNA fourni au LLM, sans aucune estimation.
//  - Normalisation stricte de la réponse LLM : les prix ne proviennent JAMAIS
//    du LLM, la source de vérité est le catalogue_ouvrages.
//  - Estimations finales : réutilisation du moteur devisCalcul (calculerDevis).

import {
  arrondir,
  calculerDevis,
  creerLigneAChiffrer,
  type CoutType,
  type LigneDevis,
  typeCoutValide,
} from "@/lib/devisCalcul";

export type StatutAnalyse = "en_attente" | "en_cours" | "terminee" | "en_echec";

export const STATUTS_ANALYSE: readonly StatutAnalyse[] = [
  "en_attente",
  "en_cours",
  "terminee",
  "en_echec",
];

/** Une analyse « en cours / en attente » plus vieille que cette durée est
 *  considérée orpheline (crash) et devient récupérable. */
export const FRAICHEUR_VERROU_MS = 10 * 60 * 1000;

export class ErreurAnalyse extends Error {}

function texte(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function nombre(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

function booleen(v: unknown): boolean {
  return v === true;
}

// ---------------------------------------------------------------------------
// 1. Verrou de concurrence (décision pure, testable)
// ---------------------------------------------------------------------------

export type DecisionDemarrage =
  | { autorise: true; raison: "nouvelle" | "disponible" | "recupere" }
  | { autorise: false; raison: "verrouille" };

/**
 * Décide si une analyse peut démarrer pour un devis donné.
 *  - aucune analyse existante           → OUI (« nouvelle ») : l'INSERT (UNIQUE) tranchera.
 *  - statut en_attente / en_cours frais → NON (« verrouille ») : analyse concurrente.
 *  - statut en_attente / en_cours obsolète → OUI (« recupere ») : verrou orphelin.
 *  - statut terminee / en_echec         → OUI (« disponible ») : remplacement autorisé.
 */
export function decisionDemarrageAnalyse(args: {
  existe: boolean;
  statut: StatutAnalyse | null;
  derniereMaj: string | null;
  maintenant?: number;
  fraicheurMs?: number;
}): DecisionDemarrage {
  const maintenant = args.maintenant ?? Date.now();
  const fraicheur = args.fraicheurMs ?? FRAICHEUR_VERROU_MS;

  if (!args.existe) {
    return { autorise: true, raison: "nouvelle" };
  }
  if (!args.statut) {
    return { autorise: true, raison: "disponible" };
  }
  if (args.statut === "en_attente" || args.statut === "en_cours") {
    const age = args.derniereMaj
      ? Math.max(0, maintenant - Date.parse(args.derniereMaj))
      : 0;
    if (age < fraicheur) {
      return { autorise: false, raison: "verrouille" };
    }
    return { autorise: true, raison: "recupere" };
  }
  return { autorise: true, raison: "disponible" };
}

// ---------------------------------------------------------------------------
// 2. Contexte BNA (lecture seule, aucune estimation)
// ---------------------------------------------------------------------------

export type ZoneAnalyse = {
  id: string;
  nom: string;
  metrage: boolean;
  pose: boolean;
  calepinage: boolean;
};

export type OuvrageAnalyse = {
  id: string;
  designation: string;
  unite: string;
  pu_ht: number | null;
  pu_revient: number | null;
  type_cout: CoutType | null;
};

export type ContexteBNA = {
  devisId: string;
  lignes: LigneDevis[];
  total_ht: number;
  surface_m2: number | null;
  chantier: { id: string; nom: string; adresse: string | null } | null;
  zones: ZoneAnalyse[];
  catalogue: OuvrageAnalyse[];
};

/** Mapping SÛR des lignes persistées (JSON sage) vers LigneDevis. On préserve
 *  zone_id — champ additif requis pour la traçabilité par zone. */
export function mapperLignesPersistees(lignes: unknown): LigneDevis[] {
  if (!Array.isArray(lignes)) return [];
  return lignes
    .filter((l): l is Record<string, unknown> => typeof l === "object" && l !== null)
    .map((l) => ({
      catalogue_id: texte(l.catalogue_id) || null,
      designation: texte(l.designation) || "",
      description: l.description == null ? null : texte(l.description),
      qte: nombre(l.qte),
      unite: texte(l.unite) || "--",
      pu_ht: nombre(l.pu_ht),
      pu_revient: l.pu_revient == null ? null : nombre(l.pu_revient),
      type_cout: typeCoutValide(l.type_cout) ? l.type_cout : null,
      a_chiffrer: typeof l.a_chiffrer === "boolean" ? l.a_chiffrer : false,
      zone_id: texte(l.zone_id) || null,
    }));
}

function mapperCatalogue(catalogue: unknown): OuvrageAnalyse[] {
  if (!Array.isArray(catalogue)) return [];
  const sortie: OuvrageAnalyse[] = [];
  for (const c of catalogue) {
    if (typeof c !== "object" || c === null) continue;
    const ligne = c as Record<string, unknown>;
    if (!texte(ligne.id)) continue;
    sortie.push({
      id: texte(ligne.id),
      designation: texte(ligne.designation) || "--",
      unite: texte(ligne.unite) || "--",
      pu_ht: nombre(ligne.pu_ht),
      pu_revient: ligne.pu_revient == null ? null : nombre(ligne.pu_revient),
      type_cout: typeCoutValide(ligne.type_cout) ? ligne.type_cout : null,
    });
  }
  return sortie;
}

function lireChantierPayload(payload: unknown): ContexteBNA["chantier"] {
  if (typeof payload !== "object" || payload === null) return null;
  const chantier = (payload as Record<string, unknown>).chantier;
  if (typeof chantier !== "object" || chantier === null) return null;
  const c = chantier as Record<string, unknown>;
  return { id: texte(c.id), nom: texte(c.nom), adresse: c.adresse == null ? null : texte(c.adresse) };
}

function lireZonesPayload(payload: unknown): ZoneAnalyse[] {
  if (typeof payload !== "object" || payload === null) return [];
  const zones = (payload as Record<string, unknown>).zones;
  if (!Array.isArray(zones)) return [];
  return zones
    .filter((z): z is Record<string, unknown> => typeof z === "object" && z !== null)
    .map((z) => ({
      id: texte(z.id),
      nom: texte(z.nom) || "--",
      metrage: booleen(z.metrage),
      pose: booleen(z.pose),
      calepinage: booleen(z.calepinage),
    }));
}

/** Construit le contexte lisible par le LLM à partir du devis, du métré
 *  complet (optionnel) et du catalogue. Lecture seule : aucune estimation. */
export function construireContexteBNA(args: {
  devis: { id: string; lignes: unknown; surface_m2: number | null };
  payloadMetreComplet?: unknown;
  catalogue?: unknown;
}): ContexteBNA {
  const lignes = mapperLignesPersistees(args.devis.lignes);
  const catalogue = mapperCatalogue(args.catalogue);
  const chantier = lireChantierPayload(args.payloadMetreComplet);
  const zones = lireZonesPayload(args.payloadMetreComplet);
  return {
    devisId: args.devis.id,
    lignes,
    total_ht: calculerDevis(lignes).total_ht,
    surface_m2: args.devis.surface_m2 ?? null,
    chantier,
    zones,
    catalogue,
  };
}

// ---------------------------------------------------------------------------
// 3. Normalisation stricte de la réponse LLM
// ---------------------------------------------------------------------------

export type AnalyseNormalisee = {
  analyse_resultats: Record<string, unknown>;
  lignes_proposees: LigneDevis[];
  alertes: string[];
  recommandations: string[];
};

function listerTextes(v: unknown): string[] {
  const result: string[] = [];
  if (!Array.isArray(v)) return result;
  for (const item of v) {
    if (typeof item === "string") {
      const t = item.trim();
      if (t) result.push(t);
    } else if (typeof item === "object" && item !== null) {
      const t = texte((item as Record<string, unknown>).message).trim();
      if (t) result.push(t);
    }
  }
  return result;
}

/**
 * Valide/type la réponse brute du LLM.
 *  - Le prix n'est JAMAIS lu dans la réponse : une ligne chiffrée ne peut
 *    provenir que du catalogue (ouvrage trouvé) AVEC une quantité positive.
 *  - Ouvrage inconnu ou quantité manquante → ligne « À CHIFFRER »
 *    (prix rejeté, jamais inventé).
 *  - zone_id éventuel d'une zone citée est conservé.
 */
export function normaliserAnalyseBrute(
  brute: unknown,
  catalogueParId: Map<string, OuvrageAnalyse>,
): AnalyseNormalisee {
  if (typeof brute !== "object" || brute === null) {
    throw new ErreurAnalyse("Réponse LLM invalide (objet attendu).");
  }
  const b = brute as Record<string, unknown>;

  const analyserLignes = (): LigneDevis[] => {
    if (!Array.isArray(b.lignes_proposees)) return [];
    const lignes: LigneDevis[] = [];
    for (const raw of b.lignes_proposees) {
      if (typeof raw !== "object" || raw === null) continue;
      const r = raw as Record<string, unknown>;
      const designation = texte(r.designation);
      const catalogue_id = texte(r.catalogue_id);
      const ouvrage = catalogue_id ? catalogueParId.get(catalogue_id) : undefined;
      const qte = nombre(r.qte);
      const zone_id = texte(r.zone_id) || null;

      if (ouvrage && qte !== null && qte > 0) {
        lignes.push({
          catalogue_id: ouvrage.id,
          designation: ouvrage.designation,
          description: r.description == null ? null : texte(r.description),
          qte,
          unite: ouvrage.unite,
          pu_ht: ouvrage.pu_ht,
          pu_revient: ouvrage.pu_revient,
          type_cout: ouvrage.type_cout,
          a_chiffrer: false,
          zone_id,
        });
      } else {
        const aChiffrer = creerLigneAChiffrer(
          designation || ouvrage?.designation || "À CHIFFRER",
          r.description == null ? undefined : texte(r.description),
        );
        lignes.push({ ...aChiffrer, zone_id });
      }
    }
    return lignes;
  };

  const bruteResultats = b.analyse_resultats;
  const analyse_resultats: Record<string, unknown> =
    typeof bruteResultats === "object" && bruteResultats !== null
      ? (bruteResultats as Record<string, unknown>)
      : {};

  return {
    analyse_resultats,
    lignes_proposees: analyserLignes(),
    alertes: listerTextes(b.alertes),
    recommandations: listerTextes(b.recommandations),
  };
}

// ---------------------------------------------------------------------------
// 4. Estimations (réutilisation du moteur devisCalcul)
// ---------------------------------------------------------------------------

export type EstimationsAnalyse = {
  total_estime: number;
  marge_estimee: number;
  marge_pct: number;
};

/** Estimations finales sur les lignes proposées (norme devisCalcul) :
 *  total = total_ht, marge = marge_ht, ratio = marge_pct. */
export function calculerEstimations(lignes: LigneDevis[]): EstimationsAnalyse {
  const calculs = calculerDevis(lignes);
  return {
    total_estime: arrondir(calculs.total_ht),
    marge_estimee: arrondir(calculs.marge_ht),
    marge_pct: arrondir(calculs.marge_pct),
  };
}
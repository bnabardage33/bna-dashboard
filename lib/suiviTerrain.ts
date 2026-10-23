// lib/suiviTerrain.ts
//
// STATUT TERRAIN DE LA JOURNÉE — module PUR, sans réseau ni base.
//
// ─── La confusion corrigée ──────────────────────────────────────────────────
//
// L'audit a montré que trois choses différentes étaient nommées « la journée » :
//
//   1. le STATUT TERRAIN (l'équipe a-t-elle travaillé ? sur quoi ?) ;
//   2. le NIVEAU DE RISQUE MÉTÉO (peut-on poser, techniquement ?) ;
//   3. la QUALIFICATION LÉGALE (jour d'arrêt indemnisable, à valider).
//
// Le parcours « Ossature posée » ne touche QUE la première. Il n'écrit rien
// dans `rapports_intemperies`, ne modifie aucun seuil, et ne transforme jamais
// une gêne de chantier en jour d'arrêt indemnisable : cette qualification
// reste une décision humaine, prise ailleurs.
//
// ─── Les deux choix, tels qu'ils se posent sur le terrain ───────────────────
//
//   A. INTEMPÉRIES — l'équipe a posé l'ossature mais a été gênée (vent, pluie,
//      gel, accès). Le motif est enregistré, la journée reste VERTE (l'activité
//      a eu lieu), et l'incident reste ouvert tant qu'il n'est pas documenté.
//
//   B. AUTRE FAÇADE — l'équipe a posé l'ossature AILLEURS que sur la façade
//      prévue. La façade initialement bloquée est conservée AVEC son motif :
//      l'incident n'est PAS effacé. La journée reste VERTE : le travail a bien
//      eu lieu, simplement pas là où c'était planifié.
//
// ─── Règle de non-régression métier ─────────────────────────────────────────
//
// Un incident sur UNE façade ne recolore JAMAIS la journée en rouge, et ne
// contamine jamais une météo défavorable prévue ailleurs ou plus tard. C'est
// la règle « journée verte » déjà en vigueur : ce module ne fait que lui donner
// un support explicite, constatable et documentable.

// ─── Types du parcours ───────────────────────────────────────────────────────

/** Les deux choix possibles, et eux seuls. Aucun troisième état implicite. */
export type ChoixOssature = "intemperies" | "autre_facade";

/** Façades du referentiel chantier (aligné sur `components/AvancementFacades`). */
export type FacadeOssature = "nord" | "sud" | "est" | "ouest";

export const LIBELLES_FACADE: Record<FacadeOssature, string> = {
  nord: "Façade Nord",
  sud: "Façade Sud",
  est: "Façade Est",
  ouest: "Façade Ouest",
};

/**
 * Événement « ossature posée » tel qu'il est SÉRIALISÉ dans
 * `journal_chantier.contenu`.
 *
 * Le stockage est un texte JSON : la table `journal_chantier` existe déjà, avec
 * sa RLS et son trigger d'entreprise — aucune migration n'est nécessaire. Le
 * format est versionné (`v`) pour qu'un futur changement reste lisible.
 */
export interface EvenementOssature {
  v: 1;
  type: "ossature_posee";
  /**
   * Identifiant stable optionnel, généré à l'écriture (`crypto.randomUUID`).
   *
   * Absent des événements historiques — ce qui est normal : il est né de la
   * correction P1. La fermeture d'une reprise fonctionne donc en DEUX temps
   * (voir `estIncidentCloture`) : par `referente` quand les deux événements
   * portent un identifiant, sinon par la clé composée historique.
   */
  id?: string;
  /** Façade effectivement posée. */
  facade: FacadeOssature;
  /** Choix A ou B. */
  choix: ChoixOssature;
  /** Motif saisi (A) ou raison du changement (B). Peut être vide : voir plus bas. */
  motif: string;
  /** Façade initialement prévue et restée bloquée. Renseignée pour le choix B. */
  facadeInitiale?: FacadeOssature;
  /** Date/heure de DÉBUT de l'événement (ISO, instant réel). */
  debut: string;
  /**
   * Reprise documentée, si elle a été renseignée plus tard.
   * `referente` porte l'`id` de l'incident clôturé (P1) ; absent sur les
   * reprises historiques, qui retombent sur la clé composée.
   */
  reprise?: { at: string; note: string; referente?: string };
}

/**
 * Statut terrain de la journée.
 *
 * `vert`   : l'activité a eu lieu. C'est le cas des DEUX choix : ni la gêne
 *            (A) ni le changement de façade (B) ne rendent la journée rouge.
 * `attente`: une décision a été prise et l'équipe n'a pas pu poser.
 * `reprise`: l'équipe a repris après une interruption documentée.
 */
export type StatutActiviteJournee = "vert" | "attente" | "reprise";

export interface EtatJournee {
  statut: StatutActiviteJournee;
  /** Façade(s) où l'ossature a effectivement été posée. */
  facadesPosees: FacadeOssature[];
  /** Incidents ouverts : conservés même quand la journée reste verte. */
  incidents: Array<{
    /** Identifiant de l'événement d'origine, s'il en porte un (cf. `EvenementOssature.id`). */
    id?: string;
    /** Façade affichée : celle qui a été bloquée (choix B), sinon celle posée. */
    facade: FacadeOssature;
    /** Façade effectivement posée par l'événement d'origine. */
    facadePosee: FacadeOssature;
    /** Façade initialement prévue et bloquée (choix B uniquement). */
    facadeInitiale?: FacadeOssature;
    choix: ChoixOssature;
    motif: string;
    debut: string;
    /** `true` tant que la reprise n'a pas été documentée. */
    ouvert: boolean;
  }>;
  /** Dernière reprise documentée, si elle existe. */
  derniereReprise: { at: string; note: string } | null;
  /**
   * Une seule ligne, prête à afficher. Volontairement factuelle : elle décrit
   * ce qui s'est PASSÉ, et ne qualifie jamais la journée d'« arrêt légal ».
   */
  resume: string;
}

/** Libellés du statut. Aucun n'emploie le mot « arrêt » seul. */
export const LIBELLES_STATUT_ACTIVITE: Record<StatutActiviteJournee, string> = {
  vert: "Activité réalisée",
  attente: "En attente",
  reprise: "Reprise documentée",
};

// ─── Sérialisation ───────────────────────────────────────────────────────────

/** Tag stable écrit dans `journal_chantier.source`. */
export const SOURCE_OSSATURE_POSEE = "ossature-posee";

export function serialiserEvenement(ev: EvenementOssature): string {
  return JSON.stringify(ev);
}

const FACADES_VALIDES: FacadeOssature[] = ["nord", "sud", "est", "ouest"];

function facadeOuNull(v: unknown): FacadeOssature | null {
  return typeof v === "string" && (FACADES_VALIDES as string[]).includes(v)
    ? (v as FacadeOssature)
    : null;
}

function choixOuNull(v: unknown): ChoixOssature | null {
  return v === "intemperies" || v === "autre_facade" ? v : null;
}

/**
 * Relit un événement sérialisé.
 *
 * TOLÉRANT À L'ÉCHEC, jamais silencieux : une ligne illisible renvoie `null`,
 * et l'appelant l'ignore explicitement plutôt que d'inventer un événement. Le
 * journal d'un chantier peut contenir d'autres textes (notes libres) : seules
 * les lignes reconnues sont exploitées.
 */
export function lireEvenement(contenu: string | null | undefined): EvenementOssature | null {
  if (!contenu) return null;
  let brut: unknown;
  try {
    brut = JSON.parse(contenu);
  } catch {
    return null;
  }
  if (!brut || typeof brut !== "object") return null;
  const o = brut as Record<string, unknown>;
  if (o.type !== "ossature_posee") return null;
  const facade = facadeOuNull(o.facade);
  const choix = choixOuNull(o.choix);
  if (!facade || !choix) return null;
  const debut = typeof o.debut === "string" ? o.debut : null;
  if (!debut) return null;

  // Identifiant stable optionnel (P1) : ignoré s'il n'est pas une chaîne.
  const id = typeof o.id === "string" && o.id.length > 0 ? o.id : undefined;

  const repriseBrute = o.reprise;
  let reprise: EvenementOssature["reprise"];
  if (repriseBrute && typeof repriseBrute === "object") {
    const r = repriseBrute as Record<string, unknown>;
    if (typeof r.at === "string" && typeof r.note === "string") {
      const referente =
        typeof r.referente === "string" && r.referente.length > 0 ? r.referente : undefined;
      reprise = referente ? { at: r.at, note: r.note, referente } : { at: r.at, note: r.note };
    }
  }

  return {
    v: 1,
    type: "ossature_posee",
    ...(id ? { id } : {}),
    facade,
    choix,
    motif: typeof o.motif === "string" ? o.motif : "",
    ...(facadeOuNull(o.facadeInitiale)
      ? { facadeInitiale: facadeOuNull(o.facadeInitiale) as FacadeOssature }
      : {}),
    debut,
    ...(reprise ? { reprise } : {}),
  };
}

// ─── Dérivation du statut de la journée ──────────────────────────────────────

/**
 * Clé d'un incident, pour relier une REPRISE à l'événement qu'elle clôture.
 *
 * La reprise est écrite comme un nouvel événement reprenant la façade POSÉE,
 * le choix, le motif et — pour le choix B — la façade initialement bloquée :
 * ces champs constituent l'identité du cas. C'est le filet de sécurité pour
 * les événements antérieurs à l'identifiant stable (`id`), absents du format
 * historique.
 */
function cleIncident(ev: EvenementOssature): string {
  return `${ev.choix}|${ev.facade}|${ev.facadeInitiale ?? ""}|${ev.motif}`;
}

/**
 * Une reprise clô-t-elle l'incident `ev` ?
 *
 * Deux mécanismes, du plus précis au plus ancien (P1) :
 *  1. `reprise.referente` pointe l'`id` de l'incident → correspondance exacte,
 *     seule recevable quand les deux événements portent un identifiant.
 *  2. À défaut de `referente` (reprises historiques), comparaison des clés
 *     composées — compatible avec tous les événements déjà enregistrés, qui
 *     n'ont pas d'`id`.
 *
 * Une reprise sans `referente` ne peut donc jamais clôturer par hasard un
 * incident qui porte un `id` : si l'incident a un identifiant et que la
 * reprise n'en cite aucun, la clé composée reste le seul recours, et elle
 * réclame l'identité complète du cas.
 */
function estIncidentCloture(
  ev: EvenementOssature,
  reprises: EvenementOssature[],
): boolean {
  return reprises.some((r) =>
    r.reprise?.referente
      ? Boolean(ev.id) && r.reprise.referente === ev.id
      : cleIncident(r) === cleIncident(ev),
  );
}

/**
 * Construit l'état de la journée à partir des événements du journal.
 *
 * RÈGLES EXPLICITES, toutes vérifiables :
 *
 *  1. Un événement « ossature posée » rend la journée `vert`, quel que soit le
 *     choix. Le travail a eu lieu : c'est un fait, pas une appréciation.
 *  2. Un incident (choix A ou B, avec un motif) reste `ouvert` tant qu'aucune
 *     reprise ne le documente. Il N'EST JAMAIS effacé par un autre événement :
 *     la reprise l'a COMPLÉTÉ, l'original reste lisible.
 *  3. Le choix B conserve la façade initialement bloquée (`facadeInitiale`) à
 *     côté de la façade réellement posée : l'information n'est pas fusionnée.
 *  4. Une reprise rattachée à un incident clôture CET incident (il passe
 *     `ouvert: false`) sans requalifier la journée. Un événement porteur d'une
 *     reprise n'est pas un nouvel incident : c'est la documentation d'un
 *     cas déjà déclaré.
 *  5. Les événements porteurs d'une reprise sont EXCLUS du calcul des façades
 *     posées : une reprise de choix B porte la façade bloquée dans son champ
 *     `facade` (elle référence l'incident) — la compter comme « posée »
 *     contredirait la mention de la façade bloquée (P2). Seuls les
 *     événements sans reprise prouvent une pose.
 *  6. Aucun événement → `attente` : on ne présume pas qu'une journée a été
 *     travaillée sans preuve. L'absence d'information n'est pas un « vert ».
 */
export function deriverEtatJournee(evenements: EvenementOssature[]): EtatJournee {
  const valides = evenements.filter(Boolean);
  if (valides.length === 0) {
    return {
      statut: "attente",
      facadesPosees: [],
      incidents: [],
      derniereReprise: null,
      resume: "Aucun événement d'ossature enregistré pour cette journée.",
    };
  }

  const tries = [...valides].sort((a, b) => a.debut.localeCompare(b.debut));

  // Règle 5 : seule une pose SANS reprise prouve une façade posée. Pour le
  // choix A, la reprise repose la même façade que l'incident (le reposer
  // n'ajoute rien) ; pour le choix B, son champ `facade` porte la façade
  // BLOQUÉE — jamais comptée ici.
  const facadesPosees: FacadeOssature[] = [];
  for (const ev of tries) {
    if (ev.reprise) continue;
    if (!facadesPosees.includes(ev.facade)) facadesPosees.push(ev.facade);
  }

  const reprises = tries.filter((ev) => ev.reprise);

  // Un incident est une décision documentée et non encore close : gêne subie
  // (A) ou changement de façade (B). Le motif peut être vide côté A (on
  // enregistre quand même le fait : « gêné » est une information, le détail
  // peut venir après). Un événement porteur d'une reprise est la clôture
  // d'un cas déjà déclaré, pas un nouvel incident.
  const incidents = tries
    .filter((ev) => !ev.reprise)
    .map((ev) => ({
      ...(ev.id ? { id: ev.id } : {}),
      facade: ev.choix === "autre_facade" ? (ev.facadeInitiale ?? ev.facade) : ev.facade,
      facadePosee: ev.facade,
      ...(ev.facadeInitiale ? { facadeInitiale: ev.facadeInitiale } : {}),
      choix: ev.choix,
      motif: ev.motif,
      debut: ev.debut,
      ouvert: !estIncidentCloture(ev, reprises),
    }));

  const derniereReprise = reprises.length
    ? (reprises[reprises.length - 1].reprise as { at: string; note: string })
    : null;

  const statut: StatutActiviteJournee = reprises.length ? "reprise" : "vert";

  const parties: string[] = [`Ossature posée : ${facadesPosees.map((f) => LIBELLES_FACADE[f]).join(", ")}.`];
  for (const inc of incidents) {
    const prefixe = inc.choix === "intemperies" ? "Gêne signalée" : "Façade bloquée";
    parties.push(
      `${prefixe} — ${LIBELLES_FACADE[inc.facade]}${inc.motif ? ` : ${inc.motif}` : " (motif à documenter)"}${inc.ouvert ? " [ouvert]" : " [documenté]"}.`,
    );
  }
  if (derniereReprise) parties.push(`Reprise documentée le ${derniereReprise.at}.`);

  return {
    statut,
    facadesPosees,
    incidents,
    derniereReprise,
    resume: parties.join(" "),
  };
}

/**
 * Validation d'une saisie d'événement.
 *
 * Le choix B EXIGE une façade initiale : sans elle, on ne saurait pas quelle
 * façade reste bloquée, et l'incident serait perdu. Le choix A exige une
 * façade posée. Le motif n'est jamais exigé pour A — refuser d'enregistrer un
 * incident faute de texte pousserait l'équipe à ne rien enregistrer du tout.
 */
export function validerEvenement(saisie: {
  choix: ChoixOssature | null;
  facade: FacadeOssature | null;
  facadeInitiale: FacadeOssature | null;
  motif: string;
}): { ok: true } | { ok: false; erreur: string } {
  if (!saisie.choix) return { ok: false, erreur: "Choisissez l'un des deux cas." };
  if (!saisie.facade) return { ok: false, erreur: "Indiquez la façade concernée." };
  if (saisie.choix === "autre_facade") {
    if (!saisie.facadeInitiale) {
      return { ok: false, erreur: "Indiquez la façade qui reste bloquée." };
    }
    if (saisie.facadeInitiale === saisie.facade) {
      return { ok: false, erreur: "La façade posée et la façade bloquée sont identiques." };
    }
  }
  return { ok: true };
}

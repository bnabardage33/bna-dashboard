import { fmtEuro } from "@/lib/financeCalculs";
import {
  detecterEtCalculerPreChiffrage,
  type DevisPrefillPayload,
  type PreChiffrageBnaResult,
} from "@/lib/bnaIaPreChiffrage";
import {
  normaliserRequeteMetier,
  type ResultatNormalisationMetier,
} from "@/lib/bnaDictionnaireMetier";
import {
  calculerParametresTerrasseNormatifs,
  genererReponseNormativeTerrasseLocale,
} from "@/lib/bnaReferentielTerrasse";
import {
  calculerParametresBardageNormatifs,
  genererReponseNormativeBardageLocale,
} from "@/lib/bnaReferentielBardage";
import { calculerMontantDeplacement } from "@/lib/deplacement/calcul";
import {
  EMOJI_VIGILANCE,
  type CouleurVigilance,
} from "@/lib/vigilanceMeteoFrance";

export const DEPOT_BNA_DEFAUT = "Générac (33920)";

export type MetierBna = "bardage" | "terrasse" | "cloture";

export type BnaIaActionType =
  | "update_avancement"
  | "shift_planning"
  | "create_note"
  | "create_devis"
  | "open_calepineur_3d"
  | "open_hub"
  | "open_planning"
  | "open_devis"
  | "open_commandes"
  | "open_sav"
  | "open_fin_chantier";

export interface CalepineurPrefillPayload {
  metier: MetierBna;
  nomSuggere: string;
  resume: string;
  surfaceOuLineaire?: number;
  raisons: string[];
}

export interface BnaIaAction {
  id: string;
  type: BnaIaActionType;
  title: string;
  description: string;
  executed?: boolean;
  payload: {
    chantierId?: string;
    chantierNom?: string;
    metier?: MetierBna;
    nouvelAvancement?: number;
    decalageJours?: number;
    noteTitre?: string;
    noteContenu?: string;
    devisPrefill?: DevisPrefillPayload;
    calepineurPrefill?: CalepineurPrefillPayload;
    href?: string;
  };
}

export interface BnaIaMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  actions?: BnaIaAction[];
  tags?: string[];
  source?: "bna_expert_engine" | "cloud_llm";
}

export interface BnaIaPrevisionJourCtx {
  date: string;
  tempMinC: number;
  tempMaxC: number;
  rafalesKmh: number;
  pluieMm: number;
  conditions: string;
  alertesDtu: string[];
}

export interface BnaIaChantierCtx {
  id: string;
  nom: string;
  ville?: string | null;
  metier: MetierBna;
  statut: string;
  avancement: number;
  date_debut?: string | null;
  date_fin?: string | null;
  alerte_meteo?: string | null;
  previsionsMeteo3J?: BnaIaPrevisionJourCtx[];
}

export interface BnaIaCommandeCtx {
  id: string;
  designation: string;
  fournisseur_nom?: string | null;
  chantier_id?: string | null;
  chantier_nom?: string | null;
  statut: string;
  date_livraison_prevue?: string | null;
  montant_ht?: number | null;
}

export interface BnaIaDevisCtx {
  id: string;
  numero: string;
  chantier_id?: string | null;
  statut: string;
  total_ht: number;
  marge_ht: number;
  marge_pct: number;
}

export interface BnaIaFactureCtx {
  id: string;
  numero: string;
  chantier_id?: string | null;
  statut: string;
  total_ttc: number;
  montant_paye_ttc: number;
  date_echeance?: string | null;
}

export interface BnaIaPvCtx {
  id: string;
  numero: string;
  chantier_id?: string | null;
  statut: string;
  reserves_nb: number;
}

export interface BnaIaSavCtx {
  id: string;
  numero: string;
  titre: string;
  metier: MetierBna;
  statut: string;
  priorite: string;
}

export interface BnaIaDeplacementCtx {
  depart: string;
  destination: string;
  distanceAllerKm: number;
  distanceRetourKm: number;
  distanceTotaleArKm: number;
  dureeTrajetAllerMin: number;
  tarifKmHt: number;
  nbJoursChantier: number;
  coutUnitaireArHt: number;
  coutTotalDeplacementHt: number;
}

export interface BnaIaVigilanceMfCtx {
  departement: string;
  couleur: CouleurVigilance;
  phenomenesActifs: Array<{ nom: string; couleur: CouleurVigilance }>;
}

export interface BnaIaContext {
  userName: string;
  currentDateIso: string;
  currentDateFr?: string;
  currentTimeParis?: string;
  chantiers: BnaIaChantierCtx[];
  meteoVilleLibre?: {
    ville: string;
    previsions: BnaIaPrevisionJourCtx[];
    vigilanceMf?: BnaIaVigilanceMfCtx[];
  } | null;
  deplacementVilleLibre?: BnaIaDeplacementCtx | null;
  commandes: BnaIaCommandeCtx[];
  devis: BnaIaDevisCtx[];
  factures: BnaIaFactureCtx[];
  pvs: BnaIaPvCtx[];
  ticketsSav: BnaIaSavCtx[];
}

export interface BnaIaAlerteProactive {
  id: string;
  categorie: "commande" | "facture" | "sav" | "pv" | "meteo";
  severite: "haute" | "moyenne";
  titre: string;
  detail: string;
  href: string;
  promptIA: string;
}

export const DTU_KNOWLEDGE_BASE = {
  terrasse_51_4: {
    code: "NF DTU 51.4",
    titre: "Platelages extérieurs en bois et matériaux composites",
    regles: [
      "Entraxe lambourdes : 40 cm à 50 cm max selon épaisseur de lame (≤ 20× épaisseur de lame).",
      "Pente d'écoulement : minimum 1,5 % conseillé loin des façades.",
      "Jeu entre lames : 4 à 7 mm (classe d'emploi 4 minimum pour bois en contact extérieur).",
      "Double lambourdage obligatoire aux aboutages de lames.",
      "Ventilation sous platelage : lame d'air continue ≥ 20 mm, bande EPDM sur lambourdes bois.",
    ],
  },
  terrasse_mobile_p90_308: {
    code: "NF P90-308 & DTU 51.4",
    titre: "Terrasse Mobile de Piscine & Motorisation",
    regles: [
      "Sécurité bassin NF P90-308 : verrouillage mécanique ou motorisé en position fermée, charge d'exploitation ≥ 150 kg/m².",
      "Guidage sur rails inox avec galets à roulements étanches et butées de fin de course.",
      "Motorisation 24V (solaire ou filaire) avec crémaillère inox et arrêt d'urgence.",
    ],
  },
  bardage_41_2: {
    code: "NF DTU 41.2",
    titre: "Revêtements extérieurs en bois",
    regles: [
      "Lame d'air ventilée continue ≥ 20 mm derrière le parement (entrée basse + sortie haute avec grilles anti-rongeurs).",
      "Garde au sol : ≥ 20 cm par rapport au sol fini (ou 5 cm sur appui dur/terrasse avec bavette).",
      "Fixations inox A2 (ou A4 en zone côtière/agressive) — 2 pointes/vis par lame sur chaque appui.",
      "Équerres de façade posées en quinconce (porteuses + guides de dilatation) avec rupture de pont thermique si ITE.",
    ],
  },
  bardage_45_4: {
    code: "NF DTU 45.4",
    titre: "Bardages rapportés en panneaux HPL / stratifiés compacts",
    regles: [
      "Jeu de dilatation périphérique 8 à 10 mm entre panneaux HPL.",
      "Point fixe central + points glissants oblongs pour absorber la dilatation thermique.",
    ],
  },
  cloture_p98_405: {
    code: "Règles pro Clôtures & NF P98-405",
    titre: "Clôtures bois, composite, alu & portillons",
    regles: [
      "Scellement béton des poteaux : profondeur 45 à 60 cm (selon hauteur et exposition au vent), béton dosé à 350 kg/m³.",
      "Platine boulonnée sur muret sain : goujons d'ancrage M10/M12 inox ou résine chimique.",
      "Gestion des pentes par redans progressifs avec plaque de soubassement béton ou alu.",
      "Poteaux d'angle dédiés sans doublon aux jonctions de segments.",
    ],
  },
} as const;

export function normaliserMetierBna(metier: string | null | undefined): MetierBna {
  if (metier === "terrasse" || metier === "cloture") return metier;
  return "bardage";
}

export function urlHubPourChantier(id: string, metier?: string | null): string {
  const m = normaliserMetierBna(metier);
  if (m === "terrasse") return `/terrain/terrasse/${id}`;
  if (m === "cloture") return `/terrain/cloture/${id}`;
  return `/terrain/chantier/${id}`;
}

export function calculerSyntheseFinanciereBna(
  devis: BnaIaDevisCtx[],
  factures: BnaIaFactureCtx[],
  currentDateIso: string
) {
  const devisActifs = devis.filter((d) => d.statut !== "refuse" && d.statut !== "annule");
  const devisSignes = devisActifs.filter((d) =>
    ["signe", "accepte", "facture"].includes(d.statut)
  );
  const devisEnAttente = devisActifs.filter(
    (d) => !["signe", "accepte", "facture"].includes(d.statut)
  );

  const caSigneHt = devisSignes.reduce((s, d) => s + (d.total_ht || 0), 0);
  const pipelineHt = devisEnAttente.reduce((s, d) => s + (d.total_ht || 0), 0);
  const margeSigneeHt = devisSignes.reduce((s, d) => s + (d.marge_ht || 0), 0);
  const margeMoyennePct = caSigneHt > 0 ? Math.round((margeSigneeHt / caSigneHt) * 1000) / 10 : 0;

  const facturesValides = factures.filter((f) => f.statut !== "annulee");
  const encaisseTtc = facturesValides.reduce((s, f) => s + (f.montant_paye_ttc || 0), 0);
  const totalFactureTtc = facturesValides.reduce((s, f) => s + (f.total_ttc || 0), 0);
  const resteAEncaisserTtc = Math.max(0, totalFactureTtc - encaisseTtc);

  const facturesEchues = facturesValides.filter(
    (f) =>
      f.statut !== "payee" &&
      (f.total_ttc - f.montant_paye_ttc) > 0.01 &&
      Boolean(f.date_echeance && f.date_echeance < currentDateIso)
  );
  const montantEchuTtc = facturesEchues.reduce(
    (s, f) => s + Math.max(0, f.total_ttc - f.montant_paye_ttc),
    0
  );

  return {
    caSigneHt,
    pipelineHt,
    margeSigneeHt,
    margeMoyennePct,
    encaisseTtc,
    resteAEncaisserTtc,
    nbFacturesEchues: facturesEchues.length,
    montantEchuTtc,
  };
}

export function calculerAlertesProactives(ctx: BnaIaContext): BnaIaAlerteProactive[] {
  const alertes: BnaIaAlerteProactive[] = [];

  const commandesRetard = ctx.commandes.filter(
    (c) =>
      c.statut !== "livree" &&
      c.statut !== "annulee" &&
      Boolean(c.date_livraison_prevue && c.date_livraison_prevue < ctx.currentDateIso)
  );
  if (commandesRetard.length > 0) {
    const premiere = commandesRetard[0];
    alertes.push({
      id: "alerte-cmd-retard",
      categorie: "commande",
      severite: "haute",
      titre: `${commandesRetard.length} commande(s) fournisseur en retard`,
      detail: `${premiere.designation} (${premiere.fournisseur_nom || "Fournisseur"}) prévue le ${premiere.date_livraison_prevue}`,
      href: `/bureau/fournisseurs?tab=commandes&retard=${premiere.id}`,
      promptIA: "Fais le point sur mes commandes fournisseurs en retard et les livraisons attendues.",
    });
  }

  const finance = calculerSyntheseFinanciereBna(ctx.devis, ctx.factures, ctx.currentDateIso);
  if (finance.nbFacturesEchues > 0) {
    alertes.push({
      id: "alerte-factures-echues",
      categorie: "facture",
      severite: "haute",
      titre: `${finance.nbFacturesEchues} facture(s) échue(s) à relancer`,
      detail: `Montant impayé échu : ${fmtEuro(finance.montantEchuTtc)} TTC`,
      href: "/bureau/factures",
      promptIA: "Quel est mon bilan trésorerie et quelles factures échues dois-je relancer ?",
    });
  }

  const savOuverts = ctx.ticketsSav.filter(
    (t) => t.statut !== "cloture" && t.statut !== "resolu"
  );
  if (savOuverts.length > 0) {
    alertes.push({
      id: "alerte-sav-ouverts",
      categorie: "sav",
      severite: savOuverts.some((t) => t.priorite === "urgente") ? "haute" : "moyenne",
      titre: `${savOuverts.length} ticket(s) SAV en cours`,
      detail: `${savOuverts[0].numero} — ${savOuverts[0].titre}`,
      href: "/bureau/sav",
      promptIA: "Quels sont mes tickets SAV ouverts et mes réserves PV à lever ?",
    });
  }

  const pvReserves = ctx.pvs.filter(
    (p) => p.statut === "avec_reserves" || p.reserves_nb > 0
  );
  if (pvReserves.length > 0) {
    alertes.push({
      id: "alerte-pv-reserves",
      categorie: "pv",
      severite: "moyenne",
      titre: `${pvReserves.length} PV de réception avec réserves`,
      detail: `${pvReserves[0].numero} (${pvReserves[0].reserves_nb} réserve(s))`,
      href: "/bureau/fin-chantier",
      promptIA: "Quelles sont les réserves à lever sur mes PV de réception ?",
    });
  }

  const chantiersMeteo = ctx.chantiers.filter((c) => Boolean(c.alerte_meteo));
  if (chantiersMeteo.length > 0) {
    alertes.push({
      id: "alerte-meteo",
      categorie: "meteo",
      severite: "moyenne",
      titre: `Vigilance météo sur ${chantiersMeteo.length} chantier(s)`,
      detail: `${chantiersMeteo[0].nom} : ${chantiersMeteo[0].alerte_meteo}`,
      href: "/terrain/meteo",
      promptIA: "Vérifie la vigilance météo et les conditions de pose DTU sur mes chantiers actifs.",
    });
  }

  return alertes;
}

export function findMentionedChantier(
  text: string,
  chantiers: BnaIaChantierCtx[],
  fallbackId?: string
): BnaIaChantierCtx | undefined {
  const lower = text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");

  for (const c of chantiers) {
    const nomNorm = c.nom
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    const tokens = nomNorm.split(/[\s\-_]+/).filter((t) => t.length >= 3);
    if (tokens.some((tok) => lower.includes(tok))) {
      return c;
    }
  }

  if (fallbackId) {
    return chantiers.find((c) => c.id === fallbackId);
  }
  return undefined;
}

export function parseNaturalDate(text: string, baseDateIso?: string): string {
  const base = baseDateIso ? new Date(`${baseDateIso}T12:00:00`) : new Date();
  const lower = text.toLowerCase();

  if (lower.includes("après-demain") || lower.includes("apres-demain")) {
    base.setDate(base.getDate() + 2);
  } else if (lower.includes("demain")) {
    base.setDate(base.getDate() + 1);
  }

  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export interface EscaladeCalepineur3D {
  estComplexe: boolean;
  raisons: string[];
  avertissement: string;
  metier: MetierBna;
  href: string;
  calepineurPrefill: CalepineurPrefillPayload;
}

export function detecterChantierComplexe(
  message: string,
  preChiffrage?: PreChiffrageBnaResult | null
): EscaladeCalepineur3D | null {
  const lower = message.toLowerCase();
  const raisons: string[] = [];

  if (/maison\s*compl[èe]te|toute\s+la\s+maison|\bpavillon\b|\bvilla\b/i.test(lower)) {
    raisons.push("maison complète");
  }

  const matchFacades = lower.match(/\b([3-9]|trois|quatre)\s*fa[çc]ades?\b/i);
  if (matchFacades) {
    raisons.push(`${matchFacades[0]} (> 2 façades)`);
  }

  if (/\bpignons?\b/i.test(lower)) {
    raisons.push("présence de pignon(s)");
  }

  // Compter les ouvertures mentionnées explicitement
  const regexNbOuv = /\b(\d+)\s*(?:fen[êe]tre|baie|porte(?:-fen[êe]tre)?|ouverture)s?\b/gi;
  let totalOuv = 0;
  let mOuv: RegExpExecArray | null;
  while ((mOuv = regexNbOuv.exec(lower)) !== null) {
    totalOuv += Number(mOuv[1] || 0);
  }
  const nbMotsOuv = (lower.match(/\b(?:fen[êe]tre|baie|porte(?:-fen[êe]tre)?|ouverture)s?\b/gi) ?? []).length;
  if (totalOuv > 3 || nbMotsOuv > 3) {
    raisons.push(`plus de 3 ouvertures (${Math.max(totalOuv, nbMotsOuv)})`);
  }

  if (/\ben\s+l\b|\ben\s+u\b|\b4\s*c[ôo]t[ée]s?\b|\bquatre\s*c[ôo]t[ée]s?\b|[ée]tage|r\+1|garage\s+attenant/i.test(lower)) {
    raisons.push("géométrie complexe (en L / en U / 4 côtés / R+1)");
  }

  if (/terrasse\s+mobile|plateau\s+mobile/i.test(lower)) {
    raisons.push("terrasse mobile");
  }

  if (raisons.length === 0) return null;

  const metier: MetierBna =
    preChiffrage?.metier ??
    (/terrasse|platelage|piscine/i.test(lower)
      ? "terrasse"
      : /cl[ôo]ture|palissade|portillon/i.test(lower)
        ? "cloture"
        : "bardage");

  const href =
    metier === "terrasse"
      ? "/terrain/terrasse"
      : metier === "cloture"
        ? "/terrain/cloture"
        : "/terrain/chantier";

  const detailMetier =
    metier === "terrasse"
      ? "(calepinage 3D, réservations, rails inox et découpes au millimètre)"
      : metier === "cloture"
        ? "(calepinage 3D, redans de pente, angles et portillons)"
        : "(imbrication plaques, pignons, ouvertures)";

  return {
    estComplexe: true,
    raisons,
    avertissement: `⚠️ Chantier complexe détecté : pour un débit exact au millimètre ${detailMetier}, basculez vers le Calepineur 3D dédié.`,
    metier,
    href,
    calepineurPrefill: {
      metier,
      nomSuggere: preChiffrage?.titre || `Chantier ${metier.toUpperCase()} complexe`,
      resume: message.trim().slice(0, 220),
      surfaceOuLineaire: preChiffrage?.surfaceOuLineaire,
      raisons,
    },
  };
}

export function detectBnaIaActions(message: string, ctx: BnaIaContext): BnaIaAction[] {
  const norm = normaliserRequeteMetier(message);
  const texte = norm.texteNormalise;
  const lower = texte.toLowerCase();
  const actions: BnaIaAction[] = [];
  const chantierCible = findMentionedChantier(texte, ctx.chantiers);

  // 0. Pré-chiffrage déterministe -> bouton 1-clic « Créer le devis pré-rempli » ou « Créer le devis global multi-lots »
  const preChiffrage = detecterEtCalculerPreChiffrage(texte);
  if (preChiffrage) {
    const dep = ctx.deplacementVilleLibre;
    const devisAvecDep: DevisPrefillPayload = dep
      ? {
          ...preChiffrage.devisPrefill,
          lignes: [
            ...preChiffrage.devisPrefill.lignes,
            {
              catalogue_id: null,
              designation: `Frais de déplacement (${dep.depart} -> ${dep.destination})`,
              description: `${dep.distanceAllerKm} km aller (${dep.distanceTotaleArKm} km A/R) · ${dep.nbJoursChantier} jour(s) à ${fmtEuro(dep.tarifKmHt)}/km`,
              qte: dep.nbJoursChantier,
              unite: "A/R",
              pu_ht: dep.coutUnitaireArHt,
              pu_revient: Math.round(dep.coutUnitaireArHt * 0.65 * 100) / 100,
              type_cout: "matiere",
              a_chiffrer: false,
            },
          ],
        }
      : preChiffrage.devisPrefill;
    const totalHtAvecDep = dep
      ? Math.round((preChiffrage.totalHt + dep.coutTotalDeplacementHt) * 100) / 100
      : preChiffrage.totalHt;

    actions.push({
      id: preChiffrage.estMultiLots
        ? "act-create-devis-multi-lots"
        : `act-create-devis-${preChiffrage.metier}`,
      type: "create_devis",
      title: preChiffrage.estMultiLots
        ? "Créer le devis global multi-lots"
        : "Créer le devis pré-rempli",
      description: `${preChiffrage.titre} · ${fmtEuro(totalHtAvecDep)} HT (${preChiffrage.heuresPoseTotal} h${dep ? ` + déplacement ${dep.destination}` : ""})`,
      payload: {
        metier: preChiffrage.metier,
        devisPrefill: devisAvecDep,
      },
    });
  }

  // 0b. Escalade vers le Calepineur 3D si chantier complexe détecté (par lot si multi-lots)
  const escalade = detecterChantierComplexe(texte, preChiffrage);
  if (preChiffrage?.estMultiLots && preChiffrage.lots && preChiffrage.lots.length > 0) {
    for (const lot of preChiffrage.lots) {
      const hrefLot =
        lot.metier === "terrasse"
          ? "/terrain/terrasse"
          : lot.metier === "cloture"
            ? "/terrain/cloture"
            : "/terrain/chantier";
      const labelLot =
        lot.metier === "terrasse"
          ? "Terrasse"
          : lot.metier === "cloture"
            ? "Clôture"
            : "Bardage";
      actions.push({
        id: `act-calepineur-3d-${lot.metier}`,
        type: "open_calepineur_3d",
        title: `Créer le chantier ${labelLot} et ouvrir le Calepineur 3D`,
        description: `${lot.titre} · Débit exact au mm.`,
        payload: {
          metier: lot.metier,
          href: hrefLot,
          calepineurPrefill: {
            metier: lot.metier,
            nomSuggere: lot.titre,
            resume: texte.trim().slice(0, 220),
            surfaceOuLineaire: lot.surfaceOuLineaire,
            raisons: escalade?.raisons ?? ["projet multi-lots"],
          },
        },
      });
    }
  } else if (escalade) {
    actions.push({
      id: `act-calepineur-3d-${escalade.metier}`,
      type: "open_calepineur_3d",
      title: "Créer le chantier et ouvrir le Calepineur 3D",
      description: `Critères : ${escalade.raisons.join(", ")} · Débit exact au mm.`,
      payload: {
        metier: escalade.metier,
        href: escalade.href,
        calepineurPrefill: escalade.calepineurPrefill,
      },
    });
  }

  // 1. Mise à jour avancement
  const matchPct = message.match(/(\d{1,3})\s*%/);
  if (
    matchPct &&
    (lower.includes("avancement") || lower.includes("passe") || lower.includes("mets"))
  ) {
    const pct = Math.min(100, Math.max(0, Number(matchPct[1])));
    const cible = chantierCible || ctx.chantiers[0];
    if (cible) {
      actions.push({
        id: `act-avancement-${cible.id}`,
        type: "update_avancement",
        title: `Passer ${cible.nom} à ${pct} %`,
        description: `Met à jour l'avancement du chantier ${cible.nom} (${cible.metier}) à ${pct} %.`,
        payload: {
          chantierId: cible.id,
          chantierNom: cible.nom,
          metier: cible.metier,
          nouvelAvancement: pct,
        },
      });
    }
  }

  // 2. Décalage planning
  const matchJours = message.match(/(\d+)\s*jour/i);
  if (
    matchJours &&
    (lower.includes("décale") || lower.includes("decale") || lower.includes("reporte") || lower.includes("planning"))
  ) {
    const jours = Math.max(1, Number(matchJours[1]));
    const cible = chantierCible || ctx.chantiers[0];
    if (cible) {
      actions.push({
        id: `act-shift-${cible.id}`,
        type: "shift_planning",
        title: `Décaler ${cible.nom} de +${jours} j`,
        description: `Décale date_debut et date_fin du chantier ${cible.nom} sur le planning.`,
        payload: {
          chantierId: cible.id,
          chantierNom: cible.nom,
          decalageJours: jours,
        },
      });
    }
  }

  // 3. Création note patron
  if (
    lower.startsWith("note :") ||
    lower.startsWith("note:") ||
    lower.includes("crée une note") ||
    lower.includes("cree une note") ||
    lower.includes("enregistre une note")
  ) {
    const contenu = message
      .replace(/^(note\s*:|crée une note\s*:?|cree une note\s*:?|enregistre une note\s*:?)/i, "")
      .trim() || message.trim();
    actions.push({
      id: `act-note-${Date.now()}`,
      type: "create_note",
      title: "Enregistrer dans Notes Patron",
      description: contenu.slice(0, 90),
      payload: {
        noteTitre: contenu.split(".")[0].slice(0, 45) || "Note BNA-IA",
        noteContenu: contenu,
      },
    });
  }

  // 4. Raccourci ouverture Hub si un chantier est mentionné
  if (chantierCible && (lower.includes("ouvre") || lower.includes("hub") || lower.includes("calepinage") || lower.includes("voir"))) {
    actions.push({
      id: `act-hub-${chantierCible.id}`,
      type: "open_hub",
      title: `Ouvrir Hub ${chantierCible.nom}`,
      description: `Accès direct au hub ${chantierCible.metier} de ${chantierCible.nom}.`,
      payload: {
        chantierId: chantierCible.id,
        chantierNom: chantierCible.nom,
        metier: chantierCible.metier,
        href: urlHubPourChantier(chantierCible.id, chantierCible.metier),
      },
    });
  }

  // 5. Liens contextuels rapides
  if (lower.includes("planning")) {
    actions.push({
      id: "act-open-planning",
      type: "open_planning",
      title: "Ouvrir le Planning multi-métiers",
      description: "Timeline consolidée Bardage, Terrasse et Clôture.",
      payload: { href: "/terrain" },
    });
  }
  if (lower.includes("commande") || lower.includes("fournisseur") || lower.includes("retard")) {
    actions.push({
      id: "act-open-commandes",
      type: "open_commandes",
      title: "Voir les commandes fournisseurs",
      description: "Suivi des livraisons, retards et marges matériaux.",
      payload: { href: "/bureau/fournisseurs?tab=commandes" },
    });
  }
  if (lower.includes("sav") || lower.includes("garantie")) {
    actions.push({
      id: "act-open-sav",
      type: "open_sav",
      title: "Ouvrir le module SAV & Garanties",
      description: "Tickets SAV multi-métiers et garanties légales.",
      payload: { href: "/bureau/sav" },
    });
  }
  if (lower.includes("réception") || lower.includes("reception") || lower.includes("pv")) {
    actions.push({
      id: "act-open-fin-chantier",
      type: "open_fin_chantier",
      title: "Ouvrir Fin de chantier & PV",
      description: "Procès-verbaux de réception, réserves et retenues 5 %.",
      payload: { href: "/bureau/fin-chantier" },
    });
  }
  if (lower.includes("devis") || lower.includes("facture") || lower.includes("trésorerie") || lower.includes("tresorerie")) {
    actions.push({
      id: "act-open-devis",
      type: "open_devis",
      title: "Ouvrir Devis & Factures",
      description: "Accéder aux chiffrages et relances clients.",
      payload: { href: "/bureau/devis-factures" },
    });
  }

  return actions;
}

export function formaterDateFrEuropeParis(date: Date = new Date()): {
  dateIso: string;
  dateFr: string;
  heureParis: string;
} {
  const dateIso = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Paris",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);

  const dateFrRaw = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  }).format(date);
  const dateFr = dateFrRaw.charAt(0).toUpperCase() + dateFrRaw.slice(1);

  const heureParis = new Intl.DateTimeFormat("fr-FR", {
    timeZone: "Europe/Paris",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);

  return { dateIso, dateFr, heureParis };
}

export function evaluerAlertesDtuMeteoJour(jour: {
  tempMinC: number;
  tempMaxC: number;
  rafalesKmh: number;
  pluieMm: number;
  conditions?: string;
}): string[] {
  const alertes: string[] = [];
  if (jour.tempMinC < 5) {
    alertes.push(
      "Température < 5 °C : pose composite interdite/déconseillée (Océwood / Neowood) et vigilance scellement béton poteaux clôture."
    );
  }
  if (jour.rafalesKmh >= 50) {
    alertes.push(
      "Rafales >= 50 km/h : alerte manutention panneaux HPL grand format et échafaudages."
    );
  }
  if (
    jour.pluieMm >= 5 ||
    /pluie\s*forte|averse|orage/i.test(jour.conditions || "")
  ) {
    alertes.push(
      "Pluie >= 5 mm : alerte traitement des coupes bois et collage/étanchéité."
    );
  }
  return alertes;
}

export function calculerChiffrageDeplacementBna(params: {
  depart?: string;
  destination: string;
  distanceAllerKm: number;
  dureeTrajetAllerMin: number;
  tarifKmHt?: number;
  nbJoursChantier?: number;
}): BnaIaDeplacementCtx {
  const depart = params.depart || DEPOT_BNA_DEFAUT;
  const distanceAllerKm = Math.max(0, Math.round(params.distanceAllerKm * 10) / 10);
  const distanceRetourKm = distanceAllerKm;
  const distanceTotaleArKm = Math.round((distanceAllerKm + distanceRetourKm) * 10) / 10;
  const dureeTrajetAllerMin = Math.max(1, Math.round(params.dureeTrajetAllerMin));
  const tarifKmHt = params.tarifKmHt && params.tarifKmHt > 0 ? params.tarifKmHt : 1.0;
  const nbJoursChantier = Math.max(1, Math.round(params.nbJoursChantier ?? 1));
  const coutUnitaireArHt = calculerMontantDeplacement(
    distanceAllerKm,
    distanceRetourKm,
    tarifKmHt
  );
  const coutTotalDeplacementHt =
    Math.round(coutUnitaireArHt * nbJoursChantier * 100) / 100;

  return {
    depart,
    destination: params.destination,
    distanceAllerKm,
    distanceRetourKm,
    distanceTotaleArKm,
    dureeTrajetAllerMin,
    tarifKmHt,
    nbJoursChantier,
    coutUnitaireArHt,
    coutTotalDeplacementHt,
  };
}

export function formaterResumeDeplacement(d: BnaIaDeplacementCtx): string {
  const h = Math.floor(d.dureeTrajetAllerMin / 60);
  const min = d.dureeTrajetAllerMin % 60;
  const dureeStr = h > 0 ? `${h}h${String(min).padStart(2, "0")}` : `${min} min`;
  return (
    `🚐 **Logistique & Déplacement (${d.depart} -> ${d.destination})** : ` +
    `${d.distanceAllerKm} km aller (${d.distanceTotaleArKm} km A/R) · ~${dureeStr} par trajet · ` +
    `${d.nbJoursChantier} jour(s) × ${fmtEuro(d.coutUnitaireArHt)} = **${fmtEuro(d.coutTotalDeplacementHt)} HT**`
  );
}

export function formaterVigilanceMeteoFrance(
  vigilances: BnaIaVigilanceMfCtx[]
): string {
  if (!vigilances || vigilances.length === 0) return "";
  return vigilances
    .map((v) => {
      const emoji = EMOJI_VIGILANCE[v.couleur];
      const niveau = v.couleur.toUpperCase();
      if (v.couleur === "vert" || v.phenomenesActifs.length === 0) {
        return `${emoji} Vigilance Météo-France Dépt. ${v.departement} : **${niveau}** (aucun phénomène actif)`;
      }
      const details = v.phenomenesActifs
        .map((p) => `${EMOJI_VIGILANCE[p.couleur]} ${p.nom} (${p.couleur.toUpperCase()})`)
        .join(", ");
      return `${emoji} **ALERTE VIGILANCE MÉTÉO-FRANCE Dépt. ${v.departement} (${niveau})** : ${details}`;
    })
    .join("\n");
}

export function extraireDestinationLibre(message: string): string | null {
  // 1. Code postal + ville explicite (ex: "33120 Arcachon")
  const matchCp = message.match(/\b(\d{5}\s+[A-Za-zÀ-ÖØ-öø-ÿ'’\-]{2,})\b/);
  if (matchCp) return matchCp[1].trim();

  // 2. Localité après "chantier à/de", "déplacement à/vers", "à", "sur", "vers", "secteur"
  const STOP_WORDS = new Set([
    "demain",
    "aujourd",
    "aujourd'hui",
    "apres-demain",
    "après-demain",
    "l'abri",
    "cause",
    "midi",
    "matin",
    "soir",
    "la",
    "le",
    "les",
    "un",
    "une",
    "mon",
    "ma",
    "mes",
    "vos",
    "nos",
    "ce",
    "cette",
    "ces",
    "bardage",
    "terrasse",
    "cloture",
    "clôture",
    "pose",
    "l'eau",
    "temps",
    "combien",
    "quel",
    "quelle",
    "300",
    "45",
    "50",
    "80",
    "100",
  ]);

  const regexLieu =
    /(?:\b(?:chantier\s+(?:de|d['’]|à|a|en|dans\s+le)|d[ée]placement\s+(?:à|a|vers|sur|en|dans\s+le)|dans\s+le|[àa]|au|en|sur|vers|secteur(?:\s+de)?)\s+)([A-ZÀ-ÖØ-Ýa-zà-öø-ÿ][A-ZÀ-ÖØ-Ýa-zà-öø-ÿ'’\-]{1,}(?:\s+[A-ZÀ-ÖØ-Ýa-zà-öø-ÿ'’\-]{2,}){0,2})/gi;

  let m: RegExpExecArray | null;
  while ((m = regexLieu.exec(message)) !== null) {
    const brut = m[1]
      .replace(
        /\s+(?:demain|aujourd['’]?hui|apr[èe]s-demain|(?:en\s+)?bardage|(?:en\s+)?terrasse|(?:en\s+)?cl[ôo]ture|pour|est-ce|si|et|ou|avec).*$/i,
        ""
      )
      .trim();
    const firstWord = brut
      .split(/\s+/)[0]
      ?.toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
    if (brut.length >= 2 && firstWord && !STOP_WORDS.has(firstWord)) {
      return brut;
    }
  }
  return null;
}

export function extraireVilleMeteoLibre(message: string): string | null {
  const estQuestionMeteo =
    /\bm[ée]t[ée]o\b|\bpluie\b|\bvent\b|conditions?\s*(?:m[ée]t[ée]o|de\s*pose|sont\s*bonnes)|repousser|d[ée]caler|\btemp[ée]rature\b|\bgel\b|\borages?\b/i.test(
      message
    );
  if (!estQuestionMeteo) return null;
  return extraireDestinationLibre(message);
}

export function estQuestionConseilOuSuivi(
  message: string,
  hasHistory: boolean
): boolean {
  if (hasHistory) return true;
  return /que\s+me\s+conseilles|qu['’]?e?s(?:t)?(?:-ce)?\s+que\s+tu\s+(?:me\s+)?conseilles|tu\s+me\s+conseilles|vaut(?:-il)?\s+mieux|maintenir\s+ou\s+repousser|repousser\s+ou\s+maintenir|ton\s+avis|\bpourquoi\b|\bd[ée]taille\b|\bexplique\b|\bcomment\s+faire\b|arbitrage|recommandes?/i.test(
    message
  );
}

export interface BnaIaHistoryTurn {
  role: "user" | "assistant";
  content: string;
}

export function buildSystemPromptContext(
  ctx: BnaIaContext,
  preChiffrage?: PreChiffrageBnaResult | null,
  normalisation?: ResultatNormalisationMetier | null,
  escalade?: EscaladeCalepineur3D | null,
  dernierPreChiffrage?: string | null
): string {
  const maintenant = formaterDateFrEuropeParis(
    ctx.currentDateIso ? new Date(`${ctx.currentDateIso}T12:00:00Z`) : new Date()
  );
  const dateFr = ctx.currentDateFr || maintenant.dateFr;
  const heureParis = ctx.currentTimeParis || "";

  const chantiersTxt =
    ctx.chantiers.length === 0
      ? "Aucun chantier actif."
      : ctx.chantiers
          .map((c) => {
            const previsionsTxt =
              c.previsionsMeteo3J && c.previsionsMeteo3J.length > 0
                ? `\n  Météo 3J : ${c.previsionsMeteo3J
                    .map(
                      (j) =>
                        `${j.date}: ${j.tempMinC}°/${j.tempMaxC}°C, rafales ${j.rafalesKmh} km/h, pluie ${j.pluieMm} mm (${j.conditions})${
                          j.alertesDtu.length > 0 ? ` [⚠️ ${j.alertesDtu.join(" | ")}]` : ""
                        }`
                    )
                    .join(" ; ")}`
                : "";
            return `- [${c.metier.toUpperCase()}] ${c.nom} (${c.ville || "Gironde"}) · Statut: ${c.statut} · Avancement: ${c.avancement}% · Dates: ${c.date_debut || "?"} -> ${c.date_fin || "?"}${c.alerte_meteo ? ` · Météo: ${c.alerte_meteo}` : ""}${previsionsTxt}`;
          })
          .join("\n");

  const commandesTxt =
    ctx.commandes.length === 0
      ? "Aucune commande."
      : ctx.commandes
          .slice(0, 12)
          .map(
            (cmd) =>
              `- ${cmd.designation} (${cmd.fournisseur_nom || "Fournisseur"}) · Statut: ${cmd.statut} · Prévu: ${cmd.date_livraison_prevue || "—"}`
          )
          .join("\n");

  const fin = calculerSyntheseFinanciereBna(ctx.devis, ctx.factures, ctx.currentDateIso);
  const savOuverts = ctx.ticketsSav.filter((t) => t.statut !== "cloture" && t.statut !== "resolu");
  const pvReserves = ctx.pvs.filter((p) => p.statut === "avec_reserves" || p.reserves_nb > 0);

  const paramsTerrasse =
    normalisation?.texteNormalise || preChiffrage?.metier === "terrasse"
      ? calculerParametresTerrasseNormatifs(
          normalisation?.texteNormalise || preChiffrage?.titre || ""
        )
      : null;

  const paramsBardage =
    normalisation?.texteNormalise || preChiffrage?.metier === "bardage"
      ? calculerParametresBardageNormatifs(
          normalisation?.texteNormalise || preChiffrage?.titre || ""
        )
      : null;

  const vigilanceLibreTxt =
    ctx.meteoVilleLibre?.vigilanceMf && ctx.meteoVilleLibre.vigilanceMf.length > 0
      ? `\n${formaterVigilanceMeteoFrance(ctx.meteoVilleLibre.vigilanceMf)}`
      : "";

  const meteoLibreTxt =
    ctx.meteoVilleLibre && ctx.meteoVilleLibre.previsions.length > 0
      ? `\n\nMÉTÉO EN DIRECT (${ctx.meteoVilleLibre.ville} — Open-Meteo 3 jours) :\n` +
        ctx.meteoVilleLibre.previsions
          .map(
            (j) =>
              `- ${j.date}: ${j.tempMinC}°/${j.tempMaxC}°C, rafales ${j.rafalesKmh} km/h, pluie ${j.pluieMm} mm (${j.conditions})${
                j.alertesDtu.length > 0 ? ` [⚠️ ${j.alertesDtu.join(" | ")}]` : ""
              }`
          )
          .join("\n") +
        vigilanceLibreTxt
      : vigilanceLibreTxt
        ? `\n\nVIGILANCE MÉTÉO-FRANCE (${ctx.meteoVilleLibre?.ville || "France"}) :${vigilanceLibreTxt}`
        : "";

  const deplacementTxt = ctx.deplacementVilleLibre
    ? `\n\nLOGISTIQUE & FRAIS DE DÉPLACEMENT (${ctx.deplacementVilleLibre.depart} -> ${ctx.deplacementVilleLibre.destination}) :\n` +
      `- Distance : ${ctx.deplacementVilleLibre.distanceAllerKm} km aller (${ctx.deplacementVilleLibre.distanceTotaleArKm} km A/R) · Durée aller : ${ctx.deplacementVilleLibre.dureeTrajetAllerMin} min\n` +
      `- Chiffrage : ${ctx.deplacementVilleLibre.nbJoursChantier} jour(s) × ${fmtEuro(ctx.deplacementVilleLibre.coutUnitaireArHt)}/A/R = ${fmtEuro(ctx.deplacementVilleLibre.coutTotalDeplacementHt)} HT`
    : "";

  return `Tu es le copilote et conducteur de travaux expérimenté de l'entreprise BNA (spécialiste Bardage, Terrasse & Mobile, Clôture, dépôt à Générac 33920). Quand le patron te demande un conseil ou un arbitrage (ex: maintenir ou repousser un chantier selon la météo et la distance), réponds de façon naturelle, directe et humaine : donne d'abord une recommandation claire et tranchée (Maintenir ou Repousser), justifie-la avec les chiffres précis du contexte (rafales km/h, pluie mm, sécurité DTU, temps de route depuis Générac 33920 et rentabilité), puis propose une alternative concrète (ex: décaler de 24h ou basculer sur un chantier abrité).
Tu réponds directement à ${ctx.userName}. Date du jour (Europe/Paris) : ${dateFr}${heureParis ? ` à ${heureParis}` : ""} (${ctx.currentDateIso}).

CHANTIERS (${ctx.chantiers.length}) :
${chantiersTxt}${meteoLibreTxt}${deplacementTxt}

COMMANDES FOURNISSEURS (${ctx.commandes.length}) :
${commandesTxt}

TRÉSORERIE & DEVIS :
CA signé HT : ${fmtEuro(fin.caSigneHt)} | Pipeline en attente HT : ${fmtEuro(fin.pipelineHt)} | Marge moyenne : ${fin.margeMoyennePct}% | Encaissé TTC : ${fmtEuro(fin.encaisseTtc)} | Reste à encaisser TTC : ${fmtEuro(fin.resteAEncaisserTtc)} | Factures échues : ${fin.nbFacturesEchues} (${fmtEuro(fin.montantEchuTtc)}).

SAV & RÉCEPTIONS :
Tickets SAV ouverts : ${savOuverts.length} | PV avec réserves : ${pvReserves.length}.

RÈGLES MÉTIERS & NORMES :
- Appuie tes conseils techniques sur NF DTU 51.4 (Terrasse), NF P90-308 (Terrasse Mobile piscine), NF DTU 41.2 (Bardage bois), NF DTU 45.4 (Bardage HPL), CSTB 3194 et les règles pro Clôtures.
- Sois concis, structuré et directement actionnable sur chantier ou au bureau.${
    normalisation?.contexteDictionnairePrompt
      ? `\n\n${normalisation.contexteDictionnairePrompt}`
      : ""
  }${
    paramsTerrasse?.reglesApplicablesPrompt
      ? `\n\n${paramsTerrasse.reglesApplicablesPrompt}`
      : ""
  }${
    paramsBardage?.reglesApplicablesPrompt
      ? `\n\n${paramsBardage.reglesApplicablesPrompt}`
      : ""
  }${
    preChiffrage
      ? `\n\nINSTRUCTION STRICTE PRÉ-CHIFFRAGE :\nUtilise EXCLUSIVEMENT les quantités, normes (CSTB 3194 / DTU 41.2 / DTU 51.4) et heures calculées par le moteur BNA ci-dessous. N'invente jamais de dimensions de panneaux ni de quincaillerie générique.\n\n${preChiffrage.syntheseTexte}`
      : dernierPreChiffrage
        ? `\n\nDERNIER PRÉ-CHIFFRAGE CALCULÉ DANS CETTE CONVERSATION (CONTEXTE PERSISTANT) :\nAppuie-toi sur ces chiffres exacts pour répondre aux questions de suivi (détail d'un lot, explication des heures ou matériaux) sans inventer de nouvelles valeurs.\n\n${dernierPreChiffrage}`
        : ""
  }${
    escalade
      ? `\n\nESCALADE CALEPINEUR 3D :\nInclus impérativement cet avertissement en fin de réponse : "${escalade.avertissement}"`
      : ""
  }`;
}

export function generateLocalAssistantResponse(
  message: string,
  ctx: BnaIaContext,
  options?: {
    history?: BnaIaHistoryTurn[];
    dernierPreChiffrage?: string | null;
  }
): { content: string; actions: BnaIaAction[]; tags: string[] } {
  const norm = normaliserRequeteMetier(message);
  const texte = norm.texteNormalise;
  const lower = texte.toLowerCase();
  const actions = detectBnaIaActions(texte, ctx);
  const fin = calculerSyntheseFinanciereBna(ctx.devis, ctx.factures, ctx.currentDateIso);
  const alertes = calculerAlertesProactives(ctx);

  // 0. Pré-chiffrage déterministe BNA (Bardage / Terrasse / Clôture) + escalade complexe éventuelle + déplacement éventuel
  const preChiffrage = detecterEtCalculerPreChiffrage(texte);
  const escalade = detecterChantierComplexe(texte, preChiffrage);
  if (preChiffrage) {
    const depTxt = ctx.deplacementVilleLibre
      ? `\n\n${formaterResumeDeplacement(ctx.deplacementVilleLibre)}`
      : "";
    return {
      content: escalade
        ? `${preChiffrage.syntheseTexte}${depTxt}\n\n${escalade.avertissement}`
        : `${preChiffrage.syntheseTexte}${depTxt}`,
      actions,
      tags: [
        "Pré-chiffrage Certifié",
        preChiffrage.metier.toUpperCase(),
        ...(escalade ? ["Calepineur 3D"] : []),
      ],
    };
  }

  if (escalade) {
    return {
      content:
        `${escalade.avertissement}\n\n` +
        `- **Critères détectés :** ${escalade.raisons.join(", ")}\n` +
        `- Utilisez le bouton **« Créer le chantier et ouvrir le Calepineur 3D »** ci-dessous pour démarrer directement le calepinage au millimètre.`,
      actions,
      tags: ["Calepineur 3D", escalade.metier.toUpperCase()],
    };
  }

  // 0b-bis. Question de suivi avec mémoire persistante (jamais de message d'accueil générique)
  const aContexteSuivi = Boolean(
    options?.dernierPreChiffrage || (options?.history && options.history.length > 0)
  );
  const estQuestionSuiviLot =
    aContexteSuivi &&
    (/lot\s*[123]|d[ée]taille|explique|calcul|pourquoi|suite|pr[ée]c[ée]dent|plus\s+d['’]info/i.test(
      lower
    ) ||
      Boolean(options?.dernierPreChiffrage));

  if (estQuestionSuiviLot && options?.dernierPreChiffrage) {
    const matchLot = lower.match(/lot\s*([123])/i);
    if (matchLot) {
      const lotNum = matchLot[1];
      const regexLot = new RegExp(
        `###\\s*Lot\\s*${lotNum}[\\s\\S]*?(?=###\\s*Lot|###\\s*TOTAL|$)`,
        "i"
      );
      const extraitLot = options.dernierPreChiffrage.match(regexLot)?.[0]?.trim();
      if (extraitLot) {
        return {
          content: `### Suivi détaillé — Lot ${lotNum}\n${extraitLot.replace(/^###\s*Lot\s*\d+\s*—\s*/i, "**")}`,
          actions,
          tags: ["Suivi Conversationnel", `Lot ${lotNum}`],
        };
      }
    }
    return {
      content: `### Suivi sur votre dernier pré-chiffrage\n${options.dernierPreChiffrage}`,
      actions,
      tags: ["Suivi Conversationnel"],
    };
  }

  const estConseilOuSuivi = estQuestionConseilOuSuivi(
    message,
    Boolean(options?.history && options.history.length > 0)
  );

  if (
    !estConseilOuSuivi &&
    (/\bm[ée]t[ée]o\b|\bpluie\b|\bvent\b|conditions?\s*(?:m[ée]t[ée]o|de\s*pose|sont\s*bonnes)|d[ée]placement/i.test(
      lower
    ) ||
      Boolean(ctx.meteoVilleLibre) ||
      Boolean(ctx.deplacementVilleLibre))
  ) {
    const maintenant = formaterDateFrEuropeParis(
      ctx.currentDateIso ? new Date(`${ctx.currentDateIso}T12:00:00Z`) : new Date()
    );
    const dateFr = ctx.currentDateFr || maintenant.dateFr;
    const actifs = ctx.chantiers.filter(
      (c) =>
        (c.previsionsMeteo3J && c.previsionsMeteo3J.length > 0) ||
        Boolean(c.alerte_meteo)
    );

    const blocs: string[] = [];
    if (ctx.deplacementVilleLibre) {
      blocs.push(formaterResumeDeplacement(ctx.deplacementVilleLibre));
    }
    if (ctx.meteoVilleLibre && ctx.meteoVilleLibre.previsions.length > 0) {
      const joursLibreTxt = ctx.meteoVilleLibre.previsions
        .map((j) => {
          const alertesTxt =
            j.alertesDtu.length > 0
              ? `\n    • ⚠️ ${j.alertesDtu.join(" / ")}`
              : " · ✅ Conditions compatibles DTU";
          return `  - ${j.date} : ${j.tempMinC}°C / ${j.tempMaxC}°C · Rafales ${j.rafalesKmh} km/h · Pluie ${j.pluieMm} mm (${j.conditions})${alertesTxt}`;
        })
        .join("\n");
      const vigTxt =
        ctx.meteoVilleLibre.vigilanceMf && ctx.meteoVilleLibre.vigilanceMf.length > 0
          ? `\n${formaterVigilanceMeteoFrance(ctx.meteoVilleLibre.vigilanceMf)}`
          : "";
      blocs.push(`**Prévisions Open-Meteo — ${ctx.meteoVilleLibre.ville}** :\n${joursLibreTxt}${vigTxt}`);
    } else if (
      ctx.meteoVilleLibre?.vigilanceMf &&
      ctx.meteoVilleLibre.vigilanceMf.length > 0
    ) {
      blocs.push(formaterVigilanceMeteoFrance(ctx.meteoVilleLibre.vigilanceMf));
    }

    for (const c of actifs) {
      if (c.previsionsMeteo3J && c.previsionsMeteo3J.length > 0) {
        const joursTxt = c.previsionsMeteo3J
          .map((j) => {
            const alertesTxt =
              j.alertesDtu.length > 0
                ? `\n    • ⚠️ ${j.alertesDtu.join(" / ")}`
                : " · ✅ Conditions compatibles DTU";
            return `  - ${j.date} : ${j.tempMinC}°C / ${j.tempMaxC}°C · Rafales ${j.rafalesKmh} km/h · Pluie ${j.pluieMm} mm (${j.conditions})${alertesTxt}`;
          })
          .join("\n");
        blocs.push(`**${c.nom}** (${c.metier.toUpperCase()} — ${c.ville || "Gironde"}) :\n${joursTxt}`);
      } else {
        blocs.push(`- **${c.nom}** (${c.metier}) : ${c.alerte_meteo}`);
      }
    }

    if (blocs.length === 0) {
      return {
        content:
          `### 🌤️ Météo & Pose DTU — ${dateFr}\n` +
          `Aucune alerte météo active ni prévision disponible sur vos chantiers (vérifiez que l'adresse des chantiers actifs est renseignée).`,
        actions,
        tags: ["Météo", "Pose DTU"],
      };
    }

    return {
      content: `### 🌤️ Météo & Vigilance Pose DTU — ${dateFr}\n${blocs.join("\n\n")}`,
      actions,
      tags: ["Météo", "Pose DTU", "Sécurité"],
    };
  }

  // 0c. Réponse normative Terrasse 0ms (DTU 51.4 / Composite Silvadec, Fiberdeck, Neowood, Océwood / Plots > 300 mm / Ipé bord de mer A4)
  const estQuestionGeneraleDtu = lower.includes("dtu") && lower.includes("p90-308");
  const reponseNormativeTerrasse = !estQuestionGeneraleDtu
    ? genererReponseNormativeTerrasseLocale(texte)
    : null;
  if (reponseNormativeTerrasse) {
    return {
      content: reponseNormativeTerrasse.content,
      actions,
      tags: reponseNormativeTerrasse.tags,
    };
  }

  // 0d. Réponse normative Bardage 0ms (Bois DTU 41.2, HPL DTU 45.4/CSTB 3799_V2, Fibrociment Cedral/Equitone, Composite WPC)
  const reponseNormativeBardage = !estQuestionGeneraleDtu
    ? genererReponseNormativeBardageLocale(texte)
    : null;
  if (reponseNormativeBardage) {
    return {
      content: reponseNormativeBardage.content,
      actions,
      tags: reponseNormativeBardage.tags,
    };
  }

  // 1. Briefing du jour
  if (lower.includes("briefing") || lower.includes("synthèse") || lower.includes("synthese")) {
    const parMetier = {
      bardage: ctx.chantiers.filter((c) => c.metier === "bardage").length,
      terrasse: ctx.chantiers.filter((c) => c.metier === "terrasse").length,
      cloture: ctx.chantiers.filter((c) => c.metier === "cloture").length,
    };
    const lignesAlertes =
      alertes.length === 0
        ? "✅ Aucune alerte critique détectée aujourd'hui."
        : alertes.map((a) => `- **${a.titre}** : ${a.detail}`).join("\n");

    return {
      content:
        `### 📋 Briefing du ${ctx.currentDateIso}\n` +
        `**Chantiers suivis (${ctx.chantiers.length}) :** Bardage (${parMetier.bardage}), Terrasse (${parMetier.terrasse}), Clôture (${parMetier.cloture}).\n` +
        `**CA signé HT :** ${fmtEuro(fin.caSigneHt)} · **Reste à encaisser :** ${fmtEuro(fin.resteAEncaisserTtc)} TTC.\n\n` +
        `**Alertes proactives :**\n${lignesAlertes}`,
      actions,
      tags: ["Briefing", "Multi-Métiers"],
    };
  }

  // 2. Trésorerie & Marges
  if (
    lower.includes("trésorerie") ||
    lower.includes("tresorerie") ||
    lower.includes("marge") ||
    lower.includes("facture") ||
    lower.includes("financier")
  ) {
    return {
      content:
        `### 💶 Synthèse Trésorerie & Marges\n` +
        `- **CA Signé HT :** ${fmtEuro(fin.caSigneHt)} (marge brute moyenne ${fin.margeMoyennePct} %)\n` +
        `- **Pipeline devis en attente :** ${fmtEuro(fin.pipelineHt)} HT\n` +
        `- **Encaissé TTC :** ${fmtEuro(fin.encaisseTtc)}\n` +
        `- **Reste à encaisser TTC :** ${fmtEuro(fin.resteAEncaisserTtc)}\n` +
        `- **Factures échues :** ${fin.nbFacturesEchues} (${fmtEuro(fin.montantEchuTtc)} TTC)`,
      actions,
      tags: ["Trésorerie", "Marges"],
    };
  }

  // 3. Règles DTU (51.4, 41.2, 45.4, P90-308, Clôture)
  if (lower.includes("dtu") || lower.includes("p90-308") || lower.includes("entraxe") || lower.includes("ventilation")) {
    return {
      content:
        `### 📐 Mémento Normes BNA\n` +
        `**${DTU_KNOWLEDGE_BASE.terrasse_51_4.code} (Terrasse) :**\n` +
        DTU_KNOWLEDGE_BASE.terrasse_51_4.regles.map((r) => `- ${r}`).join("\n") +
        `\n\n**${DTU_KNOWLEDGE_BASE.terrasse_mobile_p90_308.code} (Terrasse Mobile) :**\n` +
        DTU_KNOWLEDGE_BASE.terrasse_mobile_p90_308.regles.map((r) => `- ${r}`).join("\n") +
        `\n\n**${DTU_KNOWLEDGE_BASE.bardage_41_2.code} (Bardage) :**\n` +
        DTU_KNOWLEDGE_BASE.bardage_41_2.regles.map((r) => `- ${r}`).join("\n"),
      actions,
      tags: ["DTU 51.4", "DTU 41.2", "NF P90-308"],
    };
  }

  // 4. Clôture & Poteaux
  if (lower.includes("clôture") || lower.includes("cloture") || lower.includes("poteau") || lower.includes("redan")) {
    return {
      content:
        `### 🧱 Référentiel Clôture & Poteaux\n` +
        DTU_KNOWLEDGE_BASE.cloture_p98_405.regles.map((r) => `- ${r}`).join("\n"),
      actions,
      tags: ["Clôture", "Pose"],
    };
  }

  // 5. PV Réception & SAV
  if (lower.includes("sav") || lower.includes("réserve") || lower.includes("reserve") || lower.includes("pv")) {
    const savOuverts = ctx.ticketsSav.filter((t) => t.statut !== "cloture" && t.statut !== "resolu");
    const pvReserves = ctx.pvs.filter((p) => p.statut === "avec_reserves" || p.reserves_nb > 0);
    return {
      content:
        `### 🛡️ Suivi PV de Réception & SAV\n` +
        `- **Tickets SAV ouverts :** ${savOuverts.length}\n` +
        (savOuverts.slice(0, 4).map((t) => `  • ${t.numero} [${t.metier}] — ${t.titre} (${t.priorite})`).join("\n") ||
          "  • Aucun ticket ouvert") +
        `\n- **PV avec réserves à lever :** ${pvReserves.length}\n` +
        (pvReserves.slice(0, 4).map((p) => `  • ${p.numero} — ${p.reserves_nb} réserve(s)`).join("\n") ||
          "  • Aucune réserve ouverte"),
      actions,
      tags: ["SAV", "PV Réception"],
    };
  }

  // 6. Commandes fournisseurs & retards
  if (lower.includes("commande") || lower.includes("livraison") || lower.includes("retard") || lower.includes("fournisseur")) {
    const retard = ctx.commandes.filter(
      (c) =>
        c.statut !== "livree" &&
        c.statut !== "annulee" &&
        Boolean(c.date_livraison_prevue && c.date_livraison_prevue < ctx.currentDateIso)
    );
    const enCours = ctx.commandes.filter((c) => c.statut !== "livree" && c.statut !== "annulee");
    return {
      content:
        `### 📦 Suivi des Commandes Fournisseurs\n` +
        `- **Commandes en cours :** ${enCours.length}\n` +
        `- **Commandes en retard :** ${retard.length}\n` +
        (retard
          .slice(0, 5)
          .map((c) => `  • ⚠️ ${c.designation} (${c.fournisseur_nom || "—"}) — prévu le ${c.date_livraison_prevue}`)
          .join("\n") || "  • Aucun retard de livraison signalé."),
      actions,
      tags: ["Fournisseurs", "Commandes"],
    };
  }

  // 8. Action directe détectée (avancement / planning / note)
  if (actions.length > 0 && (actions[0].type === "update_avancement" || actions[0].type === "shift_planning" || actions[0].type === "create_note")) {
    return {
      content: `Action prête à exécuter : **${actions[0].title}**. Cliquez sur le bouton ci-dessous pour confirmer.`,
      actions,
      tags: ["Action Rapide"],
    };
  }

  // 9. Fallback Copilote BNA (déclenche le relais Cloud LLM côté API si une clé est configurée)
  if (aContexteSuivi || estQuestionConseilOuSuivi(message, aContexteSuivi)) {
    const prev = ctx.meteoVilleLibre?.previsions?.[0];
    const dep = ctx.deplacementVilleLibre;
    if (prev || dep) {
      const aAlerteCritique = Boolean(prev && prev.alertesDtu.length > 0);
      const reco = aAlerteCritique
        ? "**Recommandation : Repousser** l'intervention extérieure."
        : "**Recommandation : Maintenir** l'intervention (conditions compatibles DTU).";
      const details = [
        prev
          ? `Météo ${ctx.meteoVilleLibre?.ville} (${prev.date}) : ${prev.tempMinC}°C/${prev.tempMaxC}°C, rafales ${prev.rafalesKmh} km/h, pluie ${prev.pluieMm} mm${
              prev.alertesDtu.length > 0 ? ` — ${prev.alertesDtu.join(" ")}` : ""
            }`
          : null,
        dep ? formaterResumeDeplacement(dep) : null,
      ]
        .filter(Boolean)
        .join("\n- ");
      return {
        content: `${reco}\n- ${details}\n- **Alternative :** ${
          aAlerteCritique
            ? "Décaler de 24h ou basculer l'équipe sur un chantier abrité en Gironde."
            : "Confirmer le départ depuis Générac (33920) et verrouiller le planning."
        }`,
        actions,
        tags: ["Conseil Conducteur", "Copilote BNA"],
      };
    }

    return {
      content: options?.dernierPreChiffrage
        ? `### Suivi de votre étude en cours\n${options.dernierPreChiffrage}`
        : `Posez votre question de suivi ou précisez le chantier concerné pour obtenir un arbitrage immédiat.`,
      actions,
      tags: ["Suivi Conversationnel", "Copilote BNA"],
    };
  }

  return {
    content:
      `Je suis prêt à vous aider sur vos ${ctx.chantiers.length} chantier(s) (Bardage, Terrasse, Clôture), votre trésorerie (${fmtEuro(fin.caSigneHt)} signé HT), vos commandes et vos normes DTU. Utilisez un raccourci ou posez votre question.`,
    actions,
    tags: ["Copilote BNA"],
  };
}

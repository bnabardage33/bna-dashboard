import type { RendezVousRow } from "./rendezVousService";

export type PlanningItemType = "chantier" | "rdv" | "commande" | "livraison";
export type MetierCategorie = "Bardage" | "Terrasse" | "Clôture";

export type NatureKey =
  | "technique"
  | "reception"
  | "client"
  | "livraison"
  | "travaux"
  | "administratif"
  | "autre";

export interface NatureConfig {
  key: NatureKey;
  label: string;
  badgeClass: string;
  dotColor: string;
  barClass: string;
}

export const NATURES_CONFIG: Record<NatureKey, NatureConfig> = {
  technique: {
    key: "technique",
    label: "Technique & DTU",
    badgeClass: "bg-orange-500/15 text-orange-300 border-orange-500/40",
    dotColor: "#D96B27",
    barClass: "border-[#D96B27]/50 bg-[#D96B27]/15 text-orange-200",
  },
  reception: {
    key: "reception",
    label: "Réception & PV",
    badgeClass: "bg-emerald-500/15 text-emerald-300 border-emerald-500/40",
    dotColor: "#10B981",
    barClass: "border-emerald-500/40 bg-emerald-500/15 text-emerald-200",
  },
  client: {
    key: "client",
    label: "Point Client & Devis",
    badgeClass: "bg-sky-500/15 text-sky-300 border-sky-500/40",
    dotColor: "#38BDF8",
    barClass: "border-sky-500/40 bg-sky-500/15 text-sky-200",
  },
  livraison: {
    key: "livraison",
    label: "Commande & Livraison",
    badgeClass: "bg-purple-500/15 text-purple-300 border-purple-500/40",
    dotColor: "#A855F7",
    barClass: "border-purple-500/40 bg-purple-500/15 text-purple-200",
  },
  travaux: {
    key: "travaux",
    label: "Chantier & Pose",
    badgeClass: "bg-amber-500/15 text-amber-200 border-amber-500/40",
    dotColor: "#F59E0B",
    barClass: "border-[#D96B27]/60 bg-gradient-to-r from-[#D96B27]/35 to-[#B85316]/25 text-white",
  },
  administratif: {
    key: "administratif",
    label: "Administratif",
    badgeClass: "bg-indigo-500/15 text-indigo-300 border-indigo-500/40",
    dotColor: "#818CF8",
    barClass: "border-indigo-500/40 bg-indigo-500/15 text-indigo-200",
  },
  autre: {
    key: "autre",
    label: "Jalon Général",
    badgeClass: "bg-white/10 text-gray-300 border-white/20",
    dotColor: "#9CA3AF",
    barClass: "border-white/20 bg-white/10 text-gray-200",
  },
};

export interface PlanningChantierInput {
  id: string;
  nom: string | null;
  client_nom: string | null;
  adresse_chantier: string | null;
  metier: string;
  statut: string | null;
  date_debut: string | null;
  date_fin: string | null;
  checklist: unknown;
}

export interface PlanningCommandeInput {
  id: string;
  designation: string;
  statut: string;
  date_commande: string | null;
  date_livraison_prevue: string | null;
  date_livraison_reelle: string | null;
  chantier_id: string | null;
  montant_ht: number | null;
  fournisseur_nom?: string | null;
}

export interface UnifiedPlanningItem {
  id: string;
  rawId: string;
  type: PlanningItemType;
  titre: string;
  sousTitre?: string;
  dateDebut: string; // YYYY-MM-DD
  dateFin?: string; // YYYY-MM-DD
  heure?: string;
  lieu?: string;
  chantierId?: string;
  chantierNom?: string;
  metier?: MetierCategorie;
  statut: string;
  statutLabel: string;
  natureKey: NatureKey;
  dotColor: string;
  badgeColorClass: string;
  notes?: string;
  fournisseurNom?: string;
  avancement?: number;
}

// ---------------------------------------------------------------------------
// Helpers Dates locaux purs (zéro décalage UTC / DST)
// ---------------------------------------------------------------------------

export function parseYMD(dateStr?: string | null): Date | null {
  if (!dateStr) return null;
  const clean = dateStr.trim();
  const ymdMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (ymdMatch) {
    const y = Number(ymdMatch[1]);
    const m = Number(ymdMatch[2]);
    const d = Number(ymdMatch[3]);
    const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const frMatch = clean.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (frMatch) {
    const d = Number(frMatch[1]);
    const m = Number(frMatch[2]);
    const y = Number(frMatch[3]);
    const dt = new Date(y, m - 1, d, 0, 0, 0, 0);
    return Number.isNaN(dt.getTime()) ? null : dt;
  }
  const parsed = new Date(clean);
  if (Number.isNaN(parsed.getTime())) return null;
  return new Date(parsed.getFullYear(), parsed.getMonth(), parsed.getDate(), 0, 0, 0, 0);
}

export function formatYMD(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function normalizeDateLocal(dateStr?: string | null, fallbackDate?: Date): string {
  const parsed = parseYMD(dateStr);
  if (parsed) return formatYMD(parsed);
  return formatYMD(fallbackDate ?? new Date());
}

export function addDaysLocal(dateStr: string, days: number): string {
  const base = parseYMD(dateStr);
  if (!base) return dateStr;
  const next = new Date(base.getFullYear(), base.getMonth(), base.getDate() + days, 0, 0, 0, 0);
  return formatYMD(next);
}

export function getStartOfWeekLocal(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
  const dayOfWeek = (d.getDay() + 6) % 7; // 0 = Lundi, 6 = Dimanche
  d.setDate(d.getDate() - dayOfWeek);
  return d;
}

export function getWeekDaysLocal(startOfWeek: Date): Date[] {
  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(
      new Date(
        startOfWeek.getFullYear(),
        startOfWeek.getMonth(),
        startOfWeek.getDate() + i,
        0,
        0,
        0,
        0
      )
    );
  }
  return days;
}

export function getMonthDaysLocal(currentDate: Date): Date[] {
  const year = currentDate.getFullYear();
  const month = currentDate.getMonth();
  const totalDays = new Date(year, month + 1, 0).getDate();
  const days: Date[] = [];
  for (let i = 1; i <= totalDays; i++) {
    days.push(new Date(year, month, i, 0, 0, 0, 0));
  }
  return days;
}

export function getISOWeekNumber(date: Date): number {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

export function normaliserMetier(metier?: string | null): MetierCategorie {
  const m = (metier ?? "").toLowerCase();
  if (m.includes("terrasse")) return "Terrasse";
  if (m.includes("cloture") || m.includes("clôture")) return "Clôture";
  return "Bardage";
}

export function calculerAvancementChantier(ch: {
  statut: string | null;
  checklist: unknown;
}): number {
  const s = (ch.statut ?? "").toLowerCase();
  if (s === "termine" || s === "terminé" || s === "cloture" || s === "clôturé") {
    return 100;
  }
  if (Array.isArray(ch.checklist) && ch.checklist.length > 0) {
    const items = ch.checklist as Array<{ fait?: boolean; done?: boolean }>;
    const done = items.filter((i) => Boolean(i?.fait ?? i?.done)).length;
    return Math.round((done / items.length) * 100);
  }
  if (s === "en_cours" || s === "chantier") return 55;
  if (s === "planifie" || s === "planifié") return 20;
  return 35;
}

export function categorizeNature(
  text?: string | null,
  defaultType?: PlanningItemType,
  explicitKey?: string | null
): NatureKey {
  if (explicitKey && explicitKey in NATURES_CONFIG) {
    return explicitKey as NatureKey;
  }
  if (defaultType === "commande" || defaultType === "livraison") {
    return "livraison";
  }
  if (defaultType === "chantier") {
    return "travaux";
  }
  if (!text) return "autre";

  const s = text.toLowerCase();
  if (s.includes("recept") || s.includes("récept") || s.includes("pv") || s.includes("reserve")) {
    return "reception";
  }
  if (
    s.includes("tech") ||
    s.includes("dtu") ||
    s.includes("humid") ||
    s.includes("lambourde") ||
    s.includes("plot") ||
    s.includes("visite") ||
    s.includes("controle") ||
    s.includes("contrôle") ||
    s.includes("equerre") ||
    s.includes("équerre") ||
    s.includes("pare-pluie")
  ) {
    return "technique";
  }
  if (s.includes("client") || s.includes("reunion") || s.includes("réunion") || s.includes("devis")) {
    return "client";
  }
  if (s.includes("livrais") || s.includes("fournisseur") || s.includes("colis")) {
    return "livraison";
  }
  if (s.includes("travaux") || s.includes("pose") || s.includes("ossature") || s.includes("demarrage")) {
    return "travaux";
  }
  if (s.includes("admin") || s.includes("factur") || s.includes("assurance")) {
    return "administratif";
  }
  return "technique";
}

export function buildUnifiedPlanning(
  chantiers: PlanningChantierInput[],
  commandes: PlanningCommandeInput[],
  rdvs: RendezVousRow[],
  referenceDate?: Date
): UnifiedPlanningItem[] {
  const items: UnifiedPlanningItem[] = [];
  const chantierMap = new Map<string, PlanningChantierInput>();
  for (const ch of chantiers) {
    chantierMap.set(ch.id, ch);
  }

  // 1. Chantiers
  for (const c of chantiers) {
    const sLower = (c.statut ?? "").toLowerCase();
    if (["archive", "archivé", "annule", "annulé"].includes(sLower)) {
      continue;
    }
    if (!c.date_debut && !c.date_fin) {
      continue;
    }

    const debut = normalizeDateLocal(c.date_debut, referenceDate);
    let fin = c.date_fin ? normalizeDateLocal(c.date_fin, referenceDate) : addDaysLocal(debut, 7);
    if (debut > fin) {
      fin = addDaysLocal(debut, 7);
    }

    const avancement = calculerAvancementChantier(c);
    const metier = normaliserMetier(c.metier);
    const cfg = NATURES_CONFIG.travaux;

    items.push({
      id: `ch-${c.id}`,
      rawId: c.id,
      type: "chantier",
      titre: c.nom || c.client_nom || "Chantier sans nom",
      sousTitre: [metier, c.client_nom, c.adresse_chantier].filter(Boolean).join(" · "),
      dateDebut: debut,
      dateFin: fin,
      lieu: c.adresse_chantier ?? undefined,
      chantierId: c.id,
      chantierNom: c.nom ?? undefined,
      metier,
      statut: avancement >= 100 ? "termine" : "en_cours",
      statutLabel: avancement >= 100 ? "Terminé (100%)" : `En cours (${avancement}%)`,
      natureKey: "travaux",
      dotColor: cfg.dotColor,
      badgeColorClass: cfg.badgeClass,
      avancement,
    });
  }

  // 2. Rendez-vous (RDVs)
  for (const r of rdvs) {
    if (r.statut === "annule") continue;
    const d = normalizeDateLocal(r.date, referenceDate);
    const heureLabel = r.heure_debut
      ? r.heure_fin
        ? `${r.heure_debut} - ${r.heure_fin}`
        : r.heure_debut
      : undefined;
    const linkedChantier = r.chantier_id ? chantierMap.get(r.chantier_id) : undefined;
    const natureKey = categorizeNature(`${r.nature} ${r.titre}`, "rdv", r.nature);
    const cfg = NATURES_CONFIG[natureKey];

    items.push({
      id: `rdv-${r.id}`,
      rawId: r.id,
      type: "rdv",
      titre: r.titre,
      sousTitre: linkedChantier?.nom
        ? `Chantier : ${linkedChantier.nom}`
        : r.lieu
        ? `Lieu : ${r.lieu}`
        : "Rendez-vous terrain",
      dateDebut: d,
      dateFin: d,
      heure: heureLabel,
      lieu: r.lieu ?? undefined,
      chantierId: r.chantier_id ?? undefined,
      chantierNom: linkedChantier?.nom ?? undefined,
      metier: linkedChantier ? normaliserMetier(linkedChantier.metier) : undefined,
      statut: r.statut,
      statutLabel:
        r.statut === "confirme" ? "Confirmé" : r.statut === "effectue" ? "Effectué" : "Planifié",
      natureKey,
      dotColor: cfg.dotColor,
      badgeColorClass: cfg.badgeClass,
      notes: r.notes ?? undefined,
    });
  }

  // 3. Commandes & Livraisons
  const cfgLiv = NATURES_CONFIG.livraison;
  for (const cmd of commandes) {
    const linkedChantier = cmd.chantier_id ? chantierMap.get(cmd.chantier_id) : undefined;
    const fNom = cmd.fournisseur_nom || "Fournisseur";
    const metier = linkedChantier ? normaliserMetier(linkedChantier.metier) : undefined;

    if (cmd.date_commande) {
      const dateCmd = normalizeDateLocal(cmd.date_commande, referenceDate);
      items.push({
        id: `cmd-${cmd.id}`,
        rawId: cmd.id,
        type: "commande",
        titre: cmd.designation,
        sousTitre: `${fNom} · ${cmd.statut}`,
        dateDebut: dateCmd,
        dateFin: dateCmd,
        chantierId: cmd.chantier_id ?? undefined,
        chantierNom: linkedChantier?.nom ?? undefined,
        metier,
        statut: cmd.statut,
        statutLabel: `Commande (${cmd.statut})`,
        natureKey: "livraison",
        dotColor: cfgLiv.dotColor,
        badgeColorClass: cfgLiv.badgeClass,
        fournisseurNom: fNom,
      });
    }

    const dateLivRaw = cmd.date_livraison_reelle || cmd.date_livraison_prevue;
    if (dateLivRaw) {
      const dateLiv = normalizeDateLocal(dateLivRaw, referenceDate);
      items.push({
        id: `liv-${cmd.id}`,
        rawId: cmd.id,
        type: "livraison",
        titre: `Livraison : ${cmd.designation}`,
        sousTitre: `${fNom}${linkedChantier?.nom ? ` · ${linkedChantier.nom}` : ""}`,
        dateDebut: dateLiv,
        dateFin: dateLiv,
        chantierId: cmd.chantier_id ?? undefined,
        chantierNom: linkedChantier?.nom ?? undefined,
        metier,
        statut: cmd.date_livraison_reelle ? "livre" : "livraison_prevue",
        statutLabel: cmd.date_livraison_reelle ? "Livré" : "Livraison prévue",
        natureKey: "livraison",
        dotColor: cfgLiv.dotColor,
        badgeColorClass: cfgLiv.badgeClass,
        fournisseurNom: fNom,
      });
    }
  }

  return items.sort((a, b) => {
    const cmpDate = a.dateDebut.localeCompare(b.dateDebut);
    if (cmpDate !== 0) return cmpDate;
    return a.titre.localeCompare(b.titre);
  });
}

export function compterEvenementsSemaineCourante(
  items: UnifiedPlanningItem[],
  now: Date = new Date()
): number {
  const start = getStartOfWeekLocal(now);
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6, 23, 59, 59, 999);
  const startMs = start.getTime();
  const endMs = end.getTime();

  return items.filter((item) => {
    const dStart = parseYMD(item.dateDebut);
    if (!dStart) return false;
    const dEnd = item.dateFin ? parseYMD(item.dateFin) ?? dStart : dStart;
    return dEnd.getTime() >= startMs && dStart.getTime() <= endMs;
  }).length;
}

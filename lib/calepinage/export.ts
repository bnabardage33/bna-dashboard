// Helpers de génération des exports du bordereau de débit — CÔTÉ SERVEUR UNIQUEMENT
// (exceljs, pdf-lib, sharp). Ne jamais importer depuis un composant client :
// la partie « calculs » partagée avec l'UI est dans lib/calepinage/bordereau.ts.
//
// Les fichiers sont générés à la volée, jamais stockés.
//
// SÉCURITÉ TENANT : mêmes garanties que POST /api/calepinage/calculer —
// `resoudreTenant()` en échec fermé, client Supabase de SESSION (RLS
// `entreprise_courante()`) ET prédicat explicite `entreprise_id` sur la zone.
// Une zone d'autrui est indiscernable d'une zone inexistante (404).

import { NextResponse, type NextRequest } from "next/server";
import type { Database } from "@/types/supabase";
import ExcelJS from "exceljs";
import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
// `sharp` (binaire natif) est importé À LA DEMANDE dans genererPlanPng : s'il est
// indisponible sur la plateforme, seul le mini-plan PNG est concerné (repli
// vectoriel dans le PDF) — l'export Excel et le chargement du module restent sains.
import { createClient } from "@/lib/supabase/server";
import { resoudreTenant } from "@/lib/tenant";
import { couleurGroupe } from "@/lib/calepinage/palette";
import {
  libelleMateriau,
  libelleTraitement,
  lignesBordereau,
  totauxBordereau,
  type LigneBordereau,
} from "@/lib/calepinage/bordereau";
import type { ChantierZone, Module, ModuleGroup, Opening, Percage } from "@/types/calepinage";

export const TYPE_XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
export const TYPE_PDF = "application/pdf";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-9a-f][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// PostgREST plafonne chaque requête (1000 lignes par défaut) : lecture paginée
// pour ne JAMAIS tronquer silencieusement un export.
const TAILLE_PAGE = 1000;

export interface DonneesExport {
  zone: ChantierZone;
  /** Nom du chantier (projet), « — » si introuvable. */
  projet: string;
  groups: ModuleGroup[];
  modules: Module[];
  openings: Opening[];
  percages?: Percage[];
}

type Resultat<T> = { ok: true; data: T } | { ok: false; reponse: NextResponse };

const erreur = (message: string, status: 400 | 404 | 500): { ok: false; reponse: NextResponse } => ({
  ok: false,
  reponse: NextResponse.json({ error: message }, { status }),
});

type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>;

async function lireGroupes(
  sb: SupabaseServerClient,
  zoneId: string,
): Promise<Database["public"]["Tables"]["chantier_zones_module_groups"]["Row"][]> {
  const lignes: Database["public"]["Tables"]["chantier_zones_module_groups"]["Row"][] = [];
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const { data, error } = await sb
      .from("chantier_zones_module_groups")
      .select("*")
      .eq("zone_id", zoneId)
      .order("group_number", { ascending: true })
      .order("id", { ascending: true })
      .range(debut, debut + TAILLE_PAGE - 1);
    if (error) throw new Error(`lecture chantier_zones_module_groups : ${error.message}`);
    if (data) lignes.push(...data);
    if (!data || data.length < TAILLE_PAGE) return lignes;
  }
}

async function lireModules(
  sb: SupabaseServerClient,
  zoneId: string,
): Promise<Database["public"]["Tables"]["chantier_zones_modules"]["Row"][]> {
  const lignes: Database["public"]["Tables"]["chantier_zones_modules"]["Row"][] = [];
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const { data, error } = await sb
      .from("chantier_zones_modules")
      .select("*")
      .eq("zone_id", zoneId)
      .order("group_number", { ascending: true })
      .order("y_mm", { ascending: true })
      .order("x_mm", { ascending: true })
      .order("id", { ascending: true })
      .range(debut, debut + TAILLE_PAGE - 1);
    if (error) throw new Error(`lecture chantier_zones_modules : ${error.message}`);
    if (data) lignes.push(...data);
    if (!data || data.length < TAILLE_PAGE) return lignes;
  }
}

async function lireOuvertures(
  sb: SupabaseServerClient,
  zoneId: string,
): Promise<Database["public"]["Tables"]["chantier_zones_ouvertures"]["Row"][]> {
  const lignes: Database["public"]["Tables"]["chantier_zones_ouvertures"]["Row"][] = [];
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const { data, error } = await sb
      .from("chantier_zones_ouvertures")
      .select("*")
      .eq("zone_id", zoneId)
      .order("created_at", { ascending: true })
      .order("id", { ascending: true })
      .range(debut, debut + TAILLE_PAGE - 1);
    if (error) throw new Error(`lecture chantier_zones_ouvertures : ${error.message}`);
    if (data) lignes.push(...data);
    if (!data || data.length < TAILLE_PAGE) return lignes;
  }
}

async function lirePercages(
  sb: SupabaseServerClient,
  zoneId: string,
): Promise<Database["public"]["Tables"]["chantier_zones_percages"]["Row"][]> {
  const lignes: Database["public"]["Tables"]["chantier_zones_percages"]["Row"][] = [];
  for (let debut = 0; ; debut += TAILLE_PAGE) {
    const { data, error } = await sb
      .from("chantier_zones_percages")
      .select("*")
      .eq("zone_id", zoneId)
      .order("id", { ascending: true })
      .range(debut, debut + TAILLE_PAGE - 1);
    if (error) throw new Error(`lecture chantier_zones_percages : ${error.message}`);
    if (data) lignes.push(...data);
    if (!data || data.length < TAILLE_PAGE) return lignes;
  }
}

/**
 * Authentifie, valide `{ zone_id }` et charge zone + groupes + modules + ouvertures + perçages.
 * Commun aux deux routes d'export.
 */
export async function chargerDonneesExport(request: NextRequest): Promise<Resultat<DonneesExport>> {
  const tenant = await resoudreTenant();
  if (!tenant.ok) return { ok: false, reponse: tenant.reponse };
  const { entrepriseId } = tenant;

  let corps: unknown;
  try {
    corps = await request.json();
  } catch {
    return erreur("Corps JSON invalide.", 400);
  }
  const zoneId =
    corps && typeof corps === "object" && "zone_id" in corps
      ? (corps as { zone_id: unknown }).zone_id
      : undefined;
  if (typeof zoneId !== "string" || !UUID_RE.test(zoneId)) {
    return erreur("zone_id manquant ou invalide (UUID attendu).", 400);
  }

  try {
    const supabase = await createClient();
    const { data: zone, error: erreurZone } = await supabase
      .from("chantier_zones")
      .select("*")
      .eq("id", zoneId)
      .eq("entreprise_id", entrepriseId)
      .maybeSingle();
    if (erreurZone) {
      console.error("[calepinage/export] lecture zone :", erreurZone);
      return erreur("Erreur serveur lors de la lecture de la zone.", 500);
    }
    if (!zone) return erreur("Zone introuvable.", 404);

    let projet = "—";
    if (zone.chantier_id) {
      const { data: chantier } = await supabase
        .from("chantiers")
        .select("nom")
        .eq("id", zone.chantier_id)
        .eq("entreprise_id", entrepriseId)
        .maybeSingle();
      if (chantier?.nom) projet = chantier.nom;
    }

    const [groups, modules, openings, percages] = await Promise.all([
      lireGroupes(supabase, zoneId),
      lireModules(supabase, zoneId),
      lireOuvertures(supabase, zoneId),
      lirePercages(supabase, zoneId),
    ]);

    return {
      ok: true,
      data: {
        zone: zone as ChantierZone,
        projet,
        groups,
        modules,
        openings,
        percages: (percages ?? []) as Percage[],
      },
    };
  } catch (e: unknown) {
    console.error("[calepinage/export] chargement :", e);
    return erreur("Erreur serveur lors de la préparation de l'export.", 500);
  }
}

// ── Noms de fichiers / en-têtes ──────────────────────────────────────────────

export const dateISO = (d = new Date()): string => d.toISOString().slice(0, 10);
const dateFR = (d = new Date()): string =>
  `${String(d.getUTCDate()).padStart(2, "0")}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${d.getUTCFullYear()}`;

/** `bordereau_{nom_zone}_{date}.{ext}` — nom ASCII sûr (pas d'injection d'en-tête). */
export function nomFichier(nomZone: string, ext: "xlsx" | "pdf", d = new Date()): string {
  const slug =
    nomZone
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40) || "zone";
  return `bordereau_${slug}_${dateISO(d)}.${ext}`;
}

export function reponseFichier(octets: Uint8Array, type: string, nom: string): NextResponse {
  return new NextResponse(new Blob([octets as BlobPart], { type }), {
    status: 200,
    headers: {
      "Content-Type": type,
      "Content-Disposition": `attachment; filename="${nom}"`,
      "Cache-Control": "no-store",
    },
  });
}

// ── Excel ────────────────────────────────────────────────────────────────────

/** Neutralise l'injection de formule (=, +, -, @) dans une cellule texte saisie par l'utilisateur. */
const texteCellule = (v: string): string => (/^[=+\-@\t\r]/.test(v) ? `'${v}` : v);

export async function genererExcel(d: DonneesExport): Promise<Uint8Array> {
  const wb = new ExcelJS.Workbook();
  wb.created = new Date();
  const lignes = lignesBordereau(d.groups, d.modules);
  const totaux = totauxBordereau(d.groups);

  const percagesParModule = new Map<string, Percage[]>();
  if (d.percages) {
    for (const p of d.percages) {
      const arr = percagesParModule.get(p.module_id) || [];
      arr.push(p);
      percagesParModule.set(p.module_id, arr);
    }
  }

  const textePercagesGroupe = (groupNumber: string): string => {
    if (!d.percages || d.percages.length === 0) return "—";
    const mods = d.modules.filter((m) => m.group_number === groupNumber);
    const modRef = mods.find((m) => !m.is_cut) || mods[0];
    if (!modRef) return "—";
    const trous = percagesParModule.get(modRef.id) || [];
    if (trous.length === 0) return "Aucun";
    const nbFixes = trous.filter((t) => t.type === "fixe").length;
    const nbCoul = trous.filter((t) => t.type === "coulissante").length;
    const diam = trous[0]?.diameter_mm ?? 8;
    return `${trous.length} trous Ø${diam} (${nbFixes} fixes, ${nbCoul} coulissants)`;
  };

  const entete = (ws: ExcelJS.Worksheet) => {
    const r = ws.getRow(1);
    r.font = { bold: true, color: { argb: "FFFFFFFF" } };
    r.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF1F2937" } };
    ws.views = [{ state: "frozen", ySplit: 1 }];
  };

  // Feuille « Bordereau »
  const ws = wb.addWorksheet("Bordereau");
  const aDesPercages = Boolean(d.percages && d.percages.length > 0);
  const colonnesBordereau = [
    { header: "N° Groupe", key: "g", width: 12 },
    { header: "Qté", key: "q", width: 8 },
    { header: "Largeur (mm)", key: "l", width: 14 },
    { header: "Hauteur (mm)", key: "h", width: 14 },
    { header: "Surface (m²)", key: "s", width: 14 },
    { header: "Traitement", key: "t", width: 16 },
    { header: "Matériau", key: "m", width: 18 },
    { header: "Coupe", key: "c", width: 10 },
  ];
  if (aDesPercages) {
    colonnesBordereau.push({ header: "Perçages", key: "p", width: 32 });
  }
  ws.columns = colonnesBordereau;
  entete(ws);
  for (const l of lignes) {
    const rowObj: Record<string, string | number> = {
      g: texteCellule(l.groupNumber),
      q: l.quantite,
      l: l.largeurMm,
      h: l.hauteurMm,
      s: l.surfaceM2,
      t: l.traitement,
      m: texteCellule(l.materiau),
      c: l.nbCoupes > 0 ? `Oui (${l.nbCoupes})` : "Non",
    };
    if (aDesPercages) {
      rowObj.p = texteCellule(textePercagesGroupe(l.groupNumber));
    }
    ws.addRow(rowObj);
  }
  const debut = 2;
  const fin = lignes.length + 1;
  const total = ws.addRow({ g: "TOTAL" });
  if (lignes.length > 0) {
    total.getCell("q").value = { formula: `SUM(B${debut}:B${fin})`, result: totaux.nbModules };
    total.getCell("s").value = { formula: `SUM(E${debut}:E${fin})`, result: totaux.surfaceM2 };
  } else {
    total.getCell("q").value = 0;
    total.getCell("s").value = 0;
  }
  total.font = { bold: true };
  total.border = { top: { style: "medium" } };
  ws.getColumn("s").numFmt = "0.00";

  // Feuille « Modules » : module par module, avec positions.
  const wm = wb.addWorksheet("Modules");
  const colonnesModules = [
    { header: "N° Groupe", key: "g", width: 12 },
    { header: "X (mm)", key: "x", width: 10 },
    { header: "Y (mm)", key: "y", width: 10 },
    { header: "Largeur (mm)", key: "l", width: 14 },
    { header: "Hauteur (mm)", key: "h", width: 14 },
    { header: "Coupé", key: "c", width: 9 },
    { header: "Pivoté", key: "r", width: 9 },
    { header: "Retourné", key: "f", width: 10 },
    { header: "Traitement", key: "t", width: 16 },
    { header: "Matériau", key: "m", width: 18 },
  ];
  if (aDesPercages) {
    colonnesModules.push({ header: "Perçages", key: "p", width: 20 });
  }
  wm.columns = colonnesModules;
  entete(wm);
  for (const m of d.modules) {
    const trous = percagesParModule.get(m.id) || [];
    const rowObj: Record<string, string | number> = {
      g: texteCellule(m.group_number),
      x: m.x_mm,
      y: m.y_mm,
      l: m.width_mm,
      h: m.height_mm,
      c: m.is_cut ? "Oui" : "Non",
      r: m.is_rotated ? "Oui" : "Non",
      f: m.is_flipped ? "Oui" : "Non",
      t: libelleTraitement(m.treatment),
      m: texteCellule(libelleMateriau(m.material)),
    };
    if (aDesPercages) {
      rowObj.p = trous.length > 0 ? `${trous.length} trous` : "Aucun";
    }
    wm.addRow(rowObj);
  }

  return new Uint8Array(await wb.xlsx.writeBuffer());
}

// ── Mini-plan PNG (sharp, rendu SVG) ─────────────────────────────────────────

const PLAN_L = 800;
const PLAN_H = 600;
const PLAN_MARGE = 24;

/** Plan simplifié 800×600 px (affiché à 400×300 pt dans le PDF : net à l'impression). */
export async function genererPlanPng(d: DonneesExport): Promise<Uint8Array> {
  const zw = Math.round(d.zone.largeur * 1000);
  const zh = Math.round(d.zone.hauteur_mur * 1000);
  const s = Math.min((PLAN_L - 2 * PLAN_MARGE) / zw, (PLAN_H - 2 * PLAN_MARGE) / zh);
  const ox = (PLAN_L - zw * s) / 2;
  const oy = (PLAN_H - zh * s) / 2;
  const f = (n: number) => n.toFixed(2);
  const numeros = d.groups.map((g) => g.group_number);

  const mods = d.modules
    .map((m) => {
      const fill = couleurGroupe(m.group_number, numeros);
      const stroke = m.is_cut ? "#dc2626" : "#374151";
      return `<rect x="${f(ox + m.x_mm * s)}" y="${f(oy + m.y_mm * s)}" width="${f(m.width_mm * s)}" height="${f(m.height_mm * s)}" fill="${fill}" fill-opacity="0.85" stroke="${stroke}" stroke-width="${m.is_cut ? 1.5 : 0.8}"/>`;
    })
    .join("");

  const ouv = d.openings
    .map(
      (o) =>
        `<rect x="${f(ox + o.x_mm * s)}" y="${f(oy + o.y_mm * s)}" width="${f(o.width_mm * s)}" height="${f(o.height_mm * s)}" fill="url(#h)" stroke="#6b7280" stroke-width="1.5"/>`,
    )
    .join("");

  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="${PLAN_L}" height="${PLAN_H}" viewBox="0 0 ${PLAN_L} ${PLAN_H}">` +
    `<defs><pattern id="h" width="8" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">` +
    `<rect width="8" height="8" fill="#ffffff"/><line x1="0" y1="0" x2="0" y2="8" stroke="#6b7280" stroke-width="2"/></pattern></defs>` +
    `<rect width="${PLAN_L}" height="${PLAN_H}" fill="#ffffff"/>` +
    `<rect x="${f(ox)}" y="${f(oy)}" width="${f(zw * s)}" height="${f(zh * s)}" fill="#f3f4f6"/>` +
    mods +
    ouv +
    `<rect x="${f(ox)}" y="${f(oy)}" width="${f(zw * s)}" height="${f(zh * s)}" fill="none" stroke="#2563eb" stroke-width="3"/>` +
    `</svg>`;

  const { default: sharp } = await import("sharp");
  return new Uint8Array(await sharp(Buffer.from(svg)).png().toBuffer());
}

// ── PDF A4 (pdf-lib) ─────────────────────────────────────────────────────────

const A4_L = 595.28;
const A4_H = 841.89;
const MARGE = 40;
const HAUTEUR_LIGNE = 20;
const COLONNES: { titre: string; largeur: number; droite?: boolean }[] = [
  { titre: "N° Groupe", largeur: 70 },
  { titre: "Qté", largeur: 40, droite: true },
  { titre: "Larg. (mm)", largeur: 62, droite: true },
  { titre: "Haut. (mm)", largeur: 62, droite: true },
  { titre: "Surf. (m²)", largeur: 65, droite: true },
  { titre: "Traitement", largeur: 85 },
  { titre: "Matériau", largeur: 81 },
  { titre: "Coupe", largeur: 50 },
];

/** Police standard = WinAnsi : tout caractère hors Latin-1 est remplacé (sinon pdf-lib lève). */
const sur = (t: string): string => t.normalize("NFC").replace(/[^\u0020-\u007E\u00A0-\u00FF]/g, "?");
const nombre = (n: number, dec = 2): string => n.toFixed(dec).replace(".", ",");

function tronquer(t: string, police: PDFFont, taille: number, max: number): string {
  let s = sur(t);
  if (police.widthOfTextAtSize(s, taille) <= max) return s;
  while (s.length > 1 && police.widthOfTextAtSize(`${s}...`, taille) > max) s = s.slice(0, -1);
  return `${s}...`;
}

const hexVersRgb = (hex: string) =>
  rgb(
    Number.parseInt(hex.slice(1, 3), 16) / 255,
    Number.parseInt(hex.slice(3, 5), 16) / 255,
    Number.parseInt(hex.slice(5, 7), 16) / 255,
  );

/** Plan simplifié en vectoriel (repli du PNG) dans le cadre (bx, by, bw, bh) — origine bas-gauche. */
function dessinerPlanVectoriel(
  page: PDFPage,
  d: DonneesExport,
  bx: number,
  by: number,
  bw: number,
  bh: number,
): void {
  const zw = Math.round(d.zone.largeur * 1000);
  const zh = Math.round(d.zone.hauteur_mur * 1000);
  const marge = 12;
  const s = Math.min((bw - 2 * marge) / zw, (bh - 2 * marge) / zh);
  const ox = bx + (bw - zw * s) / 2;
  const haut = by + (bh + zh * s) / 2; // bord supérieur de la zone (y PDF vers le haut)
  const numeros = d.groups.map((g) => g.group_number);

  page.drawRectangle({ x: ox, y: haut - zh * s, width: zw * s, height: zh * s, color: rgb(0.95, 0.96, 0.96) });
  for (const m of d.modules) {
    page.drawRectangle({
      x: ox + m.x_mm * s,
      y: haut - (m.y_mm + m.height_mm) * s,
      width: m.width_mm * s,
      height: m.height_mm * s,
      color: hexVersRgb(couleurGroupe(m.group_number, numeros)),
      opacity: 0.85,
      borderColor: m.is_cut ? rgb(0.86, 0.15, 0.15) : rgb(0.22, 0.25, 0.32),
      borderWidth: m.is_cut ? 0.8 : 0.4,
    });
  }
  // Ouvertures : fond clair + croix (le hachurage exact est réservé au rendu PNG).
  for (const o of d.openings) {
    const x = ox + o.x_mm * s;
    const y = haut - (o.y_mm + o.height_mm) * s;
    const w = o.width_mm * s;
    const h = o.height_mm * s;
    const gris = rgb(0.42, 0.45, 0.5);
    page.drawRectangle({ x, y, width: w, height: h, color: rgb(1, 1, 1), borderColor: gris, borderWidth: 0.8 });
    page.drawLine({ start: { x, y }, end: { x: x + w, y: y + h }, thickness: 0.5, color: gris });
    page.drawLine({ start: { x, y: y + h }, end: { x: x + w, y }, thickness: 0.5, color: gris });
  }
  page.drawRectangle({
    x: ox, y: haut - zh * s, width: zw * s, height: zh * s,
    borderColor: rgb(0.15, 0.39, 0.92), borderWidth: 1.5,
  });
}

export async function genererPdf(d: DonneesExport): Promise<Uint8Array> {
  const pdf = await PDFDocument.create();
  const normale = await pdf.embedFont(StandardFonts.Helvetica);
  const gras = await pdf.embedFont(StandardFonts.HelveticaBold);
  const lignes = lignesBordereau(d.groups, d.modules);
  const totaux = totauxBordereau(d.groups);

  let page: PDFPage = pdf.addPage([A4_L, A4_H]);
  let y = A4_H - MARGE;

  // En-tête : logo placeholder, titre, projet / zone / date
  page.drawRectangle({
    x: MARGE, y: y - 36, width: 80, height: 36,
    borderColor: rgb(0.6, 0.6, 0.6), borderWidth: 1, color: rgb(0.95, 0.95, 0.95),
  });
  page.drawText("LOGO", { x: MARGE + 25, y: y - 22, size: 10, font: gras, color: rgb(0.55, 0.55, 0.55) });
  page.drawText("Bordereau de débit", { x: MARGE + 100, y: y - 14, size: 18, font: gras });
  page.drawText(tronquer(`Projet : ${d.projet}`, normale, 10, A4_L - 2 * MARGE - 100), {
    x: MARGE + 100, y: y - 29, size: 10, font: normale,
  });
  y -= 52;
  page.drawText(tronquer(`Zone : ${d.zone.nom}`, normale, 10, 340), { x: MARGE, y, size: 10, font: gras });
  page.drawText(`Date : ${dateFR()}`, { x: A4_L - MARGE - 90, y, size: 10, font: normale });
  y -= 14;
  page.drawText(
    `${nombre(d.zone.largeur)} x ${nombre(d.zone.hauteur_mur)} m  |  ${totaux.nbModules} modules  |  ${nombre(totaux.surfaceM2)} m²`,
    { x: MARGE, y, size: 9, font: normale, color: rgb(0.35, 0.35, 0.35) },
  );
  y -= 14;

  const PL = 400;
  const PH = 300;
  const px = (A4_L - PL) / 2;
  try {
    const png = await pdf.embedPng(await genererPlanPng(d));
    page.drawImage(png, { x: px, y: y - PH, width: PL, height: PH });
  } catch (e: unknown) {
    // sharp indisponible (binaire natif absent) : même plan dessiné en vectoriel.
    console.error("[calepinage/export/pdf] mini-plan PNG indisponible, repli vectoriel :", e);
    dessinerPlanVectoriel(page, d, px, y - PH, PL, PH);
  }
  page.drawRectangle({
    x: px, y: y - PH, width: PL, height: PH,
    borderColor: rgb(0.8, 0.8, 0.8), borderWidth: 0.5,
  });
  y -= PH + 16;

  const largeurTable = COLONNES.reduce((a, c) => a + c.largeur, 0);

  const enteteTable = () => {
    page.drawRectangle({
      x: MARGE, y: y - HAUTEUR_LIGNE + 5, width: largeurTable, height: HAUTEUR_LIGNE,
      color: rgb(0.12, 0.16, 0.22),
    });
    let x = MARGE;
    for (const c of COLONNES) {
      const w = gras.widthOfTextAtSize(sur(c.titre), 8.5);
      page.drawText(sur(c.titre), {
        x: c.droite ? x + c.largeur - 4 - w : x + 4, y: y - 8, size: 8.5, font: gras, color: rgb(1, 1, 1),
      });
      x += c.largeur;
    }
    y -= HAUTEUR_LIGNE;
  };

  const ligne = (cellules: string[], police: PDFFont, fond?: ReturnType<typeof rgb>) => {
    if (y - HAUTEUR_LIGNE < MARGE + 30) {
      page = pdf.addPage([A4_L, A4_H]);
      y = A4_H - MARGE;
      enteteTable();
    }
    if (fond) {
      page.drawRectangle({ x: MARGE, y: y - HAUTEUR_LIGNE + 5, width: largeurTable, height: HAUTEUR_LIGNE, color: fond });
    }
    let x = MARGE;
    COLONNES.forEach((c, i) => {
      const t = tronquer(cellules[i] ?? "", police, 9, c.largeur - 8);
      const w = police.widthOfTextAtSize(t, 9);
      page.drawText(t, { x: c.droite ? x + c.largeur - 4 - w : x + 4, y: y - 8, size: 9, font: police });
      x += c.largeur;
    });
    page.drawLine({
      start: { x: MARGE, y: y - HAUTEUR_LIGNE + 5 }, end: { x: MARGE + largeurTable, y: y - HAUTEUR_LIGNE + 5 },
      thickness: 0.4, color: rgb(0.8, 0.8, 0.8),
    });
    y -= HAUTEUR_LIGNE;
  };

  enteteTable();
  lignes.forEach((l: LigneBordereau, i) =>
    ligne(
      [
        l.groupNumber, String(l.quantite), String(l.largeurMm), String(l.hauteurMm),
        nombre(l.surfaceM2), l.traitement, l.materiau, l.nbCoupes > 0 ? `Oui (${l.nbCoupes})` : "Non",
      ],
      normale,
      i % 2 === 1 ? rgb(0.96, 0.96, 0.97) : undefined,
    ),
  );
  ligne(["TOTAL", String(totaux.nbModules), "", "", nombre(totaux.surfaceM2), "", "", ""], gras, rgb(0.9, 0.9, 0.92));

  // Schémas de perçage par groupe (si des perçages sont générés)
  dessinerSchemasPercage(pdf, d, normale, gras);

  // Pied de page : « Page i / n » sur toutes les pages
  const pages = pdf.getPages();
  pages.forEach((p, i) => {
    const t = `Page ${i + 1} / ${pages.length}`;
    p.drawText(t, {
      x: (A4_L - normale.widthOfTextAtSize(t, 9)) / 2, y: 20, size: 9, font: normale, color: rgb(0.4, 0.4, 0.4),
    });
  });

  return pdf.save();
}

/**
 * Dessine les plans de perçage par groupe dans le PDF.
 * Présentation 2 colonnes par page avec cotation et repères fixes/coulissants.
 */
function dessinerSchemasPercage(
  pdf: PDFDocument,
  d: DonneesExport,
  normale: PDFFont,
  gras: PDFFont,
): void {
  if (!d.percages || d.percages.length === 0 || d.groups.length === 0) return;

  const percagesParModule = new Map<string, Percage[]>();
  for (const p of d.percages) {
    const arr = percagesParModule.get(p.module_id) || [];
    arr.push(p);
    percagesParModule.set(p.module_id, arr);
  }

  const schemasGroupes: {
    group: ModuleGroup;
    moduleRef: Module;
    trous: Percage[];
  }[] = [];

  for (const g of d.groups) {
    const mods = d.modules.filter((m) => m.group_number === g.group_number);
    const modRef = mods.find((m) => !m.is_cut) || mods[0];
    if (!modRef) continue;
    const trous = percagesParModule.get(modRef.id) || [];
    if (trous.length > 0) {
      schemasGroupes.push({ group: g, moduleRef: modRef, trous });
    }
  }

  if (schemasGroupes.length === 0) return;

  let page = pdf.addPage([A4_L, A4_H]);
  let y = A4_H - MARGE;

  page.drawText("Plans et schemas de percage par groupe", {
    x: MARGE,
    y: y - 10,
    size: 14,
    font: gras,
  });
  page.drawText(`Zone : ${sur(d.zone.nom)}  |  Entraxe a 50 mm des bords`, {
    x: MARGE,
    y: y - 24,
    size: 9,
    font: normale,
    color: rgb(0.4, 0.4, 0.4),
  });
  y -= 44;

  const cols = 2;
  const colLargeur = (A4_L - 2 * MARGE - 16) / cols;
  const cadreHauteur = 165;

  for (let idx = 0; idx < schemasGroupes.length; idx++) {
    const item = schemasGroupes[idx];
    const colIdx = idx % cols;

    if (colIdx === 0 && idx > 0 && y - cadreHauteur < MARGE + 30) {
      page = pdf.addPage([A4_L, A4_H]);
      y = A4_H - MARGE;
      page.drawText("Plans de percage par groupe (suite)", {
        x: MARGE,
        y: y - 10,
        size: 12,
        font: gras,
      });
      y -= 30;
    }

    const cellX = MARGE + colIdx * (colLargeur + 16);
    const cellY = y - cadreHauteur;

    page.drawRectangle({
      x: cellX,
      y: cellY,
      width: colLargeur,
      height: cadreHauteur,
      color: rgb(0.98, 0.98, 0.99),
      borderColor: rgb(0.85, 0.85, 0.88),
      borderWidth: 0.8,
    });

    const gNum = item.group.group_number;
    const nbFixes = item.trous.filter((t) => t.type === "fixe").length;
    const nbCoul = item.trous.filter((t) => t.type === "coulissante").length;
    const diam = item.trous[0]?.diameter_mm ?? 8;

    page.drawText(`Groupe ${sur(gNum)} (x${item.group.count})`, {
      x: cellX + 10,
      y: cellY + cadreHauteur - 16,
      size: 10,
      font: gras,
    });
    page.drawText(
      `${item.moduleRef.width_mm} x ${item.moduleRef.height_mm} mm - ${item.trous.length} trous O${diam}`,
      {
        x: cellX + 10,
        y: cellY + cadreHauteur - 28,
        size: 8,
        font: normale,
        color: rgb(0.3, 0.3, 0.3),
      },
    );
    page.drawText(`${nbFixes} fixes, ${nbCoul} coulissants - Marge 50 mm`, {
      x: cellX + 10,
      y: cellY + cadreHauteur - 39,
      size: 7.5,
      font: normale,
      color: rgb(0.45, 0.45, 0.45),
    });

    // Dessin du panneau à l'échelle
    const zoneDessinL = colLargeur - 24;
    const zoneDessinH = 95;
    const mw = item.moduleRef.width_mm;
    const mh = item.moduleRef.height_mm;
    const echelle = Math.min(zoneDessinL / mw, zoneDessinH / mh);
    const pw = mw * echelle;
    const ph = mh * echelle;
    const px = cellX + (colLargeur - pw) / 2;
    const py = cellY + 12 + (zoneDessinH - ph) / 2;

    page.drawRectangle({
      x: px,
      y: py,
      width: pw,
      height: ph,
      color: rgb(0.93, 0.94, 0.96),
      borderColor: rgb(0.2, 0.25, 0.3),
      borderWidth: 1,
    });

    // Dessin des trous
    for (const p of item.trous) {
      const hx = px + p.x_mm * echelle;
      const hy = py + ph - p.y_mm * echelle;
      const rayon = Math.max(2.5, (p.diameter_mm * echelle) / 2 + 1.2);

      if (p.type === "fixe") {
        page.drawCircle({
          x: hx,
          y: hy,
          size: rayon,
          color: rgb(0.1, 0.1, 0.1),
        });
        page.drawLine({
          start: { x: hx - rayon * 0.6, y: hy },
          end: { x: hx + rayon * 0.6, y: hy },
          thickness: 0.5,
          color: rgb(1, 1, 1),
        });
        page.drawLine({
          start: { x: hx, y: hy - rayon * 0.6 },
          end: { x: hx, y: hy + rayon * 0.6 },
          thickness: 0.5,
          color: rgb(1, 1, 1),
        });
      } else {
        page.drawCircle({
          x: hx,
          y: hy,
          size: rayon,
          color: rgb(1, 1, 1),
          borderColor: rgb(0.1, 0.1, 0.1),
          borderWidth: 1,
        });
        page.drawLine({
          start: { x: hx - rayon * 0.8, y: hy },
          end: { x: hx + rayon * 0.8, y: hy },
          thickness: 1,
          color: rgb(0.1, 0.1, 0.1),
        });
      }
    }

    if (colIdx === cols - 1 || idx === schemasGroupes.length - 1) {
      y -= cadreHauteur + 12;
    }
  }
}

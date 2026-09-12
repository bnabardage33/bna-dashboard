import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  calculerDevis,
  creerLigneAChiffrer,
  type CoutType,
  type LigneDevis,
} from "@/lib/devisCalcul";

const googleProvider = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const PROMPT_MAX_CHARS = 6000;

// Quantités OSSATURE (DTU 41.2 / règles métier) — CALCUL DÉTERMINISTE serveur,
// jamais laissé à l'appréciation du LLM. Ne s'applique que si une surface
// FACTUELLE est disponible ; sinon la ligne est « À CHIFFRER » (qte inconnue).
type RegleOssature = { matcher: RegExp; facteur: number; type: "ml" | "unite" };
const REGLES_OSSATURE: RegleOssature[] = [
  { matcher: /chevron/i, facteur: 1.5, type: "ml" }, // 1,5 ml / m²
  { matcher: /équerre|equerre/i, facteur: 2, type: "unite" }, // 2 / m²
  { matcher: /cheville/i, facteur: 6, type: "unite" }, // 3/équerre → 6 / m²
];

function estUniteM2(unite: string): boolean {
  const u = unite.toLowerCase().replace(/\s+/g, "");
  return u === "m²" || u === "m2" || u === "m^2" || u === "mq";
}

function estUnitePiece(unite: string): boolean {
  const u = unite.toLowerCase();
  return u === "u" || u === "unité" || u === "unite" || u.includes("pièce") || u.includes("piece") || u.includes("unit");
}

type CatalogueOuvrage = {
  id: string;
  designation: string;
  description: string | null;
  famille_label: string;
  unite: string;
  pu_ht: number;
  pu_revient: number;
  type_cout: string;
};

function texte(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function estNombrePositif(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v) && v > 0;
}

/** Résout la surface factuelle : chantier sélectionné (source) sinon métré ponctuel, sinon null. */
async function resoudreSurface(chantierId: string | null, surfacePonctuelle: number | null): Promise<number | null> {
  if (chantierId) {
    const { data: chantier } = await supabaseAdmin
      .from("chantiers")
      .select("id, surface_m2")
      .eq("id", chantierId)
      .maybeSingle();
    if (chantier?.surface_m2 && chantier.surface_m2 > 0) return chantier.surface_m2;
  }
  return surfacePonctuelle;
}

/** Post-traitement déterministe : applique les quantités factuelles (m² et ossature). */
function appliquerQuantitesFactuelles(
  ligne: LigneDevis,
  surface: number | null,
  catalogue: Map<string, CatalogueOuvrage>
): LigneDevis {
  if (ligne.a_chiffrer || !ligne.catalogue_id) return ligne;
  const ouvrage = catalogue.get(ligne.catalogue_id);
  if (!ouvrage) return ligne;

  const designation = ouvrage.designation;

  const regle = REGLES_OSSATURE.find((r) => r.matcher.test(designation));

  if (surface !== null) {
    if (regle) {
      let qte = surface * regle.facteur;
      if (regle.type === "unite" || estUnitePiece(ouvrage.unite)) qte = Math.ceil(qte);
      else qte = Math.round(qte * 100) / 100;
      return { ...ligne, qte };
    }
    if (estUniteM2(ouvrage.unite)) {
      return { ...ligne, qte: Math.round(surface * 100) / 100 };
    }
    return ligne;
  }

  // Aucune surface factuelle : on ne devine RIEN pour l'ossature ni les m².
  if (regle || estUniteM2(ouvrage.unite)) {
    return creerLigneAChiffrer(
      ouvrage.designation,
      ligne.description || "Quantité inconnue — surface non fournie."
    );
  }

  return ligne;
}

type LigneLLM = {
  catalogue_id?: unknown;
  description?: unknown;
  qte?: unknown;
};

export async function POST(req: NextRequest) {
  try {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return NextResponse.json({ error: "Clé API Google AI manquante dans la configuration." }, { status: 503 });
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") {
      return NextResponse.json({ error: "Corps de requête invalide." }, { status: 400 });
    }

    const prompt = texte(body.prompt);
    if (!prompt) {
      return NextResponse.json({ error: "Prompt manquant" }, { status: 400 });
    }
    if (prompt.length > PROMPT_MAX_CHARS) {
      return NextResponse.json({ error: "Demande trop longue." }, { status: 400 });
    }

    // --- SOURCE DE VÉRITÉ : le catalogue lu côté serveur (jamais celui du client). ---
    const { data: catalogueData } = await supabaseAdmin
      .from("catalogue_ouvrages")
      .select("id, designation, description, famille_label, unite, pu_ht, pu_revient, type_cout");

    const catalogueComplet: CatalogueOuvrage[] = (catalogueData ?? []).map(
      (o) => o as unknown as CatalogueOuvrage
    );
    const catalogueMap = new Map<string, CatalogueOuvrage>(
      catalogueComplet.map((o) => [o.id, o])
    );

    // --- Surfice factuelle (chantier prime, sinon métré ponctuel). ---
    const chantierId = texte(body.chantier_id) || null;
    const surfacePonctuelle = estNombrePositif(body.surface_m2) ? (body.surface_m2 as number) : null;
    const surface = await resoudreSurface(chantierId, surfacePonctuelle);

    // --- Filtrage sélection (id, designation, unite, pu_ht uniquement — jamais les coûts). ---
    const promptLower = prompt.toLowerCase();
    const needsOssature = ["bardage", "ite", "claire-voie", "hpl"].some((w) => promptLower.includes(w));
    const keywords = promptLower
      .split(/\s+/)
      .filter((w: string) => w.length > 3);
    if (needsOssature) {
      keywords.push("chevron", "équerre", "equerre", "cheville", "vis", "ossature");
    }

    let selection: CatalogueOuvrage[] = [];
    if (catalogueComplet.length > 0) {
      selection = catalogueComplet.filter((c) => {
        const text = `${c.designation} ${c.description || ""}`.toLowerCase();
        return keywords.some((kw) => text.includes(kw));
      });
      if (selection.length > 15) selection = selection.slice(0, 15);
    }

    const catalogueString =
      selection.length > 0
        ? "\n\nCATALOGUE DE L'ENTREPRISE (extrait pertinent — identifiants OBLIGATOIRES) :\n" +
          JSON.stringify(selection.map((c) => ({ id: c.id, designation: c.designation, unite: c.unite, type: c.type_cout === "main_oeuvre" ? "main-d'œuvre" : "matériau" })))
        : "\n\nLe catalogue est vide : aucune référence disponible.";

    const surfaceLine =
      surface !== null
        ? `\nSURFACE NETTE FACTUELLE : ${surface} m² (donnée terrain réelle fournie par le chantier ou le métré. Tu NE la devines JAMAIS et tu NE l'arrondis pas de manière créative. Réutilise-la telle quelle pour les quantités en m².)`
        : `\nAUCUNE surface factuelle n'est fournie : n'invente AUCUNE quantité pour l'ossature ni pour les articles en m². Utilise une quantité uniquement si elle est explicitement énoncée dans la demande.`;

    const consignesOssature = needsOssature
      ? "\nSi la demande concerne un bardage/ITE/claire-voie/HPL, tu DOIS proposer l'ossature et la quincaillerie (chevrons, équerres de bardage, chevilles) en référençant LES ARTICLES du catalogue adaptés (les quantités seront recalculées par le serveur, fournis-en une approximative)."
      : "";

    const systemPrompt =
      "Tu es un métreur en bâtiment spécialiste bardage/charpente métallique. Le client dicte une demande de chantier. Tu dois la décomposer en plusieurs prestations." +
      catalogueString +
      surfaceLine +
      consignesOssature +
      "\n\nRÉPONSE STRICTEMENT JSON — réponds UNIQUEMENT par un tableau, sans texte avant/après, sans markdown :" +
      '[{"catalogue_id":"<id exact d\'un article du catalogue>","description":"détail technique","qte":nombre}, ...]' +
      "\nRÈGLES IMPÉRATIVES :" +
      "\n1. catalogue_id DOIT être un id du catalogue fourni. INTERDICTION FORMELLE d'inventer une désignation, un prix ou un id." +
      "\n2. Si une prestation demandée n'existe PAS au catalogue : {\"catalogue_id\": null, \"description\": \"courte description de la prestation manquante\", \"qte\": null}" +
      "\n3. La description est un détail technique que tu rédiges toi-même (matériau, épaisseur, fixation…)." +
      "\n4. qte : suis les consignes de surface ci-dessus." +
      "\n5. Si aucun prix n'est connu du catalogue, ne t'en préoccupe pas : tu ne produis que des références.";

    const { text: texteGenere } = await generateText({
      model: googleProvider("gemini-3.5-flash-lite"),
      system: systemPrompt,
      prompt,
      temperature: 0.2,
    });

    let jsonString = texteGenere.trim();
    jsonString = jsonString.replace(/```json/g, "").replace(/```/g, "").trim();

    let lignesLLM: LigneLLM[];
    try {
      const parsed = JSON.parse(jsonString);
      lignesLLM = Array.isArray(parsed) ? parsed : Array.isArray(parsed?.lignes) ? parsed.lignes : [];
    } catch (parseError) {
      console.error("Erreur de parsing JSON ia-devis. Texte reçu :", jsonString);
      return NextResponse.json(
        { error: "L'IA n'a pas renvoyé de tableau JSON valide." },
        { status: 500 }
      );
    }

    const lignes: LigneDevis[] = lignesLLM.map((l) => {
      const id = texte(l.catalogue_id);
      const description = texte(l.description);
      const qte = estNombrePositif(l.qte) ? (l.qte as number) : null;

      if (!id) {
        return creerLigneAChiffrer("À CHIFFRER", description || "Prestation absente du catalogue.");
      }
      const ouvrage = catalogueMap.get(id);
      if (!ouvrage) {
        return creerLigneAChiffrer(
          "À CHIFFRER",
          description || `Référence inconnue dans le catalogue : ${id}`
        );
      }
      if (qte === null) {
        return creerLigneAChiffrer(
          ouvrage.designation,
          description || "Quantité manquante — à compléter."
        );
      }

      return appliquerQuantitesFactuelles(
        {
          catalogue_id: ouvrage.id,
          designation: ouvrage.designation,
          description,
          qte,
          unite: ouvrage.unite,
          pu_ht: ouvrage.pu_ht,
          pu_revient: ouvrage.pu_revient ?? 0,
          type_cout: (ouvrage.type_cout === "main_oeuvre" ? "main_oeuvre" : "matiere") as CoutType,
          a_chiffrer: false,
        },
        surface,
        catalogueMap
      );
    });

    // Aucune ligne exploitable → on documente l'échec plutôt que d'inventer.
    const { nb_a_chiffrer } = calculerDevis(lignes);
    return NextResponse.json({
      lignes,
      surface_utilisee: surface,
      nb_a_chiffrer,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("Erreur IA Devis:", message);
    return NextResponse.json({ error: "L'IA a échoué: " + message }, { status: 500 });
  }
}
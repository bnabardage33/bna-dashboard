import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import { verifierSession } from "@/lib/auth";
import {
  telechargerImageStockage,
  validerUrlStockage,
  UrlStockageRefusee,
} from "@/lib/urlStockageAutorisee";

export const dynamic = "force-dynamic";

const googleProvider = createGoogleGenerativeAI({
  apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY,
});

const PROMPT_OCR =
  "Extrais en JSON depuis cette photo de ticket de caisse ou de bon de livraison (BL) pour une entreprise de bardage/façade :\n" +
  '{\n' +
  '  "montant_ttc": nombre (total TTC en euros, sans symbole),\n' +
  '  "montant_ht": nombre (montant HT en euros, déduis-le du TTC et de la TVA si non imprimé),\n' +
  '  "tva": nombre (taux de TVA en pourcentage, 20 par défaut),\n' +
  '  "fournisseur_nom": string (enseigne / nom du fournisseur),\n' +
  '  "date_facture": string au format "YYYY-MM-DD",\n' +
  '  "numero_facture": string,\n' +
  '  "categorie": "materiaux" | "outillage" | "location" | "carburant" | "autre"\n' +
  "}\n" +
  "Réponds UNIQUEMENT avec l'objet JSON. Aucun texte avant, aucun texte après, aucun formatage markdown.";

function extraireJson(texte: string): string {
  let t = texte.trim();
  if (t.startsWith("```")) {
    t = t.replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/, "").trim();
  }
  return t;
}

const BUCKET_TICKETS = "tickets";

// Plafond de taille téléchargée AVANT OCR. Le défaut d'origine lisait
// `await res.arrayBuffer()` SANS plafond : une réponse arbitrairement grande
// faisait entrer l'objet entier en mémoire serveur. 10 Mo couvre largement un
// ticket ou un BL scanné en haute définition.
const TAILLE_IMAGE_MAX = 10 * 1024 * 1024;

/**
 * Télécharge l'image en n'acceptant que le bucket public du projet courant.
 *
 * SSRF : avant correction, `fetch(url)` partait sur une URL entièrement
 * fournie par le client (deux sources : `image_url` en multipart l.84, et
 * `image_url` en JSON l.88), sans aucune validation. Cibles possibles : réseau
 * interne, services locaux, métadonnées cloud. Pire, le contenu récupéré était
 * envoyé à Gemini — une cible SSRF était donc aussi un canal d'exfiltration.
 *
 * La validation porte sur la DESTINATION RÉELLEMENT CONTACTÉE : origine
 * allowlistée, schéma https, préfixe de chemin, résolution DNS contrôlée, et
 * revalidation de chaque redirection. Voir `lib/urlStockageAutorisee.ts`.
 */
async function imageEnBase64(url: string): Promise<string> {
  const { dataUrl } = await telechargerImageStockage(url, {
    bucket: BUCKET_TICKETS,
    tailleMax: TAILLE_IMAGE_MAX,
  });
  return dataUrl;
}

function asNombre(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  const n = typeof v === "string" ? parseFloat(v.replace(/\s/g, "").replace(",", ".")) : Number(v);
  return Number.isFinite(n) ? Math.round(n * 100) / 100 : null;
}

function asString(v: unknown): string | null {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s ? s : null;
}

const CATEGORIES_ACCEPTEES = ["materiaux", "outillage", "location", "carburant", "autre"];

export async function POST(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  try {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return NextResponse.json(
        { error: "Clé API Google AI manquante dans la configuration." },
        { status: 503 }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let imageUrl: string | null = null;
    // true quand l'URL vient du client ET non d'un upload de ce serveur.
    let urlFournieParClient = false;

    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      const file = fd.get("file") as File | null;
      if (file && file.size > 0) {
        // SOURCE 1 — URL construite par CE serveur : le préfixe est
        // `ia-ocr/` et le nom est un `Date.now()`-aléatoire, donc elle ne peut
        // pas designer une destination arbitraire. Elle est tout de même
        // validée par `imageEnBase64` : même allowlist, mêmes gardes.
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const fileName = `ia-ocr/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const buffer = new Uint8Array(await file.arrayBuffer());
        const { error } = await supabaseAdmin.storage
          .from(BUCKET_TICKETS)
          .upload(fileName, buffer, { contentType: file.type, upsert: false });
        if (error) throw new Error("Erreur upload image : " + error.message);
        const { data } = supabaseAdmin.storage
          .from(BUCKET_TICKETS)
          .getPublicUrl(fileName);
        imageUrl = data.publicUrl;
      } else {
        // SOURCE 2 — URL FOURNIE PAR LE CLIENT : entrée SSRF directe.
        imageUrl = (fd.get("image_url") as string) || null;
        urlFournieParClient = true;
      }
    } else {
      // SOURCE 3 — même chose en JSON : entrée SSRF directe.
      const body = await req.json();
      imageUrl = asString(body?.image_url);
      urlFournieParClient = true;
    }

    if (!imageUrl) {
      return NextResponse.json({ error: "image_url requis" }, { status: 400 });
    }

    // Fail-closed : une URL client qui n'est pas dans l'allowlist est
    // refusée ICI, avant tout accès réseau. Une URL issue d'un upload de ce
    // serveur ne peut pas l'être, mais suit le même chemin — un seul
    // validateur, donc aucune divergence possible entre les deux sources.
    if (urlFournieParClient) {
      try {
        imageUrl = await validerUrlStockage(imageUrl, { bucket: BUCKET_TICKETS });
      } catch (e) {
        if (e instanceof UrlStockageRefusee) {
          return NextResponse.json(
            { error: "image_url refusée : " + e.message },
            { status: e.statut }
          );
        }
        throw e;
      }
    }

    const imageData = await imageEnBase64(imageUrl);

    const { text } = await generateText({
      model: googleProvider("gemini-3.5-flash-lite"),
      system:
        "Tu es un OCR expert pour une entreprise de pose de bardage. Tu lis un ticket ou un bon de livraison (BL) à partir d'une photo et tu en extrais les informations financières et fournisseur avec précision. En cas de doute, mets null plutôt qu'une valeur inventée.",
      messages: [
        {
          role: "user",
          content: [
            { type: "image", image: imageData },
            { type: "text", text: PROMPT_OCR },
          ],
        },
      ],
      temperature: 0,
    });

    const json = JSON.parse(extraireJson(text));

    const categorieRaw = asString(json.categorie);
    const categorie = categorieRaw && CATEGORIES_ACCEPTEES.includes(categorieRaw) ? categorieRaw : "autre";

    return NextResponse.json({
      image_url: imageUrl,
      montant_ttc: asNombre(json.montant_ttc),
      montant_ht: asNombre(json.montant_ht),
      tva: asNombre(json.tva) ?? 20,
      fournisseur_nom: asString(json.fournisseur_nom),
      date_facture: asString(json.date_facture),
      numero_facture: asString(json.numero_facture),
      categorie,
    });
  } catch (err) {
    // Un refus de validation survenu PENDANT le téléchargement (redirection
    // vers une destination interdite, image trop volumineuse, contenu non
    // image) porte son propre statut : le remonter en 500 masquerait un refus
    // volontaire et le ferait passer pour une panne du modèle.
    if (err instanceof UrlStockageRefusee) {
      return NextResponse.json({ error: err.message }, { status: err.statut });
    }
    const message = err instanceof Error ? err.message : String(err);
    console.error("Erreur OCR ticket :", message);
    return NextResponse.json({ error: "L'OCR a échoué : " + message }, { status: 500 });
  }
}
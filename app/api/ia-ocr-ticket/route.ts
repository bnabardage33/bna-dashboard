import { NextRequest, NextResponse } from "next/server";
import { generateText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

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

async function imageEnBase64(url: string): Promise<string> {
  const res = await fetch(url);
  if (!res.ok) throw new Error("Impossible de télécharger l'image depuis le storage");
  const buffer = Buffer.from(await res.arrayBuffer());
  const mime = res.headers.get("content-type") || "image/jpeg";
  return `data:${mime};base64,${buffer.toString("base64")}`;
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
  try {
    if (!process.env.GOOGLE_GENERATIVE_AI_API_KEY) {
      return NextResponse.json(
        { error: "Clé API Google AI manquante dans la configuration." },
        { status: 503 }
      );
    }

    const contentType = req.headers.get("content-type") || "";
    let imageUrl: string | null = null;

    if (contentType.includes("multipart/form-data")) {
      const fd = await req.formData();
      const file = fd.get("file") as File | null;
      if (file && file.size > 0) {
        const ext = (file.name.split(".").pop() || "jpg").toLowerCase();
        const fileName = `ia-ocr/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
        const buffer = new Uint8Array(await file.arrayBuffer());
        const { error } = await supabaseAdmin.storage
          .from("tickets")
          .upload(fileName, buffer, { contentType: file.type, upsert: false });
        if (error) throw new Error("Erreur upload image : " + error.message);
        const { data } = supabaseAdmin.storage.from("tickets").getPublicUrl(fileName);
        imageUrl = data.publicUrl;
      } else {
        imageUrl = (fd.get("image_url") as string) || null;
      }
    } else {
      const body = await req.json();
      imageUrl = asString(body?.image_url);
    }

    if (!imageUrl) {
      return NextResponse.json({ error: "image_url requis" }, { status: 400 });
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
    const message = err instanceof Error ? err.message : String(err);
    console.error("Erreur OCR ticket :", message);
    return NextResponse.json({ error: "L'OCR a échoué : " + message }, { status: 500 });
  }
}
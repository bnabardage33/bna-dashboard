import { NextRequest, NextResponse } from 'next/server';
import { generateText } from 'ai';
import { google } from '@ai-sdk/google';

export async function POST(req: NextRequest) {
  try {
    const { prompt, catalogueContext } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt manquant' }, { status: 400 });
    }

    let filteredCatalog: any[] = [];
    const promptLower = prompt.toLowerCase();
    const needsOssature = ["bardage", "ite", "claire-voie", "hpl"].some((w: string) => promptLower.includes(w));

    if (catalogueContext && catalogueContext.length > 0) {
      const keywords = promptLower.split(/\s+/).filter((w: string) => w.length > 3);
      
      // Force hardware/framing items into the filter if siding is requested
      if (needsOssature) {
        keywords.push("chevron", "équerre", "equerre", "cheville", "vis", "ossature");
      }

      filteredCatalog = catalogueContext.filter((c: any) => {
        const text = `${c.designation} ${c.description || ''}`.toLowerCase();
        return keywords.some((kw: string) => text.includes(kw));
      });
      // Garder les 15 plus pertinents max
      if (filteredCatalog.length > 15) {
        filteredCatalog = filteredCatalog.slice(0, 15);
      }
    }

    const catalogueString = filteredCatalog.length > 0
      ? "\n\nVOICI LE CATALOGUE DE L'ENTREPRISE (Extrait pertinent) :\n" + JSON.stringify(filteredCatalog.map((c: any) => ({
          designation: c.designation,
          unite: c.unite,
          pu_ht: c.pu_ht
        }))) + "\n\nConsigne IMPORTANTE : Si la demande correspond à un article du catalogue, utilise EXACTEMENT les prix, désignations du catalogue. Si la demande ne correspond à aucun article, invente une ligne cohérente avec un prix réaliste."
      : "";

    let reglesMetier = "";
    if (needsOssature) {
      reglesMetier = "\n\nRÈGLES MÉTIER OBLIGATOIRES POUR BARDAGE/ITE :\n" +
        "Le client n'a peut-être dicté que la surface de bardage, mais tu DOIS obligatoirement déduire et générer des lignes pour l'ossature bois et la quincaillerie.\n" +
        "Calcule les quantités automatiquement selon la surface nette du bardage avec ces formules strictes :\n" +
        "- Chevrons : 1.5 ml par m² de bardage\n" +
        "- Équerres de bardage : 2 unités par m² de bardage\n" +
        "- Chevilles de fixation : 3 unités par équerre (donc 6 par m²)\n" +
        "Applique ces mathématiques pour renseigner la clé 'qte' de ces lignes.";
    }

    const systemPrompt = 
      "Tu es un expert métreur en bâtiment. Le client va dicter un besoin de chantier. Tu dois décomposer sa demande en PLUSIEURS lignes de devis distinctes." +
      catalogueString +
      reglesMetier +
      "\n\nTU DOIS RÉPONDRE UNIQUEMENT AVEC UN OBJET JSON. AUCUN TEXTE AVANT, AUCUN TEXTE APRÈS, AUCUN FORMATAGE MARKDOWN.\n" +
      "L'objet JSON doit contenir EXACTEMENT ces deux clés :\n" +
      "1. \"brouillon_calculs\" : (String) Un espace où tu réfléchis. Sois EXTRÊMEMENT BREF, style télégramme. Fais tes calculs rapidement sans faire de phrases longues.\n" +
      "2. \"lignes_prestation\" : (Tableau d'objets) Le tableau final contenant uniquement les lignes du devis avec EXACTEMENT cette structure : { \"designation\": \"Titre court\", \"description\": \"Détail technique (à générer toi-même)\", \"qte\": 1, \"unite\": \"forfait\", \"pu_ht\": 100 }.";

    const { text: texte } = await generateText({
      model: google('gemini-2.5-pro'),
      system: systemPrompt,
      prompt: prompt,
      temperature: 0.2,
    });
    
    // Nettoyage au cas où Gemini ajouterait du markdown
    let jsonString = texte.trim();
    if (jsonString.startsWith("```json")) {
      jsonString = jsonString.replace(/```json/g, "").replace(/```/g, "").trim();
    } else if (jsonString.startsWith("```")) {
      jsonString = jsonString.replace(/```/g, "").trim();
    }
    
    let result;
    try {
      result = JSON.parse(jsonString);
    } catch (parseError) {
      console.error("Erreur de parsing JSON. Texte reçu :", jsonString);
      throw new Error("Impossible de parser le JSON de Gemini.");
    }

    if (!result.lignes_prestation || !Array.isArray(result.lignes_prestation)) {
      throw new Error("L'IA n'a pas renvoyé le tableau 'lignes_prestation'.");
    }

    return NextResponse.json(result.lignes_prestation);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Erreur IA Devis:', message);
    return NextResponse.json({ error: "L'IA a échoué: " + message }, { status: 500 });
  }
}

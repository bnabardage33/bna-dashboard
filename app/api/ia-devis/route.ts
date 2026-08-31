import { NextRequest, NextResponse } from 'next/server';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'groq/compound-mini';

export async function POST(req: NextRequest) {
  try {
    const { prompt, catalogueContext } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt manquant' }, { status: 400 });
    }

    const catalogueString = catalogueContext && catalogueContext.length > 0
      ? "\n\nVOICI LE CATALOGUE DE L'ENTREPRISE :\n" + JSON.stringify(catalogueContext.map((c: any) => ({
          designation: c.designation,
          description: c.description,
          unite: c.unite,
          pu_ht: c.pu_ht
        }))) + "\n\nConsigne IMPORTANTE : Si la demande correspond à un article du catalogue, utilise EXACTEMENT les prix, désignations et descriptions du catalogue. Si la demande ne correspond à aucun article, invente une ligne cohérente avec un prix réaliste."
      : "";

    const groqResponse = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: "Bearer " + process.env.GROQ_API_KEY,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content:
              "Tu es un expert métreur en bâtiment. Le client va dicter un besoin de chantier. Tu dois décomposer sa demande en PLUSIEURS lignes de devis distinctes." +
              catalogueString +
              "\nFormat attendu STRICTEMENT : un TABLEAU JSON contenant les lignes : [{ \"designation\": \"Titre court\", \"description\": \"Détail technique\", \"qte\": 1, \"unite\": \"forfait\", \"pu_ht\": 100 }]. Renvoie UNIQUEMENT le tableau JSON valide, sans markdown, sans explication."
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('Erreur Groq:', errText);
      return NextResponse.json({ error: 'Erreur Groq: ' + errText }, { status: 502 });
    }

    const groqData = await groqResponse.json();
    const texte = groqData.choices?.[0]?.message?.content ?? "";
    
    // Extraction robuste du JSON (tableau ou objet) peu importe le texte autour
    let jsonString = texte;
    const matchArray = texte.match(/\[[\s\S]*\]/);
    const matchObject = texte.match(/\{[\s\S]*\}/);
    
    if (matchArray) {
      jsonString = matchArray[0];
    } else if (matchObject) {
      jsonString = matchObject[0];
    }

    const result = JSON.parse(jsonString);

    return NextResponse.json(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Erreur IA Devis:', message);
    return NextResponse.json({ error: "L'IA n'a pas pu générer une ligne de devis valide pour cette demande. Reformule ta demande." }, { status: 500 });
  }
}
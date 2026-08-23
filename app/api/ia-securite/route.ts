import { NextRequest, NextResponse } from 'next/server';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'groq/compound-mini';

export async function POST(req: NextRequest) {
  try {
    const { contexte } = await req.json();

    if (!contexte) {
      return NextResponse.json({ error: 'Contexte manquant' }, { status: 400 });
    }

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
              "Tu es un coordinateur SPS (Sécurité et Protection de la Santé) sur un chantier BTP (Bardage, ITE). On te donne les conditions actuelles du chantier (matériel utilisé, matériau, météo). Tu dois générer une checklist de sécurité sous forme de 5 points clés ultra précis et concrets (pas de blabla). Renvoie uniquement du texte brut avec des tirets."
          },
          { role: 'user', content: contexte },
        ],
        temperature: 0.3,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('Erreur Groq:', errText);
      return NextResponse.json({ error: 'Erreur API IA' }, { status: 502 });
    }

    const groqData = await groqResponse.json();
    const texte = groqData.choices?.[0]?.message?.content ?? "";

    return NextResponse.json({ texte });
  } catch (err) {
    console.error('Erreur IA Securite:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
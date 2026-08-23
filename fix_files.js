const fs = require('fs');

const devisContent = `
import { NextRequest, NextResponse } from 'next/server';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'groq/compound-mini';

export async function POST(req: NextRequest) {
  try {
    const { prompt } = await req.json();

    if (!prompt) {
      return NextResponse.json({ error: 'Prompt manquant' }, { status: 400 });
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
              "Tu es un expert métreur en bâtiment (spécialisé en bardage, isolation thermique par l'extérieur, menuiserie). Le client va te donner une instruction courte et brouillonne. Tu dois générer une désignation technique et professionnelle pour une ligne de devis. \\nFormat attendu STRICTEMENT en JSON : { \\"designation\\": \\"Titre court\\", \\"description\\": \\"Description détaillée technique, DTU...\\", \\"qte\\": 1, \\"unite\\": \\"forfait\\", \\"pu_ht\\": 100 }. Renvoie UNIQUEMENT le JSON valide, sans markdown, sans rien avant ni après."
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.2,
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('Erreur Groq:', errText);
      return NextResponse.json({ error: 'Erreur API IA' }, { status: 502 });
    }

    const groqData = await groqResponse.json();
    const texte = groqData.choices?.[0]?.message?.content ?? "";
    
    // Nettoyage au cas où l'IA renvoie du markdown
    const cleaned = texte.replace(/\`\`\`json/g, "").replace(/\`\`\`/g, "").trim();
    const result = JSON.parse(cleaned);

    return NextResponse.json(result);
  } catch (err) {
    console.error('Erreur IA Devis:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
`;
fs.writeFileSync('app/api/ia-devis/route.ts', devisContent.trim());

const secContent = `
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
`;
fs.writeFileSync('app/api/ia-securite/route.ts', secContent.trim());


// app/api/reformuler-note/route.ts
// Endpoint serveur : reçoit le texte brut dicté, l'anonymise, l'envoie à Groq (Compound Mini),
// puis renvoie le texte reformulé avec les vraies données ré-injectées.
// Le texte anonymisé est le SEUL élément qui transite vers l'extérieur.

import { NextRequest, NextResponse } from 'next/server';
import { anonymizeText, deanonymizeText } from '@/lib/anonymizeText';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = 'groq/compound-mini';

export async function POST(req: NextRequest) {
  try {
    const { texteBrut } = await req.json();

    if (!texteBrut || typeof texteBrut !== 'string') {
      return NextResponse.json({ error: 'texteBrut manquant' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // clé serveur, pas la clé anon publique

    // 1. Anonymisation
    const { anonymizedText, mapping } = await anonymizeText(texteBrut, supabaseUrl, supabaseKey);

    // 2. Appel à Groq (Compound Mini) avec le texte neutre uniquement
    const groqResponse = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [
          {
            role: 'system',
            content:
              "Tu reformules des notes vocales dictées sur un chantier de bardage/façade en français correct et bien structuré. Garde le sens exact, corrige juste la syntaxe et la ponctuation. Ne modifie jamais les balises entre crochets comme [NOM_CLIENT_1], recopie-les telles quelles. Réponds uniquement avec le texte reformulé, sans commentaire.",
          },
          { role: 'user', content: anonymizedText },
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
    const texteReformule = groqData.choices?.[0]?.message?.content ?? anonymizedText;

    // 3. Ré-injection des vraies données
    const texteFinal = deanonymizeText(texteReformule, mapping);

    return NextResponse.json({ texteReformule: texteFinal });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Erreur reformulation:', message);
    return NextResponse.json({ error: 'Erreur serveur', debug: message }, { status: 500 });
  }
}

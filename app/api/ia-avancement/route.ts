// app/api/ia-avancement/route.ts
// Reçoit la transcription d'une note vocale du chef de chantier, l'envoie à
// gpt-oss-20b (Groq) pour extraire l'avancement par façade en pourcentage,
// et renvoie un JSON { nord, sud, est, ouest, commentaire_clean }.

import { NextRequest, NextResponse } from 'next/server';
import { verifierSession } from '@/lib/auth';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

export async function POST(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  try {
    const { texteBrut } = await req.json();

    if (!texteBrut || typeof texteBrut !== 'string') {
      return NextResponse.json({ error: 'texteBrut manquant' }, { status: 400 });
    }

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
              "Tu es un assistant de chantier de bardage/façade. Tu reçois la transcription vocale du chef de chantier qui annonce l'avancement des travaux pour les façades nord, sud, est et ouest, avec éventuellement des observations.\n\nTâche : extrais le pourcentage d'avancement de chaque façade mentionnée et nettoie les observations.\n\nRègles :\n- Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format exact : {\"nord\": number|null, \"sud\": number|null, \"est\": number|null, \"ouest\": number|null, \"commentaire_clean\": string}\n- Chaque pourcentage : entier entre 0 et 100 pour une façade mentionnée, sinon null.\n- Interprète les formulations orales : 'terminé', 'fini', 'à 100', '100 pour cent' => 100 ; 'à 80', '80%' => 80 ; 'à moitié' => 50 ; 'pas commencé', 'rien fait' => 0.\n- 'fini à' => le pourcentage donné.\n- commentaire_clean : les observations autres que les pourcentages (météo, retards, incidents...), reformulées en français correct et concis. Chaîne vide s'il n'y en a pas.\n- Ne dis rien d'autre que le JSON.",
          },
          {
            role: 'user',
            content: `Extrais l'avancement par façade depuis ce texte parlé :\n"""${texteBrut}"""`,
          },
        ],
        temperature: 0.1,
        response_format: { type: 'json_object' },
      }),
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('Erreur Groq:', errText);
      return NextResponse.json({ error: 'Erreur API IA' }, { status: 502 });
    }

    const data = await groqResponse.json();
    const content: string = data.choices?.[0]?.message?.content ?? '';

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(content);
    } catch {
      const match = content.match(/\{[\s\S]*\}/);
      if (!match) throw new Error('JSON introuvable dans la réponse IA');
      parsed = JSON.parse(match[0]);
    }

    const clampPct = (v: unknown): number | null => {
      if (typeof v === 'number' && !Number.isNaN(v)) return Math.min(100, Math.max(0, Math.round(v)));
      if (typeof v === 'string') {
        const n = parseFloat(v.replace(',', '.'));
        if (!Number.isNaN(n)) return Math.min(100, Math.max(0, Math.round(n)));
      }
      return null;
    };

    return NextResponse.json({
      nord: clampPct(parsed.nord),
      sud: clampPct(parsed.sud),
      est: clampPct(parsed.est),
      ouest: clampPct(parsed.ouest),
      commentaire_clean:
        typeof parsed.commentaire_clean === 'string' ? parsed.commentaire_clean.trim() : '',
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Erreur IA avancement:', message);
    return NextResponse.json({ error: 'Erreur serveur', debug: message }, { status: 500 });
  }
}
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
    const { texteBrut, facades: facadesParam } = await req.json();

    if (!texteBrut || typeof texteBrut !== 'string') {
      return NextResponse.json({ error: 'texteBrut manquant' }, { status: 400 });
    }

    const facadesActives: Array<{ id: string; label: string }> =
      Array.isArray(facadesParam) && facadesParam.length > 0
        ? facadesParam
        : [
            { id: 'nord', label: 'Façade Nord' },
            { id: 'sud', label: 'Façade Sud' },
            { id: 'est', label: 'Façade Est' },
            { id: 'ouest', label: 'Façade Ouest' },
          ];

    const descriptionFacades = facadesActives
      .map((f) => `- Clé "${f.id}" : ${f.label}`)
      .join('\n');

    const schemaReponse = [
      ...facadesActives.map((f) => `"${f.id}": number|null`),
      '"commentaire_clean": string',
    ].join(', ');

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
              `Tu es un assistant de chantier de bardage/façade. Tu reçois la transcription vocale du chef de chantier qui annonce l'avancement des travaux pour les façades du chantier.\n\nFaçades configurées sur ce chantier :\n${descriptionFacades}\n\nTâche : extrais le pourcentage d'avancement de chaque façade mentionnée et nettoie les observations.\n\nRègles :\n- Réponds UNIQUEMENT avec un objet JSON valide, sans texte autour, au format exact : { ${schemaReponse} }\n- Chaque pourcentage : entier entre 0 et 100 pour une façade mentionnée, sinon null.\n- Interprète les formulations orales : 'terminé', 'fini', 'à 100', '100 pour cent' => 100 ; 'à 80', '80%' => 80 ; 'à moitié' => 50 ; 'pas commencé', 'rien fait' => 0.\n- 'fini à' => le pourcentage donné.\n- commentaire_clean : les observations autres que les pourcentages (météo, retards, incidents...), reformulées en français correct et concis. Chaîne vide s'il n'y en a pas.\n- Ne dis rien d'autre que le JSON.`,
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

    const resultat: Record<string, unknown> = {
      commentaire_clean:
        typeof parsed.commentaire_clean === 'string' ? parsed.commentaire_clean.trim() : '',
    };

    for (const f of facadesActives) {
      resultat[f.id] = clampPct(parsed[f.id]);
    }

    // Toujours assurer le fallback pour les clés traditionnelles si attendu par du code hérité
    if (!('nord' in resultat) && parsed.nord !== undefined) resultat.nord = clampPct(parsed.nord);
    if (!('sud' in resultat) && parsed.sud !== undefined) resultat.sud = clampPct(parsed.sud);
    if (!('est' in resultat) && parsed.est !== undefined) resultat.est = clampPct(parsed.est);
    if (!('ouest' in resultat) && parsed.ouest !== undefined) resultat.ouest = clampPct(parsed.ouest);

    return NextResponse.json(resultat);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Erreur IA avancement:', message);
    return NextResponse.json({ error: 'Erreur serveur', debug: message }, { status: 500 });
  }
}
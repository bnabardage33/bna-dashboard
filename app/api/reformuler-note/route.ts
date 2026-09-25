// app/api/reformuler-note/route.ts
// Endpoint serveur : reçoit le texte brut dicté, l'anonymise, l'envoie à Groq (Compound Mini),
// puis renvoie le texte reformulé avec les vraies données ré-injectées.
// Le texte anonymisé est le SEUL élément qui transite vers l'extérieur.
//
// ISOLATION MULTI-ENTREPRISE (O3-B4)
// `anonymizeText` lit son dictionnaire en `service_role` (RLS inopérante) :
// le tenant doit donc être résolu AVANT et transmis explicitement. Il
// provient exclusivement du claim `app_metadata.entreprise_id` de la session
// authentifiée — jamais du body — avec refus fail-closed si absent ou
// invalide. Aucune lecture du dictionnaire n'est émise dans ce cas.

import { NextRequest, NextResponse } from 'next/server';
import { anonymizeText, deanonymizeText } from '@/lib/anonymizeText';
import { verifierSession } from '@/lib/auth';
import { createClient } from '@/lib/supabase/server';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string): boolean {
  return UUID_RE.test(value);
}

export async function POST(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  try {
    // Tenant de la session : même source que `entreprise_courante()` côté
    // PostgREST (claim app_metadata, non modifiable par l'utilisateur).
    const supabaseAuth = await createClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    const entrepriseId = (user?.app_metadata as { entreprise_id?: unknown } | null | undefined)
      ?.entreprise_id;

    if (typeof entrepriseId !== 'string' || !estUuid(entrepriseId)) {
      return NextResponse.json({ error: 'Contexte entreprise introuvable' }, { status: 403 });
    }

    const { texteBrut } = await req.json();

    if (!texteBrut || typeof texteBrut !== 'string') {
      return NextResponse.json({ error: 'texteBrut manquant' }, { status: 400 });
    }

    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!; // clé serveur, pas la clé anon publique

    // 1. Anonymisation
    const { anonymizedText, mapping } = await anonymizeText(
      texteBrut,
      supabaseUrl,
      supabaseKey,
      entrepriseId
    );

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

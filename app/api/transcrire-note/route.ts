// app/api/transcrire-note/route.ts
// Reçoit un fichier audio (enregistré côté client), l'envoie à Whisper Large v3
// via Groq pour transcription, et renvoie le texte brut.
// Ce texte brut est ensuite envoyé séparément à /api/reformuler-note.

import { NextRequest, NextResponse } from 'next/server';
import { verifierSession } from '@/lib/auth';

const GROQ_TRANSCRIPTION_URL = 'https://api.groq.com/openai/v1/audio/transcriptions';
const WHISPER_MODEL = 'whisper-large-v3';

export async function POST(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File | null;

    if (!audioFile) {
      return NextResponse.json({ error: 'Fichier audio manquant' }, { status: 400 });
    }

    const groqFormData = new FormData();
    groqFormData.append('file', audioFile, 'note.webm');
    groqFormData.append('model', WHISPER_MODEL);
    groqFormData.append('language', 'fr');

    const groqResponse = await fetch(GROQ_TRANSCRIPTION_URL, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.GROQ_API_KEY}`,
      },
      body: groqFormData,
    });

    if (!groqResponse.ok) {
      const errText = await groqResponse.text();
      console.error('Erreur Whisper/Groq:', errText);
      return NextResponse.json({ error: 'Erreur de transcription' }, { status: 502 });
    }

    const data = await groqResponse.json();
    const texteBrut = data.text ?? '';

    return NextResponse.json({ texteBrut });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error('Erreur transcription:', message);
    return NextResponse.json({ error: 'Erreur serveur', debug: message }, { status: 500 });
  }
}

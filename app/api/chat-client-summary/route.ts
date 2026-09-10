import { NextRequest, NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase';
import { supabaseAdmin } from '@/lib/supabaseAdmin';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

async function destinatairePatron(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1);
  if (data && data.length > 0) return data[0].id;
  return null;
}

export async function POST(req: NextRequest) {
  try {
    const { messages, clientName, chantierId } = await req.json();

    if (!messages || !Array.isArray(messages) || messages.length < 2) {
      return NextResponse.json({ status: 'ignored' });
    }

    const systemPrompt = {
      role: 'system',
      content: 
        `Tu es l'assistant du patron de l'entreprise BNA. Voici l'historique d'une conversation avec un client (${clientName || 'M. Dupont'}). ` +
        "Le patron n'a pas le temps de tout lire. " +
        "ANALYSE le ton du client. " +
        "Si la conversation est extrêmement banale (juste 'bonjour' et 'au revoir') et n'apporte aucune information, réponds EXACTEMENT: RAS. " +
        "Sinon, réponds OBLIGATOIREMENT dans ce format JSON valide : " +
        "{\"sentiment\": \"positif\" | \"negatif\" | \"neutre\", \"resume\": \"Résumé de 2 lignes maximum sans formule de politesse\"}"
    };

    const summaryResponse = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: "Bearer " + process.env.GROQ_API_KEY,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [systemPrompt, ...messages],
        temperature: 0.1,
        response_format: { type: "json_object" }
      }),
    });

    if (!summaryResponse.ok) {
      return NextResponse.json({ error: 'Erreur API IA' }, { status: 502 });
    }

    const summaryData = await summaryResponse.json();
    const rawContent = (summaryData.choices?.[0]?.message?.content ?? "").trim();

    if (rawContent === 'RAS') {
      return NextResponse.json({ status: 'ras' });
    }

    let parsed = { sentiment: 'neutre', resume: 'Demande de rappel client.' };
    try {
      parsed = JSON.parse(rawContent);
    } catch (e) {
      if (rawContent.includes('resume')) {
        // tentative de récupération
        parsed.resume = rawContent;
      }
    }

    let emoji = '🔵';
    if (parsed.sentiment === 'positif') emoji = '🟢';
    else if (parsed.sentiment === 'negatif') emoji = '🔴';

    await supabase.from('notes_patron').insert({
      titre: `${emoji} Résumé Espace Web`,
      contenu: `Client : ${clientName || 'Client'}\n\nRésumé :\n${parsed.resume}`,
      epingle: true
    });

    if (parsed.sentiment === 'negatif') {
      const patronId = await destinatairePatron();
      await supabaseAdmin.from('notifications').insert({
        type: 'client_alert',
        titre: '🔴 Client mécontent (Espace Web)',
        message: `Client : ${clientName || 'Client'}\n${parsed.resume}`,
        lien: chantierId ? `/bureau/chantiers?id=${chantierId}` : null,
        destinataire_id: patronId,
      });
    }

    return NextResponse.json({ status: 'alert_created', resume: parsed.resume });
  } catch (err) {
    console.error('Erreur IA Chat Client Summary:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

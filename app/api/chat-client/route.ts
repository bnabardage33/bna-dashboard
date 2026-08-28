import { NextRequest, NextResponse } from 'next/server';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

export async function POST(req: NextRequest) {
  try {
    const { messages, clientName, chantierName, avancement } = await req.json();

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages manquants ou invalides' }, { status: 400 });
    }

    const systemPrompt = {
      role: 'system',
      content: 
        "Tu es l'assistant virtuel de l'entreprise de bâtiment BNA (spécialisée en bardage, rénovation de façades). " +
        `Tu parles à un client connecté sur son Espace Client (ici, M./Mme ${clientName || 'Dupont'}, dont le chantier "${chantierName || 'Rénovation'}" est à ${avancement || 0}% d'avancement). ` +
        "SITUATION ACTUELLE : Il y a un retard de livraison sur les plaques HPL chez le fournisseur. Le chantier est en pause pour quelques jours. Tu dois l'annoncer ou l'expliquer au client s'il demande, en étant extrêmement rassurant, diplomate, et en t'excusant au nom de BNA. " +
        "Tu dois être poli, professionnel et concis. " +
        "IMPORTANT : Si le client est en colère ou pose un problème complexe, sois très empathique, dis que tu transmets au patron qui le rappellera rapidement. " +
        "INTERDICTION ABSOLUE : Tu n'as AUCUN pouvoir de décision. Tu ne dois JAMAIS accepter une modification de devis, de couleur, de matériau ou de prix. Tu ne dois JAMAIS faire de promesse (même si la demande semble réalisable ou absurde). Si le client demande une modification (comme changer la couleur du bardage, avoir une réduction, etc.), tu dois OBLIGATOIREMENT dire que tu n'es qu'un assistant virtuel et que seul le patron peut valider cela, puis transmettre le message. " +
        "À l'inverse, si la conversation est positive mais que le client n'a pas encore donné son avis sur le chantier, demande-lui s'il est satisfait des travaux. S'il vient DÉJÀ de te dire qu'il est content, remercie-le chaleureusement et NE lui repose SURTOUT PAS la question. " +
        "À la fin de tes réponses, si tu as résolu ou pris en compte sa demande, demande-lui s'il a d'autres questions. " +
        "Si le client te fait comprendre qu'il n'a plus de questions ou te dit au revoir (ex: 'non', 'merci c'est tout', 'au revoir'), termine ta réponse par une formule de politesse puis ajoute EXACTEMENT le mot-clé '[FIN_CONVERSATION]'. N'envoie jamais ce mot-clé tout seul. " +
        "Fais des réponses courtes (2 ou 3 phrases maximum). NE DIS PAS 'Bonjour' à chaque message."
    };

    const groqResponse = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: "Bearer " + process.env.GROQ_API_KEY,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [systemPrompt, ...messages],
        temperature: 0.5,
      }),
    });

    if (!groqResponse.ok) {
      const errBody = await groqResponse.text();
      console.error('Erreur Groq API:', groqResponse.status, errBody);
      return NextResponse.json({ error: 'Erreur API IA', detail: errBody }, { status: 502 });
    }

    const groqData = await groqResponse.json();
    let texte = groqData.choices?.[0]?.message?.content ?? "";

    return NextResponse.json({ texte });
  } catch (err) {
    console.error('Erreur IA Chat Client:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}

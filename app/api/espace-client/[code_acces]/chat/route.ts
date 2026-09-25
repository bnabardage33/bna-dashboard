import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { resoudreChantierParCodeAcces } from '@/lib/espace-chantier-code';
import { anonymizeText, deanonymizeText } from '@/lib/anonymizeText';

// Chatbot de l'Espace Client, SCOPÉ au code d'accès (préfixe /api/espace-client/*,
// donc public par middleware) :
// - Le code_acces est validé côté serveur (table chantiers) : 403 si inconnu,
//   aucun repli « démo » possible côté client.
// - Le contexte IA est UNIQUEMENT celui du chantier lié au code : avancement des
//   façades, intempéries et devis (numéro + statut). Ni le nom du client ni le
//   nom du chantier ne partent sur le réseau.
// - Aucune donnée personnelle ne quitte le serveur : tout le payload envoyé à
//   Groq (consigne système + conversation) passe par anonymizeText (PII remplacées
//   par des balises), puis la réponse est désanonymisée avant renvoi.

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

const FACADES = ['nord', 'sud', 'est', 'ouest'] as const;
const ETAPES = ['ossature', 'isolation', 'bardage', 'finitions'] as const;
const MAX_MESSAGES = 12;

function compterEtapes(details: unknown): number {
  let nb = 0;
  if (!details || typeof details !== 'object' || Array.isArray(details)) return nb;
  const brut = details as Record<string, unknown>;
  for (const facade of FACADES) {
    const etapes = brut[facade];
    if (etapes && typeof etapes === 'object') {
      const map = etapes as Record<string, unknown>;
      nb += ETAPES.filter((e) => map[e] === true).length;
    }
  }
  return nb;
}

type ContexteChantier = {
  dateFinEstimee: string | null;
  avancementPct: number | null;
  etapesRealisees: number;
  dernierAvancementDate: string | null;
  devis: { numero: string | null; statut: string | null }[];
  intemperies: { cree_le: string | null; motif: string | null; jour_arrete: boolean }[];
};

async function chargerContexte(chantierId: string): Promise<ContexteChantier | null> {
  const [chantierRes, avRes, devisRes, intempRes] = await Promise.all([
    supabaseAdmin
      .from('chantiers')
      .select('date_fin')
      .eq('id', chantierId)
      .maybeSingle(),
    supabaseAdmin
      .from('avancements_chantier')
      .select('pourcentage, details, created_at')
      .eq('chantier_id', chantierId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('devis')
      .select('numero, statut')
      .eq('chantier_id', chantierId)
      .in('statut', ['envoye', 'accepte']),
    supabaseAdmin
      .from('rapports_intemperies')
      .select('cree_le, motif, jour_arrete')
      .eq('chantier_id', chantierId)
      .gte('cree_le', new Date(Date.now() - 14 * 86400000).toISOString())
      .order('cree_le', { ascending: false })
      .limit(5),
  ]);

  const avancement = avRes.data;
  const details = avancement ? compterEtapes(avancement.details) : 0;

  return {
    dateFinEstimee: chantierRes.data?.date_fin ?? null,
    avancementPct: avancement?.pourcentage ?? null,
    etapesRealisees: details,
    dernierAvancementDate: avancement?.created_at ?? null,
    devis: (devisRes.data ?? []).map((d) => ({ numero: d.numero, statut: d.statut })),
    intemperies: (intempRes.data ?? []).map((i) => ({
      cree_le: i.cree_le,
      motif: i.motif,
      jour_arrete: i.jour_arrete,
    })),
  };
}

function formatContexte(contexte: ContexteChantier): string {
  const lignes: string[] = [];
  lignes.push(
    `- Avancement : ${contexte.avancementPct ?? 0}%, soit ${contexte.etapesRealisees}/16 étapes réalisées sur les 4 façades`
  );
  if (contexte.dernierAvancementDate) {
    lignes.push(`- Dernière mise à jour de l'avancement : ${new Date(contexte.dernierAvancementDate).toLocaleDateString('fr-FR')}`);
  }
  if (contexte.dateFinEstimee) {
    lignes.push(`- Date de fin estimée : ${new Date(contexte.dateFinEstimee).toLocaleDateString('fr-FR')}`);
  }
  if (contexte.intemperies.length > 0) {
    lignes.push(`- Arrêts intempéries relevés ces 14 derniers jours (${contexte.intemperies.length}) :`);
    for (const i of contexte.intemperies.slice(0, 5)) {
      const date = i.cree_le ? new Date(i.cree_le).toLocaleDateString('fr-FR') : 'date inconnue';
      lignes.push(`   • ${date} — ${i.motif || 'intempérie'}${i.jour_arrete ? ' (chantier à l\'arrêt)' : ''}`);
    }
  } else {
    lignes.push('- Arrêts intempéries : aucun relevé ces 14 derniers jours');
  }
  if (contexte.devis.length > 0) {
    lignes.push(`- Devis : ${contexte.devis.map((d) => `${d.numero || 'devis'} (${d.statut})`).join(', ')}`);
  } else {
    lignes.push('- Devis : aucun devis visible en cours');
  }
  return lignes.join('\n');
}

type Message = { role: string; content: string };

function validerMessages(valeur: unknown): Message[] {
  if (!Array.isArray(valeur)) return [];
  const messages: Message[] = [];
  for (const item of valeur) {
    if (!item || typeof item !== 'object') continue;
    const brut = item as Record<string, unknown>;
    const role = brut.role;
    const content = brut.content;
    if ((role === 'user' || role === 'assistant') && typeof content === 'string') {
      messages.push({ role, content });
    }
  }
  return messages.slice(-MAX_MESSAGES);
}

async function persisterMessages(
  cle: string,
  chantierId: string,
  clientName: string,
  sessionId: string | null,
  messages: Message[]
) {
  try {
    await supabaseAdmin.rpc('espace_client_append', {
      p_cle: cle,
      p_chantier_id: chantierId,
      p_client_nom: clientName,
      p_session_id: sessionId as string,
      p_messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
  } catch (e) {
    console.error('persisterMessages espace client:', e);
  }
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ code_acces: string }> }
) {
  try {
    const { code_acces } = await params;
    if (!code_acces || code_acces.trim() === '') {
      return NextResponse.json({ error: "Code d'accès manquant" }, { status: 400 });
    }

    // Validation serveur du code d'accès : le chantier est déduit du code, le
    // client ne fournit jamais son id, son nom ni son avancement.
    const chantier = await resoudreChantierParCodeAcces(code_acces.trim());
    if (!chantier) {
      return NextResponse.json({ error: "Code d'accès invalide" }, { status: 403 });
    }

    const corps = (await req.json()) as Record<string, unknown> | null;
    if (!corps || typeof corps !== 'object') {
      return NextResponse.json({ error: 'Payload invalide' }, { status: 400 });
    }

    const messages = validerMessages(corps.messages);
    if (messages.length === 0) {
      return NextResponse.json({ error: 'Messages manquants ou invalides' }, { status: 400 });
    }
    const sessionId = typeof corps.sessionId === 'string' ? corps.sessionId : null;
    const clientName = chantier.clientName || 'Client';

    const dernierMsg = messages[messages.length - 1];
    const userInput: Message[] = dernierMsg ? [{ role: 'user', content: dernierMsg.content }] : [];

    const contexte = await chargerContexte(chantier.id);

    let situation = '';
    if (contexte && contexte.intemperies.length > 0) {
      const reprises = contexte.intemperies.filter((i) => i.jour_arrete).length;
      situation = `Le chantier a connu ${reprises} jour(s) d'arrêt pour intempéries ces 14 derniers jours (détails dans les données ci-dessus). Si le client demande pourquoi des travaux ont été stoppés, explique-lui avec CES arrêts réels, leurs dates et leurs causes exactes.`;
    } else {
      situation = `Aucun retard n'est signalé dans les données : ne mentionne JAMAIS un retard, une pause ou un problème de livraison (les données ci-dessus n'en contiennent aucun).`;
    }

    const systemPrompt =
      "Tu es l'assistant virtuel de l'entreprise de bâtiment BNA (spécialisée en bardage, rénovation de façades). " +
      "Tu parles à un client connecté sur son Espace Client avec un code d'accès personnel (chantier à " +
      `${contexte?.avancementPct ?? 0}% d'avancement). ` +
      "Ne cite JAMAIS le nom du client, son adresse, son téléphone, son email ni le nom de son chantier : toute donnée personnelle est remplacée par une balise, réponds toujours en restant générique. " +
      'DONNÉES RÉELLES ACTUELLES DU CHANTIER (seules sources de vérité autorisées) :\n' +
      (contexte ? formatContexte(contexte) : 'Données indisponibles — ne fais AUCUNE supposition sur le chantier.') +
      '\n\n' +
      `RÈGLE CONCERNANT LE RETARD : ${situation} ` +
      "RÈGLE ABSOLUE — NE JAMAIS INVENTER : si le client demande des informations qui ne sont PAS dans les données (ex: livraison de matériaux, stocks fournisseur, retard, reprise, date précise non mentionnée), tu réponds que tu vas vérifier auprès de l'équipe et que le patron le rappellera rapidement. Tu ne dois JAMAIS inventer une cause, une date, un retard ou un fournisseur. " +
      "Tu dois être poli, professionnel et concis. " +
      "IMPORTANT : Si le client est en colère ou pose un problème complexe, sois très empathique, dis que tu transmets au patron qui le rappellera rapidement. " +
      "INTERDICTION ABSOLUE : Tu n'as AUCUN pouvoir de décision. Tu ne dois JAMAIS accepter une modification de devis, de couleur, de matériau ou de prix. Tu ne dois JAMAIS faire de promesse (même si la demande semble réalisable ou absurde). Si le client demande une modification (comme changer la couleur du bardage, avoir une réduction, etc.), tu dois OBLIGATOIREMENT dire que tu n'es qu'un assistant virtuel et que seul le patron peut valider cela, puis transmettre le message. " +
      "À l'inverse, si la conversation est positive mais que le client n'a pas encore donné son avis sur le chantier, demande-lui s'il est satisfait des travaux. S'il vient DÉJÀ de te dire qu'il est content, remercie-le chaleureusement et NE lui repose SURTOUT PAS la question. " +
      "À la fin de tes réponses, si tu as résolu ou pris en compte sa demande, demande-lui s'il a d'autres questions. " +
      "Si le client te fait comprendre qu'il n'a plus de questions ou te dit au revoir (ex: 'non', 'merci c'est tout', 'au revoir'), termine ta réponse par une formule de politesse puis ajoute EXACTEMENT le mot-clé '[FIN_CONVERSATION]'. N'envoie jamais ce mot-clé tout seul. " +
      "Fais des réponses courtes (2 ou 3 phrases maximum). NE DIS PAS 'Bonjour' à chaque message.";

    // Anonymisation complète du payload avant tout envoi à Groq : consigne
    // système + conversation. Les PII remplacées par des balises sont mémorisées
    // dans `mapping` pour désanonymiser la réponse.
    const brut = JSON.stringify({ system: systemPrompt, conversation: messages });
    const { anonymizedText, mapping } = await anonymizeText(
      brut,
      process.env.NEXT_PUBLIC_SUPABASE_URL ?? '',
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? ''
    );

    let anonymise: { system?: unknown; conversation?: unknown };
    try {
      anonymise = JSON.parse(anonymizedText) as { system?: unknown; conversation?: unknown };
    } catch {
      anonymise = { system: systemPrompt, conversation: messages };
    }
    const systemOk = typeof anonymise.system === 'string' && anonymise.system.trim() !== ''
      ? anonymise.system
      : systemPrompt;
    const conversationOk = Array.isArray(anonymise.conversation) && anonymise.conversation.length > 0
      ? (anonymise.conversation as Message[])
      : [{ role: 'user', content: anonymizedText }];

    const groqResponse = await fetch(GROQ_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: "Bearer " + process.env.GROQ_API_KEY,
      },
      body: JSON.stringify({
        model: GROQ_MODEL,
        messages: [{ role: 'system', content: systemOk }, ...conversationOk],
        temperature: 0.5,
      }),
    });

    if (!groqResponse.ok) {
      const errBody = await groqResponse.text();
      console.error('Erreur Groq API:', groqResponse.status, errBody);
      await persisterMessages(chantier.id, chantier.id, clientName, sessionId, userInput);
      return NextResponse.json({ error: 'Erreur API IA', detail: errBody }, { status: 502 });
    }

    const groqData = await groqResponse.json();
    const brutTexte = String(groqData.choices?.[0]?.message?.content ?? '');
    const texte = deanonymizeText(brutTexte, mapping);

    await persisterMessages(chantier.id, chantier.id, clientName, sessionId, [
      ...userInput,
      { role: 'assistant', content: texte },
    ]);

    return NextResponse.json({ texte });
  } catch (err) {
    console.error('Erreur IA Chat Client (Espace Client scopé):', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
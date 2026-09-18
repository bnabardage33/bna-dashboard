import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifierSession } from '@/lib/auth';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

const FACADES = ['nord', 'sud', 'est', 'ouest'] as const;
const ETAPES = ['ossature', 'isolation', 'bardage', 'finitions'] as const;

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
  chantier: string | null;
  dateFinEstimee: string | null;
  avancementPct: number | null;
  etapesRealisees: number;
  dernierAvancementDate: string | null;
  devis: { numero: string | null; statut: string | null }[];
  factures: { numero: string | null; statut: string | null }[];
  intemperies: { cree_le: string | null; motif: string | null; jour_arrete: boolean }[];
};

async function chargerContexte(chantierId?: string | null): Promise<ContexteChantier | null> {
  if (!chantierId) return null;

  const [chantierRes, avRes, devisRes, facturesRes, intempRes] = await Promise.all([
    supabaseAdmin
      .from('chantiers')
      .select('nom, date_fin')
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
      .from('factures')
      .select('numero, statut')
      .eq('chantier_id', chantierId)
      .in('statut', ['emise', 'envoyee', 'payee']),
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
    chantier: chantierRes.data?.nom ?? null,
    dateFinEstimee: chantierRes.data?.date_fin ?? null,
    avancementPct: avancement?.pourcentage ?? null,
    etapesRealisees: details,
    dernierAvancementDate: avancement?.created_at ?? null,
    devis: (devisRes.data ?? []).map((d) => ({ numero: d.numero, statut: d.statut })),
    factures: (facturesRes.data ?? []).map((f) => ({ numero: f.numero, statut: f.statut })),
    intemperies: (intempRes.data ?? []).map((i) => ({
      cree_le: i.cree_le,
      motif: i.motif,
      jour_arrete: i.jour_arrete,
    })),
  };
}

function formatContexte(contexte: ContexteChantier): string {
  const lignes: string[] = [];
  lignes.push(`- Nom du chantier : ${contexte.chantier || 'non renseigné'}`);
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
  if (contexte.factures.length > 0) {
    lignes.push(`- Factures : ${contexte.factures.map((f) => `${f.numero || 'facture'} (${f.statut})`).join(', ')}`);
  } else {
    lignes.push('- Factures : aucune facture émise');
  }
  return lignes.join('\n');
}

type Message = { role: string; content: string };

async function persisterMessages(
  cle: string,
  chantierId: string | null | undefined,
  clientName: string | null | undefined,
  sessionId: string | null | undefined,
  messages: Message[]
) {
  try {
    await supabaseAdmin.rpc('espace_client_append', {
      p_cle: cle,
      p_chantier_id: chantierId ?? null,
      p_client_nom: clientName ?? null,
      p_session_id: sessionId ?? null,
      p_messages: messages.map((m) => ({ role: m.role, content: m.content })),
    });
  } catch (e) {
    console.error('persisterMessages espace client:', e);
  }
}

export async function POST(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  try {
    const corps = (await req.json()) as Record<string, unknown> | null;
    if (!corps || typeof corps !== 'object') {
      return NextResponse.json({ error: 'Payload invalide' }, { status: 400 });
    }

    const {
      messages,
      clientName,
      chantierName,
      chantierId,
      sessionId,
      avancement,
    } = corps as {
      messages?: unknown;
      clientName?: string;
      chantierName?: string;
      chantierId?: string;
      sessionId?: string;
      avancement?: number;
    };

    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({ error: 'Messages manquants ou invalides' }, { status: 400 });
    }

    const cle = chantierId ?? `demo:${clientName ?? 'client'}`;
    const dernierMsg = messages[messages.length - 1] as Message | undefined;
    const userInput: Message[] = dernierMsg
      ? [{ role: 'user', content: String(dernierMsg.content ?? '') }]
      : [];

    const contexte = await chargerContexte(chantierId);

    let situation = '';
    if (contexte && contexte.intemperies.length > 0) {
      const reprises = contexte.intemperies.filter((i) => i.jour_arrete).length;
      situation = `Le chantier a connu ${reprises} jour(s) d'arrêt pour intempéries ces 14 derniers jours (détails dans les données ci-dessus). Si le client demande pourquoi des travaux ont été stoppés, explique-lui avec CES arrêts réels, leurs dates et leurs causes exactes.`;
    } else {
      situation = `Aucun retard n'est signalé dans les données : ne mentionne JAMAIS un retard, une pause ou un problème de livraison (les données ci-dessus n'en contiennent aucun).`;
    }

    const systemPrompt = {
      role: 'system',
      content:
        "Tu es l'assistant virtuel de l'entreprise de bâtiment BNA (spécialisée en bardage, rénovation de façades). " +
        `Tu parles à un client connecté sur son Espace Client (ici, M./Mme ${clientName || 'Dupont'}, dont le chantier "${contexte?.chantier || chantierName || 'Rénovation'}" est à ${contexte?.avancementPct ?? avancement ?? 0}% d'avancement). ` +
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
      await persisterMessages(cle, chantierId, clientName, sessionId, userInput);
      return NextResponse.json({ error: 'Erreur API IA', detail: errBody }, { status: 502 });
    }

    const groqData = await groqResponse.json();
    const texte = String(groqData.choices?.[0]?.message?.content ?? "");

    await persisterMessages(cle, chantierId, clientName, sessionId, [
      ...userInput,
      { role: 'assistant', content: texte },
    ]);

    return NextResponse.json({ texte });
  } catch (err) {
    console.error('Erreur IA Chat Client:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
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

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string): boolean {
  return UUID_RE.test(value);
}

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

// ISOLATION MULTI-ENTREPRISE (O3-B6) — le `entrepriseId` est désormais un
// paramètre OBLIGATOIRE de tout chargement de contexte. Chaque lecture est
// doublement fermée : filtre `.eq('entreprise_id', …)` PUIS revalidation de la
// ligne relue. Le résultat est discriminé pour que l'appelant puisse refuser
// (fail-closed) au lieu de dégrader silencieusement le contexte.
type ResultatContexte =
  | { ok: true; contexte: ContexteChantier | null }
  | { ok: false; motif: 'chantier_introuvable' | 'entreprise_incoherente' };

async function chargerContexte(
  chantierId: string,
  entrepriseId: string
): Promise<ResultatContexte> {
  const [chantierRes, avRes, devisRes, intempRes] = await Promise.all([
    supabaseAdmin
      .from('chantiers')
      .select('date_fin, entreprise_id')
      .eq('id', chantierId)
      .eq('entreprise_id', entrepriseId)
      .maybeSingle(),
    supabaseAdmin
      .from('avancements_chantier')
      .select('pourcentage, details, created_at')
      .eq('chantier_id', chantierId)
      .eq('entreprise_id', entrepriseId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabaseAdmin
      .from('devis')
      .select('numero, statut')
      .eq('chantier_id', chantierId)
      .eq('entreprise_id', entrepriseId)
      .in('statut', ['envoye', 'accepte']),
    supabaseAdmin
      .from('rapports_intemperies')
      .select('cree_le, motif, jour_arrete')
      .eq('chantier_id', chantierId)
      .eq('entreprise_id', entrepriseId)
      .gte('cree_le', new Date(Date.now() - 14 * 86400000).toISOString())
      .order('cree_le', { ascending: false })
      .limit(5),
  ]);

  // Fail-closed (O3-B6) : le chantier a été résolu quelques lignes plus haut par
  // `resoudreChantierParCodeAcces` avec cette entreprise. Si la relecture ne
  // retrouve pas exactement cette ligne, c'est une rupture d'invariant (course
  // concurrente, écriture directe, ligne modifiée entre-temps) : on refuse
  // tout, plutôt que de servir un contexte reconstruit sans tenant.
  if (chantierRes.data === null) {
    return { ok: false, motif: 'chantier_introuvable' };
  }
  const entrepriseRelue = (chantierRes.data as { entreprise_id?: unknown }).entreprise_id;
  if (typeof entrepriseRelue !== 'string' || entrepriseRelue !== entrepriseId) {
    return { ok: false, motif: 'entreprise_incoherente' };
  }

  const avancement = avRes.data;
  const details = avancement ? compterEtapes(avancement.details) : 0;

  return {
    ok: true,
    contexte: {
      dateFinEstimee: chantierRes.data.date_fin ?? null,
      avancementPct: avancement?.pourcentage ?? null,
      etapesRealisees: details,
      dernierAvancementDate: avancement?.created_at ?? null,
      devis: (devisRes.data ?? []).map((d) => ({ numero: d.numero, statut: d.statut })),
      intemperies: (intempRes.data ?? []).map((i) => ({
        cree_le: i.cree_le,
        motif: i.motif,
        jour_arrete: i.jour_arrete,
      })),
    },
  };
}

// O3-B6 (F4) — Le `sessionId` transmis par le navigateur est le seul lien entre
// une session de chat et sa ligne de consolidation : il est écrit dans
// `session_id_en_cours` par cette route, puis relu par `traiterConsolidation`.
//
// Précision issue de l'audit de correction, à ne pas relire de travers : le
// contrôle d'idempotence de O3-B5 (`sessionDejaConsolide`) exige
// `stockes.length === 0`. Un client ne peut donc PAS forcer `deja_consolide`
// tant que sa conversation contient des messages non consolidés — l'auto-DoS
// décrite dans le rapport d'audit initial est en réalité déjà fermée en amont,
// et ce correctif ne prétend pas la rouvrir.
//
// Ce qui reste réel, et que ces garde-fous tiennent : un `session_id` arbitraire
// fourni par le navigateur est écrit tel quel en base. Deux conséquences
// concrètes — (1) un identifiant peut être arbitrairement long ou contenir des
// caractères hostiles, et il est recopié dans `resumes_sessions` par la
// consolidation ; (2) rien n'interdisait de remémoriser un `session_id` déjà
// présent dans `resumes_sessions`, si bien que la même étiquette désignait
// deux sessions distinctes dans le dossier du patron.
//
// On lit donc la liste des sessions DÉJÀ CONSOLIDÉES (lecture scopée par
// `entreprise_id` puis revalidée) et on substitue un identifiant serveur quand
// l'identifiant fourni est déjà consommé ou malformé. L'idempotence légitime est
// intacte : un identifiant bien formé et encore disponible est réutilisé tel quel.
const SESSION_ID_RE = /^[A-Za-z0-9_-]{8,64}$/;

function genererSessionId(): string {
  return `srv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

type LectureSessions = { ok: true; consommes: string[] } | { ok: false };

async function lireSessionsConsolidees(
  cle: string,
  entrepriseId: string
): Promise<LectureSessions> {
  const { data, error } = await supabaseAdmin
    .from('espace_client_conversations')
    .select('entreprise_id, resumes_sessions')
    .eq('cle', cle)
    .eq('entreprise_id', entrepriseId)
    .maybeSingle();

  if (error) {
    console.error(
      '[O3-B6] lecture des sessions consolidées impossible :',
      typeof error.message === 'string' ? error.message : 'erreur inconnue'
    );
    return { ok: false };
  }
  // Aucune conversation pour cette `cle` : rien n'est encore consolidé.
  if (data === null) return { ok: true, consommes: [] };

  // Fail-closed : revalidation post-lecture, comme partout ailleurs (O3-B5).
  const relue = (data as { entreprise_id?: unknown }).entreprise_id;
  if (relue !== entrepriseId) {
    console.error('[O3-B6] revalidation tenant en échec sur espace_client_conversations.');
    return { ok: false };
  }

  const brutes = (data as { resumes_sessions?: unknown }).resumes_sessions;
  const consommes: string[] = [];
  for (const item of Array.isArray(brutes) ? (brutes as unknown[]) : []) {
    if (!item || typeof item !== 'object') continue;
    const sid = (item as Record<string, unknown>).session_id;
    if (typeof sid === 'string' && sid !== '') consommes.push(sid);
  }
  return { ok: true, consommes };
}

function resoudreSessionId(brut: string | null, consommes: string[]): string {
  const candidat = typeof brut === 'string' ? brut.trim() : '';
  if (candidat === '') return genererSessionId();
  if (!SESSION_ID_RE.test(candidat)) {
    console.warn(
      '[O3-B6] sessionId de format non attendu, identifiant serveur substitué (longueur reçue :',
      candidat.length,
      ').'
    );
    return genererSessionId();
  }
  if (consommes.includes(candidat)) {
    console.warn(
      "[O3-B6] sessionId déjà présent dans resumes_sessions : identifiant serveur substitué (la même étiquette ne désignera pas deux sessions)."
    );
    return genererSessionId();
  }
  return candidat;
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

// O3-B6 (F3 + F6) — Le client Supabase ne lève pas sur une erreur SQL : il la
// résout dans `{ error }`. L'ancien `try { await supabaseAdmin.rpc(...) } catch`
// n'attrapait donc jamais l'échec d'écriture, et le `catch` ne servait qu'à
// masquer les rares exceptions JS. Résultat : une conversation perdue en base
// renvoyait quand même `200 { texte }` au client, qui croyait son échange
// mémorisé. Ici, `{ error }` ET la charge utile de retour sont vérifiés, et
// l'appelant décide du comportement (fail-closed).
type ResultatAppend =
  | { ok: true; id: string }
  | { ok: false; raison: string; isolation: boolean };

// Les gardes-fous SQL de la migration O3-B6 lèvent avec le préfixe
// `espace_client_append:` ; on les distingue pour journaliser une violation
// d'invariant d'isolation (bien plus grave qu'une panne).
const GARDE_APPEND_RE = /espace_client_append\s*:/;

async function persisterMessages(
  cle: string,
  chantierId: string,
  clientName: string,
  sessionId: string,
  messages: Message[]
): Promise<ResultatAppend> {
  const { data, error } = await supabaseAdmin.rpc('espace_client_append', {
    p_cle: cle,
    p_chantier_id: chantierId,
    p_client_nom: clientName,
    p_session_id: sessionId,
    p_messages: messages.map((m) => ({ role: m.role, content: m.content })),
  });

  if (error) {
    const raison = typeof error.message === 'string' ? error.message : 'erreur inconnue';
    const isolation = GARDE_APPEND_RE.test(raison);
    console.error(
      isolation
        ? '[O3-B6] VIOLATION D\'ISOLATION — espace_client_append a rejeté l\'écriture :'
        : '[O3-B6] espace_client_append a échoué :',
      raison
    );
    return { ok: false, raison, isolation };
  }

  // F6 : le résultat du RPC est réellement vérifié. `{ ok: true, id }` est la
  // seule preuve d'écriture acceptée — un retour vide ou sans identifiant est
  // traité comme un échec, jamais comme un succès tacite.
  const charge = (data ?? null) as unknown as Record<string, unknown> | null;
  if (charge === null || charge.ok !== true || typeof charge.id !== 'string' || charge.id === '') {
    console.error("[O3-B6] espace_client_append n'a pas confirmé l'écriture :", { data });
    return { ok: false, raison: 'resultat_non_confirme', isolation: false };
  }
  return { ok: true, id: charge.id };
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

    // ISOLATION MULTI-ENTREPRISE (O3-B4) — tenant du portail public.
    // Le `code_acces` authentifie le chantier, donc son `entreprise_id` est
    // la SEULE source de tenant : il est dérivé du chantier résolu côté
    // serveur, jamais lu dans le body. On revalide ici la forme UUID malgré
    // la garde déjà appliquée dans resoudreChantierParCodeAcces (défense en
    // profondeur, et contrat explicite de anonymizeText). Réponse identique
    // au 403 ci-dessus : aucune nouvelle fuite d'information.
    const entrepriseId = chantier.entrepriseId;
    if (typeof entrepriseId !== 'string' || !estUuid(entrepriseId)) {
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
    const sessionIdBrut = typeof corps.sessionId === 'string' ? corps.sessionId : null;
    const clientName = chantier.clientName || 'Client';

    // O3-B6 (F4) : on résout le `sessionId` AVANT tout appel à Groq, pour ne pas
    // dépenser de jetons si la lecture de contrôle échoue. Fail-closed : une
    // lecture impossible ou incohérente interrompt la requête.
    const sessionsLues = await lireSessionsConsolidees(chantier.id, entrepriseId);
    if (!sessionsLues.ok) {
      console.error(
        '[O3-B6] contrôle des sessions consolidées impossible — envoi à Groq refusé (fail-closed).'
      );
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
    const sessionId = resoudreSessionId(sessionIdBrut, sessionsLues.consommes);

    const dernierMsg = messages[messages.length - 1];
    const userInput: Message[] = dernierMsg ? [{ role: 'user', content: dernierMsg.content }] : [];

    // O3-B6 (F5) : contexte entièrement scopé par `entreprise_id` + revalidation.
    // Une incohérence interrompt la requête : aucun contexte d'un autre tenant ne
    // peut atteindre le prompt, ni Groq, ni la réponse.
    const resultatContexte = await chargerContexte(chantier.id, entrepriseId);
    if (!resultatContexte.ok) {
      console.error(
        '[O3-B6] revalidation du contexte en échec (',
        resultatContexte.motif,
        ') — envoi à Groq refusé (fail-closed).'
      );
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
    const contexte = resultatContexte.contexte;

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
      process.env.SUPABASE_SERVICE_ROLE_KEY ?? '',
      entrepriseId
    );

    // FAIL-CLOSED (O3-B4) : si le JSON anonymisé est illisible, on interrompt.
    // L'ancien repli renvoyait `{ system: systemPrompt, conversation: messages }`
    // — c'est-à-dire le payload BRUT (nom/adresse/téléphone du client et nom du
    // chantier en clair) au fournisseur IA. Aucun repli n'est désormais
    // possible : ni le système ni la conversation d'origine ne sont réémis.
    let anonymise: { system?: unknown; conversation?: unknown };
    try {
      anonymise = JSON.parse(anonymizedText) as { system?: unknown; conversation?: unknown };
    } catch {
      console.error(
        'Espace Client chat : payload anonymisé non parsable — envoi à Groq refusé (fail-closed).'
      );
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
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
      // O3-B6 : l'échec d'écriture n'est plus avalé. La réponse reste 502 (c'est
      // la cause principale), mais l'incident est journalisé explicitement.
      const appendEchecGroq = await persisterMessages(
        chantier.id,
        chantier.id,
        clientName,
        sessionId,
        userInput
      );
      if (!appendEchecGroq.ok) {
        console.error(
          "[O3-B6] le message de l'utilisateur n'a PAS pu être mémorisé (échec Groq + échec d'écriture)."
        );
      }
      return NextResponse.json({ error: 'Erreur API IA', detail: errBody }, { status: 502 });
    }

    const groqData = await groqResponse.json();
    const brutTexte = String(groqData.choices?.[0]?.message?.content ?? '');
    const texte = deanonymizeText(brutTexte, mapping);

    const append = await persisterMessages(chantier.id, chantier.id, clientName, sessionId, [
      ...userInput,
      { role: 'assistant', content: texte },
    ]);

    // O3-B6 (F3, fail-closed) : on ne renvoie plus `200 { texte }` alors que
    // l'échange n'a pas été mémorisé — le client croyait le contraire, et le
    // patron ne recevait jamais la synthèse. Un échec d'écriture est donc
    // visible côté client. Le garde SQL d'isolation est journalisé comme tel.
    if (!append.ok) {
      if (append.isolation) {
        console.error(
          '[O3-B6] garde SQL d\'isolation déclenché sur espace_client_append — aucune écriture effectuée.'
        );
      }
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }

    return NextResponse.json({ texte });
  } catch (err) {
    console.error('Erreur IA Chat Client (Espace Client scopé):', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
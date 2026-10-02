import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import type { TablesInsert } from '@/types/supabase';
import {
  MessageChat,
  ResumeGlobal,
  SentimentGlobal,
  SEUIL_TOKENS_SESSION,
  decouperParTokens,
  estimerTokensMessages,
  resumeVide,
} from '@/lib/espace-chat-utils';

const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';
const GROQ_MODEL = process.env.GROQ_MODEL || 'openai/gpt-oss-20b';

// ---- Isolation multi-entreprise (O3-B5) ----------------------------------
// Convention alignée sur `lib/anonymizeText.ts` (O3-B4). Le tenant est un
// paramètre OBLIGATOIRE validé avant toute requête : sans lui, aucune ligne
// n'est lue, aucune PII n'est transmise à Groq, rien n'est écrit.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string): boolean {
  return UUID_RE.test(value);
}

type LigneTenant = { entreprise_id?: unknown } | null | undefined;

/**
 * Revalidation fail-closed : `.eq("entreprise_id", …)` est une barrière, pas
 * une garantie. Si le serveur renvoie malgré tout une ligne d'une autre
 * entreprise (ou sans entreprise), on refuse plutôt que de traiter la donnée.
 * `null` / `undefined` sont donc refusés aussi : le tenant attendu est une
 * chaîne non vide, l'inégalité stricte suffit.
 */
function exigerEntreprise(ligne: LigneTenant, entrepriseId: string, contexte: string): void {
  if (!ligne) return;
  if (ligne.entreprise_id !== entrepriseId) {
    throw new Error(`Incohérence d'entreprise sur ${contexte} : ligne hors entreprise attendue`);
  }
}

const INSTRUCTIONS_CONDENSATION =
  "Tu es l'assistant du patron de l'entreprise BNA. Tu consolides une conversation client de l'Espace Client pour que le patron puisse tout lire en 30 secondes. " +
  "L'entrée est un JSON contenant un éventuel résumé global déjà mémorisé (resume_global) et les nouveaux messages d'une session. " +
  "Réponds OBLIGATOIREMENT en un JSON valide uniquement, au format : " +
  '{"resume_session":"<résumé structuré de la session courante UNIQUEMENT, 3 à 6 puces commençant par \'-\'>","resume_global":{"texte":"<résumé global consolidé, à jour, jusqu\'à ~25 lignes ; si un résumé antérieur est fourni, enrichis-le au lieu de recommencer ; ne perds aucune information importante>","sentiment_global":"negatif"|"neutre"|"positif","demandes_en_attente":["..."],"points_cles":["..."]}} ' +
  'Règles : ' +
  "- demandes_en_attente contient UNIQUEMENT les demandes réelles du client restées en attente (choix à faire, questions sans réponse, modification à faire valider par le patron, rappel demandé). Ne jamais y mettre une demande déjà résolue, ne jamais en inventer. Si aucune, []. " +
  "- points_cles : infos factuelles utiles au patron (avancement, intempéries, ressenti, engagement de rappel). " +
  "- Tu n'as aucune autre information que celles fournies. Tout en français.";

interface ReponseCondensation {
  resume_session: string;
  resume_global: {
    texte: string;
    sentiment_global: SentimentGlobal;
    demandes_en_attente: string[];
    points_cles: string[];
  };
}

function estSentiment(valeur: unknown): valeur is SentimentGlobal {
  return valeur === 'positif' || valeur === 'negatif' || valeur === 'neutre';
}

function listeString(valeur: unknown): string[] {
  if (!Array.isArray(valeur)) return [];
  return valeur.filter((item): item is string => typeof item === 'string');
}

function dedupe(valeurs: string[]): string[] {
  const resultat: string[] = [];
  for (const v of valeurs) {
    const propre = v.trim();
    if (propre !== '' && !resultat.some((existant) => existant.toLowerCase() === propre.toLowerCase())) {
      resultat.push(propre);
    }
  }
  return resultat;
}

function chargerResumeGlobal(valeur: unknown): ResumeGlobal {
  const defaut = resumeVide();
  if (!valeur || typeof valeur !== 'object') return defaut;
  const brut = valeur as Record<string, unknown>;
  return {
    texte: typeof brut.texte === 'string' ? brut.texte : defaut.texte,
    sentiment_global: estSentiment(brut.sentiment_global) ? brut.sentiment_global : defaut.sentiment_global,
    demandes_en_attente: listeString(brut.demandes_en_attente),
    points_cles: listeString(brut.points_cles),
    sessions: typeof brut.sessions === 'number' ? brut.sessions : 0,
    maj_le: typeof brut.maj_le === 'string' ? brut.maj_le : null,
  };
}

function validerMessages(valeur: unknown): MessageChat[] {
  if (!Array.isArray(valeur)) return [];
  const messages: MessageChat[] = [];
  for (const item of valeur) {
    if (!item || typeof item !== 'object') continue;
    const brut = item as Record<string, unknown>;
    const role = brut.role;
    const content = brut.content;
    if ((role === 'user' || role === 'assistant') && typeof content === 'string') {
      messages.push({ role, content });
    }
  }
  return messages;
}

function conversationBanale(messages: MessageChat[]): boolean {
  if (messages.length > 2) return false;
  const texte = messages
    .map((m) => m.content.trim())
    .filter(Boolean)
    .join(' ')
    .toLowerCase();
  if (texte.includes('?')) return false;
  if (texte.length > 120) return false;
  return texte.split(/\s+/).filter(Boolean).length <= 10;
}

function analyserCondensation(raffle: string): ReponseCondensation {
  let nettoye = raffle.trim();
  if (nettoye.startsWith('```')) {
    nettoye = nettoye.replace(/^```[a-z]*\n?/i, '').replace(/\n?```$/i, '');
  }
  try {
    const parses = JSON.parse(nettoye) as Record<string, unknown>;
    const brutGlobal = (parses.resume_global ?? {}) as Record<string, unknown>;
    return {
      resume_session: typeof parses.resume_session === 'string' ? parses.resume_session : '',
      resume_global: {
        texte: typeof brutGlobal.texte === 'string' ? brutGlobal.texte : '',
        sentiment_global: estSentiment(brutGlobal.sentiment_global) ? brutGlobal.sentiment_global : 'neutre',
        demandes_en_attente: listeString(brutGlobal.demandes_en_attente),
        points_cles: listeString(brutGlobal.points_cles),
      },
    };
  } catch {
    return {
      resume_session: nettoye,
      resume_global: { texte: nettoye, sentiment_global: 'neutre', demandes_en_attente: [], points_cles: [] },
    };
  }
}

async function condenser(resumeGlobal: ResumeGlobal, messages: MessageChat[]): Promise<ReponseCondensation> {
  const response = await fetch(GROQ_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: "Bearer " + process.env.GROQ_API_KEY,
    },
    body: JSON.stringify({
      model: GROQ_MODEL,
      messages: [
        { role: 'system', content: INSTRUCTIONS_CONDENSATION },
        { role: 'user', content: JSON.stringify({ resume_global: resumeGlobal, messages }) },
      ],
      temperature: 0.1,
      response_format: { type: 'json_object' },
    }),
  });

  if (!response.ok) {
    throw new Error(`Groq condensation ${response.status}`);
  }

  const data = (await response.json()) as {
    choices?: Array<{ message?: { content?: unknown } }>;
  };
  const brut = String(data.choices?.[0]?.message?.content ?? '');
  return analyserCondensation(brut);
}

// O3-B5 : le destinataire doit appartenir à la MÊME entreprise que le chantier.
// L'ancien `ORDER BY created_at LIMIT 1` sans filtre renvoyait le premier profil
// créé toutes entreprises confondues (le patron BNA) et adressait à ce patron
// les alertes d'un chantier d'un autre tenant.
async function destinatairePatron(entrepriseId: string): Promise<string | null> {
  if (!estUuid(entrepriseId)) {
    throw new Error('Contexte entreprise invalide');
  }
  const { data, error } = await supabaseAdmin
    .from('profiles')
    .select('id, entreprise_id')
    .eq('entreprise_id', entrepriseId)
    .order('created_at', { ascending: true })
    .limit(1);
  if (error) {
    throw new Error('Lecture du destinataire impossible');
  }
  const patron = data?.[0] ?? null;
  exigerEntreprise(patron, entrepriseId, 'profiles');
  return patron ? String(patron.id) : null;
}

function emojiPour(sentiment: SentimentGlobal): string {
  if (sentiment === 'positif') return '🟢';
  if (sentiment === 'negatif') return '🔴';
  return '🔵';
}

function composerNote(
  resumeGlobal: ResumeGlobal,
  clientNom: string,
  chantierId: string | null | undefined,
  historique: string
): { titre: string; contenu: string } {
  const emoji = emojiPour(resumeGlobal.sentiment_global);
  const titre = `${emoji} Résumé Espace Web — ${clientNom}`;
  const chantierLabel = chantierId ? `#${chantierId.slice(0, 6).toUpperCase()}` : 'mode démo';

  const lignes: string[] = [
    `Client : ${clientNom}`,
    `Chantier : ${chantierLabel}`,
  ];
  if (historique.trim() !== '') {
    lignes.push('', 'Historique (importé avant la mémoire multi-sessions) :', historique.trim());
  }
  lignes.push(
    '',
    `Dernière mise à jour : ${new Intl.DateTimeFormat('fr-FR', {
      dateStyle: 'full',
      timeStyle: 'short',
    }).format(new Date(resumeGlobal.maj_le ?? new Date().toISOString()))}`,
    '',
    'Résumé global :',
    resumeGlobal.texte.trim() !== '' ? resumeGlobal.texte : '—'
  );
  lignes.push(
    '',
    'Demandes en attente :',
    resumeGlobal.demandes_en_attente.length > 0 ? resumeGlobal.demandes_en_attente.map((d) => `- ${d}`).join('\n') : '—'
  );
  lignes.push(
    '',
    'Points clés :',
    resumeGlobal.points_cles.length > 0 ? resumeGlobal.points_cles.map((p) => `- ${p}`).join('\n') : '—'
  );
  lignes.push('', `Sessions consolidées : ${resumeGlobal.sessions}`);

  return { titre, contenu: lignes.join('\n') };
}

// Noyau métier partagé : utilisé par la route patron (/api/chat-client-summary,
// derrière une session) ET par la route scopée Espace Client
// (/api/espace-client/:code/chat-summary, derrière un code d'accès). Le chantier
// et le nom du client sont déduits côté serveur avant l'appel, jamais fournis
// par le corps de la requête dans le cas de la route scopée.
//
// O3-B5 — `entrepriseId` est un paramètre OBLIGATOIRE, validé comme UUID avant
// la moindre requête. Il n'a ni valeur par défaut, ni repli, ni origine possible
// dans le corps de la requête : chaque appelant le résout côté serveur (claim de
// session pour la route patron, chantier issu du `code_acces` pour la route
// publique). `cle` reste une clé métier libre, mais plus aucune lecture ni
// écriture ne peut aboutir sans passer par le filtre `entreprise_id`.
export async function traiterConsolidation(
  corps: Record<string, unknown>,
  entrepriseId: string
): Promise<NextResponse> {
  // Fail-closed : sans tenant validé, on refuse avant tout traitement — donc
  // avant toute lecture de conversation et avant tout appel à Groq.
  if (!estUuid(entrepriseId)) {
    throw new Error('Contexte entreprise invalide');
  }

  const clientNom =
    (typeof corps.clientName === 'string' && corps.clientName.trim() !== '') ? corps.clientName.trim() : 'Client';
  const chantierId = typeof corps.chantierId === 'string' ? corps.chantierId : null;
  const sessionId = typeof corps.sessionId === 'string' ? corps.sessionId : null;
  const cle = chantierId ?? `demo:${clientNom}`;

  // Niveau 1 : messages bruts de la session, mémorisés au fil de l'eau par le
  // chatbot (route scopée ou vérifiée). En cas d'échec d'écriture, repli sur le
  // corps de la requête.
  //
  // O3-B5 : la lecture est doublement fermée — filtre `entreprise_id` PUIS
  // revalidation de la ligne relue. Une `cle` hostile pointant hors tenant ne
  // peut donc rien charger : la conversation d'un autre tenant n'atteint ni la
  // condensation Groq, ni la note, ni la notification, ni la réponse HTTP.
  const { data: ligneBrute } = await supabaseAdmin
    .from('espace_client_conversations')
    .select('*, entreprise_id')
    .eq('cle', cle)
    .eq('entreprise_id', entrepriseId)
    .maybeSingle();
  exigerEntreprise(ligneBrute, entrepriseId, 'espace_client_conversations');

  const stockes: MessageChat[] = validerMessages(ligneBrute?.messages_session);
  const candidats: MessageChat[] =
    stockes.length > 0
      ? stockes
      : validerMessages(corps.messages).filter((m) => !(m.role === 'assistant' && /^Bonjour/i.test(m.content)));

  // Idempotence : une session déjà consolidée (même sessionId, mémoire brute
  // déjà vidée) est signalée sans nouveau résumé, sans note et sans appel LLM.
  // évite le doublon si une fermeture arrive en double.
  const sessionDejaConsolidee =
    stockes.length === 0 && sessionId !== null && sessionId !== ''
      ? (ligneBrute?.resumes_sessions as Array<Record<string, unknown>> | null)?.some(
          (s) => s && typeof s === 'object' && s.session_id === sessionId
        ) ?? false
      : false;

  if (sessionDejaConsolidee) {
    return NextResponse.json({ status: 'deja_consolide' });
  }

  if (candidats.length === 0) {
    return NextResponse.json({ status: 'ras' });
  }

  // RAS : conversation banale (bonjour/au revoir) — pas d'appel LLM, on débloque
  // la mémoire brute (les messages inutiles sont purgés) et on reporte.
  //
  // O3-B5 : `espace_client_consolider` est `SECURITY DEFINER` et cible
  // `WHERE cle = p_cle` sans filtre d'entreprise. Il reste sûr ici parce que
  // (1) il n'est appelé que si la lecture scopée ci-dessus a trouvé une ligne,
  // donc `cle` est une clé de conversation DU tenant attendu, et
  // (2) `espace_client_conversations.cle` porte un index UNIQUE : `p_cle`
  // désigne donc cette unique ligne, jamais une autre. Une `cle` hostile n'atteint
  // pas ce RPC : `ligneBrute` serait null et le bloc serait sauté.
  if (conversationBanale(candidats)) {
    if (ligneBrute) {
      await supabaseAdmin.rpc('espace_client_consolider', {
        p_cle: cle,
        p_session_id: sessionId as string,
        p_nb_messages_calcules: stockes.length,
        p_resume_global: null,
        p_resume_session: null,
      });
    }
    return NextResponse.json({ status: 'ras' });
  }

  // Niveau 2 : condensation bornée en tokens. Un seul appel si ça rentre dans
  // le budget ; sinon découpage séquentiel — chaque bloc condense resume_global
  // courant + le bloc, donc la mémoire globale grandit sans jamais déborder.
  const resumeGlobalInitial = chargerResumeGlobal(ligneBrute?.resume_global);
  const tokensCandidats = estimerTokensMessages(candidats);

  let dernierResume: ResumeGlobal = resumeGlobalInitial;
  let resumeSessionFinal = '';
  let demandesEnsemble: string[] = resumeGlobalInitial.demandes_en_attente;

  const blocs: MessageChat[][] =
    tokensCandidats <= SEUIL_TOKENS_SESSION
      ? [candidats]
      : decouperParTokens(candidats, SEUIL_TOKENS_SESSION);

  const condenses: ReponseCondensation[] = [];
  for (const bloc of blocs) {
    const resultat = await condenser(dernierResume, bloc);
    condenses.push(resultat);
    dernierResume = {
      texte: resultat.resume_global.texte,
      sentiment_global: resultat.resume_global.sentiment_global,
      demandes_en_attente: dedupe([...demandesEnsemble, ...resultat.resume_global.demandes_en_attente]),
      points_cles: dedupe(resultat.resume_global.points_cles),
      sessions: 0,
      maj_le: null,
    };
    demandesEnsemble = dernierResume.demandes_en_attente;
    resumeSessionFinal = resultat.resume_session;
  }

  if (condenses.length > 1) {
    resumeSessionFinal = condenses
      .map((c, i) => `${c.resume_session}`)
      .filter((s) => s.trim() !== '')
      .join('\n');
  }

  const resumeGlobalFinal: ResumeGlobal = {
    texte: dernierResume.texte,
    sentiment_global: dernierResume.sentiment_global,
    demandes_en_attente: dernierResume.demandes_en_attente,
    points_cles: dernierResume.points_cles,
    sessions: resumeGlobalInitial.sessions + 1,
    maj_le: new Date().toISOString(),
  };

  if (ligneBrute) {
    const { data: resultatConsolide } = await supabaseAdmin.rpc('espace_client_consolider', {
      p_cle: cle,
      p_session_id: sessionId as string,
      p_nb_messages_calcules: stockes.length,
      p_resume_global: {
        texte: resumeGlobalFinal.texte,
        sentiment_global: resumeGlobalFinal.sentiment_global,
        demandes_en_attente: resumeGlobalFinal.demandes_en_attente,
        points_cles: resumeGlobalFinal.points_cles,
        sessions: resumeGlobalFinal.sessions,
        maj_le: resumeGlobalFinal.maj_le,
      },
      p_resume_session: { session_id: sessionId, resume_session: resumeSessionFinal, consolide_le: resumeGlobalFinal.maj_le },
    });

    if (resultatConsolide && (resultatConsolide as { ok?: boolean }).ok === false) {
      return NextResponse.json({ status: 'consolidation_echouee' });
    }
  }

  // Note patron unique par chantier (cle). Récupération de l'historique legacy :
  // on adopte la plus récente des anciennes notes « Résumé Espace Web » sans cle,
  // on fusionne les suivantes, le reste est supprimé.
  //
  // O3-B5 : les trois opérations ci-dessous (lecture de la note indexée,
  // balayage des notes legacy, adoption/suppression) ne portent plus que sur le
  // tenant attendu. Auparavant la sélection legacy ramassait les notes « Résumé
  // Espace Web » de TOUTES les entreprises, puis supprimait les plus anciennes et
  // rattachait les survivantes à une `cle` fournie par l'appelant.
  const { data: noteExistante } = await supabaseAdmin
    .from('notes_patron')
    .select('id, entreprise_id')
    .eq('espace_client_id', cle)
    .eq('entreprise_id', entrepriseId)
    .maybeSingle();
  exigerEntreprise(noteExistante, entrepriseId, 'notes_patron');

  let historyLegacy = '';
  let noteId = noteExistante?.id ?? null;

  if (!noteId) {
    const { data: notesLegacy } = await supabaseAdmin
      .from('notes_patron')
      .select('id, titre, contenu, entreprise_id')
      .eq('entreprise_id', entrepriseId)
      .is('espace_client_id', null)
      .ilike('titre', '%Résumé Espace Web%')
      .order('created_at', { ascending: false });
    for (const legacy of notesLegacy ?? []) {
      exigerEntreprise(legacy, entrepriseId, 'notes_patron (legacy)');
    }

    if (notesLegacy && notesLegacy.length > 0) {
      const plusRecente = notesLegacy[0];
      historyLegacy = notesLegacy
        .map((n) => `${n.titre ?? 'Note'}\n${n.contenu ?? ''}`)
        .join('\n\n');
      if (notesLegacy.length > 1) {
        await supabaseAdmin
          .from('notes_patron')
          .delete()
          .eq('entreprise_id', entrepriseId)
          .in(
            'id',
            notesLegacy.slice(1).map((n) => n.id)
          );
      }
      await supabaseAdmin
        .from('notes_patron')
        .update({ espace_client_id: cle, updated_at: new Date().toISOString() })
        .eq('id', plusRecente.id)
        .eq('entreprise_id', entrepriseId);
      noteId = plusRecente.id;
    }
  }

  const { titre, contenu } = composerNote(resumeGlobalFinal, clientNom, chantierId, historyLegacy);
  const miseAJour = new Date().toISOString();

  // O3-B5 : la note est écrite dans le tenant attendu, et l'erreur d'écriture est
  // contrôlée. L'INSERT omettait `entreprise_id`, désormais `NOT NULL` : l'insert
  // échouait en silence (aucun `{ error }` extrait) et la route répondait quand
  // même `200 { status: 'alert_created' }`.
  if (noteId) {
    const { error: erreurNote } = await supabaseAdmin
      .from('notes_patron')
      .update({ titre, contenu, epingle: true, updated_at: miseAJour })
      .eq('id', noteId)
      .eq('entreprise_id', entrepriseId);
    if (erreurNote) {
      console.error('Espace Client : mise à jour de la note patron impossible.', erreurNote);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
  } else {
    const { error: erreurNote } = await supabaseAdmin.from('notes_patron').insert({
      titre,
      contenu,
      epingle: true,
      espace_client_id: cle,
      entreprise_id: entrepriseId,
    } as TablesInsert<"notes_patron">);
    if (erreurNote) {
      console.error('Espace Client : création de la note patron impossible.', erreurNote);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
  }

  // Notification au patron : priorité au mécontentement, sinon aux demandes en attente.
  // O3-B5 : le destinataire est résolu DANS le tenant du chantier, et non plus
  // comme « premier profil créé toutes entreprises confondues ».
  const patronId = await destinatairePatron(entrepriseId);
  // PHASE 2 — lien de notification.
  //
  // Ce chemin pointait vers `/bureau/chantiers?id=<id>`, route qui N'EXISTE
  // PAS : elle est absente du manifeste de build (`.next/server/
  // app-paths-manifest.json`), et `app/bureau/chantiers/` n'a jamais existé.
  // La notification « Client mécontent » et « Réponse client en attente » menait
  // donc au 404 de `app/not-found.tsx`, ce qui est le pire endroit pour
  // annoncer un client mécontent.
  //
  // La cible réelle est la fiche chantier, dont le segment dynamique est
  // `/terrain/chantier/[id]`. L'URL est conservée telle quelle en phase 2 (les
  // routes ne sont pas déplacées) : on ne corrige que le chemin, ce qui répare
  // les notifications à venir sans migration des lignes déjà écrites.
  const lienChantier = chantierId ? `/terrain/chantier/${chantierId}` : null;
  if (resumeGlobalFinal.sentiment_global === 'negatif') {
    const { error: erreurNotif } = await supabaseAdmin.from('notifications').insert({
      type: 'client_alert',
      titre: '🔴 Client mécontent (Espace Web)',
      message:
        `Client : ${clientNom}\n${resumeGlobalFinal.texte}`,
      lien: lienChantier,
      destinataire_id: patronId,
      entreprise_id: entrepriseId,
    } as TablesInsert<"notifications">);
    if (erreurNotif) {
      console.error('Espace Client : création de la notification impossible.', erreurNotif);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
  } else if (resumeGlobalFinal.demandes_en_attente.length > 0) {
    const { error: erreurNotif } = await supabaseAdmin.from('notifications').insert({
      type: 'client_alert',
      titre: '📌 Réponse client en attente',
      message:
        `Client : ${clientNom}\n` +
        resumeGlobalFinal.demandes_en_attente.map((d) => `- ${d}`).join('\n'),
      lien: lienChantier,
      destinataire_id: patronId,
      entreprise_id: entrepriseId,
    } as TablesInsert<"notifications">);
    if (erreurNotif) {
      console.error('Espace Client : création de la notification impossible.', erreurNotif);
      return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
    }
  }

  // `alert_created` n'est atteignable qu'une fois la note et, le cas échéant, la
  // notification réellement écrites : plus de succès mensonger sur un échec.
  return NextResponse.json({
    status: 'alert_created',
    resume: resumeGlobalFinal.texte,
    sessions: resumeGlobalFinal.sessions,
  });
}
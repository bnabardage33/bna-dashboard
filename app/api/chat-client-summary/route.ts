import { NextRequest, NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabaseAdmin';
import { verifierSession } from '@/lib/auth';
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

async function destinatairePatron(): Promise<string | null> {
  const { data } = await supabaseAdmin
    .from('profiles')
    .select('id')
    .order('created_at', { ascending: true })
    .limit(1);
  if (data && data.length > 0) return data[0].id;
  return null;
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

export async function POST(req: NextRequest) {
  const session = await verifierSession();
  if (!session.authentifie) return session.reponse;
  try {
    const corps = (await req.json()) as Record<string, unknown> | null;
    if (!corps || typeof corps !== 'object') {
      return NextResponse.json({ error: 'Payload invalide' }, { status: 400 });
    }

    const clientNom =
      (typeof corps.clientName === 'string' && corps.clientName.trim() !== '') ? corps.clientName.trim() : 'Client';
    const chantierId = typeof corps.chantierId === 'string' ? corps.chantierId : null;
    const sessionId = typeof corps.sessionId === 'string' ? corps.sessionId : null;
    const cle = chantierId ?? `demo:${clientNom}`;

    // Niveau 1 : messages bruts de la session, mémorisés au fil de l'eau par
    // /api/chat-client. En cas d'échec d'écriture, repli sur le corps de la requête.
    const { data: ligneBrute } = await supabaseAdmin
      .from('espace_client_conversations')
      .select('*')
      .eq('cle', cle)
      .maybeSingle();

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
    if (conversationBanale(candidats)) {
      if (ligneBrute) {
        await supabaseAdmin.rpc('espace_client_consolider', {
          p_cle: cle,
          p_session_id: sessionId,
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
        p_session_id: sessionId,
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
    const { data: noteExistante } = await supabaseAdmin
      .from('notes_patron')
      .select('id')
      .eq('espace_client_id', cle)
      .maybeSingle();

    let historyLegacy = '';
    let noteId = noteExistante?.id ?? null;

    if (!noteId) {
      const { data: notesLegacy } = await supabaseAdmin
        .from('notes_patron')
        .select('id, titre, contenu')
        .is('espace_client_id', null)
        .ilike('titre', '%Résumé Espace Web%')
        .order('created_at', { ascending: false });

      if (notesLegacy && notesLegacy.length > 0) {
        const plusRecente = notesLegacy[0];
        historyLegacy = notesLegacy
          .map((n) => `${n.titre ?? 'Note'}\n${n.contenu ?? ''}`)
          .join('\n\n');
        if (notesLegacy.length > 1) {
          await supabaseAdmin
            .from('notes_patron')
            .delete()
            .in(
              'id',
              notesLegacy.slice(1).map((n) => n.id)
            );
        }
        await supabaseAdmin
          .from('notes_patron')
          .update({ espace_client_id: cle, updated_at: new Date().toISOString() })
          .eq('id', plusRecente.id);
        noteId = plusRecente.id;
      }
    }

    const { titre, contenu } = composerNote(resumeGlobalFinal, clientNom, chantierId, historyLegacy);
    const miseAJour = new Date().toISOString();

    if (noteId) {
      await supabaseAdmin
        .from('notes_patron')
        .update({ titre, contenu, epingle: true, updated_at: miseAJour })
        .eq('id', noteId);
    } else {
      await supabaseAdmin.from('notes_patron').insert({
        titre,
        contenu,
        epingle: true,
        espace_client_id: cle,
      });
    }

    // Notification au patron : priorité au mécontentement, sinon aux demandes en attente.
    const patronId = await destinatairePatron();
    if (resumeGlobalFinal.sentiment_global === 'negatif') {
      await supabaseAdmin.from('notifications').insert({
        type: 'client_alert',
        titre: '🔴 Client mécontent (Espace Web)',
        message:
          `Client : ${clientNom}\n${resumeGlobalFinal.texte}`,
        lien: chantierId ? `/bureau/chantiers?id=${chantierId}` : null,
        destinataire_id: patronId,
      });
    } else if (resumeGlobalFinal.demandes_en_attente.length > 0) {
      await supabaseAdmin.from('notifications').insert({
        type: 'client_alert',
        titre: '📌 Réponse client en attente',
        message:
          `Client : ${clientNom}\n` +
          resumeGlobalFinal.demandes_en_attente.map((d) => `- ${d}`).join('\n'),
        lien: chantierId ? `/bureau/chantiers?id=${chantierId}` : null,
        destinataire_id: patronId,
      });
    }

    return NextResponse.json({
      status: 'alert_created',
      resume: resumeGlobalFinal.texte,
      sessions: resumeGlobalFinal.sessions,
    });
  } catch (err) {
    console.error('Erreur IA Chat Client Summary:', err);
    return NextResponse.json({ error: 'Erreur serveur' }, { status: 500 });
  }
}
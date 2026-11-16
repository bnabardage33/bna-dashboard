// lib/anonymizeText.ts
// Filtre d'anonymisation PII avant envoi du texte à une API IA externe (Groq).
// Principe : on remplace les données sensibles par des balises génériques ([NOM_CLIENT_1], [CODE_ACCES_1]...),
// on envoie le texte "neutre" à l'IA, puis on ré-injecte les vraies valeurs dans la réponse
// avant de l'afficher à l'utilisateur. Rien de sensible ne quitte jamais le serveur.
//
// ISOLATION MULTI-ENTREPRISE (O3-B4) : le dictionnaire est lu en
// `service_role` (la RLS ne filtre donc rien), `entrepriseId` est
// OBLIGATOIRE et non optionnel. Chaque appelant doit fournir le tenant
// qu'il a déjà validé : le claim de session pour une route authentifiée,
// l'entreprise du chantier résolu par `code_acces` pour le portail public.
// Aucune lecture n'est émise sans `.eq("entreprise_id", …)`, et chaque
// ligne retournée est revalidée (fail-closed).

import { createClient } from '@supabase/supabase-js';

// ---- Types ----

export interface AnonymizeResult {
  /** Texte avec les données sensibles remplacées par des balises */
  anonymizedText: string;
  /** Mapping balise -> valeur réelle, à garder en mémoire serveur uniquement (jamais envoyé à l'IA) */
  mapping: Record<string, string>;
}

// ---- Regex pour les formats prévisibles (pas besoin de la base pour ceux-là) ----

const REGEX_PATTERNS: { type: string; regex: RegExp }[] = [
  // Emails
  { type: 'EMAIL', regex: /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g },
  // Téléphones français (formats: 06 12 34 56 78 / 06.12.34.56.78 / +33612345678 / 0612345678)
  { type: 'TEL', regex: /(?:(?:\+33|0)\s?[1-9](?:[\s.-]?\d{2}){4})/g },
  // Montants en euros (50€, 1 200,50 €, 50 euros)
  { type: 'MONTANT', regex: /\d+(?:[\s.,]\d+)?\s?(?:€|euros?)/gi },
  // Codes d'accès / digicodes explicitement mentionnés ("code 4521", "digicode B1234")
  { type: 'CODE_ACCES', regex: /(?:code|digicode)\s*[:\s]*[A-Z0-9]{3,8}/gi },
];

// ---- Chargement du dictionnaire dynamique depuis Supabase ----

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string): boolean {
  return UUID_RE.test(value);
}

interface SupabaseDictEntry {
  value: string;
  type: 'NOM_CLIENT' | 'VILLE' | 'ADRESSE' | 'SOCIETE' | 'CODE_ACCES' | 'TEL';
}

/** Colonnes lues, avec `entreprise_id` relu pour la revalidation. */
type ClientDictRow = {
  nom: string | null;
  societe: string | null;
  ville: string | null;
  tel: string | null;
  entreprise_id: string | null;
};

type ChantierDictRow = {
  adresse_chantier: string | null;
  code_acces: string | null;
  entreprise_id: string | null;
};

// ISOLATION MULTI-ENTREPRISE (O3-B4)
// ------------------------------------------------------------------
// Le dictionnaire est lu avec une clé `service_role` : la RLS ne filtre
// RIEN. `entrepriseId` est donc OBLIGATOIRE, et chaque lecture est
// doublement protégée :
//   1. `.eq("entreprise_id", entrepriseId)` émis dans la requête ;
//   2. revalidation ci-dessous, qui rejette (fail-closed) toute ligne
//      remontée avec une autre entreprise — elle couvrirait aussi une
//      régression du filtre ou une ligne incohérente en base.
// Sans ce scope, chaque requête d'un tenant chargeait le référentiel PII
// ET les `code_acces` (secrets du portail client) de TOUTES les
// entreprises, y compris depuis l'endpoint public /api/espace-client/*.
// ------------------------------------------------------------------

async function loadDynamicDictionary(
  supabaseUrl: string,
  supabaseKey: string,
  entrepriseId: string
): Promise<SupabaseDictEntry[]> {
  // Validé AVANT toute requête : un tenant invalide n'atteint jamais la base.
  if (!estUuid(entrepriseId)) {
    throw new Error('Contexte entreprise invalide');
  }

  const supabase = createClient(supabaseUrl, supabaseKey);
  const entries: SupabaseDictEntry[] = [];

  const exigerEntreprise = (ligne: { entreprise_id: string | null }, contexte: string): void => {
    if (ligne.entreprise_id !== entrepriseId) {
      throw new Error(`Incohérence d'entreprise sur ${contexte} : ligne hors entreprise attendue`);
    }
  };

  // Clients : nom, société, ville, téléphone
  const { data: clientsData } = await supabase
    .from('clients')
    .select('nom, societe, ville, tel, entreprise_id')
    .eq('entreprise_id', entrepriseId);

  const clients = (clientsData ?? []) as ClientDictRow[];

  for (const c of clients) {
    exigerEntreprise(c, 'clients');
    if (c.nom) entries.push({ value: c.nom, type: 'NOM_CLIENT' });
    if (c.societe) entries.push({ value: c.societe, type: 'SOCIETE' });
    if (c.ville) entries.push({ value: c.ville, type: 'VILLE' });
    if (c.tel) entries.push({ value: c.tel, type: 'TEL' });
  }

  // Chantiers : adresse + code d'accès (donnée sensible critique)
  const { data: chantiersData } = await supabase
    .from('chantiers')
    .select('adresse_chantier, code_acces, entreprise_id')
    .eq('entreprise_id', entrepriseId);

  const chantiers = (chantiersData ?? []) as ChantierDictRow[];

  for (const ch of chantiers) {
    exigerEntreprise(ch, 'chantiers');
    if (ch.adresse_chantier) entries.push({ value: ch.adresse_chantier, type: 'ADRESSE' });
    if (ch.code_acces) entries.push({ value: ch.code_acces, type: 'CODE_ACCES' });
  }

  // Tri par longueur décroissante : on remplace d'abord les valeurs les plus longues
  // pour éviter qu'un remplacement partiel casse un remplacement plus précis
  // (ex: remplacer "Lyon" avant "Lyon 8ème")
  return entries.sort((a, b) => b.value.length - a.value.length);
}

// ---- Fonction principale ----

export async function anonymizeText(
  text: string,
  supabaseUrl: string,
  supabaseKey: string,
  entrepriseId: string
): Promise<AnonymizeResult> {
  // Fail-closed : sans tenant validé, on refuse avant tout traitement.
  if (!estUuid(entrepriseId)) {
    throw new Error('Contexte entreprise invalide');
  }

  let workingText = text;
  const mapping: Record<string, string> = {};
  const counters: Record<string, number> = {};

  const nextTag = (type: string): string => {
    counters[type] = (counters[type] || 0) + 1;
    return `[${type}_${counters[type]}]`;
  };

  // 1. Remplacement via le dictionnaire dynamique (données métier connues)
  const dict = await loadDynamicDictionary(supabaseUrl, supabaseKey, entrepriseId);
  for (const entry of dict) {
    if (!entry.value || entry.value.trim().length < 2) continue;
    // Échappe les caractères spéciaux regex dans la valeur
    const escaped = entry.value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(escaped, 'gi');

    if (regex.test(workingText)) {
      const tag = nextTag(entry.type);
      mapping[tag] = entry.value;
      workingText = workingText.replace(regex, tag);
    }
  }

  // 2. Remplacement via regex génériques (formats prévisibles)
  for (const pattern of REGEX_PATTERNS) {
    workingText = workingText.replace(pattern.regex, (match) => {
      const tag = nextTag(pattern.type);
      mapping[tag] = match;
      return tag;
    });
  }

  return { anonymizedText: workingText, mapping };
}

// ---- Fonction inverse : ré-injecte les vraies valeurs dans la réponse de l'IA ----

export function deanonymizeText(text: string, mapping: Record<string, string>): string {
  let result = text;
  for (const [tag, value] of Object.entries(mapping)) {
    // Échappe le tag pour la regex (contient des crochets)
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    result = result.replace(new RegExp(escapedTag, 'g'), value);
  }
  return result;
}

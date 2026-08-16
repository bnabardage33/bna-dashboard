// lib/anonymizeText.ts
// Filtre d'anonymisation PII avant envoi du texte à une API IA externe (Groq).
// Principe : on remplace les données sensibles par des balises génériques ([NOM_CLIENT_1], [CODE_ACCES_1]...),
// on envoie le texte "neutre" à l'IA, puis on ré-injecte les vraies valeurs dans la réponse
// avant de l'afficher à l'utilisateur. Rien de sensible ne quitte jamais le serveur.

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

interface SupabaseDictEntry {
  value: string;
  type: 'NOM_CLIENT' | 'VILLE' | 'ADRESSE' | 'SOCIETE' | 'CODE_ACCES' | 'TEL';
}

async function loadDynamicDictionary(
  supabaseUrl: string,
  supabaseKey: string
): Promise<SupabaseDictEntry[]> {
  const supabase = createClient(supabaseUrl, supabaseKey);
  const entries: SupabaseDictEntry[] = [];

  // Clients : nom, société, ville, téléphone
  const { data: clients } = await supabase
    .from('clients')
    .select('nom, societe, ville, tel');

  if (clients) {
    for (const c of clients) {
      if (c.nom) entries.push({ value: c.nom, type: 'NOM_CLIENT' });
      if (c.societe) entries.push({ value: c.societe, type: 'SOCIETE' });
      if (c.ville) entries.push({ value: c.ville, type: 'VILLE' });
      if (c.tel) entries.push({ value: c.tel, type: 'TEL' });
    }
  }

  // Chantiers : adresse + code d'accès (donnée sensible critique)
  const { data: chantiers } = await supabase
    .from('chantiers')
    .select('adresse_chantier, code_acces');

  if (chantiers) {
    for (const ch of chantiers) {
      if (ch.adresse_chantier) entries.push({ value: ch.adresse_chantier, type: 'ADRESSE' });
      if (ch.code_acces) entries.push({ value: ch.code_acces, type: 'CODE_ACCES' });
    }
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
  supabaseKey: string
): Promise<AnonymizeResult> {
  let workingText = text;
  const mapping: Record<string, string> = {};
  const counters: Record<string, number> = {};

  const nextTag = (type: string): string => {
    counters[type] = (counters[type] || 0) + 1;
    return `[${type}_${counters[type]}]`;
  };

  // 1. Remplacement via le dictionnaire dynamique (données métier connues)
  const dict = await loadDynamicDictionary(supabaseUrl, supabaseKey);
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

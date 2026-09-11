// Utilitaires de budget tokens pour la mémoire multi-sessions des conversations
// Espace Client. Estimation pessimiste ≈ 3,7 caractères par token (texte FR/EN,
// sans tokenizer réel — marge volontaire, le but est de borner le contexte LLM).

export interface MessageChat {
  role: "user" | "assistant";
  content: string;
}

export type SentimentGlobal = "positif" | "negatif" | "neutre";

export interface ResumeGlobal {
  texte: string;
  sentiment_global: SentimentGlobal;
  demandes_en_attente: string[];
  points_cles: string[];
  sessions: number;
  maj_le?: string | null;
}

export function resumeVide(): ResumeGlobal {
  return {
    texte: "",
    sentiment_global: "neutre",
    demandes_en_attente: [],
    points_cles: [],
    sessions: 0,
    maj_le: null,
  };
}

export function estimerTokensTexte(texte: string | null | undefined): number {
  if (!texte) return 0;
  return Math.ceil(texte.length / 3.7);
}

export function estimerTokensMessages(messages: MessageChat[]): number {
  return messages.reduce((total, m) => total + estimerTokensTexte(m.content) + 8, 0);
}

// Budget d'entrée maximal d'une consolidation (garde-fou tokens, remplace
// l'ancien seuil "150 messages"). Sous la limite, 1 seul appel LLM.
export const SEUIL_TOKENS_SESSION = 6000;

// Découpe les messages en paquets qui ne dépassent jamais le budget donné.
// Chaque paquet contient au moins 1 message ; l'ordre chronologique est
// préservé. La concaténation des paquets reproduit exactement l'entrée.
export function decouperParTokens(
  messages: MessageChat[],
  budget: number
): MessageChat[][] {
  if (budget <= 0) return [];
  if (messages.length === 0) return [];

  const paquets: MessageChat[][] = [];
  let courant: MessageChat[] = [];
  let poids = 0;

  for (const message of messages) {
    const poidsMessage = estimerTokensTexte(message.content) + 8;
    if (courant.length > 0 && poids + poidsMessage > budget) {
      paquets.push(courant);
      courant = [];
      poids = 0;
    }
    courant.push(message);
    poids += poidsMessage;
  }

  if (courant.length > 0) paquets.push(courant);
  return paquets;
}
import { supabase } from "@/lib/supabase";

/**
 * Numerotation par lecture-ecriture cote navigateur : SELECT du max, puis +1.
 *
 * RESERVEE A LA SEULE TABLE pv_receptions, qui porte une contrainte
 * `numero TEXT NOT NULL UNIQUE` depuis 20260821_create_pv_receptions.sql : si
 * deux creations concurrentes tombent sur le meme numero, PostgreSQL rejette
 * l'ecriture. Le defaut reste visible, il n'est pas silencieux.
 *
 * Ne PLUS utiliser pour devis ou factures : ces deux tables n'ont pas de
 * contrainte unique, un doublon y etait donc passe inapercu. Elles passent
 * depuis le 20261001 par les RPC `generer_prochain_numero_dev` et
 * `_fac`, qui verrouillent la table et sont scopees entreprise.
 *
 * Le type ci-dessous est volontairement restreint a "pv_receptions" : tout
 * nouvel appel sur devis ou factures devient une erreur de compilation.
 */
export async function prochainNumero(
  table: "pv_receptions",
  prefix: string
) {
  const annee = new Date().getFullYear();
  const { data, error } = await supabase
    .from(table)
    .select("numero")
    .ilike("numero", `${prefix}-${annee}-%`);

  if (error) {
    console.error(error);
    return `${prefix}-${annee}-001`;
  }

  const nums = (data ?? []).map((d: {numero: string}) => parseInt(d.numero.split("-")[2]) || 0);
  const suivant = (nums.length ? Math.max(...nums) : 0) + 1;
  return `${prefix}-${annee}-${String(suivant).padStart(3, "0")}`;
}

/**
 * Erreur de numerotation. Distincte d'une erreur reseau ou d'un RLS : elle dit
 * explicitement qu'aucun numero n'a ete produit, pour que l'appelant n'insert
 * jamais un devis sans numero ni ne retombe silencieusement sur « 001 ».
 */
export class ErreurNumerotation extends Error {
  constructor(prefixe: string, cause: unknown) {
    const detail = cause instanceof Error ? cause.message : String(cause);
    super(`Numerotation ${prefixe} impossible : ${detail}`);
    this.name = "ErreurNumerotation";
  }
}

/**
 * Prochain numero d'un devis, via la RPC `generer_prochain_numero_dev`.
 *
 * La variante sans argument resout l'entreprise depuis le claim de session.
 * La RPC leve « contexte entreprise manquant » si ce claim est absent : on
 * laisse remonter ce refus plutot que de produire un numero hors perimetre.
 */
export async function prochainNumeroDevis(): Promise<string> {
  const { data, error } = await supabase.rpc("generer_prochain_numero_dev");
  if (error) throw new ErreurNumerotation("DEV", error.message);
  if (!data) throw new ErreurNumerotation("DEV", "la RPC n'a renvoye aucun numero");
  return data;
}

/**
 * Prochain numero de facture, via la RPC `generer_prochain_numero_fac`.
 *
 * Ne pas confondre avec `generer_prochain_numero_sit`, qui numrote les
 * situations (SIT-YYYY-###) depuis la meme table public.factures. Les prefixes
 * different, la numerotation reste donc separee.
 */
export async function prochainNumeroFacture(): Promise<string> {
  const { data, error } = await supabase.rpc("generer_prochain_numero_fac");
  if (error) throw new ErreurNumerotation("FAC", error.message);
  if (!data) throw new ErreurNumerotation("FAC", "la RPC n'a renvoye aucun numero");
  return data;
}

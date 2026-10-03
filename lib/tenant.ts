// lib/tenant.ts
//
// Résolution du tenant de la requête, en ÉCHEC FERMÉ.
//
// Remplace `verifierSession()` (lib/auth.ts) sur les routes qui doivent
// CLOISONNER par entreprise. `verifierSession` ne renvoyait que
// `{ authentifie: true }` : ni utilisateur, ni entreprise. Une route qui
// n'appelle que ça ne dispose d'aucune information de tenant, et ne peut donc
// pas poser de prédicat `entreprise_id` — c'est exactement le défaut des
// 3 routes `app/api/devis/[id]/*`.
//
// Source du tenant : le claim `app_metadata.entreprise_id` de la session. C'est
// la MÊME source que `entreprise_courante()` côté PostgREST, et `app_metadata`
// n'est pas modifiable par l'utilisateur (contrairement à `user_metadata`) :
// un utilisateur ne peut donc pas s'attribuer un autre tenant.
//
// Le client est celui de `verifierSession()` : clé `anon` + cookies de session,
// donc `auth.getUser()` est bien exécuté avec le JWT de l'utilisateur — et non
// avec la clé `service_role` qui, elle, contourne le RLS.
//
// Fail-closed : session absente ⇒ 401 ; claim absent, vide ou malformé ⇒ 403.
// Dans les deux cas, AUCUNE requête métier n'est émise.
//
// Motif éprouvé : appliqué à l'identique dans `app/api/documents-compta/route.ts`
// et vérifié par `__tests__/securite/documents-compta-tenant.test.ts`. Cette
// route conserve sa copie locale ; la consolidation des deux est un nettoyage
// ultérieur, hors périmètre.

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export type ResultatTenant =
  | { ok: true; entrepriseId: string }
  | { ok: false; reponse: NextResponse };

function refus(statut: 401 | 403, message: string): ResultatTenant {
  return { ok: false, reponse: NextResponse.json({ error: message }, { status: statut }) };
}

/**
 * Renvoie le tenant de la requête, ou échoue fermé.
 *
 * NE JAMAIS utiliser `verifierSession()` sur une route qui cloisonne : elle ne
 * fournit aucun tenant. Utiliser cette fonction, et poser `.eq("entreprise_id",
 * resultat.entrepriseId)` sur TOUTES les requêtes `devis` / `devis_ia`.
 */
export async function resoudreTenant(): Promise<ResultatTenant> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
      error: erreurSession,
    } = await supabase.auth.getUser();

    if (erreurSession || !user) {
      return refus(401, "Non autorisé — session requise");
    }

    // Le claim est un objet applicatif libre (UserMetadata), pas une colonne
    // typée par le générateur Supabase : d'où le cast explicite.
    const brut = (user.app_metadata as { entreprise_id?: unknown } | null | undefined)
      ?.entreprise_id;
    const entrepriseId = typeof brut === "string" ? brut.trim() : "";

    if (!UUID_RE.test(entrepriseId)) {
      return refus(403, "Contexte entreprise introuvable ou invalide dans votre session.");
    }

    return { ok: true, entrepriseId };
  } catch (err) {
    console.error("resoudreTenant : échec de lecture de la session", err);
    return refus(401, "Non autorisé — session requise");
  }
}
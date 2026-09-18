// lib/auth.ts
//
// Garde-fou central d'authentification, complément du middleware.
// Le middleware bloque/redirige au niveau réseau ; `verifierSession`
// protège CHAQUE route handler qui touche des données privées, en
// renvoyant un 401 JSON IMMÉDIATEMENT, avant la moindre requête base
// de données (défense en profondeur, même si le middleware est contourné).

import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

const REPONSE_NON_AUTORISE = () =>
  NextResponse.json(
    { error: "Non autorisé — session requise" },
    { status: 401 }
  );

export type ResultatSession =
  | { authentifie: true }
  | { authentifie: false; reponse: NextResponse };

// Vérifie que les cookies de session correspondent à un utilisateur
// Supabase unique et actif. En cas de session absente, expirée ou de
// défaillance du contrôle, on échoue fermé (fail-closed) : 401.
export async function verifierSession(): Promise<ResultatSession> {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return { authentifie: false, reponse: REPONSE_NON_AUTORISE() };
    return { authentifie: true };
  } catch (err) {
    console.error("verifierSession : échec de lecture de la session", err);
    return { authentifie: false, reponse: REPONSE_NON_AUTORISE() };
  }
}
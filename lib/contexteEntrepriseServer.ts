import type { User } from "@supabase/supabase-js";
import { DEFAULT_ENTREPRISE_ID } from "./contexteEntreprise";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function resoudreEntrepriseIdDepuisUser(user: User | null | undefined): string | null {
  if (!user) return null;

  const fromApp = (user.app_metadata as { entreprise_id?: unknown } | null | undefined)
    ?.entreprise_id;
  if (typeof fromApp === "string" && UUID_RE.test(fromApp.trim())) {
    return fromApp.trim();
  }

  const fromUser = (user.user_metadata as { entreprise_id?: unknown } | null | undefined)
    ?.entreprise_id;
  if (typeof fromUser === "string" && UUID_RE.test(fromUser.trim())) {
    return fromUser.trim();
  }

  return DEFAULT_ENTREPRISE_ID;
}

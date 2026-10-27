import type { Note } from '@/components/DashboardAccueil';

type ClientSupabaseServeur = Awaited<
  ReturnType<typeof import('@/lib/supabase/server').createClient>
>;

export type ChantierAPreparer = {
  id: string;
  nom: string | null;
  adresse: string | null;
};

export type NotificationAccueil = {
  id: string;
  titre: string;
  message: string | null;
  lien: string | null;
  lu: boolean | null;
  created_at: string | null;
};

/** Charge les trois listes privées du cockpit avec le client serveur de session. */
export async function chargerDonneesAccueil(supabase: ClientSupabaseServeur) {
  const [notes, chantiersAPreparer, notifications] = await Promise.all([
    chargerNotes(supabase),
    chargerChantiersAPreparer(supabase),
    chargerNotifications(supabase),
  ]);

  return { notes, chantiersAPreparer, notifications };
}

/**
 * Le statut `prevu` est celui écrit par la fiche chantier pour un chantier
 * qui n'a pas démarré. Le bloc reste limité aux cinq prochains à préparer.
 */
async function chargerChantiersAPreparer(
  supabase: ClientSupabaseServeur,
): Promise<ChantierAPreparer[]> {
  try {
    const { data, error } = await supabase
      .from('chantiers')
      .select('id, nom, adresse_chantier')
      .eq('statut', 'prevu')
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return [];
    return (data ?? []).map((c) => ({
      id: c.id,
      nom: c.nom,
      adresse: c.adresse_chantier,
    }));
  } catch {
    return [];
  }
}

/** Dernières notifications de l'entreprise, pour le bloc « Alertes ». */
async function chargerNotifications(
  supabase: ClientSupabaseServeur,
): Promise<NotificationAccueil[]> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, titre, message, lien, lu, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return [];
    return (data ?? []) as NotificationAccueil[];
  } catch {
    return [];
  }
}

async function chargerNotes(
  supabase: ClientSupabaseServeur,
): Promise<Note[]> {
  try {
    const { data, error } = await supabase
      .from('notes_patron')
      .select('id, titre, contenu, created_at')
      .order('created_at', { ascending: false })
      .limit(3);
    if (error) return [];
    return (data ?? []).map((n) => ({
      id: n.id,
      titre: n.titre,
      contenu: n.contenu,
      created_at: n.created_at,
    }));
  } catch {
    return [];
  }
}

import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type ChantierCodeAcces = {
  id: string;
  clientName: string | null;
};

// Résolution serveur d'un code d'accès Espace Client. Le code_acces n'existe
// que sur la table chantiers (pas sur clients) : c'est la seule source de
// vérité pour lier un code à un chantier et à son client. Le nom du client est
// repris de client_nom quand il est renseigné, sinon de la relation clients.
export async function resoudreChantierParCodeAcces(codeAcces: string): Promise<ChantierCodeAcces | null> {
  const { data } = await supabaseAdmin
    .from('chantiers')
    .select('id, client_nom, clients(nom)')
    .eq('code_acces', codeAcces)
    .maybeSingle();

  if (!data?.id) return null;
  const ligne = data as {
    id?: unknown;
    client_nom?: unknown;
    clients?: { nom?: unknown } | null;
  };

  const clientNom =
    (typeof ligne.client_nom === 'string' && ligne.client_nom.trim() !== '' && ligne.client_nom.trim()) ||
    (ligne.clients && typeof ligne.clients.nom === 'string' && ligne.clients.nom.trim()) ||
    null;

  return { id: String(ligne.id), clientName: clientNom };
}
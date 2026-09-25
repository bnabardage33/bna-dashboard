import { supabaseAdmin } from '@/lib/supabaseAdmin';

export type ChantierCodeAcces = {
  id: string;
  clientName: string | null;
  /**
   * Entreprise du chantier résolu (O3-B4). C'est la SEULE source de tenant
   * pour le portail client public : le `code_acces` authentifie le chantier,
   * donc l'entreprise en découle. Jamais fournie par le client.
   */
  entrepriseId: string;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// Résolution serveur d'un code d'accès Espace Client. Le code_acces n'existe
// que sur la table chantiers (pas sur clients) : c'est la seule source de
// vérité pour lier un code à un chantier et à son client. Le nom du client est
// repris de client_nom quand il est renseigné, sinon de la relation clients.
export async function resoudreChantierParCodeAcces(codeAcces: string): Promise<ChantierCodeAcces | null> {
  const { data } = await supabaseAdmin
    .from('chantiers')
    .select('id, client_nom, entreprise_id, clients(nom)')
    .eq('code_acces', codeAcces)
    .maybeSingle();

  if (!data?.id) return null;
  const ligne = data as {
    id?: unknown;
    client_nom?: unknown;
    entreprise_id?: unknown;
    clients?: { nom?: unknown } | null;
  };

  const clientNom =
    (typeof ligne.client_nom === 'string' && ligne.client_nom.trim() !== '' && ligne.client_nom.trim()) ||
    (ligne.clients && typeof ligne.clients.nom === 'string' && ligne.clients.nom.trim()) ||
    null;

  // Fail-closed (O3-B4) : sans entreprise valide, le code est rejeté — donc
  // 403 « Code d'accès invalide », identique à un code inconnu. On ne peut pas
  // en déduire qu'un chantier existe.
  const entrepriseId = typeof ligne.entreprise_id === 'string' ? ligne.entreprise_id.trim() : '';
  if (!estUuid(entrepriseId)) return null;

  return { id: String(ligne.id), clientName: clientNom, entrepriseId };
}
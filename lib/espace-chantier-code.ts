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
  /**
   * Client du chantier, résolu côté serveur (signature par OTP, phase 3).
   *
   * `null` si le chantier n'est rattaché à aucun client. C'est un cas
   * REEL : les devis peuvent être créés sans client. Les appelants doivent donc
   * traiter `null` comme un refus, jamais comme une valeur à comparer.
   *
   * Ajout additif : les appelants existants (chat, chat-summary) n'utilisent pas
   * ce champ et n'en sont pas affectés.
   */
  clientId: string | null;
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
    .select('id, client_nom, client_id, entreprise_id, clients(nom)')
    .eq('code_acces', codeAcces)
    .maybeSingle();

  if (!data?.id) return null;
  const ligne = data as {
    id?: unknown;
    client_nom?: unknown;
    client_id?: unknown;
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

  // `clientId` suit la MÊME règle fail-closed que `entrepriseId` : un
  // `client_id` qui n'est pas un UUID n'est pas un client exploitable, on
  // renvoie `null` plutôt que de laisser un appelant le transmettre à une
  // requête base. Ici ce n'est PAS un refus de code d'accès : le code reste
  // valide pour le chat, et l'appelant décide. D'où l'absence de garde
  // bloquante sur ce champ, contrairement à l'entreprise.
  const clientBrut = typeof ligne.client_id === 'string' ? ligne.client_id.trim() : '';
  const clientId = estUuid(clientBrut) ? clientBrut : null;

  return { id: String(ligne.id), clientName: clientNom, entrepriseId, clientId };
}
import Link from 'next/link';
import { ArrowRight, LogIn } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import DashboardAccueil, { type Note } from '@/components/DashboardAccueil';
import ChantiersMeteoCards from '@/components/ChantiersMeteoCards';
import { Surface } from '@/components/ui/Surface';

// Option B (durecissement) : la landing `/` reste PUBLIQUE au niveau proxy
// (whitelist lib/supabase/middleware.ts), mais aucune donnée privée n'est
// chargée ni transmise au navigateur sans session active — et uniquement par
// le canal SERVEUR (cookie de session, RLS honorée), jamais via la clé anon
// depuis le navigateur.
//
// dynamic: force-dynamic — la sortie dépend de la session cookie à la requête :
// pas de cache statique ni du CTA anonyme ni du tableau de bord.
export const dynamic = 'force-dynamic';

type ChantierAPreparer = {
  id: string;
  nom: string | null;
  adresse: string | null;
};

type Notification = {
  id: string;
  titre: string;
  message: string | null;
  lien: string | null;
  lu: boolean | null;
  created_at: string | null;
};

/**
 * Chantiers à préparer.
 *
 * Le statut `prevu` est le SEUL que le formulaire de la fiche chantier écrit
 * pour un chantier qui n'a pas démarré (les trois valeurs réelles du modèle
 * sont `prevu`, `en_cours`, `termine`). On filtre donc sur `prevu` seul, sans
 * la liste de variantes défensives recopiée ailleurs dans le dépôt : ces
 * variantes ne sont écrites par aucun code, les garder ici n'ajouterait que
 * du bruit.
 */
async function chargerChantiersAPreparer(
  supabase: Awaited<ReturnType<typeof createClient>>,
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
  supabase: Awaited<ReturnType<typeof createClient>>,
): Promise<Notification[]> {
  try {
    const { data, error } = await supabase
      .from('notifications')
      .select('id, titre, message, lien, lu, created_at')
      .order('created_at', { ascending: false })
      .limit(5);
    if (error) return [];
    return (data ?? []) as Notification[];
  } catch {
    return [];
  }
}

async function chargerNotes(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Note[]> {
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

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // ── Visiteur anonyme : CTA de connexion léger, AUCUNE donnée. ─────────
  if (!user) {
    return (
      <div className="relative overflow-hidden w-full">
        {/* Le reflet rouge du fond global est désormais porté par le `<main>`
            de `app/layout.tsx` : plus rien à dupliquer ici. */}
        <main className="relative z-10 mx-auto w-full max-w-7xl px-4 pt-6 pb-[20px] flex flex-col gap-8">
          <Surface as="section" className="mx-auto w-full max-w-lg p-8 text-center shadow-lg" radius="2xl">
            <LogIn className="w-10 h-10 mx-auto text-[#E53935] mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">
              Connectez-vous pour accéder au tableau de bord
            </h2>
            <p className="text-sm text-gray-400 mb-6">
              Vos notes, chantiers et devis sont chargés une fois la session active.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-[#E53935] px-6 py-3 text-sm font-bold text-white hover:bg-red-600 transition-colors"
            >
              Se connecter <ArrowRight className="h-4 w-4" />
            </Link>
          </Surface>
        </main>
      </div>
    );
  }

  // ── Session active : données chargées CÔTÉ SERVEUR (cookie de session). ─
  // Aucune requête de comptage ici : le bloc « Chiffres clés » qui les lisait a
  // été retiré de l'accueil. Les trois requêtes restantes alimentent chacune un
  // bloc du cockpit.
  const [notes, chantiersAPreparer, notifications] = await Promise.all([
    chargerNotes(supabase),
    chargerChantiersAPreparer(supabase),
    chargerNotifications(supabase),
  ]);

  return (
    <div className="relative overflow-hidden w-full">
      {/* Le reflet rouge du fond global est désormais porté par le `<main>`
          de `app/layout.tsx` : plus rien à dupliquer ici. */}
      <main className="relative z-10 mx-auto w-full max-w-7xl px-4 pt-6 pb-[20px] flex flex-col gap-8">
        {/* `ChantiersMeteoCards` est monté ICI, dans l'arbre serveur, et
            transmis au composant client sous forme de nœud déjà rendu. Il ne
            réécrit donc ni sa logique ni son accès à Supabase : il lit
            `chantiers` en direct, demande la prévision à `GET /api/meteo` et
            applique `evaluerAlerteChantier`, comme avant. Le passer en
            propriété (plutôt que l'importer dans `DashboardAccueil`) évite
            aussi de le monter dans les tests du composant, qui n'ont rien à
            voir avec la météo. */}
        <DashboardAccueil
          notesInitiales={notes}
          chantiersAPreparer={chantiersAPreparer}
          notifications={notifications}
          blocMeteo={<ChantiersMeteoCards />}
        />
      </main>
    </div>
  );
}
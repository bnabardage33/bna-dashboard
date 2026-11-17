import { redirect } from 'next/navigation';
import AccueilProfessionnel from '@/components/AccueilProfessionnel';
import ChantiersMeteoCards from '@/components/ChantiersMeteoCards';
import DashboardAccueil from '@/components/DashboardAccueil';
import { createClient } from '@/lib/supabase/server';
import { chargerDonneesAccueil } from '@/lib/accueil/chargerDonnees';

export const dynamic = 'force-dynamic';

export default async function AccueilChantierPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // Le middleware protège déjà /terrain/** ; cette vérification serveur garde
  // néanmoins la page fail-closed avant toute lecture de données privées.
  if (!user) redirect('/login');

  const { notes, chantiersAPreparer, notifications } =
    await chargerDonneesAccueil(supabase);

  return (
    <div className="min-h-screen bg-[#F3F3F1] text-[#23272B]">
      <div
        id="accueil-container"
        className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-6 sm:px-6"
      >
        <AccueilProfessionnel titre="Accueil Chantier" />
        <DashboardAccueil
          notesInitiales={notes}
          chantiersAPreparer={chantiersAPreparer}
          notifications={notifications}
          blocMeteo={<ChantiersMeteoCards />}
        />
      </div>
    </div>
  );
}

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
    <div className="relative w-full overflow-hidden">
      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-[20px] pt-6">
        <AccueilProfessionnel titre="Accueil Chantier" />
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

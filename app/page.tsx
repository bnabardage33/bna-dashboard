import Link from 'next/link';
import { redirect } from 'next/navigation';
import { ArrowRight, LogIn } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import AccueilProfessionnel from '@/components/AccueilProfessionnel';
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

export default async function Home() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  // L'accueil public reste disponible sans session. Pour une session active,
  // la météo générale est l'écran d'entrée ; aucune donnée du cockpit n'est
  // chargée avant cette redirection serveur.
  if (user) redirect('/terrain/meteo');

  // ── Visiteur anonyme : CTA de connexion léger, AUCUNE donnée. ─────────
  return (
    <div className="relative w-full overflow-hidden">
      <main className="relative z-10 mx-auto flex w-full max-w-7xl flex-col gap-8 px-4 pb-[20px] pt-6">
        <AccueilProfessionnel />
        <Surface as="section" className="mx-auto w-full max-w-lg p-8 text-center shadow-lg" radius="2xl">
          <LogIn className="mx-auto mb-4 h-10 w-10 text-[#B85B2B]" />
          <h2 className="mb-2 text-xl font-bold text-white">
            Connectez-vous pour accéder au tableau de bord
          </h2>
          <p className="mb-6 text-sm text-gray-400">
            Vos notes, chantiers et devis sont chargés une fois la session active.
          </p>
          <Link
            href="/login"
            className="inline-flex items-center gap-2 rounded-xl bg-[#B85B2B] px-6 py-3 text-sm font-bold text-white transition-colors hover:bg-red-600"
          >
            Se connecter <ArrowRight className="h-4 w-4" />
          </Link>
        </Surface>
      </main>
    </div>
  );
}

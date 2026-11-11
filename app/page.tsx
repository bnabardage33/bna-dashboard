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

  // Utilisateur connecté -> écran d'entrée cockpit météo
  if (user) redirect('/terrain/meteo');

  // Visiteur non connecté -> redirection directe vers la page de connexion
  redirect('/login');
}

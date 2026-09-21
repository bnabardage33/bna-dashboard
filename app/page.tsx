import Link from 'next/link';
import { ArrowRight, LogIn } from 'lucide-react';
import { createClient } from '@/lib/supabase/server';
import DashboardAccueil, { type Note } from '@/components/DashboardAccueil';

// Option B (durecissement) : la landing `/` reste PUBLIQUE au niveau proxy
// (whitelist lib/supabase/middleware.ts), mais aucune donnée privée n'est
// chargée ni transmise au navigateur sans session active — et uniquement par
// le canal SERVEUR (cookie de session, RLS honorée), jamais via la clé anon
// depuis le navigateur.
//
// dynamic: force-dynamic — la sortie dépend de la session cookie à la requête :
// pas de cache statique ni du CTA anonyme ni du tableau de bord.
export const dynamic = 'force-dynamic';

type Stats = { notes: number; chantiers: number; devis: number };

const STATUTS_CHANTIERS_ACTIFS = [
  'en_cours',
  'En cours',
  'prevu',
  'Actif',
  'Préparation',
  'preparation',
  'nouveau',
];

async function chargerStats(supabase: Awaited<ReturnType<typeof createClient>>): Promise<Stats> {
  try {
    const [notesRes, chantiersRes, devisRes] = await Promise.all([
      supabase.from('notes_patron').select('*', { count: 'exact', head: true }),
      supabase
        .from('chantiers')
        .select('*', { count: 'exact', head: true })
        .in('statut', STATUTS_CHANTIERS_ACTIFS),
      supabase.from('devis').select('*', { count: 'exact', head: true }),
    ]);
    return {
      notes: notesRes.count ?? 0,
      chantiers: chantiersRes.count ?? 0,
      devis: devisRes.count ?? 0,
    };
  } catch {
    // stats à 0 si échec (fail-soft, la page reste fonctionnelle)
    return { notes: 0, chantiers: 0, devis: 0 };
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
        <div className="absolute top-0 inset-x-0 h-[380px] bg-[radial-gradient(ellipse_at_top,_rgba(227,6,19,0.15),transparent_60%)] pointer-events-none z-0" />
        <main className="relative z-10 px-4 pt-6 pb-[20px] flex flex-col gap-8">
          <section className="rounded-2xl border border-white/10 bg-[#1A1D24] p-8 text-center shadow-lg">
            <LogIn className="w-10 h-10 mx-auto text-[#E30613] mb-4" />
            <h2 className="text-xl font-bold text-white mb-2">
              Connectez-vous pour accéder au tableau de bord
            </h2>
            <p className="text-sm text-gray-400 mb-6">
              Vos notes, chantiers et devis sont chargés une fois la session active.
            </p>
            <Link
              href="/login"
              className="inline-flex items-center gap-2 rounded-xl bg-[#E30613] px-6 py-3 text-sm font-bold text-white hover:bg-red-600 transition-colors"
            >
              Se connecter <ArrowRight className="h-4 w-4" />
            </Link>
          </section>
        </main>
      </div>
    );
  }

  // ── Session active : données chargées CÔTÉ SERVEUR (cookie de session). ─
  const [stats, notes] = await Promise.all([chargerStats(supabase), chargerNotes(supabase)]);

  return (
    <div className="relative overflow-hidden w-full">
      <div className="absolute top-0 inset-x-0 h-[380px] bg-[radial-gradient(ellipse_at_top,_rgba(227,6,19,0.15),transparent_60%)] pointer-events-none z-0" />
      <main className="relative z-10 px-4 pt-6 pb-[20px] flex flex-col gap-8">
        <DashboardAccueil notesInitiales={notes} statsInitiales={stats} />
      </main>
    </div>
  );
}
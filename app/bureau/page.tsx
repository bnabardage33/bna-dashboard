"use client";

import { useEffect, useState } from "react";
import { calculerMontantTTCFacture } from "@/lib/financeCalculs";
import { supabase } from "@/lib/supabase";
import Link from "next/link";
import { 
  FileText, 
  Receipt, 
  Users, 
  AlertCircle, 
  CheckCircle2, 
  Clock, 
  HardHat,
  ArrowRight,
  Truck,
  Wand2
} from "lucide-react";
import { fmtEuro } from "@/lib/financeCalculs";
import ChantierHealthCard from "@/components/ChantierHealthCard";

type DashboardStats = {
  devisEnAttente: number;
  facturesRetard: number;
  montantRetard: number;
  chantiersEnCours: number;
  fournisseursActifs: number;
};

export default function BureauDashboard() {
  const [stats, setStats] = useState<DashboardStats>({
    devisEnAttente: 0,
    facturesRetard: 0,
    montantRetard: 0,
    chantiersEnCours: 0,
    fournisseursActifs: 0,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      setIsLoading(true);
      const today = new Date().toISOString().slice(0, 10);

      const [devisRes, facturesRes, chantiersRes, fournRes] = await Promise.all([
        supabase.from("devis").select("id").in("statut", ["brouillon", "envoye"]),
        supabase.from("factures").select("lignes, tva_pct").eq("statut", "envoyee").lt("echeance", today),
        supabase.from("chantiers").select("id").eq("statut", "en_cours"),
        supabase.from("fournisseurs").select("id").eq("statut_relation", "principal")
      ]);

      const devisEnAttente = devisRes.data?.length || 0;
      const facturesRetard = facturesRes.data?.length || 0;
      const montantRetard = facturesRes.data?.reduce((sum, f) => sum + calculerMontantTTCFacture(f), 0) || 0;
      const chantiersEnCours = chantiersRes.data?.length || 0;
      const fournisseursActifs = fournRes.data?.length || 0;

      setStats({
        devisEnAttente,
        facturesRetard,
        montantRetard,
        chantiersEnCours,
        fournisseursActifs
      });
      setIsLoading(false);
    }

    fetchStats();
  }, []);

  return (
    <div className="min-h-screen bg-transparent p-4 lg:p-8 text-white">
      <div className="mx-auto max-w-7xl space-y-8">
        <header>
          <h1 className="text-3xl font-bold text-white">Bureau & Administratif</h1>
          <p className="text-sm font-medium text-gray-400 mt-1">
            Gérez vos devis, factures, clients et documents contractuels.
          </p>
        </header>

        {isLoading ? (
          <div className="flex h-64 items-center justify-center rounded-xl border border-white/10 bg-[#1A1D24]/50">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/10 border-t-transparent"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-4">
            
            {/* Factures en retard */}
            <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <div className="rounded-full bg-rose-500/20 p-2">
                  <AlertCircle className="h-5 w-5 text-rose-400" />
                </div>
                <h3 className="font-bold text-rose-400">Factures Impayées</h3>
              </div>
              <div className="mt-2 flex-grow">
                <p className="text-3xl font-black text-white">{stats.facturesRetard}</p>
                <p className="text-sm font-semibold text-rose-400 mt-1">Soit {fmtEuro(stats.montantRetard)}</p>
              </div>
              <Link href="/bureau/factures" className="mt-4 flex items-center justify-between text-xs font-bold text-rose-400 hover:text-rose-300">
                Relancer les clients <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Devis en attente */}
            <div className="rounded-xl border border-white/10 bg-red-600/10 p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <div className="rounded-full bg-red-600/20 p-2">
                  <Clock className="h-5 w-5 text-gray-400" />
                </div>
                <h3 className="font-bold text-gray-400">Devis en attente</h3>
              </div>
              <div className="mt-2 flex-grow">
                <p className="text-3xl font-black text-white">{stats.devisEnAttente}</p>
                <p className="text-sm font-semibold text-gray-400 mt-1">À relancer ou valider</p>
              </div>
              <Link href="/bureau/devis-factures" className="mt-4 flex items-center justify-between text-xs font-bold text-gray-400 hover:text-gray-400">
                Gérer les devis <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Chantiers en cours */}
            <div className="rounded-xl border border-white/10 bg-red-600/10 p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <div className="rounded-full bg-red-600/20 p-2">
                  <HardHat className="h-5 w-5 text-gray-400" />
                </div>
                <h3 className="font-bold text-gray-400">Chantiers Actifs</h3>
              </div>
              <div className="mt-2 flex-grow">
                <p className="text-3xl font-black text-white">{stats.chantiersEnCours}</p>
                <p className="text-sm font-semibold text-gray-400 mt-1">En cours de production</p>
              </div>
              <Link href="/bureau/fin-chantier" className="mt-4 flex items-center justify-between text-xs font-bold text-gray-400 hover:text-gray-400">
                PV de Réceptions <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Fournisseurs */}
            <div className="rounded-xl border border-white/10 bg-red-600/10 p-6 flex flex-col">
              <div className="flex items-center gap-3 mb-2">
                <div className="rounded-full bg-red-600/20 p-2">
                  <Truck className="h-5 w-5 text-gray-400" />
                </div>
                <h3 className="font-bold text-gray-400">Fournisseurs Actifs</h3>
              </div>
              <div className="mt-2 flex-grow">
                <p className="text-3xl font-black text-white">{stats.fournisseursActifs}</p>
                <p className="text-sm font-semibold text-gray-400 mt-1">Fournisseurs réguliers</p>
              </div>
              <Link href="/bureau/fournisseurs" className="mt-4 flex items-center justify-between text-xs font-bold text-gray-400 hover:text-gray-400">
                Bons de commandes <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

          </div>
        )}

        {/* DETECTEUR D'ANOMALIES IA */}
        <section className="mt-8">
          <div className="flex items-center gap-2 mb-6">
            <div className="bg-[#1A1D24] border border-red-500/30 p-2 rounded-lg">
              <Wand2 className="h-5 w-5 text-red-500" />
            </div>
            <h2 className="text-xl font-bold text-white">Détecteur d'Anomalies BNA</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <ChantierHealthCard
              chantierName="Villa Arcachon"
              chantierData={{
                avancementPct: 80,
                heuresConsommeesPct: 105,
                joursSansPointage: 0,
                joursSansAvancement: 2,
                joursIntemperies: 1,
                margeActuellePct: 15,
                margePrevuePct: 22
              }}
            />
            <ChantierHealthCard
              chantierName="Résidence Les Pins"
              chantierData={{
                avancementPct: 35,
                heuresConsommeesPct: 20,
                joursSansPointage: 0,
                joursSansAvancement: 1,
                joursIntemperies: 0,
                margeActuellePct: 25,
                margePrevuePct: 25
              }}
            />
            <ChantierHealthCard
              chantierName="Entrepôt Logistique"
              chantierData={{
                avancementPct: 100,
                heuresConsommeesPct: 80,
                joursSansPointage: 5,
                joursSansAvancement: 1,
                joursIntemperies: 0,
                margeActuellePct: 30,
                margePrevuePct: 28
              }}
            />
          </div>
        </section>

        {/* Accès rapides */}
        <section className="mt-12">
          <h2 className="text-xl font-bold text-white mb-6">Accès Rapides</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {/* Nouveau Super Pouvoir : Métré IA */}
            <Link href="/terrain/metre-ia" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-cyan-500/50 bg-cyan-900/20 p-6 hover:bg-cyan-900/40 transition-all text-center group">
              <div className="rounded-full bg-cyan-500/20 p-3 group-hover:scale-110 transition-transform">
                <Wand2 className="h-8 w-8 text-cyan-400" />
              </div>
              <span className="font-bold text-cyan-100">Métré IA</span>
            </Link>

            <Link href="/bureau/clients" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#1A1D24]/50 p-6 hover:bg-[#1A1D24] hover:border-slate-500 transition-all text-center">
              <Users className="h-8 w-8 text-gray-400" />
              <span className="font-semibold text-gray-200">Clients & Prospects</span>
            </Link>
            <Link href="/bureau/devis-factures" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#1A1D24]/50 p-6 hover:bg-[#1A1D24] hover:border-slate-500 transition-all text-center">
              <FileText className="h-8 w-8 text-gray-400" />
              <span className="font-semibold text-gray-200">Devis</span>
            </Link>
            <Link href="/bureau/factures" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#1A1D24]/50 p-6 hover:bg-[#1A1D24] hover:border-slate-500 transition-all text-center">
              <Receipt className="h-8 w-8 text-gray-400" />
              <span className="font-semibold text-gray-200">Factures</span>
            </Link>
            <Link href="/bureau/catalogue" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#1A1D24]/50 p-6 hover:bg-[#1A1D24] hover:border-slate-500 transition-all text-center">
              <FileText className="h-8 w-8 text-gray-400" />
              <span className="font-semibold text-gray-200">Catalogue Ouvrages</span>
            </Link>
            <Link href="/bureau/rapports-intemperies" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#1A1D24]/50 p-6 hover:bg-[#1A1D24] hover:border-slate-500 transition-all text-center md:col-span-2 lg:col-span-1">
              <CheckCircle2 className="h-8 w-8 text-gray-400" />
              <span className="font-semibold text-gray-200">Rapports Intempéries</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

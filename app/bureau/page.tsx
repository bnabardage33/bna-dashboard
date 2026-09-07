"use client";

import { useEffect, useState } from "react";
import { calculerMontantTTCFacture } from "@/lib/financeCalculs";
import type { FactureFinance } from "@/types/finance";
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
  Wand2,
  Package,
  MapPin,
  ShieldCheck
} from "lucide-react";
import { fmtEuro } from "@/lib/financeCalculs";
import ChantierHealthCard from "@/components/ChantierHealthCard";
import { calculerTempsBudget, calculerTempsConsommeMeteo } from "@/lib/gaelLogic";

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
  const [healthCards, setHealthCards] = useState<any[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      setIsLoading(true);
      const today = new Date().toISOString().slice(0, 10);

      const [devisRes, facturesRes, chantiersRes, fournRes] = await Promise.all([
        supabase.from("devis").select("id").in("statut", ["brouillon", "envoye"]),
        supabase.from("factures").select("lignes, tva_pct").eq("statut", "envoyee").lt("echeance", today),
        supabase.from("chantiers")
          .select("id, nom, created_at, surface_m2, quantite_coupes_ml, singularites_nb, pointages_globaux(volume_heures_declare, coef_meteo, meteo_relevee, created_at, date_saisie), avancements_chantier(pourcentage, date, created_at)")
          .in("statut", ["en_cours", "En cours", "prevu", "Actif", "Préparation", "preparation", "nouveau"]),
        supabase.from("fournisseurs").select("id").eq("statut_relation", "principal")
      ]);

      const devisEnAttente = devisRes.data?.length || 0;
      const facturesRetard = facturesRes.data?.length || 0;
      const montantRetard = facturesRes.data?.reduce((sum: number, f: FactureFinance) => sum + calculerMontantTTCFacture(f), 0) || 0;
      const chantiersEnCours = chantiersRes.data?.length || 0;
      const fournisseursActifs = fournRes.data?.length || 0;

      const newHealthCards = [];
      const now = new Date().getTime();
      
      for (const c of (chantiersRes.data || [])) {
        // Avancement
        const avancements = (c.avancements_chantier || []) as any[];
        avancements.sort((a, b) => new Date(b.created_at || b.date || 0).getTime() - new Date(a.created_at || a.date || 0).getTime());
        const latestAvancement = avancements[0]?.pourcentage != null ? Number(avancements[0].pourcentage) : 0;
        
        // Pointages
        const pointages = (c.pointages_globaux || []) as any[];
        pointages.sort((a, b) => new Date(b.date_saisie || b.created_at || 0).getTime() - new Date(a.date_saisie || a.created_at || 0).getTime());
        
        // Budget calculation (Gaël Logic)
        const budget = calculerTempsBudget(
          c.surface_m2 || 0, 0.5,
          c.quantite_coupes_ml || 0, 0.3,
          c.singularites_nb || 0, 1.5
        );

        // Temps consommé (Gaël Logic)
        const formattedPointages = pointages.map(p => ({
          volumeHeures: Number(p.volume_heures_declare) || 0,
          coefMeteo: Number(p.coef_meteo) || 1.0,
        }));
        const tempsConsomme = calculerTempsConsommeMeteo(formattedPointages);
        const heuresConsommeesPct = budget > 0 ? (tempsConsomme / budget) * 100 : 0;
        
        // Days calculation
        const chantierCreatedAt = c.created_at ? new Date(c.created_at).getTime() : now;
        
        const lastPointageDate = pointages[0] ? new Date(pointages[0].date_saisie || pointages[0].created_at || 0).getTime() : chantierCreatedAt;
        const joursSansPointage = Math.floor((now - lastPointageDate) / (1000 * 3600 * 24));
        
        const lastAvancementDate = avancements[0] ? new Date(avancements[0].date || avancements[0].created_at || 0).getTime() : chantierCreatedAt;
        const joursSansAvancement = Math.floor((now - lastAvancementDate) / (1000 * 3600 * 24));

        // Intemperies count
        const joursIntemperies = pointages.filter(p => p.coef_meteo && Number(p.coef_meteo) > 1.0).length;

        newHealthCards.push({
          id: c.id,
          chantierName: c.nom || "Chantier sans nom",
          chantierData: {
            avancementPct: latestAvancement,
            heuresConsommeesPct,
            joursSansPointage,
            joursSansAvancement,
            joursIntemperies,
            margeActuellePct: 20, // Default mock for now
            margePrevuePct: 20   // Default mock for now
          }
        });
      }

      setStats({
        devisEnAttente,
        facturesRetard,
        montantRetard,
        chantiersEnCours,
        fournisseursActifs
      });
      setHealthCards(newHealthCards);
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
            <div className="rounded-xl border border-white/10 bg-[#1A1D24]/80 p-6 flex flex-col hover:border-white/20 transition-colors">
              <div className="flex items-center gap-3 mb-2">
                <div className="rounded-full bg-[#E30613]/20 p-2">
                  <Clock className="h-5 w-5 text-[#E30613]" />
                </div>
                <h3 className="font-bold text-white">Devis en attente</h3>
              </div>
              <div className="mt-2 flex-grow">
                <p className="text-3xl font-black text-white">{stats.devisEnAttente}</p>
                <p className="text-sm font-semibold text-gray-400 mt-1">À relancer ou valider</p>
              </div>
              <Link href="/bureau/devis-factures" className="mt-4 flex items-center justify-between text-xs font-bold text-[#E30613] hover:text-red-400 transition-colors">
                Gérer les devis <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Chantiers en cours */}
            <div className="rounded-xl border border-white/10 bg-[#1A1D24]/80 p-6 flex flex-col hover:border-white/20 transition-colors">
              <div className="flex items-center gap-3 mb-2">
                <div className="rounded-full bg-[#E30613]/20 p-2">
                  <HardHat className="h-5 w-5 text-[#E30613]" />
                </div>
                <h3 className="font-bold text-white">Chantiers Actifs</h3>
              </div>
              <div className="mt-2 flex-grow">
                <p className="text-3xl font-black text-white">{stats.chantiersEnCours}</p>
                <p className="text-sm font-semibold text-gray-400 mt-1">En cours de production</p>
              </div>
              <Link href="/bureau/fin-chantier" className="mt-4 flex items-center justify-between text-xs font-bold text-[#E30613] hover:text-red-400 transition-colors">
                PV de Réceptions <ArrowRight className="h-4 w-4" />
              </Link>
            </div>

            {/* Fournisseurs */}
            <div className="rounded-xl border border-white/10 bg-[#1A1D24]/80 p-6 flex flex-col hover:border-white/20 transition-colors">
              <div className="flex items-center gap-3 mb-2">
                <div className="rounded-full bg-[#E30613]/20 p-2">
                  <Truck className="h-5 w-5 text-[#E30613]" />
                </div>
                <h3 className="font-bold text-white">Fournisseurs Actifs</h3>
              </div>
              <div className="mt-2 flex-grow">
                <p className="text-3xl font-black text-white">{stats.fournisseursActifs}</p>
                <p className="text-sm font-semibold text-gray-400 mt-1">Fournisseurs réguliers</p>
              </div>
              <Link href="/bureau/fournisseurs" className="mt-4 flex items-center justify-between text-xs font-bold text-[#E30613] hover:text-red-400 transition-colors">
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
            {healthCards.length > 0 ? (
              healthCards.map((card) => (
                <ChantierHealthCard
                  key={card.id}
                  chantierName={card.chantierName}
                  chantierData={card.chantierData}
                />
              ))
            ) : (
              <p className="text-gray-500 text-sm italic col-span-full">
                Aucun chantier actif à analyser pour le moment.
              </p>
            )}
          </div>
        </section>

        {/* Accès rapides */}
        <section className="mt-12">
          <h2 className="text-xl font-bold text-white mb-6">Accès Rapides</h2>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
            {/* Nouveau Super Pouvoir : Métré IA */}
            <Link href="/terrain/metre-ia" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-cyan-500/30 bg-cyan-950/30 p-6 hover:bg-cyan-950/50 hover:border-cyan-500/50 transition-all text-center group">
              <div className="rounded-full bg-cyan-500/20 p-3 group-hover:scale-110 transition-transform">
                <Wand2 className="h-8 w-8 text-cyan-400" />
              </div>
              <span className="font-bold text-cyan-100 text-sm">Métré IA</span>
            </Link>

            <Link href="/bureau/clients" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#1A1D24]/60 p-6 hover:bg-[#1A1D24] hover:border-white/20 hover:scale-[1.02] transition-all text-center">
              <div className="rounded-full bg-blue-500/20 p-3 group-hover:scale-110 transition-transform">
                <Users className="h-8 w-8 text-blue-400" />
              </div>
              <span className="font-semibold text-gray-200 text-sm">Clients</span>
            </Link>
            <Link href="/bureau/devis-factures" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#1A1D24]/60 p-6 hover:bg-[#1A1D24] hover:border-white/20 hover:scale-[1.02] transition-all text-center">
              <div className="rounded-full bg-[#E30613]/20 p-3 group-hover:scale-110 transition-transform">
                <FileText className="h-8 w-8 text-[#E30613]" />
              </div>
              <span className="font-semibold text-gray-200 text-sm">Devis & Factures</span>
            </Link>
            <Link href="/bureau/catalogue" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#1A1D24]/60 p-6 hover:bg-[#1A1D24] hover:border-white/20 hover:scale-[1.02] transition-all text-center">
              <div className="rounded-full bg-emerald-500/20 p-3 group-hover:scale-110 transition-transform">
                <Package className="h-8 w-8 text-emerald-400" />
              </div>
              <span className="font-semibold text-gray-200 text-sm">Catalogue</span>
            </Link>
            <Link href="/bureau/photos-chantier" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#1A1D24]/60 p-6 hover:bg-[#1A1D24] hover:border-white/20 hover:scale-[1.02] transition-all text-center">
              <div className="rounded-full bg-purple-500/20 p-3 group-hover:scale-110 transition-transform">
                <MapPin className="h-8 w-8 text-purple-400" />
              </div>
              <span className="font-semibold text-gray-200 text-sm">Photos</span>
            </Link>
            <Link href="/bureau/rapports-intemperies" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#1A1D24]/60 p-6 hover:bg-[#1A1D24] hover:border-white/20 hover:scale-[1.02] transition-all text-center">
              <div className="rounded-full bg-amber-500/20 p-3 group-hover:scale-110 transition-transform">
                <CheckCircle2 className="h-8 w-8 text-amber-400" />
              </div>
              <span className="font-semibold text-gray-200 text-sm">Rapports</span>
            </Link>
            <Link href="/bureau/fournisseurs" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#1A1D24]/60 p-6 hover:bg-[#1A1D24] hover:border-white/20 hover:scale-[1.02] transition-all text-center">
              <div className="rounded-full bg-orange-500/20 p-3 group-hover:scale-110 transition-transform">
                <Truck className="h-8 w-8 text-orange-400" />
              </div>
              <span className="font-semibold text-gray-200 text-sm">Fournisseurs</span>
            </Link>
            <Link href="/bureau/fin-chantier" className="flex flex-col items-center justify-center gap-3 rounded-xl border border-white/10 bg-[#1A1D24]/60 p-6 hover:bg-[#1A1D24] hover:border-white/20 hover:scale-[1.02] transition-all text-center">
              <div className="rounded-full bg-rose-500/20 p-3 group-hover:scale-110 transition-transform">
                <ShieldCheck className="h-8 w-8 text-rose-400" />
              </div>
              <span className="font-semibold text-gray-200 text-sm">Fin de Chantier</span>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}

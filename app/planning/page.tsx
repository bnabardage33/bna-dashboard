"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowLeft,
  CalendarDays,
  GanttChart,
  List,
  Loader2,
  Plus,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
import {
  buildUnifiedPlanning,
  type MetierCategorie,
  type PlanningChantierInput,
  type PlanningCommandeInput,
  type UnifiedPlanningItem,
} from "@/lib/services/planningService";
import {
  listerRendezVous,
  type RendezVousRow,
} from "@/lib/services/rendezVousService";
import { BnaPlanningView } from "@/components/planning/BnaPlanningView";
import { PlanningListView } from "@/components/planning/PlanningListView";
import { NewRdvModal } from "@/components/planning/NewRdvModal";
import { PlanningItemModal } from "@/components/planning/PlanningItemModal";

type TypeFilter = "tous" | "chantier" | "rdv" | "livraison";
type MetierFilter = "tous" | MetierCategorie;

interface ClientOption {
  id: string;
  nom: string;
}

export default function PlanningPage() {
  const [loading, setLoading] = useState(true);
  const [entrepriseId, setEntrepriseId] = useState<string | null>(null);
  const [chantiers, setChantiers] = useState<PlanningChantierInput[]>([]);
  const [commandes, setCommandes] = useState<PlanningCommandeInput[]>([]);
  const [rdvs, setRdvs] = useState<RendezVousRow[]>([]);
  const [clients, setClients] = useState<ClientOption[]>([]);
  const [migrationRequired, setMigrationRequired] = useState(false);

  const [displayMode, setDisplayMode] = useState<"gantt" | "liste">("gantt");
  const [typeFilter, setTypeFilter] = useState<TypeFilter>("tous");
  const [metierFilter, setMetierFilter] = useState<MetierFilter>("tous");

  const [isNewRdvOpen, setIsNewRdvOpen] = useState(false);
  const [selectedItem, setSelectedItem] = useState<UnifiedPlanningItem | null>(null);

  const chargerDonnees = useCallback(async () => {
    setLoading(true);
    try {
      const ctx = await resoudreContexteEntreprise(null);
      const entId = ctx.entreprise_id;
      setEntrepriseId(entId);

      const chantiersQuery = entId
        ? supabase
            .from("chantiers")
            .select("id, nom, client_nom, adresse_chantier, metier, statut, date_debut, date_fin, checklist")
            .eq("entreprise_id", entId)
            .order("created_at", { ascending: false })
        : supabase
            .from("chantiers")
            .select("id, nom, client_nom, adresse_chantier, metier, statut, date_debut, date_fin, checklist")
            .order("created_at", { ascending: false });

      const commandesQuery = entId
        ? supabase
            .from("commandes")
            .select("id, designation, statut, date_commande, date_livraison_prevue, date_livraison_reelle, chantier_id, montant_ht, fournisseurs(nom)")
            .eq("entreprise_id", entId)
        : supabase
            .from("commandes")
            .select("id, designation, statut, date_commande, date_livraison_prevue, date_livraison_reelle, chantier_id, montant_ht, fournisseurs(nom)");

      const clientsQuery = entId
        ? supabase.from("clients").select("id, nom").eq("entreprise_id", entId).order("nom")
        : supabase.from("clients").select("id, nom").order("nom");

      const [chRes, cmdRes, clRes, rdvRes] = await Promise.all([
        chantiersQuery,
        commandesQuery,
        clientsQuery,
        listerRendezVous(supabase, entId).catch(() => ({
          data: [] as RendezVousRow[],
          migrationRequired: true,
        })),
      ]);

      if (!chRes.error && chRes.data) {
        setChantiers(chRes.data as PlanningChantierInput[]);
      }

      if (!cmdRes.error && cmdRes.data) {
        const mappedCmds: PlanningCommandeInput[] = cmdRes.data.map((row) => {
          const fournisseurObj = row.fournisseurs as { nom?: string } | null;
          return {
            id: row.id,
            designation: row.designation,
            statut: row.statut,
            date_commande: row.date_commande,
            date_livraison_prevue: row.date_livraison_prevue,
            date_livraison_reelle: row.date_livraison_reelle,
            chantier_id: row.chantier_id,
            montant_ht: row.montant_ht,
            fournisseur_nom: fournisseurObj?.nom ?? null,
          };
        });
        setCommandes(mappedCmds);
      }

      if (!clRes.error && clRes.data) {
        setClients(clRes.data as ClientOption[]);
      }

      setRdvs(rdvRes.data);
      setMigrationRequired(rdvRes.migrationRequired);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void chargerDonnees();
  }, [chargerDonnees]);

  const allItems = useMemo(
    () => buildUnifiedPlanning(chantiers, commandes, rdvs),
    [chantiers, commandes, rdvs]
  );

  const filteredItems = useMemo(() => {
    return allItems.filter((item) => {
      if (typeFilter === "chantier" && item.type !== "chantier") return false;
      if (typeFilter === "rdv" && item.type !== "rdv") return false;
      if (
        typeFilter === "livraison" &&
        item.type !== "commande" &&
        item.type !== "livraison"
      ) {
        return false;
      }
      if (metierFilter !== "tous" && item.metier !== metierFilter) {
        return false;
      }
      return true;
    });
  }, [allItems, typeFilter, metierFilter]);

  const counts = useMemo(
    () => ({
      tous: allItems.length,
      chantier: allItems.filter((i) => i.type === "chantier").length,
      rdv: allItems.filter((i) => i.type === "rdv").length,
      livraison: allItems.filter(
        (i) => i.type === "commande" || i.type === "livraison"
      ).length,
    }),
    [allItems]
  );

  return (
    <div className="mx-auto max-w-[1440px] px-4 py-5 sm:px-6 text-white space-y-4">
      {/* En-tête */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#D96B27] hover:underline mb-1"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Retour à l&apos;accueil
          </Link>
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[#D96B27]/15 border border-[#D96B27]/40">
              <CalendarDays className="h-5 w-5 text-[#D96B27]" />
            </div>
            <div>
              <h1 className="text-xl font-bold text-white leading-tight">
                Planning chantiers &amp; interventions
              </h1>
              <p className="text-xs text-white/55">
                Chantiers, rendez-vous terrain et suivi des livraisons fournisseurs
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <div className="inline-flex rounded-xl border border-white/10 bg-[#1B1511] p-1">
            <button
              type="button"
              onClick={() => setDisplayMode("gantt")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                displayMode === "gantt"
                  ? "bg-[#D96B27] text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <GanttChart className="h-3.5 w-3.5" />
              Timeline Gantt
            </button>
            <button
              type="button"
              onClick={() => setDisplayMode("liste")}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors cursor-pointer ${
                displayMode === "liste"
                  ? "bg-[#D96B27] text-white"
                  : "text-white/60 hover:text-white"
              }`}
            >
              <List className="h-3.5 w-3.5" />
              Vue Liste
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsNewRdvOpen(true)}
            disabled={migrationRequired}
            className="h-10 px-4 rounded-xl bg-gradient-to-r from-[#D96B27] to-[#B85316] hover:from-[#E57732] hover:to-[#C95D1B] text-xs font-bold text-white shadow-lg shadow-[#D96B27]/20 inline-flex items-center gap-2 cursor-pointer disabled:opacity-50"
          >
            <Plus className="h-4 w-4" />
            <span>Nouveau RDV / Jalon</span>
          </button>
        </div>
      </div>

      {migrationRequired && (
        <div className="rounded-2xl border border-amber-500/40 bg-amber-950/35 p-3.5 text-xs text-amber-200 flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
          <span>
            La table <code>public.rendez_vous</code> n&apos;est pas encore créée sur Supabase.
            Appliquez la migration{" "}
            <code>supabase/migrations/20261118_rendez_vous_planning.sql</code> pour activer
            l&apos;ajout et la sauvegarde des rendez-vous.
          </span>
        </div>
      )}

      {/* Filtres combinés : Type + Métier */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#1B1511] p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {(
            [
              { key: "tous", label: `Tous (${counts.tous})` },
              { key: "chantier", label: `Chantiers (${counts.chantier})` },
              { key: "rdv", label: `RDV (${counts.rdv})` },
              { key: "livraison", label: `Livraisons (${counts.livraison})` },
            ] as const
          ).map((f) => (
            <button
              key={f.key}
              type="button"
              onClick={() => setTypeFilter(f.key)}
              className={`rounded-xl px-3 py-1.5 text-xs font-semibold border transition-colors cursor-pointer ${
                typeFilter === f.key
                  ? "border-[#D96B27] bg-[#D96B27]/20 text-white"
                  : "border-white/10 bg-[#120F0D] text-white/60 hover:text-white"
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex flex-wrap items-center gap-1.5">
          <span className="text-[11px] font-semibold text-white/45 mr-1">Métier :</span>
          {(["tous", "Bardage", "Terrasse", "Clôture"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMetierFilter(m)}
              className={`rounded-xl px-2.5 py-1 text-[11px] font-semibold border transition-colors cursor-pointer ${
                metierFilter === m
                  ? "border-[#D96B27]/70 bg-[#D96B27]/15 text-[#F59E0B]"
                  : "border-white/10 bg-[#120F0D] text-white/55 hover:text-white"
              }`}
            >
              {m === "tous" ? "Tous" : m}
            </button>
          ))}
        </div>
      </div>

      {/* Corps principal */}
      {loading ? (
        <div className="flex items-center justify-center gap-2 rounded-2xl border border-white/10 bg-[#1B1511] p-16 text-xs text-white/60">
          <Loader2 className="h-4 w-4 animate-spin text-[#D96B27]" />
          <span>Chargement du planning BNA...</span>
        </div>
      ) : displayMode === "gantt" ? (
        <BnaPlanningView
          items={filteredItems}
          onSelectItem={(item) => setSelectedItem(item)}
        />
      ) : (
        <PlanningListView
          items={filteredItems}
          onSelectItem={(item) => setSelectedItem(item)}
          onChanged={() => void chargerDonnees()}
        />
      )}

      {/* Modale Création RDV / Jalon */}
      <NewRdvModal
        isOpen={isNewRdvOpen}
        onClose={() => setIsNewRdvOpen(false)}
        chantiers={chantiers}
        clients={clients}
        entrepriseId={entrepriseId}
        onCreated={() => void chargerDonnees()}
      />

      {/* Modale Détail / Édition / Suppression */}
      <PlanningItemModal
        item={selectedItem}
        onClose={() => setSelectedItem(null)}
        onChanged={() => void chargerDonnees()}
      />
    </div>
  );
}

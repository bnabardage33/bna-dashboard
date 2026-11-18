"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Fence,
  Plus,
  Search,
  MapPin,
  Calendar,
  User,
  ArrowRight,
  SlidersHorizontal,
  Trash2,
  Pencil,
  Copy,
  Check,
  List,
  BarChartHorizontal,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import PlanningChantiers from "@/components/PlanningChantiers";
import NouveauChantierClotureModal from "@/components/cloture/NouveauChantierClotureModal";
import ModifierChantierClotureModal from "@/components/cloture/ModifierChantierClotureModal";
import CorbeilleClotureModal from "@/components/cloture/CorbeilleClotureModal";
import {
  mettreChantierClotureEnCorbeille,
  recupererChantiersCorbeilleCloture,
} from "@/lib/cloture/corbeilleService";

interface ChantierClotureItem {
  id: string;
  nom: string | null;
  client_id: string;
  adresse_chantier: string | null;
  date_debut: string | null;
  date_fin: string | null;
  statut: string;
  code_acces: string | null;
  clients: { nom: string; societe: string | null } | null;
  chantier_clotures?:
    | {
        id: string;
        forme: string;
        materiau: string;
        hauteur_utile_m: number;
      }
    | {
        id: string;
        forme: string;
        materiau: string;
        hauteur_utile_m: number;
      }[]
    | null;
  chantier_cloture_troncons?: { longueur_m: number }[] | null;
}

export default function ChantiersCloturePage() {
  const router = useRouter();
  const [chantiers, setChantiers] = useState<ChantierClotureItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOuvert, setModalOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [filtreStatut, setFiltreStatut] = useState<string>("tous");
  const [viewMode, setViewMode] = useState<"liste" | "gantt">("liste");

  const [corbeilleOuverte, setCorbeilleOuverte] = useState(false);
  const [nbCorbeille, setNbCorbeille] = useState(0);
  const [chantierAModifier, setChantierAModifier] =
    useState<ChantierClotureItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const chargerChantiers = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("chantiers")
        .select(
          "*, clients(nom, societe), chantier_clotures(*), chantier_cloture_troncons(longueur_m)"
        )
        .eq("metier", "cloture")
        .neq("statut", "corbeille")
        .order("created_at", { ascending: false });

      if (!error && data) {
        setChantiers(data as unknown as ChantierClotureItem[]);
      }
      const { data: corbeille } = await recupererChantiersCorbeilleCloture();
      setNbCorbeille(corbeille.length);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    chargerChantiers();
  }, [chargerChantiers]);

  const chantiersFiltres = useMemo(() => {
    return chantiers.filter((c) => {
      if (filtreStatut !== "tous" && c.statut !== filtreStatut) {
        return false;
      }
      if (recherche.trim()) {
        const query = recherche.toLowerCase().trim();
        const nomMatch = (c.nom || "").toLowerCase().includes(query);
        const clientMatch = (c.clients?.nom || "").toLowerCase().includes(query);
        const societeMatch = (c.clients?.societe || "").toLowerCase().includes(query);
        const adresseMatch = (c.adresse_chantier || "").toLowerCase().includes(query);
        return nomMatch || clientMatch || societeMatch || adresseMatch;
      }
      return true;
    });
  }, [chantiers, filtreStatut, recherche]);

  return (
    <div className="-mt-4 -mb-12 -mx-4 sm:mx-0 min-h-screen bg-[#120F0D] text-[#F5EFEA] selection:bg-[#D97732]/20 selection:text-[#D96B27] px-4 py-6 sm:py-8 transition-colors">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {/* 1. Bannière d'en-tête (Identité BNA Pilotage BTP) */}
        <section className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 sm:p-6 md:p-8 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#D96B27]/20 bg-[#D96B27]/10 text-[#D96B27]">
                  <Fence className="h-5 w-5" strokeWidth={2} />
                </span>
                <p className="text-xs font-bold uppercase tracking-[2.5px] text-[#D96B27]">
                  BNA Pilotage BTP · Espace Métier
                </p>
              </div>
              <h1 className="mt-2 text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-[#F5EFEA]">
                Chantiers Clôture
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-[#8E7F74] max-w-2xl leading-relaxed">
                Espace dédié aux projets de clôtures : calepinage 1 à 4 côtés 2D/3D, soubassements béton, redans, portillons et suivi d&apos;exécution.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setCorbeilleOuverte(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-[#120F0D] hover:bg-[#221B17] px-4 py-3 text-sm font-bold text-[#F5EFEA] hover:text-[#D96B27] hover:border-[#D96B27]/40 transition-all shadow-xs"
                title="Accéder à la corbeille des chantiers clôture"
              >
                <Trash2 className="h-4 w-4 text-[#D96B27]" />
                <span>Corbeille</span>
                {nbCorbeille > 0 && (
                  <span className="rounded-full bg-[#D96B27] px-2 py-0.5 text-xs font-bold text-white">
                    {nbCorbeille}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setModalOuvert(true)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#D96B27] px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#E07A38] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]"
              >
                <Plus className="h-5 w-5" />
                <span>Nouveau Chantier Clôture</span>
              </button>
            </div>
          </div>

          {/* Barre de recherche et filtres */}
          <div className="mt-6 flex flex-col gap-3 pt-5 border-t border-white/10 sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher par nom, client, adresse..."
                className="w-full rounded-xl border border-white/10 bg-[#120F0D] pl-10 pr-4 py-2.5 text-sm text-[#F5EFEA] placeholder:text-[#8E7F74] focus:border-[#D96B27] focus:bg-[#1E1916] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20 transition-all"
              />
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#8E7F74]" />
            </div>

            {/* Bascule Liste / Planning + Filtres de statut */}
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-1 rounded-xl border border-white/10 bg-[#120F0D] p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("liste")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    viewMode === "liste"
                      ? "bg-[#1B1511] text-[#F5EFEA] shadow-sm"
                      : "text-[#8E7F74] hover:text-[#F5EFEA]"
                  }`}
                >
                  <List className="h-3.5 w-3.5" />
                  <span>Liste</span>
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("gantt")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    viewMode === "gantt"
                      ? "bg-[#1B1511] text-[#F5EFEA] shadow-sm"
                      : "text-[#8E7F74] hover:text-[#F5EFEA]"
                  }`}
                >
                  <BarChartHorizontal className="h-3.5 w-3.5" />
                  <span>Planning</span>
                </button>
              </div>

              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-white/10 bg-[#120F0D] p-1">
                {[
                  { id: "tous", label: "Tous" },
                  { id: "prevu", label: "Prévus" },
                  { id: "en_cours", label: "En cours" },
                  { id: "termine", label: "Terminés" },
                ].map((f) => (
                  <button
                    key={f.id}
                    type="button"
                    onClick={() => setFiltreStatut(f.id)}
                    className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                      filtreStatut === f.id
                        ? "bg-[#1B1511] text-[#F5EFEA] shadow-sm"
                        : "text-[#8E7F74] hover:text-[#F5EFEA]"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 2. Grille des Chantiers Clôture */}
        {loading ? (
          <div className="flex min-h-72 items-center justify-center rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-8 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#D97732] border-t-transparent" />
              <p className="text-sm font-medium text-[#8E7F74]">
                Chargement des chantiers clôture...
              </p>
            </div>
          </div>
        ) : chantiersFiltres.length === 0 ? (
          <section className="rounded-2xl sm:rounded-3xl border border-dashed border-[#DCDCDC] bg-[#1B1511] p-10 sm:p-12 text-center shadow-xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#D96B27]/10 border border-[#D96B27]/20 text-[#D96B27]">
              <Fence className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-[#F5EFEA]">
              {chantiers.length === 0
                ? "Aucun chantier clôture pour le moment"
                : "Aucun résultat pour cette recherche"}
            </h3>
            <p className="mt-1 text-xs text-[#8E7F74] max-w-md mx-auto">
              {chantiers.length === 0
                ? "Créez votre premier projet clôture pour accéder au calepinage 2D/3D, redans, portillons et au suivi complet des travaux."
                : "Modifiez vos filtres ou lancez une autre recherche."}
            </p>
            {chantiers.length === 0 && (
              <button
                type="button"
                onClick={() => setModalOuvert(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#D96B27] hover:bg-[#E07A38] active:scale-[0.98] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all"
              >
                <Plus className="h-4 w-4" />
                Créer mon premier chantier clôture
              </button>
            )}
          </section>
        ) : viewMode === "gantt" ? (
          <PlanningChantiers
            chantiers={chantiersFiltres.map((c) => ({
              id: c.id,
              nom: c.nom,
              client_nom: c.clients?.nom || null,
              client_societe: c.clients?.societe || null,
              adresse_chantier: c.adresse_chantier,
              date_debut: c.date_debut,
              date_fin: c.date_fin,
              statut: c.statut,
              metier: "cloture",
            }))}
            onUpdateDates={async (id, newDebut, newFin) => {
              await supabase
                .from("chantiers")
                .update({ date_debut: newDebut, date_fin: newFin })
                .eq("id", id);
              chargerChantiers();
            }}
          />
        ) : (
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {chantiersFiltres.map((c) => {
              const info = Array.isArray(c.chantier_clotures)
                ? c.chantier_clotures[0]
                : c.chantier_clotures;
              const lineaireTotal = (c.chantier_cloture_troncons ?? []).reduce(
                (sum, t) => sum + (Number(t.longueur_m) || 0),
                0
              );
              const lineaireAffiche = lineaireTotal > 0 ? lineaireTotal.toFixed(1) : null;

              return (
                <div
                  key={c.id}
                  className="group relative flex flex-col justify-between rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-1 hover:border-[#D96B27]/60 hover:shadow-[0_15px_35px_rgba(184,91,43,0.08)]"
                >
                  <div>
                    {/* Statut & badge clôture */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="rounded-md border border-[#D96B27]/20 bg-[#D96B27]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#D96B27]">
                        Clôture {info?.forme?.replace("_", " ") || "Sur mesure"}
                      </span>

                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          c.statut === "termine"
                            ? "bg-emerald-500/15 text-emerald-300 border border-emerald-200"
                            : c.statut === "en_cours"
                            ? "bg-amber-500/15 text-amber-900 border border-amber-200"
                            : "bg-[#120F0D] text-[#8E7F74] border border-white/10"
                        }`}
                      >
                        {c.statut === "termine"
                          ? "Terminé"
                          : c.statut === "en_cours"
                          ? "En cours"
                          : "Prévu"}
                      </span>
                    </div>

                    {/* Titre & Client */}
                    <h3 className="text-lg font-bold text-[#F5EFEA] tracking-tight group-hover:text-[#D96B27] transition-colors">
                      {c.nom || "Chantier Clôture"}
                    </h3>

                    <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[#8E7F74]">
                      <User className="h-3.5 w-3.5 text-gray-400" />
                      <span>
                        {c.clients?.nom || "Client non associé"}{" "}
                        {c.clients?.societe ? `(${c.clients.societe})` : ""}
                      </span>
                    </p>

                    {/* Adresse */}
                    {c.adresse_chantier && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-[#8E7F74] truncate">
                        <MapPin className="h-3.5 w-3.5 text-[#D96B27] shrink-0" />
                        <span className="truncate">{c.adresse_chantier}</span>
                      </p>
                    )}

                    {/* Linéaire & Matériau */}
                    {(lineaireAffiche || info?.materiau) && (
                      <div className="mt-3.5 flex items-center gap-2 rounded-xl bg-[#120F0D] px-3 py-1.5 border border-white/10 text-xs">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-[#D96B27]" />
                        <span className="font-bold text-[#F5EFEA]">
                          {lineaireAffiche ? `${lineaireAffiche} ml` : "Calepinage prêt"}
                        </span>
                        <span className="text-[#CCCCCC]">·</span>
                        <span className="text-[#8E7F74] capitalize">
                          {(info?.materiau || "COMPOSITE").toLowerCase()}
                        </span>
                      </div>
                    )}

                    {/* Planning / Démarrage */}
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[#8E7F74]">
                      <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span>
                        {c.date_debut
                          ? `Démarrage : ${new Date(c.date_debut).toLocaleDateString("fr-FR")}`
                          : "Dates à définir"}
                      </span>
                    </div>
                  </div>

                  {/* Zone d'actions inférieure : Grille équilibrée 2x2 + Bouton Hub */}
                  <div className="mt-4 pt-3.5 border-t border-white/10 flex flex-col gap-2">
                    <div className="grid grid-cols-2 gap-2">
                      {/* 1. Modifier */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setChantierAModifier(c);
                        }}
                        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-[#120F0D] hover:bg-[#221B17] hover:border-[#D96B27]/40 px-2.5 text-xs font-semibold text-[#F5EFEA] hover:text-[#D96B27] active:scale-[0.98] transition-all shadow-2xs group"
                        title="Modifier les informations du chantier clôture"
                        aria-label={`Modifier ${c.nom || "le chantier clôture"}`}
                      >
                        <Pencil className="h-3.5 w-3.5 text-gray-400 group-hover:text-[#D96B27] shrink-0 transition-colors" />
                        <span className="truncate">Modifier</span>
                      </button>

                      {/* 2. GPS Itinéraire */}
                      {c.adresse_chantier ? (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.adresse_chantier)}&travelmode=driving`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-[#120F0D] hover:bg-[#221B17] hover:border-[#D96B27]/40 px-2.5 text-xs font-semibold text-[#8E7F74] hover:text-[#F5EFEA] active:scale-[0.98] transition-all shadow-2xs truncate"
                          title="Lancer l'itinéraire GPS Google Maps vers le chantier"
                        >
                          <span className="truncate">🗺️ GPS Itinéraire</span>
                        </a>
                      ) : (
                        <div
                          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-white/10/60 bg-[#120F0D]/60 px-2.5 text-xs font-semibold text-[#AAAAAA] cursor-not-allowed select-none"
                          title="Adresse non renseignée — navigation indisponible"
                        >
                          <span className="truncate">🗺️ GPS Itinéraire</span>
                        </div>
                      )}

                      {/* 3. Lien client */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!c.code_acces) return;
                          const link = `${window.location.origin}/espace-client/${c.code_acces}`;
                          navigator.clipboard.writeText(link);
                          setCopiedId(c.id);
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                        disabled={!c.code_acces}
                        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-white/10 bg-[#120F0D] hover:bg-[#221B17] hover:border-[#D96B27]/40 px-2.5 text-xs font-semibold text-[#8E7F74] hover:text-[#F5EFEA] active:scale-[0.98] transition-all shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                        title={c.code_acces ? "Copier le lien d'accès espace client" : "Code d'accès non généré"}
                      >
                        {copiedId === c.id ? (
                          <Check size={13} className="text-emerald-600 shrink-0" />
                        ) : (
                          <Copy size={13} className="text-gray-400 shrink-0" />
                        )}
                        <span className="truncate">{copiedId === c.id ? "Copié !" : "Lien client"}</span>
                      </button>

                      {/* 4. Corbeille */}
                      <button
                        type="button"
                        onClick={async (e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!confirm(`Mettre « ${c.nom || "ce chantier"} » à la corbeille ?`)) return;
                          await mettreChantierClotureEnCorbeille(c.id);
                          chargerChantiers();
                        }}
                        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-red-200/80 bg-red-500/15 text-red-500 hover:bg-red-100 hover:border-red-300 hover:text-red-300 active:scale-[0.98] transition-all shadow-2xs"
                        title="Mettre ce chantier à la corbeille"
                        aria-label={`Mettre à la corbeille ${c.nom || "le chantier"}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">Corbeille</span>
                      </button>
                    </div>

                    {/* Action principale au poids visuel maîtrisé */}
                    <Link
                      href={`/terrain/cloture/${c.id}`}
                      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[#23272B] px-3 text-xs font-bold text-white transition-all hover:bg-[#D96B27] active:scale-[0.98] shadow-2xs"
                    >
                      <span>Ouvrir Hub Clôture</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <NouveauChantierClotureModal
        ouvert={modalOuvert}
        onFermer={() => setModalOuvert(false)}
        onCree={(id) => router.push(`/terrain/cloture/${id}`)}
      />

      <ModifierChantierClotureModal
        chantier={chantierAModifier}
        onFermer={() => setChantierAModifier(null)}
        onMisAJour={chargerChantiers}
      />

      <CorbeilleClotureModal
        ouvert={corbeilleOuverte}
        onFermer={() => setCorbeilleOuverte(false)}
        onChange={chargerChantiers}
      />
    </div>
  );
}

// app/terrain/chantier/page.tsx
"use client";

import { useEffect, useState, useMemo } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
import {
  Layers3,
  Plus,
  MapPin,
  Calendar,
  Building,
  User,
  Trash2,
  Pencil,
  X,
  ArrowRight,
  List,
  Search,
  Copy,
  Check,
  BarChartHorizontal,
} from "lucide-react";
import PlanningGantt from "@/components/PlanningGantt";
import ConfirmationSuppressionModal from "@/components/terrasse/ConfirmationSuppressionModal";
import CorbeilleBardageModal from "@/components/bardage/CorbeilleBardageModal";
import ModifierChantierBardageModal from "@/components/bardage/ModifierChantierBardageModal";
import {
  mettreChantierBardageEnCorbeille,
  recupererChantiersCorbeilleBardage,
} from "@/lib/bardage/corbeilleService";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string | null): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

type Client = { id: string; nom: string; societe: string | null };

type Chantier = {
  id: string;
  nom: string | null;
  client_id: string;
  adresse_chantier: string | null;
  date_debut: string | null;
  date_fin: string | null;
  statut: string;
  materiau_structurel?: string | null;
  moyen_acces?: string | null;
  zone_vent?: number | null;
  contact_chantier?: string | null;
  notes_terrain?: string | null;
  clients: { nom: string; societe: string | null } | null;
  code_acces: string | null;
  chantier_zones?: { id: string; nom: string }[];
  metier?: string | null;
  entreprise_id?: string | null;
};

export default function ChantiersPage() {
  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [viewMode, setViewMode] = useState<"liste" | "gantt">("liste");
  const [filtreStatut, setFiltreStatut] = useState<string>("tous");

  const handleUpdateDates = async (id: string, newDebut: string, newFin: string) => {
    setChantiers((prev) =>
      prev.map((c) =>
        c.id === id ? { ...c, date_debut: newDebut, date_fin: newFin } : c
      )
    );
    await supabase
      .from("chantiers")
      .update({ date_debut: newDebut, date_fin: newFin })
      .eq("id", id);
  };

  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOuvert, setModalOuvert] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [recherche, setRecherche] = useState("");

  // Gestion de la Corbeille
  const [corbeilleOuverte, setCorbeilleOuverte] = useState(false);
  const [nbCorbeille, setNbCorbeille] = useState(0);
  const [chantierAMettreEnCorbeille, setChantierAMettreEnCorbeille] =
    useState<Chantier | null>(null);
  const [miseEnCorbeilleEnCours, setMiseEnCorbeilleEnCours] = useState(false);

  // Modification d'un chantier existant
  const [chantierAModifier, setChantierAModifier] = useState<Chantier | null>(null);

  // Formulaire nouveau chantier
  const [nom, setNom] = useState("");
  const [clientId, setClientId] = useState("");
  const [adresse, setAdresse] = useState("");
  const [dateDebut, setDateDebut] = useState("");
  const [dateFin, setDateFin] = useState("");
  const [materiauStructurel, setMateriauStructurel] = useState("Bois / Mélèze");
  const [creationEnCours, setCreationEnCours] = useState(false);

  async function fetchClients() {
    const { data } = await supabase
      .from("clients")
      .select("id, nom, societe")
      .order("nom");
    if (data) setClients(data as Client[]);
  }

  async function fetchChantiers() {
    setLoading(true);
    try {
      // Filtrage strict Bardage : on accepte les chantiers bardage explicites et les historiques NULL,
      // tout en excluant les chantiers en corbeille et ceux disposant d'une fiche terrasse.
      const { data, error } = await (supabase
        .from("chantiers") as any)
        .select("*, clients(nom, societe), chantier_zones(id, nom), chantier_terrasses(id)")
        .or("metier.eq.bardage,metier.is.null")
        .neq("statut", "corbeille")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erreur chargement chantiers bardage:", error);
        const fallback = await (supabase
          .from("chantiers") as any)
          .select("*, clients(nom, societe)")
          .or("metier.eq.bardage,metier.is.null")
          .neq("statut", "corbeille")
          .order("created_at", { ascending: false });
        if (fallback.data) {
          const filtres = (fallback.data as (Chantier & { metier?: string })[]).filter(
            (c) => c.metier !== "terrasse"
          );
          setChantiers(filtres);
        }
      } else if (data) {
        const filtres = (data as (Chantier & {
          metier?: string;
          chantier_terrasses?: { id: string }[];
        })[]).filter((c) => {
          if (c.metier === "terrasse") return false;
          if (Array.isArray(c.chantier_terrasses) && c.chantier_terrasses.length > 0) return false;
          return true;
        });
        setChantiers(filtres);
      }

      // Compter les chantiers bardage en corbeille
      const corbeilleListe = await recupererChantiersCorbeilleBardage(supabase);
      setNbCorbeille(corbeilleListe.length);
    } catch (e) {
      console.error("Exception chargement chantiers bardage:", e);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchClients();
    fetchChantiers();
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return;
    setCreationEnCours(true);

    const { entreprise_id } = await resoudreContexteEntreprise(null);

    if (!estUuid(entreprise_id)) {
      console.error(
        "Chantiers : création refusée — contexte entreprise introuvable ou invalide dans la session."
      );
      setCreationEnCours(false);
      alert(
        "Impossible de créer le chantier : votre session ne contient pas d'entreprise identifiée. Reconnectez-vous et réessayez."
      );
      return;
    }

    const { error } = await supabase.from("chantiers").insert({
      nom: nom || null,
      client_id: clientId,
      adresse_chantier: adresse || null,
      date_debut: dateDebut || null,
      date_fin: dateFin || null,
      materiau_structurel: materiauStructurel || undefined,
      statut: "prevu",
      code_acces:
        "BNA-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
      checklist: { tasseaux: false, pare_pluie: false, pose: false, finition: false },
      metier: "bardage",
      entreprise_id,
    } as any);

    setCreationEnCours(false);

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }

    setNom("");
    setClientId("");
    setAdresse("");
    setDateDebut("");
    setDateFin("");
    setModalOuvert(false);
    fetchChantiers();
  }

  async function handleConfirmerMiseEnCorbeille() {
    if (!chantierAMettreEnCorbeille) return;
    setMiseEnCorbeilleEnCours(true);
    try {
      await mettreChantierBardageEnCorbeille(
        supabase,
        chantierAMettreEnCorbeille.id
      );
      // Retirer immédiatement de la liste active
      setChantiers((prev) =>
        prev.filter((c) => c.id !== chantierAMettreEnCorbeille.id)
      );
      setNbCorbeille((prev) => prev + 1);
      setChantierAMettreEnCorbeille(null);
    } catch (err) {
      alert(
        err instanceof Error
          ? err.message
          : "Erreur lors de la mise à la corbeille."
      );
    } finally {
      setMiseEnCorbeilleEnCours(false);
    }
  }

  // Filtrage combiné : recherche + statut
  const chantiersFiltres = useMemo(() => {
    return chantiers.filter((ch) => {
      // Filtre statut
      if (filtreStatut !== "tous" && ch.statut !== filtreStatut) {
        return false;
      }
      // Filtre recherche
      if (recherche.trim()) {
        const q = recherche.toLowerCase();
        return (
          ch.nom?.toLowerCase().includes(q) ||
          ch.clients?.nom?.toLowerCase().includes(q) ||
          ch.clients?.societe?.toLowerCase().includes(q) ||
          ch.adresse_chantier?.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [chantiers, filtreStatut, recherche]);

  return (
    <div className="-mt-4 -mb-12 -mx-4 sm:mx-0 min-h-screen bg-[#F3F3F1] text-[#23272B] selection:bg-[#D97732]/20 selection:text-[#B85B2B] px-4 py-6 sm:py-8 transition-colors">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {/* 1. Bannière d'en-tête (Identité BNA Espace Métier Bardage) */}
        <section className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 md:p-8 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
                  <Layers3 className="h-5 w-5" strokeWidth={2} />
                </span>
                <p className="text-xs font-bold uppercase tracking-[2.5px] text-[#B85B2B]">
                  BNA Pilotage BTP · Espace Métier
                </p>
              </div>
              <h1 className="mt-2 text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-[#23272B]">
                Chantiers Bardage
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-[#777777] max-w-2xl leading-relaxed">
                Espace dédié aux projets de bardage : calepinage 2D/3D DTU 41.2 / DTU 45.4, suivi des 4 phases de pose et pilotage d&apos;exécution.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setCorbeilleOuverte(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white px-4 py-3 text-sm font-bold text-[#23272B] hover:text-[#B85B2B] hover:border-[#B85B2B]/40 transition-all shadow-xs"
                title="Accéder à la corbeille des chantiers bardage"
              >
                <Trash2 className="h-4 w-4 text-[#B85B2B]" />
                <span>Corbeille</span>
                {nbCorbeille > 0 && (
                  <span className="rounded-full bg-[#B85B2B] px-2 py-0.5 text-xs font-bold text-white">
                    {nbCorbeille}
                  </span>
                )}
              </button>

              <button
                type="button"
                onClick={() => setModalOuvert(true)}
                aria-label="Ajouter un chantier"
                className="inline-flex items-center gap-2 rounded-xl bg-[#B85B2B] px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#D97732] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]"
              >
                <Plus className="h-5 w-5" />
                <span>Nouveau Chantier Bardage</span>
              </button>
            </div>
          </div>

          {/* Barre de recherche, bascule vue et filtres de statut */}
          <div className="mt-6 flex flex-col gap-3 pt-5 border-t border-[#F0F0F0] sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher par nom de chantier, client, adresse..."
                className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] pl-10 pr-4 py-2.5 text-sm text-[#23272B] placeholder:text-[#999999] focus:border-[#B85B2B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20 transition-all"
              />
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#999999]" />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Bascule Vue Liste / Gantt */}
              <div className="flex items-center gap-1 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] p-1">
                <button
                  type="button"
                  onClick={() => setViewMode("liste")}
                  className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold transition-all ${
                    viewMode === "liste"
                      ? "bg-white text-[#23272B] shadow-sm"
                      : "text-[#777777] hover:text-[#23272B]"
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
                      ? "bg-white text-[#23272B] shadow-sm"
                      : "text-[#777777] hover:text-[#23272B]"
                  }`}
                >
                  <BarChartHorizontal className="h-3.5 w-3.5" />
                  <span>Planning</span>
                </button>
              </div>

              {/* Filtres de statut */}
              <div className="flex flex-wrap items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] p-1">
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
                        ? "bg-white text-[#23272B] shadow-sm"
                        : "text-[#777777] hover:text-[#23272B]"
                    }`}
                  >
                    {f.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* 2. Grille des Chantiers Bardage */}
        {loading ? (
          <div className="flex min-h-72 items-center justify-center rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-8 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#D97732] border-t-transparent" />
              <p className="text-sm font-medium text-[#777777]">
                Chargement des chantiers bardage...
              </p>
            </div>
          </div>
        ) : chantiersFiltres.length === 0 ? (
          <section className="rounded-2xl sm:rounded-3xl border border-dashed border-[#DCDCDC] bg-white p-10 sm:p-12 text-center shadow-xs">
            <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-[#B85B2B]/10 border border-[#B85B2B]/20 text-[#B85B2B]">
              <Layers3 className="h-7 w-7" />
            </div>
            <h3 className="mt-4 text-lg font-bold text-[#23272B]">
              {chantiers.length === 0
                ? "Aucun chantier bardage pour le moment"
                : "Aucun résultat pour cette recherche"}
            </h3>
            <p className="mt-1 text-xs text-[#777777] max-w-md mx-auto">
              {chantiers.length === 0
                ? "Créez votre premier projet de bardage pour accéder au calepinage 2D/3D et au suivi complet des travaux."
                : "Modifiez vos filtres ou lancez une autre recherche."}
            </p>
            {chantiers.length === 0 && (
              <button
                type="button"
                onClick={() => setModalOuvert(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#B85B2B] hover:bg-[#D97732] active:scale-[0.98] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all"
              >
                <Plus className="h-4 w-4" />
                Créer mon premier chantier bardage
              </button>
            )}
          </section>
        ) : viewMode === "gantt" ? (
          <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-4 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
            <PlanningGantt
              chantiers={chantiersFiltres.map((c) => ({
                id: c.id,
                nom: c.nom,
                client_nom: c.clients?.nom || null,
                client_societe: c.clients?.societe || null,
                adresse_chantier: c.adresse_chantier,
                date_debut: c.date_debut,
                date_fin: c.date_fin,
                statut: c.statut,
              }))}
              onUpdateDates={handleUpdateDates}
            />
          </div>
        ) : (
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {chantiersFiltres.map((ch) => {
              const nomClient =
                ch.clients?.societe || ch.clients?.nom || "Client direct";
              const nbZones = Array.isArray(ch.chantier_zones)
                ? ch.chantier_zones.length
                : 0;

              return (
                <div
                  key={ch.id}
                  className="group relative flex flex-col justify-between rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-1 hover:border-[#B85B2B]/60 hover:shadow-[0_15px_35px_rgba(184,91,43,0.08)]"
                >
                  <div>
                    {/* Statut & badge métier */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="rounded-md border border-[#B85B2B]/20 bg-[#B85B2B]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B85B2B]">
                        Bardage DTU 41.2 / 45.4
                      </span>

                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          ch.statut === "termine"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : ch.statut === "en_cours"
                            ? "bg-amber-50 text-amber-900 border border-amber-200"
                            : "bg-[#F8F9FA] text-[#777777] border border-[#E5E5E5]"
                        }`}
                      >
                        {ch.statut === "termine"
                          ? "Terminé"
                          : ch.statut === "en_cours"
                          ? "En cours"
                          : "Prévu"}
                      </span>
                    </div>

                    {/* Titre & Client */}
                    <h3 className="text-lg font-bold text-[#23272B] tracking-tight group-hover:text-[#B85B2B] transition-colors truncate">
                      {ch.nom || nomClient}
                    </h3>

                    <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[#777777] truncate">
                      <User className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span className="truncate">{nomClient}</span>
                    </p>

                    {/* Adresse */}
                    {ch.adresse_chantier && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-[#777777] truncate">
                        <MapPin className="h-3.5 w-3.5 text-[#B85B2B] shrink-0" />
                        <span className="truncate">{ch.adresse_chantier}</span>
                      </p>
                    )}

                    {/* Planning / Démarrage — Zone dédiée claire */}
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[#777777]">
                      <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span>
                        {ch.date_debut
                          ? `Démarrage : ${new Date(ch.date_debut).toLocaleDateString("fr-FR")}`
                          : "Non démarré"}
                      </span>
                    </div>
                  </div>

                  {/* Zone d'actions inférieure : Grille équilibrée 2x2 + Bouton Hub maîtrisé */}
                  <div className="mt-4 pt-3.5 border-t border-[#F0F0F0] flex flex-col gap-2">
                    {/* Grille équilibrée de deux colonnes pour les 4 actions secondaires */}
                    <div className="grid grid-cols-2 gap-2">
                      {/* 1. Bouton Modifier — Accent cuivre BNA */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setChantierAModifier(ch);
                        }}
                        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white hover:border-[#B85B2B]/40 px-2.5 text-xs font-semibold text-[#23272B] hover:text-[#B85B2B] active:scale-[0.98] transition-all shadow-2xs group"
                        title="Modifier les informations du chantier"
                        aria-label={`Modifier ${ch.nom || "le chantier"}`}
                      >
                        <Pencil className="h-3.5 w-3.5 text-gray-400 group-hover:text-[#B85B2B] shrink-0 transition-colors" />
                        <span className="truncate">Modifier</span>
                      </button>

                      {/* 2. Lien GPS Itinéraire réel (Google Maps Directions) — Style neutre */}
                      {ch.adresse_chantier ? (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(ch.adresse_chantier)}&travelmode=driving`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white hover:border-[#B85B2B]/40 px-2.5 text-xs font-semibold text-[#777777] hover:text-[#23272B] active:scale-[0.98] transition-all shadow-2xs truncate"
                          title="Lancer l'itinéraire GPS Google Maps vers le chantier"
                        >
                          <span className="truncate">🗺️ GPS Itinéraire</span>
                        </a>
                      ) : (
                        <div
                          className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#E5E5E5]/60 bg-[#F8F9FA]/60 px-2.5 text-xs font-semibold text-[#AAAAAA] cursor-not-allowed select-none"
                          title="Adresse non renseignée — navigation indisponible"
                        >
                          <span className="truncate">🗺️ GPS Itinéraire</span>
                        </div>
                      )}

                      {/* 3. Bouton Lien client — Style neutre */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          if (!ch.code_acces) return;
                          const link = `${window.location.origin}/espace-client/${ch.code_acces}`;
                          navigator.clipboard.writeText(link);
                          setCopiedId(ch.id);
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                        disabled={!ch.code_acces}
                        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white hover:border-[#B85B2B]/40 px-2.5 text-xs font-semibold text-[#777777] hover:text-[#23272B] active:scale-[0.98] transition-all shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                        title={ch.code_acces ? "Copier le lien d'accès espace client" : "Code d'accès non généré"}
                      >
                        {copiedId === ch.id ? (
                          <Check size={13} className="text-emerald-600 shrink-0" />
                        ) : (
                          <Copy size={13} className="text-gray-400 shrink-0" />
                        )}
                        <span className="truncate">{copiedId === ch.id ? "Copié !" : "Lien client"}</span>
                      </button>

                      {/* 4. Bouton Corbeille — Traitement rouge doux */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setChantierAMettreEnCorbeille(ch);
                        }}
                        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-red-200/80 bg-red-50 text-red-600 hover:bg-red-100 hover:border-red-300 hover:text-red-700 active:scale-[0.98] transition-all shadow-2xs"
                        title="Mettre ce chantier à la corbeille"
                        aria-label={`Mettre à la corbeille ${ch.nom || "le chantier"}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">Corbeille</span>
                      </button>
                    </div>

                    {/* Action principale au poids visuel maîtrisé */}
                    <Link
                      href={`/terrain/chantier/${ch.id}`}
                      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[#23272B] px-3 text-xs font-bold text-white transition-all hover:bg-[#B85B2B] active:scale-[0.98] shadow-2xs"
                    >
                      <span>Ouvrir Hub Bardage</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal pour Nouveau Chantier Bardage — Design Harmonisé BNA Clair */}
        {modalOuvert && (
          <div
            role="dialog"
            aria-modal="true"
            className="fixed inset-0 z-[1000] flex items-center justify-center overflow-y-auto bg-black/60 p-4 backdrop-blur-sm animate-in fade-in duration-200"
            onClick={() => setModalOuvert(false)}
          >
            <div
              className="relative w-full max-w-xl overflow-hidden rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white text-[#23272B] shadow-[0_25px_60px_rgba(0,0,0,0.15)] animate-in zoom-in-95 duration-150"
              onClick={(e) => e.stopPropagation()}
            >
              {/* En-tête cuivré et élégant */}
              <div className="border-b border-[#F0F0F0] bg-[#F8F9FA] px-6 py-5">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
                      <Layers3 className="h-5 w-5" strokeWidth={2} />
                    </span>
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[2.5px] text-[#B85B2B]">
                        Nouveau Projet
                      </p>
                      <h2 className="text-xl font-bold tracking-tight text-[#23272B]">
                        Créer un Chantier Bardage
                      </h2>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => setModalOuvert(false)}
                    className="flex h-9 w-9 items-center justify-center rounded-xl text-gray-400 transition-colors hover:bg-gray-100 hover:text-[#23272B]"
                    aria-label="Fermer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Formulaire complet */}
              <form onSubmit={handleSubmit} className="space-y-4 p-6">
                <div>
                  <label
                    htmlFor="chp-nom-du-chantier"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                  >
                    Nom du chantier <span className="text-[#B85B2B]">*</span>
                  </label>
                  <input
                    id="chp-nom-du-chantier"
                    value={nom}
                    onChange={(e) => setNom(e.target.value)}
                    placeholder="Ex. Bardage Clin Bois — Villa Arcachon"
                    required
                    className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] placeholder:text-gray-400 focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="chp-client-associe"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                  >
                    Client associé <span className="text-[#B85B2B]">*</span>
                  </label>
                  <select
                    id="chp-client-associe"
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    required
                    className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
                  >
                    <option value="">— Sélectionner un client —</option>
                    {clients.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.societe ? `${c.societe} (${c.nom})` : c.nom}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="chp-adresse-du-site-des-travaux"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                  >
                    Adresse du site des travaux
                  </label>
                  <input
                    id="chp-adresse-du-site-des-travaux"
                    value={adresse}
                    onChange={(e) => setAdresse(e.target.value)}
                    placeholder="Ex. 14 Route des Plages, 33120 Arcachon"
                    className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] placeholder:text-gray-400 focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
                  />
                </div>

                <div>
                  <label
                    htmlFor="chp-materiau-predominant"
                    className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                  >
                    Matériau prédominant
                  </label>
                  <select
                    id="chp-materiau-predominant"
                    value={materiauStructurel}
                    onChange={(e) => setMateriauStructurel(e.target.value)}
                    className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
                  >
                    <option value="Bois / Mélèze">Bois Naturel / Mélèze</option>
                    <option value="Panneaux HPL Trespa">Panneaux HPL (Trespa / Fundermax)</option>
                    <option value="Composite Fibres-Ciment">Composite / Fibres-Ciment (Cedral)</option>
                    <option value="Cassettes Métalliques Alu">Cassettes Métalliques / Zinc / Alu</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <div>
                    <label
                      htmlFor="chp-date-debut-prevue"
                      className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                    >
                      Date début prévue
                    </label>
                    <input
                      id="chp-date-debut-prevue"
                      type="date"
                      value={dateDebut}
                      onChange={(e) => setDateDebut(e.target.value)}
                      className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="chp-date-fin-estimee"
                      className="mb-1.5 block text-xs font-bold uppercase tracking-wider text-[#777777]"
                    >
                      Date fin estimée
                    </label>
                    <input
                      id="chp-date-fin-estimee"
                      type="date"
                      value={dateFin}
                      onChange={(e) => setDateFin(e.target.value)}
                      className="w-full rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-sm font-medium text-[#23272B] focus:border-[#B85B2B] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20"
                    />
                  </div>
                </div>

                {/* Boutons d'action du formulaire */}
                <div className="flex items-center justify-end gap-3 pt-4 border-t border-[#F0F0F0]">
                  <button
                    type="button"
                    onClick={() => setModalOuvert(false)}
                    className="rounded-xl border border-[#E5E5E5] bg-white px-4 py-2.5 text-xs font-bold text-[#23272B] hover:bg-gray-50 transition-colors"
                  >
                    Annuler
                  </button>

                  <button
                    type="submit"
                    disabled={creationEnCours}
                    className="inline-flex items-center gap-2 rounded-xl bg-[#B85B2B] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#D97732] active:scale-[0.98] disabled:opacity-50"
                  >
                    {creationEnCours ? "Création en cours..." : "Enregistrer le Chantier"}
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Corbeille Bardage */}
        <CorbeilleBardageModal
          ouvert={corbeilleOuverte}
          onFermer={() => setCorbeilleOuverte(false)}
          onActualiser={fetchChantiers}
        />

        {/* Modal Confirmation mise en corbeille */}
        {chantierAMettreEnCorbeille && (
          <ConfirmationSuppressionModal
            ouvert={Boolean(chantierAMettreEnCorbeille)}
            titre="Mettre ce chantier à la corbeille ?"
            message="Le chantier ne sera plus visible dans la liste active. Vous pourrez le restaurer à tout moment depuis la corbeille."
            nomChantier={chantierAMettreEnCorbeille.nom || "Chantier bardage"}
            estDefinitif={false}
            enCours={miseEnCorbeilleEnCours}
            onConfirmer={handleConfirmerMiseEnCorbeille}
            onAnnuler={() => setChantierAMettreEnCorbeille(null)}
          />
        )}

        {/* Modal Modifier Chantier Bardage */}
        {chantierAModifier && (
          <ModifierChantierBardageModal
            chantier={chantierAModifier}
            clients={clients}
            ouvert={Boolean(chantierAModifier)}
            onFermer={() => setChantierAModifier(null)}
            onSucces={(modifie) => {
              setChantiers((prev) =>
                prev.map((c) => (c.id === modifie.id ? { ...c, ...modifie } : c))
              );
              setChantierAModifier(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

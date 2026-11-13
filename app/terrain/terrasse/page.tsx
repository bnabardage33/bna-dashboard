"use client";

import React, { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Layers3,
  Plus,
  Search,
  MapPin,
  Calendar,
  User,
  ArrowRight,
  Filter,
  CheckCircle2,
  Clock,
  Building,
  SlidersHorizontal,
  Trash2,
  Pencil,
  Copy,
  Check,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import NouveauChantierTerrasseModal from "@/components/terrasse/NouveauChantierTerrasseModal";
import ModifierChantierTerrasseModal from "@/components/terrasse/ModifierChantierTerrasseModal";
import CorbeilleTerrasseModal from "@/components/terrasse/CorbeilleTerrasseModal";
import ConfirmationSuppressionModal from "@/components/terrasse/ConfirmationSuppressionModal";
import {
  mettreChantierTerrasseEnCorbeille,
  recupererChantiersCorbeilleTerrasse,
} from "@/lib/terrasse/corbeilleService";

interface ChantierTerrasseItem {
  id: string;
  nom: string | null;
  client_id: string;
  adresse_chantier: string | null;
  date_debut: string | null;
  date_fin: string | null;
  statut: string;
  code_acces: string | null;
  checklist?: Record<string, unknown> | null;
  clients: { nom: string; societe: string | null } | null;
  chantier_terrasses?:
    | {
        id: string;
        nom: string;
        longueur_m: number;
        largeur_m: number;
        essence_bois: string;
        systeme_terrasse: string;
        type_sol?: string;
        resultats_techniques?: unknown;
      }
    | {
        id: string;
        nom: string;
        longueur_m: number;
        largeur_m: number;
        essence_bois: string;
        systeme_terrasse: string;
        type_sol?: string;
        resultats_techniques?: unknown;
      }[]
    | null;
}

export default function ChantiersTerrassePage() {
  const router = useRouter();
  const [chantiers, setChantiers] = useState<ChantierTerrasseItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [modalOuvert, setModalOuvert] = useState(false);
  const [recherche, setRecherche] = useState("");
  const [filtreStatut, setFiltreStatut] = useState<string>("tous");

  // Gestion de la Corbeille
  const [corbeilleOuverte, setCorbeilleOuverte] = useState(false);
  const [nbCorbeille, setNbCorbeille] = useState(0);
  const [chantierAMettreEnCorbeille, setChantierAMettreEnCorbeille] =
    useState<ChantierTerrasseItem | null>(null);
  const [miseEnCorbeilleEnCours, setMiseEnCorbeilleEnCours] = useState(false);

  // Modification & Espace Client
  const [chantierAModifier, setChantierAModifier] =
    useState<ChantierTerrasseItem | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const chargerChantiers = useCallback(async () => {
    setLoading(true);
    try {
      // 1. Récupération des chantiers actifs (hors corbeille)
      const { data, error } = await supabase
        .from("chantiers")
        .select("*, clients(nom, societe), chantier_terrasses!inner(*)")
        .neq("statut", "corbeille")
        .order("created_at", { ascending: false });

      if (error) {
        console.error("Erreur chargement chantiers terrasse:", error);
        // Fallback sans inner join si besoin
        const fallback = await supabase
          .from("chantiers")
          .select("*, clients(nom, societe), chantier_terrasses(*)")
          .neq("statut", "corbeille")
          .order("created_at", { ascending: false });
        if (fallback.data) {
          const filtres = (fallback.data as unknown as ChantierTerrasseItem[]).filter(
            (c) =>
              c.statut !== "corbeille" &&
              !(c.checklist as { corbeille?: unknown })?.corbeille &&
              ((Array.isArray(c.chantier_terrasses) ? c.chantier_terrasses.length > 0 : Boolean(c.chantier_terrasses)) ||
                (c.checklist as { metier?: string })?.metier === "terrasse")
          );
          setChantiers(filtres);
        }
      } else if (data) {
        // Double sécurité : filtrer également les éventuels soft-delete dans checklist
        const actifs = (data as unknown as ChantierTerrasseItem[]).filter(
          (c) =>
            c.statut !== "corbeille" &&
            !(c.checklist as { corbeille?: unknown })?.corbeille
        );
        setChantiers(actifs);
      }

      // 2. Compter les chantiers actuellement placés dans la corbeille
      const corbeilleListe = await recupererChantiersCorbeilleTerrasse(supabase);
      setNbCorbeille(corbeilleListe.length);
    } catch (e) {
      console.error("Exception chargement chantiers terrasse :", e);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    chargerChantiers();
  }, [chargerChantiers]);

  async function handleConfirmerMiseEnCorbeille() {
    if (!chantierAMettreEnCorbeille) return;
    setMiseEnCorbeilleEnCours(true);
    try {
      await mettreChantierTerrasseEnCorbeille(supabase, chantierAMettreEnCorbeille.id);
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
    return chantiers.filter((c) => {
      // Filtre statut
      if (filtreStatut !== "tous" && c.statut !== filtreStatut) {
        return false;
      }
      // Filtre recherche
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
    <div className="-mt-4 -mb-12 -mx-4 sm:mx-0 min-h-screen bg-[#F3F3F1] text-[#23272B] selection:bg-[#D97732]/20 selection:text-[#B85B2B] px-4 py-6 sm:py-8 transition-colors">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {/* 1. Bannière d'en-tête (Identité BNA Météo) */}
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
                Chantiers Terrasse
              </h1>
              <p className="mt-1 text-xs sm:text-sm text-[#777777] max-w-2xl leading-relaxed">
                Espace dédié aux projets de terrasses : calepinage 2D/3D DTU 51.4, suivi des 6 phases normatives et pilotage d&apos;exécution.
              </p>
            </div>

            <div className="flex shrink-0 flex-wrap items-center gap-2.5">
              <button
                type="button"
                onClick={() => setCorbeilleOuverte(true)}
                className="inline-flex items-center gap-2 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white px-4 py-3 text-sm font-bold text-[#23272B] hover:text-[#B85B2B] hover:border-[#B85B2B]/40 transition-all shadow-xs"
                title="Accéder à la corbeille des chantiers terrasse"
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
                className="inline-flex items-center gap-2 rounded-xl bg-[#B85B2B] px-5 py-3 text-sm font-bold text-white shadow-sm transition-all hover:bg-[#D97732] active:scale-[0.98] focus:outline-none focus:ring-2 focus:ring-[#B85B2B]"
              >
                <Plus className="h-5 w-5" />
                <span>Nouveau Chantier Terrasse</span>
              </button>
            </div>
          </div>

          {/* Barre de recherche et filtres */}
          <div className="mt-6 flex flex-col gap-3 pt-5 border-t border-[#F0F0F0] sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher par nom, client, adresse..."
                className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] pl-10 pr-4 py-2.5 text-sm text-[#23272B] placeholder:text-[#999999] focus:border-[#B85B2B] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[#B85B2B]/20 transition-all"
              />
              <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-[#999999]" />
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
        </section>

        {/* 2. Grille des Chantiers Terrasse */}
        {loading ? (
          <div className="flex min-h-72 items-center justify-center rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-8 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#D97732] border-t-transparent" />
              <p className="text-sm font-medium text-[#777777]">
                Chargement des chantiers terrasse...
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
                ? "Aucun chantier terrasse pour le moment"
                : "Aucun résultat pour cette recherche"}
            </h3>
            <p className="mt-1 text-xs text-[#777777] max-w-md mx-auto">
              {chantiers.length === 0
                ? "Créez votre premier projet terrasse pour accéder au calepinage 2D/3D et au suivi complet des travaux."
                : "Modifiez vos filtres ou lancez une autre recherche."}
            </p>
            {chantiers.length === 0 && (
              <button
                type="button"
                onClick={() => setModalOuvert(true)}
                className="mt-5 inline-flex items-center gap-2 rounded-xl bg-[#B85B2B] hover:bg-[#D97732] active:scale-[0.98] px-5 py-2.5 text-xs font-bold text-white shadow-sm transition-all"
              >
                <Plus className="h-4 w-4" />
                Créer mon premier chantier terrasse
              </button>
            )}
          </section>
        ) : (
          <div className="grid grid-cols-1 min-[480px]:grid-cols-2 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {chantiersFiltres.map((c) => {
              const terrasseInfo = Array.isArray(c.chantier_terrasses)
                ? c.chantier_terrasses[0]
                : c.chantier_terrasses;
              const surfaceEstimee =
                terrasseInfo && terrasseInfo.longueur_m && terrasseInfo.largeur_m
                  ? (Number(terrasseInfo.longueur_m) * Number(terrasseInfo.largeur_m)).toFixed(1)
                  : null;

              return (
                <div
                  key={c.id}
                  className="group relative flex flex-col justify-between rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)] transition-all duration-200 hover:-translate-y-1 hover:border-[#B85B2B]/60 hover:shadow-[0_15px_35px_rgba(184,91,43,0.08)]"
                >
                  <div>
                    {/* Statut & badge terrasse */}
                    <div className="flex items-center justify-between gap-2 mb-3">
                      <span className="rounded-md border border-[#B85B2B]/20 bg-[#B85B2B]/10 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B85B2B]">
                        Terrasse DTU 51.4
                      </span>

                      <span
                        className={`rounded-full px-2.5 py-0.5 text-[11px] font-bold ${
                          c.statut === "termine"
                            ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                            : c.statut === "en_cours"
                            ? "bg-amber-50 text-amber-900 border border-amber-200"
                            : "bg-[#F8F9FA] text-[#777777] border border-[#E5E5E5]"
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
                    <h3 className="text-lg font-bold text-[#23272B] tracking-tight group-hover:text-[#B85B2B] transition-colors">
                      {c.nom || "Chantier Terrasse"}
                    </h3>

                    <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-[#777777]">
                      <User className="h-3.5 w-3.5 text-gray-400" />
                      <span>
                        {c.clients?.nom || "Client non associé"}{" "}
                        {c.clients?.societe ? `(${c.clients.societe})` : ""}
                      </span>
                    </p>

                    {/* Adresse */}
                    {c.adresse_chantier && (
                      <p className="mt-2 flex items-center gap-1.5 text-xs text-[#777777] truncate">
                        <MapPin className="h-3.5 w-3.5 text-[#B85B2B] shrink-0" />
                        <span className="truncate">{c.adresse_chantier}</span>
                      </p>
                    )}

                    {/* Surface & Essence */}
                    {surfaceEstimee && (
                      <div className="mt-3.5 flex items-center gap-2 rounded-xl bg-[#F8F9FA] px-3 py-1.5 border border-[#E5E5E5] text-xs">
                        <SlidersHorizontal className="h-3.5 w-3.5 text-[#B85B2B]" />
                        <span className="font-bold text-[#23272B]">{surfaceEstimee} m²</span>
                        <span className="text-[#CCCCCC]">·</span>
                        <span className="text-[#777777] capitalize">
                          {terrasseInfo?.essence_bois?.replace("_", " ") || "Bois sur plots"}
                        </span>
                      </div>
                    )}

                    {/* Planning / Démarrage — Zone dédiée claire */}
                    <div className="mt-3 flex items-center gap-1.5 text-xs font-medium text-[#777777]">
                      <Calendar className="h-3.5 w-3.5 text-gray-400 shrink-0" />
                      <span>
                        {c.date_debut
                          ? `Démarrage : ${new Date(c.date_debut).toLocaleDateString("fr-FR")}`
                          : "Dates à définir"}
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
                          setChantierAModifier(c);
                        }}
                        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white hover:border-[#B85B2B]/40 px-2.5 text-xs font-semibold text-[#23272B] hover:text-[#B85B2B] active:scale-[0.98] transition-all shadow-2xs group"
                        title="Modifier les informations du chantier terrasse"
                        aria-label={`Modifier ${c.nom || "le chantier terrasse"}`}
                      >
                        <Pencil className="h-3.5 w-3.5 text-gray-400 group-hover:text-[#B85B2B] shrink-0 transition-colors" />
                        <span className="truncate">Modifier</span>
                      </button>

                      {/* 2. Lien GPS Itinéraire réel (Google Maps Directions) — Style neutre */}
                      {c.adresse_chantier ? (
                        <a
                          href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(c.adresse_chantier)}&travelmode=driving`}
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
                          if (!c.code_acces) return;
                          const link = `${window.location.origin}/espace-client/${c.code_acces}`;
                          navigator.clipboard.writeText(link);
                          setCopiedId(c.id);
                          setTimeout(() => setCopiedId(null), 2000);
                        }}
                        disabled={!c.code_acces}
                        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white hover:border-[#B85B2B]/40 px-2.5 text-xs font-semibold text-[#777777] hover:text-[#23272B] active:scale-[0.98] transition-all shadow-2xs disabled:opacity-40 disabled:cursor-not-allowed"
                        title={c.code_acces ? "Copier le lien d'accès espace client" : "Code d'accès non généré"}
                      >
                        {copiedId === c.id ? (
                          <Check size={13} className="text-emerald-600 shrink-0" />
                        ) : (
                          <Copy size={13} className="text-gray-400 shrink-0" />
                        )}
                        <span className="truncate">{copiedId === c.id ? "Copié !" : "Lien client"}</span>
                      </button>

                      {/* 4. Bouton Corbeille — Traitement rouge doux avec libellé */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setChantierAMettreEnCorbeille(c);
                        }}
                        className="flex h-9 w-full items-center justify-center gap-1.5 rounded-xl border border-red-200/80 bg-red-50 text-red-500 hover:bg-red-100 hover:border-red-300 hover:text-red-700 active:scale-[0.98] transition-all shadow-2xs"
                        title="Mettre ce chantier à la corbeille"
                        aria-label={`Mettre à la corbeille ${c.nom || "le chantier"}`}
                      >
                        <Trash2 className="h-3.5 w-3.5 shrink-0" />
                        <span className="truncate">Corbeille</span>
                      </button>
                    </div>

                    {/* Action principale au poids visuel maîtrisé */}
                    <Link
                      href={`/terrain/terrasse/${c.id}`}
                      className="inline-flex h-9 w-full items-center justify-center gap-1.5 rounded-xl bg-[#23272B] px-3 text-xs font-bold text-white transition-all hover:bg-[#B85B2B] active:scale-[0.98] shadow-2xs"
                    >
                      <span>Ouvrir Hub Terrasse</span>
                      <ArrowRight className="h-3.5 w-3.5 shrink-0" />
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Modal de création */}
        <NouveauChantierTerrasseModal
          ouvert={modalOuvert}
          onFermer={() => setModalOuvert(false)}
          onSucces={(nouveauId) => {
            setModalOuvert(false);
            router.push(`/terrain/terrasse/${nouveauId}`);
          }}
        />

        {/* Modal Corbeille Terrasse */}
        <CorbeilleTerrasseModal
          ouvert={corbeilleOuverte}
          onFermer={() => setCorbeilleOuverte(false)}
          onActualiser={chargerChantiers}
        />

        {/* Modal Confirmation mise en corbeille */}
        {chantierAMettreEnCorbeille && (
          <ConfirmationSuppressionModal
            ouvert={Boolean(chantierAMettreEnCorbeille)}
            titre="Mettre ce chantier à la corbeille ?"
            message="Le chantier ne sera plus visible dans la liste active. Vous pourrez le restaurer à tout moment depuis la corbeille."
            nomChantier={chantierAMettreEnCorbeille.nom || "Chantier terrasse"}
            estDefinitif={false}
            enCours={miseEnCorbeilleEnCours}
            onConfirmer={handleConfirmerMiseEnCorbeille}
            onAnnuler={() => setChantierAMettreEnCorbeille(null)}
          />
        )}

        {/* Modal Modifier Chantier Terrasse */}
        {chantierAModifier && (
          <ModifierChantierTerrasseModal
            chantier={chantierAModifier}
            ouvert={Boolean(chantierAModifier)}
            onFermer={() => setChantierAModifier(null)}
            onSucces={(modifie) => {
              setChantiers((prev) =>
                prev.map((c) =>
                  c.id === modifie.id ? ({ ...c, ...modifie } as ChantierTerrasseItem) : c
                )
              );
              setChantierAModifier(null);
            }}
          />
        )}
      </div>
    </div>
  );
}

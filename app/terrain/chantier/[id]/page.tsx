"use client";

import React, { useState, useEffect, useCallback, useMemo, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Layers3,
  ArrowLeft,
  Calendar,
  MapPin,
  User,
  KeyRound,
  Copy,
  Check,
  ChevronRight,
  ShieldCheck,
  Building2,
  Clock,
  Sparkles,
  Home,
  FileSpreadsheet,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Materiau, Acces } from "@/lib/meteoAlerte";
import { composerAdresseDepart } from "@/lib/deplacement/adresse";
import type { ConfigTechnique } from "@/components/ZoneCard";

import BardageCardNavigation, {
  ModuleBardageKey,
} from "@/components/bardage/hub/BardageCardNavigation";
import BardageGeneralDeplacementsModule from "@/components/bardage/hub/BardageGeneralDeplacementsModule";
import BardageAvancementModule from "@/components/bardage/hub/BardageAvancementModule";
import BardageCalepinageModule from "@/components/bardage/hub/BardageCalepinageModule";
import BardageHeuresModule from "@/components/bardage/hub/BardageHeuresModule";
import BardageMeteoModule from "@/components/bardage/hub/BardageMeteoModule";
import BardagePhotosNotesModule from "@/components/bardage/hub/BardagePhotosNotesModule";
import BardageRapportClientModule from "@/components/bardage/hub/BardageRapportClientModule";
import BardageDocumentsModule from "@/components/bardage/hub/BardageDocumentsModule";

interface ChantierBardageDetail {
  id: string;
  nom: string | null;
  client_id: string;
  adresse_chantier: string | null;
  date_debut: string | null;
  date_fin: string | null;
  statut: string;
  code_acces: string | null;
  materiau_structurel: Materiau;
  moyen_acces: Acces;
  zone_vent: number;
  checklist: Record<string, boolean>;
  surface_m2?: number;
  quantite_coupes_ml?: number;
  singularites_nb?: number;
  type_isolant: "laine_roche" | "laine_verre" | "sans_isolant" | null;
  epaisseur_isolant_mm: number | null;
  surface_paquet_m2: number | null;
  zone_vent_rive: boolean | null;
  coef_perte_rendement: number | null;
  horaires: string | null;
  clients: { nom: string; societe?: string | null } | null;
}

const MODULE_TITRES: Record<ModuleBardageKey, string> = {
  general: "Général & Déplacements",
  avancement: "Avancement & Façades",
  calepinage: "Métrés & Calepinage Bardage",
  heures: "Heures & Pointages",
  meteo: "Météo & Intempéries",
  photos: "Photos & Notes",
  rapport: "Rapport Client",
  documents: "Documents & Facturation",
};

const MODULES_BARDAGE_VALIDES: readonly ModuleBardageKey[] = [
  "general",
  "avancement",
  "calepinage",
  "heures",
  "meteo",
  "photos",
  "rapport",
  "documents",
];

function validerCleModule(cle: string | null): ModuleBardageKey | null {
  if (!cle) return null;
  return MODULES_BARDAGE_VALIDES.includes(cle as ModuleBardageKey)
    ? (cle as ModuleBardageKey)
    : null;
}

function HubBardageContenu() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawId = params.id;
  const chantierId = Array.isArray(rawId) ? rawId[0] : (rawId ?? "");

  // Module actif (validé par rapport aux clés autorisées du Hub Bardage)
  const rawParam = searchParams.get("module");
  const moduleParam = useMemo(() => validerCleModule(rawParam), [rawParam]);
  const [moduleActif, setModuleActif] = useState<ModuleBardageKey | null>(moduleParam);

  const [chantier, setChantier] = useState<ChantierBardageDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [devisLikables, setDevisLikables] = useState<{ id: string; numero: string }[]>([]);

  // Adresse de départ par défaut du calcul de trajet, lue dans les Paramètres
  // (`entreprise_settings`, ligne `id = 1`). `null` tant que la lecture n'a pas
  // abouti, ET quand les Paramètres n'enregistrent aucune adresse : dans les
  // deux cas l'onglet Déplacements laisse le champ de départ vide.
  const [adresseDepartDefaut, setAdresseDepartDefaut] = useState<string | null>(null);

  // Indicateurs dynamiques pour les cartes du Hub
  const [totalHeures, setTotalHeures] = useState(0);

  // Synchronisation URL si le module change
  const selectionnerModule = useCallback(
    (cle: ModuleBardageKey | null) => {
      setModuleActif(cle);
      if (cle) {
        router.push(`/terrain/chantier/${chantierId}?module=${cle}`, { scroll: false });
      } else {
        router.push(`/terrain/chantier/${chantierId}`, { scroll: false });
      }
    },
    [chantierId, router]
  );

  useEffect(() => {
    setModuleActif(moduleParam);
  }, [moduleParam]);

  // Chargement de l'adresse par défaut entreprise (contrat test ui/FraisDeplacementTab)
  useEffect(() => {
    async function chargerAdresseEntreprise() {
      const { data } = await supabase
        .from("entreprise_settings")
        .select("adresse, code_postal, ville")
        .eq("id", 1)
        .maybeSingle();

      if (data) {
        setAdresseDepartDefaut(composerAdresseDepart(data) || null);
      }
    }
    chargerAdresseEntreprise();
  }, []);

  // Chargement des données du chantier Bardage
  const chargerChantier = useCallback(async () => {
    if (!chantierId) return;
    setLoading(true);

    try {
      const [resChantier, resDevis, resPointages] = await Promise.all([
        supabase
          .from("chantiers")
          .select("*, clients(nom, societe)")
          .eq("id", chantierId)
          .single(),
        supabase
          .from("devis")
          .select("id, numero")
          .eq("chantier_id", chantierId),
        supabase
          .from("pointages")
          .select("heures")
          .eq("chantier_id", chantierId),
      ]);

      if (resChantier.data) {
        const donnees = resChantier.data as unknown as ChantierBardageDetail & { metier?: string };
        // Protection multi-métier : si le chantier est de type Terrasse, rediriger immédiatement vers son Hub dédié
        if (donnees.metier === "terrasse") {
          router.replace(`/terrain/terrasse/${chantierId}`);
          return;
        }
        setChantier(donnees);
      }

      if (resDevis.data) {
        setDevisLikables(resDevis.data);
      }

      if (resPointages.data) {
        const total = resPointages.data.reduce((sum, p) => sum + (Number(p.heures) || 0), 0);
        setTotalHeures(total);
      }
    } catch (err) {
      console.error("Erreur chargement chantier bardage:", err);
    } finally {
      setLoading(false);
    }
  }, [chantierId]);

  useEffect(() => {
    chargerChantier();
  }, [chargerChantier]);

  // Calcul du pourcentage d'avancement préparatoire
  const avancementPct = useMemo(() => {
    if (!chantier) return 0;
    if (chantier.statut === "termine") return 100;
    const cl = chantier.checklist || {};
    const clValues = Object.values(cl);
    if (clValues.length === 0) return chantier.statut === "en_cours" ? 50 : 15;
    const valides = clValues.filter(Boolean).length;
    return Math.round((valides / clValues.length) * 100);
  }, [chantier]);

  // Configuration technique initiale (toujours appelée au top-level pour respecter l'ordre des hooks React)
  const configTechniqueInitiale = useMemo<ConfigTechnique>(() => {
    if (!chantier) {
      return {
        type_isolant: null,
        epaisseur_isolant_mm: null,
        surface_paquet_m2: null,
        zone_vent_rive: null,
        coef_perte_rendement: 1.10,
      };
    }
    return {
      type_isolant: chantier.type_isolant ?? null,
      epaisseur_isolant_mm: chantier.epaisseur_isolant_mm ?? null,
      surface_paquet_m2: chantier.surface_paquet_m2 ?? null,
      zone_vent_rive: chantier.zone_vent_rive ?? null,
      coef_perte_rendement:
        chantier.coef_perte_rendement === 1.8 ? 1.10 : (chantier.coef_perte_rendement ?? 1.10),
    };
  }, [
    chantier?.type_isolant,
    chantier?.epaisseur_isolant_mm,
    chantier?.surface_paquet_m2,
    chantier?.zone_vent_rive,
    chantier?.coef_perte_rendement,
  ]);

  // Synchronisation idempotente des surfaces pour éviter toute boucle de re-render
  const handleSurfacesSync = useCallback((surf: number, coupes: number, sing: number) => {
    setChantier((prev) => {
      if (!prev) return null;
      if (
        prev.surface_m2 === surf &&
        prev.quantite_coupes_ml === coupes &&
        prev.singularites_nb === sing
      ) {
        return prev;
      }
      return {
        ...prev,
        surface_m2: surf,
        quantite_coupes_ml: coupes,
        singularites_nb: sing,
      };
    });
  }, []);

  const handleConfigSaved = useCallback((nouvelleConfig: ConfigTechnique) => {
    setChantier((prev) => {
      if (!prev) return null;
      if (
        prev.type_isolant === nouvelleConfig.type_isolant &&
        prev.epaisseur_isolant_mm === nouvelleConfig.epaisseur_isolant_mm &&
        prev.surface_paquet_m2 === nouvelleConfig.surface_paquet_m2 &&
        prev.zone_vent_rive === nouvelleConfig.zone_vent_rive &&
        prev.coef_perte_rendement === nouvelleConfig.coef_perte_rendement
      ) {
        return prev;
      }
      return {
        ...prev,
        type_isolant: nouvelleConfig.type_isolant,
        epaisseur_isolant_mm: nouvelleConfig.epaisseur_isolant_mm,
        surface_paquet_m2: nouvelleConfig.surface_paquet_m2,
        zone_vent_rive: nouvelleConfig.zone_vent_rive,
        coef_perte_rendement: nouvelleConfig.coef_perte_rendement,
      };
    });
  }, []);

  function handleCopierCode() {
    if (!chantier?.code_acces) return;
    navigator.clipboard.writeText(chantier.code_acces);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  if (loading) {
    return (
      <div className="-mt-4 -mb-12 -mx-4 sm:mx-0 min-h-screen bg-[#F3F3F1] text-[#23272B] px-4 py-6 sm:py-8 transition-colors">
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex min-h-72 items-center justify-center rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-8 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#B85B2B] border-t-transparent" />
              <p className="text-sm font-medium text-[#777777]">
                Chargement du Hub Bardage...
              </p>
            </div>
          </div>
        </div>
      </div>
    );
  }

  if (!chantier) {
    return (
      <div className="-mt-4 -mb-12 -mx-4 sm:mx-0 min-h-screen bg-[#F3F3F1] text-[#23272B] px-4 py-6 sm:py-8 transition-colors">
        <div className="mx-auto w-full max-w-5xl">
          <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-10 sm:p-12 text-center shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
            <h3 className="text-lg font-bold text-[#23272B]">Chantier Bardage introuvable</h3>
            <p className="mt-1 text-xs text-[#777777]">
              Ce chantier n&apos;existe pas ou a été archivé.
            </p>
            <Link
              href="/terrain/chantier"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#B85B2B] hover:bg-[#D97732] active:scale-[0.98] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Retour à la liste des chantiers</span>
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="-mt-4 -mb-12 -mx-4 sm:mx-0 min-h-screen bg-[#F3F3F1] text-[#23272B] selection:bg-[#B85B2B]/20 selection:text-[#B85B2B] px-4 py-6 sm:py-8 transition-colors">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {/* 1. En-tête Général du Hub Chantier Bardage */}
        <header className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
          {/* Ligne 1 : Navigation retour & Fil d'ariane */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#F0F0F0] pb-3 text-xs">
            <Link
              href="/terrain/chantier"
              className="inline-flex items-center gap-2 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white hover:border-[#B85B2B]/40 px-3.5 py-1.5 text-xs font-bold text-[#23272B] hover:text-[#B85B2B] transition-all shadow-xs"
              title="Retour à la liste des chantiers"
            >
              <Home className="h-4 w-4 text-[#B85B2B]" />
              <span>Accueil chantier</span>
            </Link>

            {moduleActif ? (
              <div className="flex items-center gap-1.5 font-semibold text-[#777777]">
                <button
                  type="button"
                  onClick={() => selectionnerModule(null)}
                  className="hover:text-[#B85B2B] transition-colors cursor-pointer"
                  title="Revenir aux 8 cartes du Hub"
                >
                  Hub Bardage
                </button>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="font-bold text-[#B85B2B]">{MODULE_TITRES[moduleActif]}</span>
              </div>
            ) : (
              <span className="rounded-full border border-[#B85B2B]/20 bg-[#B85B2B]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#B85B2B]">
                Hub Chantier Bardage · Vue d&apos;ensemble
              </span>
            )}
          </div>

          {/* Ligne 2 : Identité du chantier, client, statut */}
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
                  <Building2 className="h-5 w-5" />
                </span>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-[#23272B]">
                  {chantier.nom || chantier.clients?.nom || "Chantier Bardage"}
                </h1>
                <span
                  className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                    chantier.statut === "termine"
                      ? "bg-emerald-50 text-emerald-800 border border-emerald-200"
                      : chantier.statut === "en_cours"
                      ? "bg-amber-50 text-amber-900 border border-amber-200"
                      : "bg-[#F8F9FA] text-[#777777] border border-[#E5E5E5]"
                  }`}
                >
                  {chantier.statut === "termine"
                    ? "Terminé"
                    : chantier.statut === "en_cours"
                    ? "En cours"
                    : "Prévu"}
                </span>
              </div>

              <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-[#777777]">
                <span className="flex items-center gap-1 font-semibold text-[#23272B]">
                  <User className="h-3.5 w-3.5 text-gray-400" />
                  {chantier.clients?.nom || "Client inconnu"}{" "}
                  {chantier.clients?.societe ? `(${chantier.clients.societe})` : ""}
                </span>

                {chantier.adresse_chantier && (
                  <span className="flex items-center gap-1 text-[#777777]">
                    <MapPin className="h-3.5 w-3.5 text-[#B85B2B]" />
                    {chantier.adresse_chantier}
                  </span>
                )}

                {chantier.date_debut && (
                  <span className="flex items-center gap-1 text-[#777777]">
                    <Calendar className="h-3.5 w-3.5 text-gray-400" />
                    Du {new Date(chantier.date_debut).toLocaleDateString("fr-FR")}{" "}
                    {chantier.date_fin ? `au ${new Date(chantier.date_fin).toLocaleDateString("fr-FR")}` : ""}
                  </span>
                )}
              </div>
            </div>

            {/* Raccourci code portail client & jauge rapide */}
            <div className="flex flex-wrap items-center gap-3">
              {chantier.code_acces && (
                <button
                  type="button"
                  onClick={handleCopierCode}
                  className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white px-3 py-1.5 text-xs font-semibold text-[#23272B] hover:border-[#B85B2B] transition-colors"
                  title="Copier le code client"
                >
                  <KeyRound className="h-3.5 w-3.5 text-[#B85B2B]" />
                  <span>Code : {chantier.code_acces}</span>
                  {copiedCode ? (
                    <Check className="h-3.5 w-3.5 text-emerald-600" />
                  ) : (
                    <Copy className="h-3.5 w-3.5 text-gray-400" />
                  )}
                </button>
              )}

              <div className="rounded-xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 px-3.5 py-1.5 text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#777777]">Avancement</p>
                <p className="text-xs font-bold text-[#B85B2B]">{avancementPct}% validé</p>
              </div>
            </div>
          </div>

          {/* Si un module est actif : bandeau de retour immédiat vers les cartes du Hub */}
          {moduleActif && (
            <div className="mt-5 pt-4 border-t border-[#F0F0F0] flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={() => selectionnerModule(null)}
                className="inline-flex items-center gap-2 rounded-xl bg-[#23272B] hover:bg-[#B85B2B] active:scale-[0.98] px-4 py-2.5 text-xs font-bold text-white transition-all shadow-sm cursor-pointer"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>← Retour à la navigation par cartes du Hub</span>
              </button>

              <div className="flex items-center gap-3">
                {/* Raccourci devis (présent pour contrat test ia-devis-metre) */}
                <Link
                  href={`/bureau/devis-factures?chantier_id=${encodeURIComponent(chantier.id)}`}
                  className="hidden sm:inline-flex items-center gap-1.5 text-xs font-bold text-[#777777] hover:text-[#B85B2B] transition-colors"
                >
                  <FileSpreadsheet size={13} />
                  <span>Devis associé</span>
                </Link>

                <span className="text-xs font-bold text-[#B85B2B]">
                  Espace actif : {MODULE_TITRES[moduleActif]}
                </span>
              </div>
            </div>
          )}
        </header>

        {/* 2. Corps du Hub : Cartes de navigation OU Module actif */}
        <main>
          {!moduleActif ? (
            /* VUE D'ENSEMBLE DU HUB : NAVIGATION PRINCIPALE PAR 8 CARTES */
            <BardageCardNavigation
              onSelectionnerModule={(cle) => selectionnerModule(cle)}
              avancementPct={avancementPct}
              phaseEnCours={chantier.statut === "termine" ? "Terminé" : "En cours"}
              surfaceM2={chantier.surface_m2 || 0}
              totalHeures={totalHeures}
              devisCount={devisLikables.length}
            />
          ) : (
            /* VUE D'UN MODULE SÉLECTIONNÉ */
            <div>
              {moduleActif === "general" && (
                <BardageGeneralDeplacementsModule
                  chantierId={chantier.id}
                  nom={chantier.nom || "Chantier Bardage"}
                  clientId={chantier.client_id}
                  clientNom={chantier.clients?.nom}
                  adresseChantier={chantier.adresse_chantier}
                  dateDebut={chantier.date_debut}
                  dateFin={chantier.date_fin}
                  statut={chantier.statut}
                  codeAcces={chantier.code_acces}
                  materiauStructurel={chantier.materiau_structurel}
                  moyenAcces={chantier.moyen_acces}
                  zoneVent={chantier.zone_vent}
                  checklist={chantier.checklist}
                  devisLikables={devisLikables}
                  adresseDepartDefaut={adresseDepartDefaut}
                  onChantierMisAJour={chargerChantier}
                />
              )}

              {moduleActif === "avancement" && (
                <BardageAvancementModule
                  chantierId={chantier.id}
                  checklist={chantier.checklist}
                  onChantierMisAJour={chargerChantier}
                />
              )}

              {moduleActif === "calepinage" && (
                <BardageCalepinageModule
                  chantierId={chantier.id}
                  chantierNom={chantier.nom || chantier.clients?.nom || "Chantier"}
                  zoneVent={chantier.zone_vent}
                  initialConfigTechnique={configTechniqueInitiale}
                  onSurfacesSync={handleSurfacesSync}
                  onConfigSaved={handleConfigSaved}
                />
              )}

              {moduleActif === "heures" && (
                <BardageHeuresModule
                  chantierId={chantier.id}
                  chantierNom={chantier.nom || chantier.clients?.nom || "Chantier"}
                  surfaceM2={chantier.surface_m2 || 0}
                  coupesMl={chantier.quantite_coupes_ml || 0}
                  singularitesNb={chantier.singularites_nb || 0}
                />
              )}

              {moduleActif === "meteo" && (
                <BardageMeteoModule
                  chantierId={chantier.id}
                  adresseChantier={chantier.adresse_chantier}
                  materiauStructurel={chantier.materiau_structurel}
                  moyenAcces={chantier.moyen_acces}
                  horaires={chantier.horaires}
                />
              )}

              {moduleActif === "photos" && (
                <BardagePhotosNotesModule chantierId={chantier.id} />
              )}

              {moduleActif === "rapport" && (
                <BardageRapportClientModule chantierId={chantier.id} />
              )}

              {moduleActif === "documents" && (
                <BardageDocumentsModule
                  chantierId={chantier.id}
                  chantierNom={chantier.nom || chantier.clients?.nom || "Chantier"}
                  clientId={chantier.client_id}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function ChantierDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-72 items-center justify-center p-8 text-center text-sm text-[#777777] bg-transparent">
          Chargement du Hub Chantier...
        </div>
      }
    >
      <div className="bg-transparent">
        <HubBardageContenu />
      </div>
    </Suspense>
  );
}

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
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import TerrasseCardNavigation, {
  ModuleTerrasseKey,
} from "@/components/terrasse/hub/TerrasseCardNavigation";
import TerrasseGeneralDeplacementsModule from "@/components/terrasse/hub/TerrasseGeneralDeplacementsModule";
import TerrasseAvancementModule from "@/components/terrasse/hub/TerrasseAvancementModule";
import TerrasseCalepinageModule from "@/components/terrasse/hub/TerrasseCalepinageModule";
import TerrasseHeuresModule from "@/components/terrasse/hub/TerrasseHeuresModule";
import TerrasseMeteoModule from "@/components/terrasse/hub/TerrasseMeteoModule";
import TerrassePhotosNotesModule from "@/components/terrasse/hub/TerrassePhotosNotesModule";
import TerrasseRapportClientModule from "@/components/terrasse/hub/TerrasseRapportClientModule";
import TerrasseDocumentsModule from "@/components/terrasse/hub/TerrasseDocumentsModule";

interface ChantierTerrasseDetail {
  id: string;
  nom: string | null;
  client_id: string;
  adresse_chantier: string | null;
  date_debut: string | null;
  date_fin: string | null;
  statut: string;
  code_acces: string | null;
  contact_chantier: string | null;
  notes_terrain: string | null;
  checklist: Record<string, unknown> | null;
  clients: { nom: string; societe: string | null } | null;
  chantier_terrasses?:
    | {
        id: string;
        nom: string;
        longueur_m: number;
        largeur_m: number;
        essence_bois: string;
        systeme_terrasse: string;
        resultats_techniques?: unknown;
      }
    | {
        id: string;
        nom: string;
        longueur_m: number;
        largeur_m: number;
        essence_bois: string;
        systeme_terrasse: string;
        resultats_techniques?: unknown;
      }[]
    | null;
}

const MODULE_TITRES: Record<ModuleTerrasseKey, string> = {
  general: "Général & Déplacements",
  avancement: "Avancement & 6 Phases DTU 51.4",
  calepinage: "Calepinage Terrasse Pro 2D/3D",
  heures: "Heures & Pointages d'Intervention",
  meteo: "Météo & Intempéries Site",
  photos: "Photos & Notes de Chantier",
  rapport: "Rapport Client Automatisé",
  documents: "Documents & Facturation",
};

function HubTerrasseContenu() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawId = params.id;
  const chantierId = Array.isArray(rawId) ? rawId[0] : (rawId ?? "");

  // Module actif (lu depuis l'URL ou null pour la vue des cartes du Hub)
  const moduleParam = searchParams.get("module") as ModuleTerrasseKey | null;
  const [moduleActif, setModuleActif] = useState<ModuleTerrasseKey | null>(moduleParam);

  const [chantier, setChantier] = useState<ChantierTerrasseDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);
  const [devisLikables, setDevisLikables] = useState<{ id: string; numero: string }[]>([]);

  // Indicateurs dynamiques pour les cartes
  const [avancementPct, setAvancementPct] = useState(0);
  const [phaseEnCours, setPhaseEnCours] = useState("Support & Implantation");
  const [totalHeures, setTotalHeures] = useState(0);

  // Synchronisation URL si le module change
  const selectionnerModule = useCallback(
    (cle: ModuleTerrasseKey | null) => {
      setModuleActif(cle);
      if (cle) {
        router.push(`/terrain/terrasse/${chantierId}?module=${cle}`, { scroll: false });
      } else {
        router.push(`/terrain/terrasse/${chantierId}`, { scroll: false });
      }
    },
    [chantierId, router]
  );

  useEffect(() => {
    setModuleActif(moduleParam);
  }, [moduleParam]);

  // Chargement des données du chantier
  const chargerChantier = useCallback(async () => {
    if (!chantierId) return;
    setLoading(true);

    try {
      const [resChantier, resDevis] = await Promise.all([
        supabase
          .from("chantiers")
          .select("*, clients(nom, societe), chantier_terrasses(*)")
          .eq("id", chantierId)
          .single(),
        supabase
          .from("devis")
          .select("id, numero")
          .eq("chantier_id", chantierId),
      ]);

      if (resChantier.data) {
        const c = resChantier.data as unknown as ChantierTerrasseDetail;
        setChantier(c);

        // Calculer l'avancement depuis checklist.phases_dtu
        if (c.checklist && typeof c.checklist === "object") {
          const phasesMap = (c.checklist as { phases_dtu?: Record<string, { statut: string }> })
            ?.phases_dtu;
          if (phasesMap) {
            const vals = Object.values(phasesMap);
            const termine = vals.filter((p) => p.statut === "termine").length;
            const enCours = vals.filter((p) => p.statut === "en_cours").length;
            const pct = Math.round(((termine + enCours * 0.5) / 6) * 100);
            setAvancementPct(pct);
          }
        }
      }

      if (resDevis.data) {
        setDevisLikables(resDevis.data);
      }
    } catch (err) {
      console.error("Erreur chargement chantier terrasse:", err);
    } finally {
      setLoading(false);
    }
  }, [chantierId]);

  useEffect(() => {
    chargerChantier();
  }, [chargerChantier]);

  function handleCopierCode() {
    if (!chantier?.code_acces) return;
    navigator.clipboard.writeText(chantier.code_acces);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  const terrasseInfo = Array.isArray(chantier?.chantier_terrasses)
    ? chantier.chantier_terrasses[0]
    : (chantier?.chantier_terrasses as any);
  const surfaceCalculee = terrasseInfo && terrasseInfo.longueur_m && terrasseInfo.largeur_m
    ? Number((Number(terrasseInfo.longueur_m) * Number(terrasseInfo.largeur_m)).toFixed(1))
    : 24.0;

  if (loading) {
    return (
      <div className="-mt-4 -mb-12 -mx-4 sm:mx-0 min-h-screen bg-[#F3F3F1] text-[#23272B] px-4 py-6 sm:py-8 transition-colors">
        <div className="mx-auto w-full max-w-5xl">
          <div className="flex min-h-72 items-center justify-center rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-8 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
            <div className="flex flex-col items-center gap-3">
              <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#D97732] border-t-transparent" />
              <p className="text-sm font-medium text-[#777777]">
                Chargement du Hub Terrasse...
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
            <h3 className="text-lg font-bold text-[#23272B]">Chantier Terrasse introuvable</h3>
            <p className="mt-1 text-xs text-[#777777]">
              Ce chantier n&apos;existe pas ou a été archivé.
            </p>
            <Link
              href="/terrain/terrasse"
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-[#B85B2B] hover:bg-[#D97732] active:scale-[0.98] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour à la liste des chantiers terrasse
            </Link>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="-mt-4 -mb-12 -mx-4 sm:mx-0 min-h-screen bg-[#F3F3F1] text-[#23272B] selection:bg-[#D97732]/20 selection:text-[#B85B2B] px-4 py-6 sm:py-8 transition-colors">
      <div className="mx-auto w-full max-w-5xl space-y-6">
        {/* 1. En-tête Général du Hub Terrasse (Identité Météo) */}
        <header className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
          {/* Ligne 1 : Navigation retour & Fil d'ariane */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2 border-b border-[#F0F0F0] pb-3 text-xs">
            <Link
              href="/terrain/terrasse"
              className="inline-flex items-center gap-2 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white hover:border-[#B85B2B]/40 px-3.5 py-1.5 text-xs font-bold text-[#23272B] hover:text-[#B85B2B] transition-all shadow-xs"
              title="Retour à la page d'accueil des chantiers Terrasse"
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
                  Hub Terrasse
                </button>
                <ChevronRight className="h-3.5 w-3.5" />
                <span className="font-bold text-[#B85B2B]">{MODULE_TITRES[moduleActif]}</span>
              </div>
            ) : (
              <span className="rounded-full border border-[#B85B2B]/20 bg-[#B85B2B]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#B85B2B]">
                Hub Chantier Terrasse · Vue d&apos;ensemble
              </span>
            )}
          </div>

          {/* Ligne 2 : Identité du chantier, client, statut */}
          <div className="flex flex-col gap-4 md:flex-row md:items-start md:justify-between">
            <div>
              <div className="flex flex-wrap items-center gap-2.5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
                  <Layers3 className="h-5 w-5" />
                </span>
                <h1 className="text-xl sm:text-2xl md:text-3xl font-bold tracking-tight text-[#23272B]">
                  {chantier.nom || "Chantier Terrasse"}
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
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#777777]">Avancement DTU</p>
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
                className="inline-flex items-center gap-2 rounded-xl bg-[#23272B] hover:bg-[#B85B2B] active:scale-[0.98] px-4 py-2.5 text-xs font-bold text-white transition-all shadow-sm"
              >
                <ArrowLeft className="h-4 w-4" />
                <span>← Retour à la navigation par cartes du Hub</span>
              </button>

              <span className="text-xs font-bold text-[#B85B2B]">
                Espace actif : {MODULE_TITRES[moduleActif]}
              </span>
            </div>
          )}
        </header>

        {/* 2. Corps du Hub : Cartes de navigation OU Module actif */}
        <main>
          {!moduleActif ? (
            /* VUE D'ENSEMBLE DU HUB : NAVIGATION PRINCIPALE PAR CARTES (Zéro onglet horizontal) */
            <TerrasseCardNavigation
              onSelectionnerModule={(cle) => selectionnerModule(cle)}
              avancementPct={avancementPct}
              phaseEnCours={phaseEnCours}
              surfaceM2={surfaceCalculee}
              totalHeures={totalHeures}
              devisCount={devisLikables.length}
            />
          ) : (
            /* VUE D'UN MODULE SÉLECTIONNÉ */
            <div>
              {moduleActif === "general" && (
                <TerrasseGeneralDeplacementsModule
                  chantierId={chantier.id}
                  nom={chantier.nom || "Chantier Terrasse"}
                  clientId={chantier.client_id}
                  clientNom={chantier.clients?.nom}
                  adresseChantier={chantier.adresse_chantier}
                  dateDebut={chantier.date_debut}
                  dateFin={chantier.date_fin}
                  statut={chantier.statut}
                  codeAcces={chantier.code_acces}
                  contactChantier={chantier.contact_chantier}
                  notesTerrain={chantier.notes_terrain}
                  devisLikables={devisLikables}
                  onChantierMisAJour={chargerChantier}
                />
              )}

              {moduleActif === "avancement" && (
                <TerrasseAvancementModule
                  chantierId={chantier.id}
                  checklistActuelle={chantier.checklist}
                  onAvancementMisAJour={(pct, ph) => {
                    setAvancementPct(pct);
                    setPhaseEnCours(ph);
                  }}
                />
              )}

              {moduleActif === "calepinage" && (
                <TerrasseCalepinageModule
                  chantierId={chantier.id}
                  chantierNom={chantier.nom || "Chantier Terrasse"}
                  clientNom={chantier.clients?.nom}
                />
              )}

              {moduleActif === "heures" && (
                <TerrasseHeuresModule
                  chantierId={chantier.id}
                  onTotalHeuresChange={(h) => setTotalHeures(h)}
                />
              )}

              {moduleActif === "meteo" && (
                <TerrasseMeteoModule
                  chantierId={chantier.id}
                  adresseChantier={chantier.adresse_chantier}
                />
              )}

              {moduleActif === "photos" && (
                <TerrassePhotosNotesModule chantierId={chantier.id} />
              )}

              {moduleActif === "rapport" && (
                <TerrasseRapportClientModule chantierId={chantier.id} />
              )}

              {moduleActif === "documents" && (
                <TerrasseDocumentsModule
                  chantierId={chantier.id}
                  chantierNom={chantier.nom || "Chantier Terrasse"}
                  clientId={chantier.client_id}
                  clientNom={chantier.clients?.nom}
                  surfaceM2={surfaceCalculee}
                />
              )}
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function HubChantierTerrassePage() {
  return (
    <Suspense
      fallback={
        <div className="-mt-4 -mb-12 -mx-4 sm:mx-0 min-h-screen bg-[#F3F3F1] text-[#23272B] px-4 py-6 sm:py-8 transition-colors">
          <div className="mx-auto w-full max-w-5xl">
            <div className="flex min-h-72 items-center justify-center rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-8 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
              <div className="flex flex-col items-center gap-3">
                <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#D97732] border-t-transparent" />
                <p className="text-sm font-medium text-[#777777]">
                  Initialisation du Hub Terrasse...
                </p>
              </div>
            </div>
          </div>
        </div>
      }
    >
      <HubTerrasseContenu />
    </Suspense>
  );
}

"use client";

import React, { useState, useEffect, useCallback, Suspense } from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import Link from "next/link";
import {
  Fence,
  ArrowLeft,
  Calendar,
  MapPin,
  User,
  KeyRound,
  Copy,
  Check,
  ChevronRight,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import ClotureCardNavigation, {
  type ModuleClotureKey,
} from "@/components/cloture/hub/ClotureCardNavigation";
import ClotureAvancementModule from "@/components/cloture/hub/ClotureAvancementModule";
import ClotureCalepinageModule from "@/components/cloture/hub/ClotureCalepinageModule";
import TerrasseGeneralDeplacementsModule from "@/components/terrasse/hub/TerrasseGeneralDeplacementsModule";
import TerrasseHeuresModule from "@/components/terrasse/hub/TerrasseHeuresModule";
import TerrasseMeteoModule from "@/components/terrasse/hub/TerrasseMeteoModule";
import TerrassePhotosNotesModule from "@/components/terrasse/hub/TerrassePhotosNotesModule";
import TerrasseRapportClientModule from "@/components/terrasse/hub/TerrasseRapportClientModule";
import TerrasseDocumentsModule from "@/components/terrasse/hub/TerrasseDocumentsModule";

interface ChantierClotureDetail {
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
}

const MODULE_TITRES: Record<ModuleClotureKey, string> = {
  general: "Général & Déplacements",
  avancement: "Avancement & Tronçons",
  calepinage: "Métrés & Calepinage Clôture",
  heures: "Heures & Pointages",
  meteo: "Météo & Intempéries",
  photos: "Photos & Notes",
  rapport: "Rapport Client",
  documents: "Documents & Facturation",
};

function HubClotureContenu() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();

  const rawId = params.id;
  const chantierId = Array.isArray(rawId) ? rawId[0] : (rawId ?? "");

  const moduleParam = searchParams.get("module") as ModuleClotureKey | null;
  const [moduleActif, setModuleActif] = useState<ModuleClotureKey | null>(moduleParam);
  const [chantier, setChantier] = useState<ChantierClotureDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [copiedCode, setCopiedCode] = useState(false);

  const [avancementPct, setAvancementPct] = useState(0);
  const [phaseEnCours, setPhaseEnCours] = useState("Implantation");
  const [lineaireTotalM, setLineaireTotalM] = useState(0);
  const [totalHeures, setTotalHeures] = useState(0);
  const [devisCount, setDevisCount] = useState(0);
  const [photosCount, setPhotosCount] = useState(0);

  const chargerChantier = useCallback(async () => {
    if (!chantierId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("chantiers")
        .select("*, clients(nom, societe)")
        .eq("id", chantierId)
        .eq("metier", "cloture")
        .single();

      if (error || !data) {
        router.replace("/terrain/cloture");
        return;
      }

      const detail = data as unknown as ChantierClotureDetail;
      setChantier(detail);

      const cl = detail.checklist ?? {};
      const cles = ["implantation", "poteaux_scellement", "lames_panneaux", "portillon_finitions"];
      const faites = cles.filter((k) => Boolean(cl[k])).length;
      setAvancementPct(Math.round((faites / cles.length) * 100));

      const [pointagesRes, devisRes] = await Promise.all([
        supabase.from("pointages").select("heures").eq("chantier_id", chantierId),
        supabase.from("devis").select("id", { count: "exact", head: true }).eq("chantier_id", chantierId),
      ]);
      if (pointagesRes.data) {
        setTotalHeures(pointagesRes.data.reduce((s, p) => s + (Number(p.heures) || 0), 0));
      }
      if (devisRes.count != null) setDevisCount(devisRes.count);
    } finally {
      setLoading(false);
    }
  }, [chantierId, router]);

  useEffect(() => {
    chargerChantier();
  }, [chargerChantier]);

  const selectionnerModule = (cle: ModuleClotureKey | null) => {
    setModuleActif(cle);
    const url = cle ? `/terrain/cloture/${chantierId}?module=${cle}` : `/terrain/cloture/${chantierId}`;
    router.replace(url, { scroll: false });
  };

  if (loading || !chantier) {
    return (
      <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
        <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#B85B2B] border-t-transparent" />
      </div>
    );
  }

  const nomClient = chantier.clients?.societe || chantier.clients?.nom || "Client";

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#23272B] p-4 sm:p-6">
      <div className="mx-auto max-w-7xl space-y-6">
        {/* Fil d'Ariane + En-tête blanc */}
        <section className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.04)]">
          <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2 text-xs text-[#777777]">
              <Link
                href="/terrain/cloture"
                className="inline-flex items-center gap-1 font-bold text-[#B85B2B] hover:underline"
              >
                <ArrowLeft className="h-3.5 w-3.5" /> Chantiers Clôture
              </Link>
              <ChevronRight className="h-3.5 w-3.5" />
              <span className="font-semibold text-[#23272B]">
                {chantier.nom || "Hub Clôture"}
              </span>
              {moduleActif && (
                <>
                  <ChevronRight className="h-3.5 w-3.5" />
                  <span className="font-bold text-[#B85B2B]">
                    {MODULE_TITRES[moduleActif]}
                  </span>
                </>
              )}
            </div>

            {moduleActif && (
              <button
                type="button"
                onClick={() => selectionnerModule(null)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white px-3 py-1.5 text-xs font-bold text-[#23272B]"
              >
                <ArrowLeft className="h-3.5 w-3.5 text-[#B85B2B]" /> Retour aux 8 modules
              </button>
            )}
          </div>

          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-3.5">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#B85B2B]/10 border border-[#B85B2B]/20 text-[#B85B2B]">
                <Fence className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl sm:text-2xl font-extrabold text-[#23272B]">
                  {chantier.nom || "Chantier Clôture"}
                </h1>
                <div className="mt-1 flex flex-wrap items-center gap-3 text-xs text-[#666666]">
                  <span className="inline-flex items-center gap-1 font-semibold text-[#23272B]">
                    <User className="h-3.5 w-3.5 text-[#B85B2B]" /> {nomClient}
                  </span>
                  {chantier.adresse_chantier && (
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-[#999999]" /> {chantier.adresse_chantier}
                    </span>
                  )}
                  {chantier.date_debut && (
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="h-3.5 w-3.5 text-[#999999]" />
                      {new Date(chantier.date_debut).toLocaleDateString("fr-FR")}
                    </span>
                  )}
                </div>
              </div>
            </div>

            {chantier.code_acces && (
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(
                    `${window.location.origin}/espace-client/${chantier.code_acces}`
                  );
                  setCopiedCode(true);
                  setTimeout(() => setCopiedCode(false), 2500);
                }}
                className="inline-flex items-center gap-2 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3.5 py-2 text-xs font-bold text-[#23272B]"
              >
                <KeyRound className="h-3.5 w-3.5 text-[#B85B2B]" />
                <span className="font-mono">{chantier.code_acces}</span>
                {copiedCode ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-[#999999]" />
                )}
              </button>
            )}
          </div>
        </section>

        {/* Contenu : Grille 8 modules ou module actif */}
        {!moduleActif ? (
          <ClotureCardNavigation
            onSelectionnerModule={selectionnerModule}
            avancementPct={avancementPct}
            phaseEnCours={phaseEnCours}
            lineaireTotalM={lineaireTotalM}
            totalHeures={totalHeures}
            devisCount={devisCount}
            photosCount={photosCount}
          />
        ) : moduleActif === "general" ? (
          <TerrasseGeneralDeplacementsModule
            chantierId={chantier.id}
            nom={chantier.nom || "Chantier Clôture"}
            clientId={chantier.client_id}
            clientNom={nomClient}
            adresseChantier={chantier.adresse_chantier}
            dateDebut={chantier.date_debut}
            dateFin={chantier.date_fin}
            statut={chantier.statut}
            codeAcces={chantier.code_acces}
            contactChantier={chantier.contact_chantier}
            notesTerrain={chantier.notes_terrain}
            onChantierMisAJour={chargerChantier}
          />
        ) : moduleActif === "avancement" ? (
          <ClotureAvancementModule
            chantierId={chantier.id}
            checklistInitiale={chantier.checklist}
            onAvancementChange={(pct, phase) => {
              setAvancementPct(pct);
              setPhaseEnCours(phase);
            }}
          />
        ) : moduleActif === "calepinage" ? (
          <ClotureCalepinageModule
            chantierId={chantier.id}
            onLineaireChange={(ml) => setLineaireTotalM(ml)}
          />
        ) : moduleActif === "heures" ? (
          <TerrasseHeuresModule
            chantierId={chantier.id}
            onTotalHeuresChange={(h) => setTotalHeures(h)}
          />
        ) : moduleActif === "meteo" ? (
          <TerrasseMeteoModule
            chantierId={chantier.id}
            adresseChantier={chantier.adresse_chantier}
          />
        ) : moduleActif === "photos" ? (
          <TerrassePhotosNotesModule chantierId={chantier.id} />
        ) : moduleActif === "rapport" ? (
          <TerrasseRapportClientModule chantierId={chantier.id} />
        ) : (
          <TerrasseDocumentsModule
            chantierId={chantier.id}
            chantierNom={chantier.nom || "Chantier Clôture"}
            clientId={chantier.client_id}
            clientNom={nomClient}
          />
        )}
      </div>
    </div>
  );
}

export default function HubChantierCloturePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#F8F9FA] flex items-center justify-center p-6">
          <div className="h-10 w-10 animate-spin rounded-full border-3 border-[#B85B2B] border-t-transparent" />
        </div>
      }
    >
      <HubClotureContenu />
    </Suspense>
  );
}

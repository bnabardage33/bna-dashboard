"use client";

// components/RapportClient.tsx
// Onglet "Rapport Client" du Chantier Détail (Hub Bardage & Hub Terrasse).
// ------------------------------------------------------------
// Génère le rapport hebdo (POST /api/rapports-client/generer),
// liste les rapports existants, affiche l'aperçu du snapshot figé,
// permet d'éditer le SEUL champ modifiable (message_patron) et
// d'envoyer le rapport au client (statut -> 'envoye').
// ------------------------------------------------------------

import { useCallback, useEffect, useState } from "react";
import Image from "next/image";
import { supabase } from "@/lib/supabase";
import type { Json } from "@/types/supabase";
import RapportClientPrint, {
  type EntrepriseRapport,
} from "@/components/rapports/RapportClientPrint";
import {
  analyserSnapshot,
  formatDateFr,
  preparerEtImprimer,
  EMOJI_VIGILANCE,
  FACADES,
  STYLES_PRINT_RAPPORT,
  type SnapshotContenu,
  type FacadeId,
} from "@/lib/rapports-client";
import { type FacadeConfig } from "@/lib/bardage/facadesConfig";
import {
  Loader2,
  RefreshCw,
  Send,
  AlertTriangle,
  CheckCircle2,
  Pencil,
  Printer,
  X,
} from "lucide-react";

// Niveaux officiels Météo-France (couleurs). Toute autre valeur de
// `vigilance_max` — dont la sentinelle « indisponible » — n'est PAS un vert.
const NIVEAUX_VIGILANCE = new Set(["vert", "jaune", "orange", "rouge"]);

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type RapportBrut = {
  id: string;
  chantier_id: string | null;
  semaine_label: string;
  statut: string;
  envoye_le: string | null;
  created_at: string | null;
  date_debut: string;
  date_fin: string;
  contenu: Json;
};

type ReponseGenerer = {
  success?: boolean;
  error?: string;
  rapport?: {
    id?: string;
    semaine_label?: string | null;
    statut?: string | null;
  } | null;
};

// -----------------------------------------------------------------------------
// Helpers de style clair BNA
// -----------------------------------------------------------------------------

function statutFacadeClair(n: number): {
  label: string;
  cardClass: string;
  textClass: string;
} {
  if (n >= 4) {
    return {
      label: "Terminée",
      cardClass: "border-emerald-200 bg-emerald-50/70",
      textClass: "text-emerald-800 font-bold",
    };
  }
  if (n > 0) {
    return {
      label: "En cours",
      cardClass: "border-amber-200 bg-amber-50/70",
      textClass: "text-amber-800 font-bold",
    };
  }
  return {
    label: "À commencer",
    cardClass: "border-[#E5E5E5] bg-[#F8F9FA]",
    textClass: "text-[#777777]",
  };
}

// -----------------------------------------------------------------------------
// Composant principal
// -----------------------------------------------------------------------------

export default function RapportClient({ chantierId }: { chantierId: string }) {
  const [rapports, setRapports] = useState<RapportBrut[]>([]);
  const [chargementListe, setChargementListe] = useState(true);
  const [idSelectionne, setIdSelectionne] = useState<string | null>(null);
  const [generationEnCours, setGenerationEnCours] = useState(false);
  const [rapport409, setRapport409] = useState<ReponseGenerer["rapport"]>(null);
  const [messageErreur, setMessageErreur] = useState<string | null>(null);

  const [motPatron, setMotPatron] = useState("");
  const [sauvegardeEnCours, setSauvegardeEnCours] = useState(false);
  const [statutSauvegarde, setStatutSauvegarde] = useState<"idle" | "ok" | "erreur">("idle");

  const [modaleEnvoiOuverte, setModaleEnvoiOuverte] = useState(false);
  const [envoiEnCours, setEnvoiEnCours] = useState(false);

  const [entreprise, setEntreprise] = useState<EntrepriseRapport | null>(null);
  const [apercu, setApercu] = useState<{ titre: string; snapshot: SnapshotContenu } | null>(
    null
  );

  const [facadesConfig, setFacadesConfig] = useState<FacadeConfig[] | null>(null);

  const rapportSelectionne =
    rapports.find((r) => r.id === idSelectionne) ?? null;

  const snapshotSelectionne = rapportSelectionne
    ? analyserSnapshot(rapportSelectionne.contenu)
    : null;

  const estEnvoye = rapportSelectionne?.statut === "envoye";

  const chargerRapports = useCallback(async () => {
    const { data, error } = await supabase
      .from("rapports_client")
      .select("*")
      .eq("chantier_id", chantierId)
      .order("date_fin", { ascending: false });

    if (error) {
      setMessageErreur(`Erreur chargement des rapports : ${error.message}`);
      setRapports([]);
      return;
    }

    setRapports(data ?? []);
  }, [chantierId]);

  useEffect(() => {
    chargerRapports().finally(() => setChargementListe(false));
  }, [chargerRapports]);

  useEffect(() => {
    supabase
      .from("entreprise_settings")
      .select("raison_sociale, logo_url, adresse, code_postal, ville, mentions_legales")
      .eq("id", 1)
      .maybeSingle()
      .then(({ data }) => {
        if (data) setEntreprise(data);
      });
  }, []);

  // Charger la configuration des façades dynamiques du chantier si existante
  useEffect(() => {
    supabase
      .from("chantiers")
      .select("checklist")
      .eq("id", chantierId)
      .maybeSingle()
      .then(({ data }) => {
        if (data?.checklist && typeof data.checklist === "object") {
          const chk = data.checklist as { facades_config?: FacadeConfig[] };
          if (Array.isArray(chk.facades_config) && chk.facades_config.length > 0) {
            setFacadesConfig(chk.facades_config);
          }
        }
      });
  }, [chantierId]);

  // La liste change -> on garde une sélection valide, sinon la plus récente.
  useEffect(() => {
    if (rapports.length === 0) {
      setIdSelectionne(null);
      return;
    }
    if (!rapports.some((r) => r.id === idSelectionne)) {
      setIdSelectionne(rapports[0].id);
    }
  }, [rapports, idSelectionne]);

  // Initialisation du champ "mot du patron" à chaque changement de rapport.
  useEffect(() => {
    const r = rapports.find((x) => x.id === idSelectionne) ?? null;
    const snapshot = r ? analyserSnapshot(r.contenu) : null;
    setMotPatron(snapshot?.communication.message_patron ?? "");
    setStatutSauvegarde("idle");
  }, [idSelectionne, rapports]);

  async function envoyerGenerer(): Promise<boolean> {
    setMessageErreur(null);
    setRapport409(null);

    try {
      const reponse = await fetch("/api/rapports-client/generer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ chantier_id: chantierId }),
      });

      const donnees = (await reponse.json().catch(() => null)) as ReponseGenerer | null;

      if (reponse.ok && donnees?.success) {
        await chargerRapports();
        if (donnees.rapport?.id) setIdSelectionne(donnees.rapport.id);
        return true;
      }

      if (reponse.status === 409 && donnees?.rapport?.id) {
        setRapport409(donnees.rapport);
      } else {
        setMessageErreur(donnees?.error ?? "Impossible de générer le rapport.");
      }

      return false;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      setMessageErreur(`Erreur réseau : ${message}`);
      return false;
    }
  }

  async function generer() {
    setGenerationEnCours(true);
    await envoyerGenerer();
    setGenerationEnCours(false);
  }

  async function regenerer() {
    const id409 = rapport409?.id;
    if (!id409) return;
    setGenerationEnCours(true);
    setMessageErreur(null);

    const { error: erreurSuppression } = await supabase
      .from("rapports_client")
      .delete()
      .eq("id", id409);

    if (erreurSuppression) {
      setMessageErreur(`Suppression impossible : ${erreurSuppression.message}`);
      setGenerationEnCours(false);
      return;
    }

    await chargerRapports();
    await envoyerGenerer();
    setGenerationEnCours(false);
  }

  async function sauvegarderMotPatron() {
    const r = rapportSelectionne;
    const snapshot = snapshotSelectionne;
    if (!r || !snapshot) return;

    setSauvegardeEnCours(true);

    const contenuMaj: SnapshotContenu = {
      ...snapshot,
      communication: {
        ...snapshot.communication,
        message_patron: motPatron.trim() === "" ? null : motPatron.trim(),
      },
    };

    const { error } = await supabase
      .from("rapports_client")
      .update({ contenu: contenuMaj })
      .eq("id", r.id);

    setSauvegardeEnCours(false);

    if (error) {
      setStatutSauvegarde("erreur");
      setMessageErreur(`Enregistrement impossible : ${error.message}`);
      return;
    }

    setStatutSauvegarde("ok");
    await chargerRapports();
  }

  function ouvrirModaleEnvoi() {
    if (!rapportSelectionne || !snapshotSelectionne) return;

    const mot = motPatron.trim();
    if (mot === "") {
      setMessageErreur("Ajoutez un mot personnel avant l'envoi.");
      return;
    }

    setMessageErreur(null);
    setModaleEnvoiOuverte(true);
  }

  async function confirmerEnvoi() {
    const r = rapportSelectionne;
    const snapshot = snapshotSelectionne;
    if (!r || !snapshot) return;

    setEnvoiEnCours(true);

    const contenuMaj: SnapshotContenu = {
      ...snapshot,
      communication: {
        ...snapshot.communication,
        message_patron: motPatron.trim() === "" ? null : motPatron.trim(),
      },
    };

    const { error } = await supabase
      .from("rapports_client")
      .update({
        contenu: contenuMaj,
        statut: "envoye",
        envoye_le: new Date().toISOString(),
      })
      .eq("id", r.id);

    setEnvoiEnCours(false);

    if (error) {
      setMessageErreur(`Envoi impossible : ${error.message}`);
      return;
    }

    setModaleEnvoiOuverte(false);
    setMessageErreur(null);
    await chargerRapports();
  }

  // Liste des façades actives : dynamique si configurée sur le chantier, sinon par défaut
  const listeFacadesAffichees =
    facadesConfig && facadesConfig.length > 0
      ? facadesConfig
      : FACADES;

  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Message d'erreur global */}
      {messageErreur && (
        <div className="flex items-start gap-2.5 rounded-2xl border border-rose-200 bg-rose-50/80 p-4 text-xs text-rose-800">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-rose-600" />
          <div className="flex-1 space-y-2">
            <p className="font-semibold">{messageErreur}</p>

            {rapport409 && (
              <button
                type="button"
                onClick={regenerer}
                disabled={generationEnCours}
                className="inline-flex items-center gap-1.5 rounded-xl bg-rose-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-rose-700 active:scale-98 transition-all disabled:opacity-50 shadow-2xs"
              >
                {generationEnCours ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5" />
                )}
                Régénérer le rapport de la semaine passée
              </button>
            )}
          </div>
        </div>
      )}

      {/* Action principale : générer le rapport */}
      <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="space-y-0.5">
            <h3 className="text-sm sm:text-base font-bold text-[#23272B]">
              Rapport hebdomadaire client
            </h3>
            <p className="text-xs text-[#777777]">
              Fige un snapshot de la semaine passée (lundi → dimanche) puis envoyez-le au client.
            </p>
          </div>

          <button
            type="button"
            onClick={generer}
            disabled={generationEnCours}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[#B85B2B] px-4 sm:px-5 text-xs sm:text-sm font-bold text-white shadow-sm hover:bg-[#9C4B23] active:scale-98 transition-all disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generationEnCours ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>Génération en cours…</span>
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                <span>Générer le rapport de la semaine passée</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* Liste des rapports existants */}
      <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-bold uppercase tracking-wider text-[#23272B]">
            Rapports existants ({rapports.length})
          </p>
          {rapports.length > 0 && (
            <span className="text-2xs font-semibold text-[#777777]">
              Sélectionnez un rapport pour le consulter
            </span>
          )}
        </div>

        {chargementListe ? (
          <div className="flex items-center justify-center gap-2 py-6 text-xs text-[#777777]">
            <Loader2 className="h-4 w-4 animate-spin text-[#B85B2B]" />
            <span>Chargement des rapports…</span>
          </div>
        ) : rapports.length === 0 ? (
          <div className="rounded-xl border border-dashed border-[#E5E5E5] bg-[#F8F9FA] p-6 text-center text-xs text-[#777777]">
            Aucun rapport généré. Cliquez sur « Générer le rapport de la semaine passée » pour commencer.
          </div>
        ) : (
          <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
            {rapports.map((r) => {
              const actif = r.id === idSelectionne;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setIdSelectionne(r.id)}
                  className={`rounded-xl border p-3.5 text-left transition-all duration-150 ${
                    actif
                      ? "border-[#B85B2B] bg-[#FFF7ED]/70 shadow-xs ring-1 ring-[#B85B2B]/30"
                      : "border-[#E5E5E5] bg-white hover:border-[#B85B2B]/40 hover:bg-[#F8F9FA]"
                  }`}
                >
                  <p
                    className={`truncate text-xs sm:text-sm font-bold transition-colors ${
                      actif ? "text-[#B85B2B]" : "text-[#23272B]"
                    }`}
                  >
                    {r.semaine_label}
                  </p>
                  <div className="mt-2 flex items-center justify-between gap-2">
                    <span
                      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-2xs font-bold border ${
                        r.statut === "envoye"
                          ? "bg-emerald-50 border-emerald-200 text-emerald-800"
                          : "bg-amber-50 border-amber-200 text-amber-800"
                      }`}
                    >
                      <span
                        className={`h-1.5 w-1.5 rounded-full ${
                          r.statut === "envoye" ? "bg-emerald-600" : "bg-amber-600"
                        }`}
                      />
                      {r.statut === "envoye" ? "Envoyé" : "Brouillon"}
                    </span>
                    <span className="text-2xs font-semibold font-mono text-[#777777]">
                      {formatDateFr(r.created_at)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Aperçu du rapport sélectionné */}
      {rapportSelectionne && snapshotSelectionne && (
        <div className="space-y-4">
          {/* En-tête du rapport sélectionné */}
          <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="space-y-1">
                <h3 className="text-sm sm:text-base font-bold text-[#23272B]">
                  {snapshotSelectionne.periode.semaine || rapportSelectionne.semaine_label}
                </h3>
                {estEnvoye ? (
                  <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 text-2xs font-bold text-emerald-800">
                    <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                    <span>Envoyé le {formatDateFr(rapportSelectionne.envoye_le)}</span>
                  </div>
                ) : (
                  <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 border border-amber-200 px-2.5 py-0.5 text-2xs font-semibold text-amber-800">
                    <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
                    Brouillon — lecture seule pour le client après envoi
                  </span>
                )}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setApercu({
                      titre: rapportSelectionne.semaine_label,
                      snapshot: snapshotSelectionne,
                    })
                  }
                  className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-white px-3.5 py-2 text-xs font-bold text-[#23272B] hover:bg-[#F8F9FA] hover:border-[#B85B2B]/40 hover:text-[#B85B2B] shadow-2xs transition-colors active:scale-98"
                >
                  <Printer className="h-3.5 w-3.5 text-[#B85B2B]" />
                  Aperçu PDF
                </button>

                {!estEnvoye && (
                  <button
                    type="button"
                    onClick={sauvegarderMotPatron}
                    disabled={sauvegardeEnCours}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-white px-3.5 py-2 text-xs font-bold text-[#23272B] hover:bg-[#F8F9FA] hover:border-[#B85B2B]/40 hover:text-[#B85B2B] shadow-2xs transition-colors active:scale-98 disabled:opacity-50"
                  >
                    {sauvegardeEnCours ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin text-[#B85B2B]" />
                    ) : (
                      <Pencil className="h-3.5 w-3.5 text-[#B85B2B]" />
                    )}
                    Enregistrer
                  </button>
                )}

                {!estEnvoye && (
                  <button
                    type="button"
                    onClick={ouvrirModaleEnvoi}
                    disabled={envoiEnCours}
                    className="inline-flex h-9 items-center gap-1.5 rounded-xl bg-[#B85B2B] px-4 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#9C4B23] active:scale-98 transition-all disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {envoiEnCours ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Send className="h-3.5 w-3.5" />
                    )}
                    Envoyer au client
                  </button>
                )}
              </div>
            </div>

            {estEnvoye && (
              <p className="mt-2.5 text-xs text-[#777777] border-t border-[#F0F0F0] pt-2">
                Ce rapport a été transmis au client. Il est désormais figé en lecture seule.
              </p>
            )}
          </div>

          {/* Avertissement si mot du patron vide */}
          {!estEnvoye && motPatron.trim() === "" && (
            <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50/70 p-3 text-xs text-amber-900">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
              <span>Ajoutez un mot personnel avant l&apos;envoi au client.</span>
            </div>
          )}

          {/* Indicateurs de synthèse : Delta, Avancement global et Temps */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
              <p className="text-3xs sm:text-2xs font-bold uppercase tracking-wider text-[#777777]">
                Avancement période
              </p>
              <p className="mt-1 text-2xl sm:text-3xl font-black text-[#B85B2B]">
                {snapshotSelectionne.avancement.delta > 0 ? "+" : ""}
                {snapshotSelectionne.avancement.delta.toFixed(0)}%
              </p>
              <p className="mt-0.5 text-xs text-[#777777]">
                {snapshotSelectionne.avancement.pct_debut.toFixed(0)}% →{" "}
                {snapshotSelectionne.avancement.pct_fin.toFixed(0)}%
              </p>
            </div>

            <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
              <p className="text-3xs sm:text-2xs font-bold uppercase tracking-wider text-[#777777]">
                Avancement global
              </p>
              <p className="mt-1 text-2xl sm:text-3xl font-black text-[#23272B]">
                {snapshotSelectionne.avancement.pct_fin.toFixed(0)}%
              </p>
              <p className="mt-0.5 text-xs text-[#777777]">
                {snapshotSelectionne.avancement.cases_cochees} case(s) cochée(s)
              </p>
            </div>

            <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)]">
              <p className="text-3xs sm:text-2xs font-bold uppercase tracking-wider text-[#777777]">
                Temps de la semaine
              </p>
              <p className="mt-1 text-2xl sm:text-3xl font-black text-[#23272B]">
                {snapshotSelectionne.pointages.total_heures.toFixed(1)} h
              </p>
              <p className="mt-0.5 text-xs text-[#777777]">
                {snapshotSelectionne.pointages.jours_pointes} jour(s) travaillé(s)
              </p>
            </div>
          </div>

          {/* Suivi des Façades (Façades dynamiques adaptées) */}
          <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-xs font-bold uppercase tracking-wider text-[#23272B]">
                Suivi des Façades
              </p>
              <span className="text-3xs font-semibold text-[#777777]">
                4 étapes techniques par façade
              </span>
            </div>

            <div
              className={`grid gap-2.5 ${
                listeFacadesAffichees.length === 1
                  ? "grid-cols-1"
                  : listeFacadesAffichees.length === 2
                  ? "grid-cols-1 sm:grid-cols-2"
                  : listeFacadesAffichees.length === 3
                  ? "grid-cols-1 sm:grid-cols-3"
                  : "grid-cols-2 sm:grid-cols-4"
              }`}
            >
              {listeFacadesAffichees.map((f) => {
                const compteur =
                  snapshotSelectionne.avancement.facades[f.id as FacadeId] ?? 0;
                const statut = statutFacadeClair(compteur);

                return (
                  <div
                    key={f.id}
                    className={`rounded-xl border p-3 text-center transition-colors ${statut.cardClass}`}
                  >
                    <p className="text-xs font-bold text-[#23272B] truncate">{f.label}</p>
                    <p className={`mt-1 text-2xs font-semibold ${statut.textClass}`}>
                      {statut.label} · {compteur}/4
                    </p>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Photos de la semaine */}
          <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-3">
            <p className="text-xs font-bold uppercase tracking-wider text-[#23272B]">
              Photos de la semaine
            </p>
            {snapshotSelectionne.photos.length === 0 ? (
              <div className="rounded-xl border border-dashed border-[#E5E5E5] bg-[#F8F9FA] p-6 text-center text-xs text-[#777777]">
                Aucune photo prise cette semaine.
              </div>
            ) : (
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
                {snapshotSelectionne.photos.map((photo, index) => (
                  <a
                    key={`${photo.url}-${index}`}
                    href={photo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative block rounded-xl overflow-hidden border border-[#E5E5E5] bg-[#F8F9FA] p-1.5 transition-all hover:border-[#B85B2B]/40 hover:shadow-sm"
                  >
                    <Image
                      src={photo.url}
                      alt={photo.legende || "Photo de chantier"}
                      width={320}
                      height={180}
                      className="aspect-video w-full rounded-lg object-cover transition-transform group-hover:scale-[1.02]"
                    />
                    <span className="mt-1.5 block truncate text-xs font-medium text-[#555555] px-1">
                      {photo.legende ||
                        (photo.date ? `Photo du ${formatDateFr(photo.date)}` : "Photo de chantier")}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </div>

          {/* Météo & Intempéries */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Météo relevée */}
            <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#23272B]">
                Météo relevée
              </p>
              {snapshotSelectionne.pointages.meteo_relevee.length === 0 ? (
                <p className="text-xs text-[#777777] italic">Aucun relevé météo cette semaine.</p>
              ) : (
                <div className="flex flex-wrap gap-1.5">
                  {snapshotSelectionne.pointages.meteo_relevee.map((m) => (
                    <span
                      key={m}
                      className="rounded-full border border-[#E5E5E5] bg-[#F8F9FA] px-2.5 py-1 text-2xs font-semibold text-[#23272B]"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
              <p className="text-xs text-[#777777] border-t border-[#F0F0F0] pt-2">
                {snapshotSelectionne.pointages.nb_pointages} pointage(s) · Coef météo moyen :{" "}
                <span className="font-semibold text-[#23272B]">
                  {snapshotSelectionne.pointages.coef_meteo_moyen ?? "—"}
                </span>
              </p>
            </div>

            {/* Intempéries & Arrêts */}
            <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-[#23272B]">
                  Intempéries &amp; Arrêts
                </p>
                {snapshotSelectionne.intemperies.vigilance_max &&
                  (NIVEAUX_VIGILANCE.has(snapshotSelectionne.intemperies.vigilance_max) ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#23272B]">
                      {EMOJI_VIGILANCE[snapshotSelectionne.intemperies.vigilance_max]}
                      <span className="capitalize">{snapshotSelectionne.intemperies.vigilance_max}</span>
                    </span>
                  ) : (
                    <span className="rounded-full border border-[#E5E5E5] bg-[#F8F9FA] px-2 py-0.5 text-3xs font-semibold uppercase text-[#777777]">
                      Vigilance indisponible
                    </span>
                  ))}
              </div>

              {snapshotSelectionne.intemperies.jours_arret_total === 0 ? (
                <p className="text-xs text-[#777777] italic">
                  Aucune interruption météo constatée cette semaine.
                </p>
              ) : (
                <div className="space-y-2">
                  <div>
                    <p className="text-2xl font-black text-[#B85B2B]">
                      {snapshotSelectionne.intemperies.jours_arret_total} jour(s)
                    </p>
                    <p className="text-xs text-[#777777]">d&apos;arrêt lié à la météo</p>
                  </div>

                  <div className="space-y-1.5 pt-1">
                    {snapshotSelectionne.intemperies.details
                      .filter((j) => j.jour_arrete)
                      .map((j) => (
                        <div
                          key={j.date}
                          className="rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] p-2.5 text-xs text-[#23272B]"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-bold text-[#23272B]">{j.date}</span>
                            <span>{EMOJI_VIGILANCE[j.vigilance] ?? "⚪"}</span>
                          </div>
                          <p className="mt-1 line-clamp-2 text-xs text-[#555555]">{j.motif}</p>
                        </div>
                      ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Observations & Mot du patron pour le client */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {/* Observations de la semaine */}
            <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-2.5">
              <p className="text-xs font-bold uppercase tracking-wider text-[#23272B]">
                Observations de la semaine
              </p>
              {snapshotSelectionne.communication.observations ? (
                <div className="rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] p-3.5">
                  <p className="whitespace-pre-wrap text-xs sm:text-sm text-[#23272B] leading-relaxed">
                    {snapshotSelectionne.communication.observations}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-[#777777] italic">Aucune observation enregistrée.</p>
              )}
            </div>

            {/* Mot du patron pour le client */}
            <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4 sm:p-5 shadow-[0_2px_8px_rgba(0,0,0,0.03)] space-y-2.5">
              <div className="flex items-center justify-between">
                <p className="text-xs font-bold uppercase tracking-wider text-[#23272B]">
                  Mot du patron pour le client
                </p>
                {estEnvoye && (
                  <span className="text-3xs font-semibold text-[#777777]">
                    Lecture seule
                  </span>
                )}
              </div>
              <textarea
                value={motPatron}
                onChange={(e) => {
                  setMotPatron(e.target.value);
                  setStatutSauvegarde("idle");
                }}
                disabled={estEnvoye}
                rows={4}
                placeholder="Un mot personnel pour accompagner ce rapport…"
                className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3.5 py-2.5 text-xs sm:text-sm text-[#23272B] placeholder-[#999999] focus:border-[#B85B2B] focus:bg-white focus:outline-none focus:ring-1 focus:ring-[#B85B2B]/30 disabled:bg-[#F0F0F0] disabled:text-[#777777] disabled:cursor-not-allowed transition-all"
              />
              {statutSauvegarde === "ok" && (
                <p className="text-xs font-semibold text-emerald-700">✓ Mot enregistré avec succès.</p>
              )}
              {statutSauvegarde === "erreur" && (
                <p className="text-xs font-semibold text-rose-600">✕ Échec de l&apos;enregistrement.</p>
              )}
              {estEnvoye && (
                <p className="text-xs text-[#777777]">
                  Ce message est figé car le rapport a déjà été transmis au client.
                </p>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modale de confirmation d'envoi */}
      {modaleEnvoiOuverte && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="envoi-modal-title"
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs animate-in fade-in duration-150"
        >
          <div
            className="w-full max-w-md rounded-2xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[#B85B2B]/10 border border-[#B85B2B]/20 text-[#B85B2B]">
                  <Send className="h-5 w-5" />
                </div>
                <div>
                  <h3
                    id="envoi-modal-title"
                    className="text-base font-bold text-[#23272B]"
                  >
                    Envoyer le rapport au client ?
                  </h3>
                  <p className="text-xs text-[#777777]">
                    Transmission officielle du compte-rendu hebdomadaire
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => !envoiEnCours && setModaleEnvoiOuverte(false)}
                disabled={envoiEnCours}
                className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 transition-colors disabled:opacity-50"
                aria-label="Fermer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="rounded-xl border border-slate-100 bg-[#F9F9F8] p-3.5 text-xs text-[#555555] space-y-1.5">
              <p>
                Le rapport <strong className="font-bold text-[#23272B]">{rapportSelectionne?.semaine_label}</strong> sera transmis au client avec votre mot personnalisé.
              </p>
              <p className="text-[#B85B2B] font-semibold">
                ⚠️ Une fois envoyé, ce rapport passera définitivement en lecture seule.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setModaleEnvoiOuverte(false)}
                disabled={envoiEnCours}
                className="h-10 px-4 rounded-xl border border-[#E5E5E5] bg-white text-xs font-semibold text-[#555555] hover:bg-slate-50 transition-colors disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmerEnvoi}
                disabled={envoiEnCours}
                className="inline-flex h-10 items-center justify-center gap-2 px-4 rounded-xl bg-[#B85B2B] text-xs font-bold text-white hover:bg-[#9C4B23] active:scale-98 transition-all disabled:opacity-50 shadow-sm"
              >
                {envoiEnCours ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Envoi en cours…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4" />
                    Confirmer l&apos;envoi
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Overlay : aperçu PDF (rendu clair client) */}
      {apercu && (
        <div className="fixed inset-0 z-[220] overflow-y-auto bg-slate-900/80 p-4 sm:p-6 print:overflow-visible print:bg-white print:p-0 backdrop-blur-xs">
          <style>{STYLES_PRINT_RAPPORT}</style>

          <div className="mx-auto mb-4 flex max-w-[860px] items-center justify-between gap-3 print:hidden bg-white/95 backdrop-blur-sm rounded-2xl p-4 border border-[#E5E5E5] shadow-lg">
            <p className="text-sm font-bold text-[#23272B]">{apercu.titre}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void preparerEtImprimer();
                }}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#B85B2B] px-4 py-2 text-xs font-bold text-white hover:bg-[#9C4B23] shadow-sm transition-all"
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimer / Export PDF
              </button>
              <button
                type="button"
                onClick={() => setApercu(null)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-white px-3.5 py-2 text-xs font-semibold text-[#555555] hover:bg-slate-50 transition-colors"
              >
                <X className="h-3.5 w-3.5" />
                Fermer
              </button>
            </div>
          </div>

          <RapportClientPrint
            snapshot={apercu.snapshot}
            semaineLabel={apercu.titre}
            entreprise={entreprise}
          />
        </div>
      )}
    </div>
  );
}

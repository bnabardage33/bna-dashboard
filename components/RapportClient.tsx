"use client";

// components/RapportClient.tsx
// Onglet "Rapport Client" du Chantier Détail.
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
  statutFacade,
  EMOJI_VIGILANCE,
  FACADES,
  STYLES_PRINT_RAPPORT,
  type SnapshotContenu,
} from "@/lib/rapports-client";
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
import { Surface } from '@/components/ui/Surface';

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

  // ---------------------------------------------------------------------------

  return (
    <div className="space-y-4">
      {/* Message d'erreur global */}
      {messageErreur && (
        <div className="flex items-start gap-2 rounded-xl border border-red-500/30 bg-red-950/10 p-3 text-sm text-red-400">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="flex-1">
            <p>{messageErreur}</p>

            {rapport409 && (
              <button
                type="button"
                onClick={regenerer}
                disabled={generationEnCours}
                className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-700 disabled:opacity-50"
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

      {/* Action principale : générer */}
      <Surface className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Rapport hebdomadaire client</h3>
            <p className="mt-0.5 text-xs text-gray-400">
              Fige un snapshot de la semaine passée (lundi → dimanche) puis envoyez-le au
              client.
            </p>
          </div>

          <button
            type="button"
            onClick={generer}
            disabled={generationEnCours}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white shadow-md transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {generationEnCours ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Génération en cours…
              </>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                Générer le rapport de la semaine passée
              </>
            )}
          </button>
        </div>
      </Surface>

      {/* Liste des rapports */}
      <Surface className="p-4">
        <p className="mb-3 text-xs font-semibold uppercase tracking-wide text-slate-400">
          Rapports existants ({rapports.length})
        </p>

        {chargementListe ? (
          <p className="text-sm text-gray-400">Chargement des rapports…</p>
        ) : rapports.length === 0 ? (
          <p className="rounded-lg border border-dashed border-white/10 p-4 text-xs text-gray-500">
            Aucun rapport généré. Cliquez sur « Générer le rapport de la semaine passée » pour
            commencer.
          </p>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {rapports.map((r) => {
              const actif = r.id === idSelectionne;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setIdSelectionne(r.id)}
                  className={`rounded-lg border p-3 text-left transition-colors ${
                    actif
                      ? "border-red-600/60 bg-red-600/10"
                      : "border-white/10 bg-[#0B0F19]/50 hover:border-white/25"
                  }`}
                >
                  <p className="truncate text-xs font-semibold text-white">{r.semaine_label}</p>
                  <div className="mt-1.5 flex items-center justify-between gap-2">
                    <span
                      className={`rounded-full px-2 py-0.5 text-2xs font-semibold uppercase ${
                        r.statut === "envoye"
                          ? "bg-emerald-500/15 text-emerald-300"
                          : "bg-amber-500/15 text-amber-300"
                      }`}
                    >
                      {r.statut === "envoye" ? "Envoyé" : "Brouillon"}
                    </span>
                    <span className="text-2xs text-gray-500">
                      {formatDateFr(r.created_at)}
                    </span>
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </Surface>

      {/* Aperçu du rapport sélectionné */}
      {rapportSelectionne && snapshotSelectionne && (
        <div className="space-y-4">
          {/* En-tête du rapport */}
          <Surface className="p-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white">
                  {snapshotSelectionne.periode.semaine || rapportSelectionne.semaine_label}
                </h3>
                {estEnvoye ? (
                  <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-3xs font-semibold text-emerald-300">
                    <CheckCircle2 className="h-3.5 w-3.5" />
                    Envoyé le {formatDateFr(rapportSelectionne.envoye_le)}
                  </div>
                ) : (
                  <span className="mt-1 inline-flex rounded-full bg-amber-500/15 px-2.5 py-0.5 text-3xs font-semibold text-amber-300">
                    Brouillon — lecture seule pour le client après envoi
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() =>
                    setApercu({
                      titre: rapportSelectionne.semaine_label,
                      snapshot: snapshotSelectionne,
                    })
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-white/5"
                >
                  <Printer className="h-3.5 w-3.5" />
                  Aperçu PDF
                </button>

                {!estEnvoye && (
                  <button
                    type="button"
                    onClick={sauvegarderMotPatron}
                    disabled={sauvegardeEnCours}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-white/5 disabled:opacity-50"
                  >
                    {sauvegardeEnCours ? (
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    ) : (
                      <Pencil className="h-3.5 w-3.5" />
                    )}
                    Enregistrer
                  </button>
                )}

                {!estEnvoye && (
                  <button
                    type="button"
                    onClick={ouvrirModaleEnvoi}
                    disabled={envoiEnCours}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-md transition-colors hover:bg-red-700 disabled:cursor-not-allowed disabled:opacity-50"
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
              <p className="mt-2 text-xs text-gray-500">
                Rapport envoyé : aperçu en lecture seule.
              </p>
            )}
          </Surface>

          {/* Avertissement si mot du patron vide */}
          {!estEnvoye && motPatron.trim() === "" && (
            <div className="flex items-start gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3 text-xs text-amber-300">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              Ajoutez un mot personnel avant l&apos;envoi.
            </div>
          )}

          {/* Delta d'avancement */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <Surface className="p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Avancement période</p>
              <p className="mt-1 text-3xl font-black text-white">
                {snapshotSelectionne.avancement.delta > 0 ? "+" : ""}
                {snapshotSelectionne.avancement.delta.toFixed(0)}%
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {snapshotSelectionne.avancement.pct_debut.toFixed(0)}% →{" "}
                {snapshotSelectionne.avancement.pct_fin.toFixed(0)}%
              </p>
            </Surface>

            <Surface className="p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Avancement global</p>
              <p className="mt-1 text-3xl font-black text-white">
                {snapshotSelectionne.avancement.pct_fin.toFixed(0)}%
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                {snapshotSelectionne.avancement.cases_cochees} case(s) cochée(s)
              </p>
            </Surface>

            <Surface className="p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Temps de la semaine</p>
              <p className="mt-1 text-3xl font-black text-white">
                {snapshotSelectionne.pointages.total_heures.toFixed(1)}
              </p>
              <p className="mt-0.5 text-xs text-gray-500">
                h · {snapshotSelectionne.pointages.jours_pointes} jour(s) travaillé(s)
              </p>
            </Surface>
          </div>

          {/* Badges façades */}
          <Surface className="p-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-gray-400">Façades</p>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FACADES.map((f) => {
                const compteur = snapshotSelectionne.avancement.facades[f.id];
                const statut = statutFacade(compteur);
                return (
                  <div
                    key={f.id}
                    className={`rounded-lg px-3 py-2 text-center ${statut.className}`}
                  >
                    <p className="text-3xs font-semibold">{f.label}</p>
                    <p className="text-2xs opacity-70">
                      {statut.label} · {compteur}/4
                    </p>
                  </div>
                );
              })}
            </div>
          </Surface>

          {/* Photos de la semaine */}
          <Surface className="p-4">
            <p className="mb-2 text-xs uppercase tracking-wide text-gray-400">
              Photos de la semaine
            </p>
            {snapshotSelectionne.photos.length === 0 ? (
              <p className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-gray-500">
                Aucune photo prise cette semaine.
              </p>
            ) : (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
                {snapshotSelectionne.photos.map((photo, index) => (
                  <a
                    key={`${photo.url}-${index}`}
                    href={photo.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="group relative block"
                  >
                    <Image
                      src={photo.url}
                      alt={photo.legende || "Photo de chantier"}
                      width={320}
                      height={180}
                      className="aspect-video w-full rounded-lg object-cover transition-transform group-hover:scale-[1.02]"
                    />
                    <span className="mt-1 block truncate text-2xs text-gray-400">
                      {photo.legende || (photo.date ? `Photo du ${formatDateFr(photo.date)}` : "Photo de chantier")}
                    </span>
                  </a>
                ))}
              </div>
            )}
          </Surface>

          {/* Météo & pointages */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Surface className="p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Météo relevée</p>
              {snapshotSelectionne.pointages.meteo_relevee.length === 0 ? (
                <p className="mt-1 text-sm text-gray-500">Aucun relevé cette semaine.</p>
              ) : (
                <div className="mt-1 flex flex-wrap gap-1.5">
                  {snapshotSelectionne.pointages.meteo_relevee.map((m) => (
                    <span
                      key={m}
                      className="rounded-full border border-white/10 bg-[#0B0F19] px-2 py-0.5 text-2xs font-medium text-gray-300"
                    >
                      {m}
                    </span>
                  ))}
                </div>
              )}
              <p className="mt-2 text-xs text-gray-500">
                {snapshotSelectionne.pointages.nb_pointages} pointage(s) · Coef météo moyen :{" "}
                {snapshotSelectionne.pointages.coef_meteo_moyen ?? "—"}
              </p>
            </Surface>

            <Surface className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs uppercase tracking-wide text-gray-400">Intempéries</p>
                {snapshotSelectionne.intemperies.vigilance_max && (
                  <span className="text-sm">
                    {EMOJI_VIGILANCE[snapshotSelectionne.intemperies.vigilance_max] ?? ""}
                  </span>
                )}
              </div>

              {snapshotSelectionne.intemperies.jours_arret_total === 0 ? (
                <p className="mt-1 text-sm text-gray-500">Aucune interruption météo cette semaine.</p>
              ) : (
                <>
                  <p className="mt-1 text-2xl font-black text-white">
                    {snapshotSelectionne.intemperies.jours_arret_total} jour(s)
                  </p>
                  <p className="text-xs text-gray-500">d&apos;arrêt lié à la météo</p>

                  <div className="mt-2 space-y-1.5">
                    {snapshotSelectionne.intemperies.details
                      .filter((j) => j.jour_arrete)
                      .map((j) => (
                        <div
                          key={j.date}
                          className="rounded-lg border border-white/10 bg-[#0B0F19]/50 px-2.5 py-1.5 text-3xs text-gray-300"
                        >
                          <span className="font-semibold text-white">{j.date}</span>
                          <span className="ml-2">{EMOJI_VIGILANCE[j.vigilance] ?? ""}</span>
                          <p className="mt-0.5 line-clamp-2 text-gray-500">{j.motif}</p>
                        </div>
                      ))}
                  </div>
                </>
              )}
            </Surface>
          </div>

          {/* Observations + mot du patron */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Surface className="p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">Observations de la semaine</p>
              {snapshotSelectionne.communication.observations ? (
                <p className="mt-1 whitespace-pre-wrap text-sm text-gray-300">
                  {snapshotSelectionne.communication.observations}
                </p>
              ) : (
                <p className="mt-1 text-sm text-gray-500">Aucune observation enregistrée.</p>
              )}
            </Surface>

            <Surface className="p-4">
              <p className="text-xs uppercase tracking-wide text-gray-400">
                Mot du patron pour le client
              </p>
              <textarea
                value={motPatron}
                onChange={(e) => {
                  setMotPatron(e.target.value);
                  setStatutSauvegarde("idle");
                }}
                disabled={estEnvoye}
                rows={4}
                placeholder="Un mot personnel pour accompagner ce rapport…"
                className="mt-1 w-full rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-sm text-white placeholder-gray-600 focus:border-red-600 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
              />
              {statutSauvegarde === "ok" && (
                <p className="mt-1 text-xs font-medium text-emerald-400">✓ Mot enregistré.</p>
              )}
              {statutSauvegarde === "erreur" && (
                <p className="mt-1 text-xs font-medium text-red-400">✕ Échec de l&apos;enregistrement.</p>
              )}
              {estEnvoye && (
                <p className="mt-1 text-xs text-gray-500">
                  Modifiable uniquement avant l&apos;envoi.
                </p>
              )}
            </Surface>
          </div>
        </div>
      )}

      {/* Modale de confirmation d'envoi */}
      {modaleEnvoiOuverte && (
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm">
          <Surface className="w-full max-w-md p-5 shadow-2xl">
            <h3 className="text-sm font-bold text-white">Envoyer le rapport au client ?</h3>
            <p className="mt-2 text-xs text-gray-400">
              {rapportSelectionne?.semaine_label} sera transmis au client avec votre mot
              personnel. Une fois envoyé, le rapport passera en lecture seule.
            </p>
            <div className="mt-4 flex justify-end gap-3">
              <button
                type="button"
                onClick={() => setModaleEnvoiOuverte(false)}
                disabled={envoiEnCours}
                className="rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-white/5 disabled:opacity-50"
              >
                Annuler
              </button>
              <button
                type="button"
                onClick={confirmerEnvoi}
                disabled={envoiEnCours}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {envoiEnCours ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Send className="h-3.5 w-3.5" />
                )}
                Confirmer l&apos;envoi
              </button>
            </div>
          </Surface>
        </div>
      )}
    {/* Overlay : aperçu PDF (rendu clair client) */}
      {apercu && (
        <div className="fixed inset-0 z-[220] overflow-y-auto bg-[#0B0F19]/95 p-4 sm:p-6 print:overflow-visible print:bg-white print:p-0">
          <style>{STYLES_PRINT_RAPPORT}</style>

          <div className="mx-auto mb-4 flex max-w-[860px] items-center justify-between gap-3 print:hidden">
            <p className="text-sm font-bold text-white">{apercu.titre}</p>
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  void preparerEtImprimer();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700"
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimer / Export PDF
              </button>
              <button
                type="button"
                onClick={() => setApercu(null)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-white/5"
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
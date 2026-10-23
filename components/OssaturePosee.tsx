"use client";

// components/OssaturePosee.tsx
//
// PARCOURS TERRAIN « OSSATURE POSÉE » — mobile d'abord.
//
// ─── Ce que ce panneau fait, et ce qu'il ne fait PAS ────────────────────────
//
// Il enregistre un FAIT de terrain : l'ossature a été posée, et l'équipe a
// rencontré l'un de deux cas :
//
//   A. INTEMPÉRIES   — la pose a eu lieu mais a été gênée (vent, pluie, gel,
//                      accès). Le motif est enregistré.
//   B. AUTRE FAÇADE  — la pose a eu lieu ailleurs que prévu. La façade
//                      initialement bloquée est conservée AVEC son motif.
//
// Il n'écrit RIEN dans `rapports_intemperies`, ne modifie aucun seuil, et ne
// qualifie JAMAIS la journée d'« arrêt légal indemnisable » : cette décision
// est humaine et prise ailleurs. La journée reste VERTE dans les deux cas,
// parce que le travail a eu lieu — c'est la règle métier « journée verte ».
//
// ─── Persistance, sans migration ────────────────────────────────────────────
//
// La table `journal_chantier` existe déjà, avec sa RLS et son trigger
// d'entreprise. On y écrit une ligne dont `contenu` est l'événement sérialisé
// en JSON et `source` le tag stable `ossature-posee`. Aucune colonne n'est
// ajoutée, aucune migration n'est nécessaire.

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import { dateParis } from "@/lib/dateParis";
import type { TablesInsert } from "@/types/supabase";
import {
  LIBELLES_FACADE,
  SOURCE_OSSATURE_POSEE,
  deriverEtatJournee,
  lireEvenement,
  serialiserEvenement,
  validerEvenement,
  type ChoixOssature,
  type EtatJournee,
  type EvenementOssature,
  type FacadeOssature,
} from "@/lib/suiviTerrain";

const FACADES: FacadeOssature[] = ["nord", "sud", "est", "ouest"];

const CHOIX: Array<{ id: ChoixOssature; titre: string; detail: string }> = [
  {
    id: "intemperies",
    titre: "Intempéries",
    detail:
      "L'ossature est posée, mais l'équipe a été gênée (vent, pluie, gel, accès).",
  },
  {
    id: "autre_facade",
    titre: "Autre façade",
    detail:
      "L'ossature a été posée sur une autre façade. Celle qui était prévue reste bloquée.",
  },
];

/** Instant courant, en ISO : la date ET l'heure de début sont conservées. */
const maintenant = () => new Date().toISOString();

/** Rend une date ISO lisible en français, en heure Europe/Paris (P6) : l'affichage ne dépend jamais du fuseau configuré sur le téléphone du terrain. */
function heureLisible(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("fr-FR", {
    timeZone: "Europe/Paris",
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/** Identifiant stable d'événement (P1). Jamais requis : les événements historiques n'en ont pas. */
function nouvelId(): string | undefined {
  try {
    return typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : undefined;
  } catch {
    return undefined;
  }
}

export default function OssaturePosee({
  chantierId,
  jour,
}: {
  chantierId: string;
  /** Journée concernée (AAAA-MM-JJ), en date française. */
  jour: string;
}) {
  const [evenements, setEvenements] = useState<EvenementOssature[]>([]);
  const [chargement, setChargement] = useState(true);
  const [enregistrement, setEnregistrement] = useState(false);
  const [erreur, setErreur] = useState<string | null>(null);

  // Saisie du formulaire. Aucun choix n'est présélectionné : l'équipe choisit
  // explicitement l'un des DEUX cas, jamais par défaut.
  const [choix, setChoix] = useState<ChoixOssature | null>(null);
  const [facade, setFacade] = useState<FacadeOssature | null>(null);
  const [facadeInitiale, setFacadeInitiale] = useState<FacadeOssature | null>(null);
  const [motif, setMotif] = useState("");
  const [repriseNote, setRepriseNote] = useState("");
  const [repriseOuverte, setRepriseOuverte] = useState(false);

  // Garde de soumission SYNCHRONE (P6) : l'état `enregistrement` (React) ne
  // désactive les boutons qu'au rendu suivant — deux clics rapprochés
  // pourraient passer entre les deux. Le ref, lui, est immédiat.
  const soumissionEnCours = useRef(false);

  const charger = useCallback(async () => {
    setChargement(true);
    // On lit LARGE (toutes les lignes de journal du chantier pour ce tag) puis
    // on filtre en mémoire sur le jour : la table n'a pas de colonne date
    // dédiée, et `created_at` est l'horodatage serveur — le jour fait foi.
    const { data, error } = await supabase
      .from("journal_chantier")
      .select("contenu, source, created_at")
      .eq("chantier_id", chantierId)
      .eq("source", SOURCE_OSSATURE_POSEE)
      .order("created_at", { ascending: false })
      .limit(200);

    if (error) {
      console.error("OssaturePosee : lecture du journal impossible —", error.message);
      setErreur("Historique illisible : " + error.message);
      setChargement(false);
      return;
    }

    const lus: EvenementOssature[] = [];
    for (const ligne of data ?? []) {
      // `lireEvenement` renvoie `null` sur une ligne illisible : elle est
      // ignorée explicitement, jamais convertie en événement inventé.
      const ev = lireEvenement(ligne.contenu);
      if (!ev) continue;
      // Filtre sur le jour (P3) : `debut` est un ISO UTC ; le jour fait foi
      // au calendrier Europe/Paris, pas au préfixe UTC — sans quoi un
      // événement enregistré entre 0 h et 2 h du matin serait invisible le
      // jour même.
      if (dateParis(new Date(ev.debut)) !== jour) continue;
      lus.push(ev);
    }
    setEvenements(lus);
    setErreur(null);
    setChargement(false);
  }, [chantierId, jour]);

  useEffect(() => {
    charger();
  }, [charger]);

  const etat: EtatJournee = useMemo(() => deriverEtatJournee(evenements), [evenements]);

  /** Un incident encore ouvert se documente par une reprise. */
  const incidentOuvert = etat.incidents.find((i) => i.ouvert) ?? null;

  async function enregistrer() {
    if (soumissionEnCours.current) return; // P6 : garde synchrone
    const controle = validerEvenement({ choix, facade, facadeInitiale, motif });
    if (!controle.ok) {
      setErreur(controle.erreur);
      return;
    }
    if (!choix || !facade) return;

    soumissionEnCours.current = true;
    setEnregistrement(true);
    setErreur(null);

    try {
      const id = nouvelId();
      const ev: EvenementOssature = {
        v: 1,
        type: "ossature_posee",
        ...(id ? { id } : {}), // P1 : identifiant stable, sans exigence
        facade,
        choix,
        motif: motif.trim(),
        ...(choix === "autre_facade" && facadeInitiale ? { facadeInitiale } : {}),
        // DATE ET HEURE DE DÉBUT : l'instant du constat, pas un jour nu.
        debut: maintenant(),
      };

      // Le trigger `tg_auto_entreprise` remplit `entreprise_id` : on ne
      // l'invente pas côté client.
      const ligne = {
        chantier_id: chantierId,
        contenu: serialiserEvenement(ev),
        source: SOURCE_OSSATURE_POSEE,
      } as Omit<TablesInsert<"journal_chantier">, "entreprise_id">;

      const { error } = await supabase
        .from("journal_chantier")
        .insert(ligne as TablesInsert<"journal_chantier">);

      if (error) {
        console.error("OssaturePosee : écriture du journal impossible —", error.message);
        setErreur("Enregistrement impossible : " + error.message);
        return;
      }

      // On ne vide la saisie qu'APRÈS succès : un échec ne doit pas faire perdre
      // un motif saisi sur le terrain.
      setChoix(null);
      setFacade(null);
      setFacadeInitiale(null);
      setMotif("");
      await charger();
    } finally {
      soumissionEnCours.current = false;
      setEnregistrement(false);
    }
  }

  async function documenterReprise() {
    if (soumissionEnCours.current) return; // P6 : garde synchrone
    if (!incidentOuvert) return;
    const note = repriseNote.trim();
    if (!note) {
      setErreur("Décrivez la reprise avant de l'enregistrer.");
      return;
    }

    soumissionEnCours.current = true;
    setEnregistrement(true);
    setErreur(null);

    try {
      // La reprise est un NOUVEL événement rattaché au même cas : l'incident
      // d'origine n'est pas modifié (et n'est donc pas effacé), il est complété.
      //
      // P1 — rattachement SANS AMBIGUÏTÉ : la reprise reprend l'identité
      // COMPLÈTE de l'incident (façade posée ET, pour le choix B, façade
      // initialement bloquée) et cite son `id` dans `reprise.referente`.
      // Avant la correction, elle ne portait que `incidentOuvert.facade` —
      // la façade BLOQUÉE pour le choix B — et la clé de clôture ne
      // correspondait jamais : l'incident restait ouvert à vie.
      const idReprise = nouvelId();
      const ev: EvenementOssature = {
        v: 1,
        type: "ossature_posee",
        ...(idReprise ? { id: idReprise } : {}), // son PROPRE identifiant
        facade: incidentOuvert.facadePosee,
        choix: incidentOuvert.choix,
        motif: incidentOuvert.motif,
        ...(incidentOuvert.choix === "autre_facade" && incidentOuvert.facadeInitiale
          ? { facadeInitiale: incidentOuvert.facadeInitiale }
          : {}),
        debut: maintenant(),
        reprise: {
          at: maintenant(),
          note,
          // Absent sur les incidents historiques (sans `id`) : la fermeture
          // retombe alors sur la clé composée — cf. `estIncidentCloture`.
          ...(incidentOuvert.id ? { referente: incidentOuvert.id } : {}),
        },
      };

      const ligne = {
        chantier_id: chantierId,
        contenu: serialiserEvenement(ev),
        source: SOURCE_OSSATURE_POSEE,
      } as Omit<TablesInsert<"journal_chantier">, "entreprise_id">;

      const { error } = await supabase
        .from("journal_chantier")
        .insert(ligne as TablesInsert<"journal_chantier">);

      if (error) {
        setErreur("Enregistrement de la reprise impossible : " + error.message);
        return;
      }

      setRepriseNote("");
      setRepriseOuverte(false);
      await charger();
    } finally {
      soumissionEnCours.current = false;
      setEnregistrement(false);
    }
  }

  if (chargement) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
        <p className="text-xs text-gray-400">Chargement de l&apos;avancement…</p>
      </div>
    );
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/10 bg-white/[0.03] p-3 sm:p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <h4 className="text-sm font-bold text-white">🧱 Ossature posée ?</h4>
          <p className="mt-0.5 text-2xs leading-snug text-gray-400">
            Enregistrez la pose et le cas rencontré. La journée reste verte :
            c&apos;est un constat de terrain, pas une qualification d&apos;arrêt.
          </p>
        </div>
        <span
          className={`shrink-0 rounded-full border px-2 py-0.5 text-2xs font-semibold ${
            etat.statut === "attente"
              ? "border-white/15 text-gray-400"
              : etat.statut === "reprise"
              ? "border-sky-500/40 text-sky-300"
              : "border-emerald-500/40 text-emerald-300"
          }`}
        >
          {etat.statut === "attente"
            ? "Rien enregistré"
            : etat.statut === "reprise"
            ? "Reprise documentée"
            : "Activité réalisée"}
        </span>
      </div>

      {/* ── État du jour ───────────────────────────────────────────────── */}
      {evenements.length > 0 && (
        <div className="rounded-lg border border-white/10 bg-transparent p-3">
          <p className="text-2xs uppercase tracking-wide text-gray-500">
            Journée du {jour}
          </p>
          <p className="mt-1 text-xs leading-snug text-gray-300">{etat.resume}</p>
        </div>
      )}

      {/* ── Trois choix explicites, jamais présélectionnés ─────────────── */}
      <div className="grid gap-2 sm:grid-cols-2">
        {CHOIX.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => {
              setChoix(c.id);
              setErreur(null);
            }}
            aria-pressed={choix === c.id}
            className={`min-h-11 rounded-lg border p-3 text-left transition-colors ${
              choix === c.id
                ? "border-white/40 bg-white/[0.06]"
                : "border-white/10 bg-transparent hover:border-white/25"
            }`}
          >
            <p className="text-xs font-semibold text-white">{c.titre}</p>
            <p className="mt-0.5 text-2xs leading-snug text-gray-400">{c.detail}</p>
          </button>
        ))}
      </div>

      {choix && (
        <div className="space-y-3">
          <div>
            <label className="text-2xs font-semibold uppercase tracking-wide text-gray-400">
              {choix === "intemperies"
                ? "Façade où l'ossature a été posée"
                : "Façade où l'ossature a été posée finalement"}
            </label>
            <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {FACADES.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => {
                    setFacade(f);
                    setErreur(null);
                  }}
                  aria-pressed={facade === f}
                  className={`min-h-11 rounded-lg border px-2 text-2xs font-medium transition-colors ${
                    facade === f
                      ? "border-white/40 bg-white/[0.06] text-white"
                      : "border-white/10 bg-transparent text-gray-400 hover:border-white/25"
                  }`}
                >
                  {LIBELLES_FACADE[f]}
                </button>
              ))}
            </div>
          </div>

          {choix === "autre_facade" && (
            <div>
              <label className="text-2xs font-semibold uppercase tracking-wide text-gray-400">
                Façade initialement prévue — reste bloquée
              </label>
              <p className="mt-0.5 text-2xs text-gray-500">
                Cet incident n&apos;est jamais effacé, même une fois la pose faite
                ailleurs.
              </p>
              <div className="mt-1.5 grid grid-cols-2 gap-2 sm:grid-cols-4">
                {FACADES.filter((f) => f !== facade).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => {
                      setFacadeInitiale(f);
                      setErreur(null);
                    }}
                    aria-pressed={facadeInitiale === f}
                    className={`min-h-11 rounded-lg border px-2 text-2xs font-medium transition-colors ${
                      facadeInitiale === f
                        ? "border-white/40 bg-white/[0.06] text-white"
                        : "border-white/10 bg-transparent text-gray-400 hover:border-white/25"
                    }`}
                  >
                    {LIBELLES_FACADE[f]}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label
              htmlFor="motif-ossature"
              className="text-2xs font-semibold uppercase tracking-wide text-gray-400"
            >
              {choix === "intemperies"
                ? "Gêne rencontrée (motif)"
                : "Pourquoi la façade prévue est restée bloquée"}
            </label>
            <p className="mt-0.5 text-2xs text-gray-500">
              Facultatif, mais c&apos;est ce qui documente la décision.
            </p>
            <textarea
              id="motif-ossature"
              value={motif}
              onChange={(e) => setMotif(e.target.value)}
              rows={2}
              placeholder={
                choix === "intemperies"
                  ? "Ex. : rafales dans l'après-midi, accès échafaudage mouillé…"
                  : "Ex. : façade très exposée à la pluie, prévision défavorable…"
              }
              className="mt-1.5 w-full rounded-lg border border-white/10 bg-transparent p-2 text-xs text-white placeholder:text-gray-600 focus:border-white/30 focus:outline-none"
            />
          </div>

          <button
            type="button"
            disabled={enregistrement}
            onClick={enregistrer}
            className="min-h-11 w-full rounded-lg border border-emerald-500/40 bg-emerald-500/10 px-3 text-xs font-semibold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:opacity-50"
          >
            {enregistrement ? "Enregistrement…" : "Enregistrer l'ossature posée"}
          </button>
        </div>
      )}

      {/* ── Reprise à documenter ───────────────────────────────────────── */}
      {incidentOuvert && (
        <div className="rounded-lg border border-amber-500/30 bg-amber-500/[0.06] p-3">
          <p className="text-2xs font-semibold text-amber-200">
            Incident ouvert — {LIBELLES_FACADE[incidentOuvert.facade]}
          </p>
          <p className="mt-0.5 text-2xs text-gray-400">
            {incidentOuvert.motif || "Motif à documenter."} · signalé le{" "}
            {heureLisible(incidentOuvert.debut)}
          </p>
          {repriseOuverte ? (
            <div className="mt-2 space-y-2">
              <textarea
                value={repriseNote}
                onChange={(e) => setRepriseNote(e.target.value)}
                rows={2}
                placeholder="Décrivez la reprise (ce qui a été fait, quand)…"
                className="w-full rounded-lg border border-white/10 bg-transparent p-2 text-xs text-white placeholder:text-gray-600 focus:border-white/30 focus:outline-none"
              />
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={enregistrement}
                  onClick={documenterReprise}
                  className="min-h-11 flex-1 rounded-lg border border-white/20 bg-white/[0.06] px-3 text-xs font-semibold text-white disabled:opacity-50"
                >
                  {enregistrement ? "Enregistrement…" : "Documenter la reprise"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setRepriseOuverte(false);
                    setRepriseNote("");
                  }}
                  className="min-h-11 rounded-lg border border-white/10 px-3 text-xs text-gray-400"
                >
                  Annuler
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => setRepriseOuverte(true)}
              className="mt-2 min-h-11 rounded-lg border border-white/15 px-3 text-xs font-medium text-gray-300 hover:border-white/30"
            >
              + Documenter la reprise
            </button>
          )}
        </div>
      )}

      {erreur && (
        <p className="rounded-lg border border-red-500/30 bg-red-500/[0.06] p-2 text-2xs text-red-300">
          {erreur}
        </p>
      )}
    </div>
  );
}

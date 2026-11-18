// app/rapports-intemperies/[id]/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { obtenirContexteEntreprise } from "@/lib/contexteEntreprise";
import {
  LABELS_METIER_METEO,
  normaliserMetierChantier,
  resumeSeuilsMetier,
  type Acces,
  type Materiau,
} from "@/lib/meteoAlerte";
import RapportIntemperiesPDF, { RapportIntemperiesData, Chantier } from "@/components/RapportIntemperiesPDF";
import SignatureTactileCanvas from "@/components/SignatureTactileCanvas";
import { Entreprise } from "@/types/entreprise";
import { Surface } from '@/components/ui/Surface';

function ajouterJoursOuvres(dateStr: string | null | undefined, nbJoursOuvres: number): string {
  const base =
    dateStr && /^\d{4}-\d{2}-\d{2}/.test(dateStr)
      ? new Date(`${dateStr.slice(0, 10)}T12:00:00`)
      : new Date();
  if (Number.isNaN(base.getTime())) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    base.setTime(today.getTime());
  }
  let restant = Math.max(0, Math.round(nbJoursOuvres));
  while (restant > 0) {
    base.setDate(base.getDate() + 1);
    if (base.getDay() !== 0 && base.getDay() !== 6) {
      restant -= 1;
    }
  }
  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function calculerHeuresPerduesDepuisHeure(heureStr: string): number {
  const m = /^(\d{2}):(\d{2})$/.exec(heureStr);
  if (!m) return 7;
  const debutMin = Number(m[1]) * 60 + Number(m[2]);
  const finJourneeMin = 17 * 60;
  const pauseDejMin = debutMin <= 12 * 60 ? 60 : 0;
  const perdues = Math.max(0.5, Math.min(7, (finJourneeMin - debutMin - pauseDejMin) / 60));
  return Math.round(perdues * 2) / 2;
}

function RapportDetailContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [rapport, setRapport] = useState<RapportIntemperiesData | null>(null);
  const [chantier, setChantier] = useState<Chantier | null>(null);
  const [entreprise, setEntreprise] = useState<Entreprise>({
    raison_sociale: "BNA BARDAGE",
    siret: "921 456 789 00012",
    telephone: "05 56 00 00 00",
    email: "contact@bna-bardage.fr",
    adresse: "12 Rue de l'Artisanat",
    code_postal: "33000",
    ville: "Bordeaux",
    logo_url: null,
    assurance: null,
    iban: null,
    bic: null,
    mentions_legales: null,
  });
  const [loading, setLoading] = useState(true);
  const [validentEnCours, setValidantEnCours] = useState(false);
  const [chantierId, setChantierId] = useState<string | null>(null);
  const [chantierDateFin, setChantierDateFin] = useState<string | null>(null);
  const [chantierHeuresARattraper, setChantierHeuresARattraper] = useState<number>(0);
  const [rapportEntrepriseId, setRapportEntrepriseId] = useState<string | null>(null);
  const [decalerDateFin, setDecalerDateFin] = useState(true);
  const [heureArretConstatee, setHeureArretConstatee] = useState("08:00");
  const [heuresPerdues, setHeuresPerdues] = useState<number>(7);
  const [arretDecideSurPlace, setArretDecideSurPlace] = useState(false);
  const [repliImpossible, setRepliImpossible] = useState(false);
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [feedbackAction, setFeedbackAction] = useState<string | null>(null);

  useEffect(() => {
    async function charger() {
      setLoading(true);
      const { data: dataRapport, error: errRapport } = await supabase
        .from("rapports_intemperies")
        .select("*")
        .eq("id", id)
        .single();

      if (errRapport || !dataRapport) {
        console.error("Erreur chargement rapport intempéries:", errRapport);
        setLoading(false);
        return;
      }

      setRapport({
        numero: dataRapport.numero,
        cree_le: dataRapport.cree_le,
        cree_par: (dataRapport.cree_par as "auto" | "manuel") || "manuel",
        // La colonne est NOT NULL en base, mais on ne remplace jamais une valeur
        // absente par une couleur « jaune » inventée : l'état par défaut est
        // « indisponible ».
        vigilance_officielle:
          (dataRapport.vigilance_officielle as
            | import("@/components/RapportIntemperiesPDF").StatutVigilanceOfficielle
            | null) || "indisponible",
        jour_arrete: dataRapport.jour_arrete ?? false,
        a_valider: dataRapport.a_valider ?? false,
        pluie_continue: dataRapport.pluie_continue ?? false,
        motif: dataRapport.motif || "",
        risque_technique_niveau: dataRapport.risque_technique_niveau,
        risque_technique_motif: dataRapport.risque_technique_motif,
        temp_max: dataRapport.temp_max ?? null,
        rafales_max: dataRapport.rafales_max ?? null,
        pluie_cumul: dataRapport.pluie_cumul ?? null,
        materiau: dataRapport.materiau ?? null,
        acces: dataRapport.acces ?? null,
        metier: null,
        departement: dataRapport.departement ?? null,
        mesures_prises: dataRapport.mesures_prises ?? null,
        heure_arret_constatee: dataRapport.heure_arret_constatee ?? null,
        heures_perdues: dataRapport.heures_perdues ?? 7,
        repli_impossible: dataRapport.repli_impossible ?? false,
        arret_decide_sur_place: dataRapport.arret_decide_sur_place ?? false,
        signature_data_url: dataRapport.signature_data_url ?? null,
        heures: dataRapport.releve_horaire as { heure: string; temp: number; vent: number; rafales: number; pluie: number }[] | undefined,
      });

      if (dataRapport.heure_arret_constatee) {
        setHeureArretConstatee(dataRapport.heure_arret_constatee.slice(0, 5));
      }
      if (typeof dataRapport.heures_perdues === "number") {
        setHeuresPerdues(dataRapport.heures_perdues);
      }
      setArretDecideSurPlace(Boolean(dataRapport.arret_decide_sur_place));
      setRepliImpossible(Boolean(dataRapport.repli_impossible));
      setSignatureDataUrl(dataRapport.signature_data_url ?? null);

      setRapportEntrepriseId(dataRapport.entreprise_id ?? null);
      setChantierId(dataRapport.chantier_id ?? null);

      if (dataRapport.chantier_id) {
        const { data: ch } = await supabase
          .from("chantiers")
          .select("id, nom, adresse_chantier, metier, date_fin, heures_a_rattraper")
          .eq("id", dataRapport.chantier_id)
          .maybeSingle();

        if (ch) {
          setChantierDateFin(ch.date_fin ?? null);
          setChantierHeuresARattraper(Number(ch.heures_a_rattraper ?? 0));
          setRapport((prev) => (prev ? { ...prev, metier: ch.metier ?? null } : prev));
          setChantier({
            nom: ch.nom,
            adresse: ch.adresse_chantier,
            code_postal: "",
            ville: "",
          });
        }

        const dateRapport = new Date(dataRapport.cree_le);
        const debutJour = new Date(dateRapport);
        debutJour.setHours(0, 0, 0, 0);
        const finJour = new Date(dateRapport);
        finJour.setHours(23, 59, 59, 999);

        const { data: captures } = await supabase
          .from("vigilance_captures")
          .select("vigilance_phenomenes")
          .eq("chantier_id", dataRapport.chantier_id)
          .gte("capture_le", debutJour.toISOString())
          .lte("capture_le", finJour.toISOString());

        if (captures && captures.length > 0) {
          const nomsUniques = new Set<string>();
          for (const capture of captures) {
            const phenomenes = capture.vigilance_phenomenes as
              | { nom: string; couleur: string }[]
              | null;
            phenomenes?.forEach((p) => nomsUniques.add(p.nom));
          }
          if (nomsUniques.size > 0) {
            setRapport((prev) =>
              prev ? { ...prev, vigilance_phenomene: Array.from(nomsUniques).join(", ") } : prev
            );
          }
        }
      }

      setLoading(false);
    }
    charger();
  }, [id]);

  async function validerArretChantier(arreter: boolean) {
    if (arreter && !repliImpossible) {
      setFeedbackAction(
        "⚠️ Veuillez certifier qu'aucun repli en atelier ou tâche à l'abri n'était praticable avant de valider l'arrêt."
      );
      return;
    }

    setValidantEnCours(true);
    setFeedbackAction(null);

    const heuresFinales = arreter ? Math.max(0.5, Math.min(24, Number(heuresPerdues) || 7)) : 0;

    // Garde-fou idempotent : la transition ne s'applique QUE si `a_valider = true`
    const { data: updatedRow, error } = await supabase
      .from("rapports_intemperies")
      .update({
        a_valider: false,
        jour_arrete: arreter,
        ampleur_impact: arreter ? "complete" : "partielle",
        valide_le: new Date().toISOString(),
        ...(arreter
          ? {
              heure_arret_constatee: heureArretConstatee,
              heures_perdues: heuresFinales,
              arret_decide_sur_place: arretDecideSurPlace,
              repli_impossible: repliImpossible,
              signature_data_url: signatureDataUrl,
            }
          : {}),
      })
      .eq("id", id)
      .eq("a_valider", true)
      .select("id")
      .maybeSingle();

    if (error) {
      setFeedbackAction(`❌ Erreur validation (${error.code ?? "SQL"}) : ${error.message}`);
      setValidantEnCours(false);
      return;
    }

    if (!updatedRow) {
      setFeedbackAction("ℹ️ Ce rapport a déjà été validé ou clôturé.");
      setValidantEnCours(false);
      return;
    }

    if (rapport) {
      setRapport({
        ...rapport,
        a_valider: false,
        jour_arrete: arreter,
        ...(arreter
          ? {
              heure_arret_constatee: heureArretConstatee,
              heures_perdues: heuresFinales,
              arret_decide_sur_place: arretDecideSurPlace,
              repli_impossible: repliImpossible,
              signature_data_url: signatureDataUrl,
            }
          : {}),
      });
    }

    if (arreter && chantierId && rapport) {
      const joursOuvres = Math.max(1, Math.ceil(heuresFinales / 7));
      const nouvelleDateFin = decalerDateFin
        ? ajouterJoursOuvres(chantierDateFin, joursOuvres)
        : null;
      const nouveauCumulRattraper =
        Math.round((chantierHeuresARattraper + heuresFinales) * 100) / 100;

      const { error: errChantier } = await supabase
        .from("chantiers")
        .update({
          heures_a_rattraper: nouveauCumulRattraper,
          ...(nouvelleDateFin ? { date_fin: nouvelleDateFin } : {}),
        })
        .eq("id", chantierId);

      if (errChantier) {
        console.error("[rapport-detail] Erreur mise à jour chantier :", errChantier);
      } else {
        setChantierHeuresARattraper(nouveauCumulRattraper);
        if (nouvelleDateFin) setChantierDateFin(nouvelleDateFin);
      }

      try {
        const entId = rapportEntrepriseId ?? (await obtenirContexteEntreprise());
        const { data: existantAv } = await supabase
          .from("avancements_chantier")
          .select("id")
          .eq("chantier_id", chantierId)
          .ilike("commentaire", `%${rapport.numero}%`)
          .limit(1);

        if (!existantAv || existantAv.length === 0) {
          const { data: prevAv } = await supabase
            .from("avancements_chantier")
            .select("pourcentage, details")
            .eq("chantier_id", chantierId)
            .order("id", { ascending: false })
            .limit(1);

          const pourcentage =
            prevAv && prevAv.length > 0 && typeof prevAv[0].pourcentage === "number"
              ? prevAv[0].pourcentage
              : 0;
          const details =
            prevAv && prevAv.length > 0 && prevAv[0].details && typeof prevAv[0].details === "object"
              ? prevAv[0].details
              : {};

          const dateAujourdhui = new Date().toISOString().slice(0, 10);
          const suffixPlanning = nouvelleDateFin
            ? ` · +${joursOuvres} j ouvré(s) → fin au ${new Date(`${nouvelleDateFin}T12:00:00`).toLocaleDateString("fr-FR")}`
            : "";

          const { error: errAv } = await supabase.from("avancements_chantier").insert({
            entreprise_id: entId,
            chantier_id: chantierId,
            date: dateAujourdhui,
            pourcentage,
            commentaire: `🌧️ Arrêt intempéries validé (${rapport.numero}, ${heuresFinales}h perdues) : ${rapport.motif}${suffixPlanning}`,
            details,
          });
          if (errAv) {
            console.error("[rapport-detail] Erreur insertion avancement :", errAv);
          }
        }
      } catch (e) {
        console.error("[rapport-detail] Exception avancement :", e);
      }

      setFeedbackAction(
        nouvelleDateFin
          ? `✓ Arrêt validé (${rapport.numero}) · +${heuresFinales}h à rattraper · Fin décalée de ${joursOuvres} jour(s) ouvré(s) au ${new Date(`${nouvelleDateFin}T12:00:00`).toLocaleDateString("fr-FR")}.`
          : `✓ Arrêt validé (${rapport.numero}) · +${heuresFinales}h à rattraper.`
      );
    } else if (!arreter && rapport) {
      setFeedbackAction(`✓ Rapport ${rapport.numero} clôturé : travail maintenu.`);
    }

    setValidantEnCours(false);
  }

  function imprimer() {
    window.print();
  }

  if (loading) {
    return <div className="p-8 text-center text-sm text-gray-400">Chargement du rapport…</div>;
  }

  if (!rapport) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400">Rapport intempéries introuvable.</p>
        <Link href="/bureau/rapports-intemperies" className="mt-4 inline-block text-xs text-gray-400 hover:text-white">
          ← Retour aux rapports
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barre d'action supérieure */}
      <div className="space-y-3 border-b border-white/10 pb-3 print:hidden">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <button
            onClick={() => router.back()}
            className="text-xs text-gray-400 hover:text-white"
          >
            ← Retour
          </button>

          <div className="flex flex-wrap items-center gap-2">
            {rapport.a_valider && (
              <>
                <button
                  onClick={() => validerArretChantier(true)}
                  disabled={validentEnCours}
                  className="rounded-xl bg-[#D96B27] px-3.5 py-2 text-xs font-semibold text-white shadow-sm hover:bg-[#E07A38] disabled:opacity-50 transition-colors"
                >
                  ✓ Valider l&apos;Arrêt de Chantier
                </button>
                <button
                  onClick={() => validerArretChantier(false)}
                  disabled={validentEnCours}
                  className="rounded-xl border border-white/15 bg-[#1B1511] px-3.5 py-2 text-xs font-medium text-gray-200 hover:border-[#D96B27]/50 disabled:opacity-50 transition-colors"
                >
                  Travail maintenu
                </button>
              </>
            )}

            <button
              onClick={imprimer}
              className="flex items-center gap-1.5 rounded-xl border border-[#D96B27]/40 bg-[#1B1511] px-4 py-2 text-xs font-bold text-[#F59E0B] hover:bg-[#D96B27]/15 transition-all"
            >
              <span>🖨️</span> Imprimer / Exporter PDF
            </button>
          </div>
        </div>

        {/* Récapitulatif métier + seuils & option décalage planning */}
        <div className="flex flex-col gap-2 rounded-xl border border-white/10 bg-[#1B1511] px-4 py-3 text-xs text-gray-300 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <span className="font-semibold text-[#D96B27]">
              {LABELS_METIER_METEO[normaliserMetierChantier(rapport.metier)]}
            </span>
            <span className="mx-2 text-gray-600">·</span>
            <span className="text-gray-400">
              {resumeSeuilsMetier(
                normaliserMetierChantier(rapport.metier),
                (rapport.materiau as Materiau | null) ?? "bois",
                (rapport.acces as Acces | null) ?? "echafaudage"
              )}
            </span>
          </div>

          {rapport.a_valider && (
            <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-amber-100">
              <input
                type="checkbox"
                checked={decalerDateFin}
                onChange={(e) => setDecalerDateFin(e.target.checked)}
                className="h-4 w-4 rounded border-white/20 bg-[#120F0D] accent-[#D96B27]"
              />
              <span>
                Décaler automatiquement la date de fin (+{Math.max(1, Math.ceil((Number(heuresPerdues) || 7) / 7))} j ouvré(s), hors week-end) sur le planning
              </span>
            </label>
          )}
        </div>

        {/* Formulaire légal & signature tactile avant validation */}
        {rapport.a_valider && (
          <div className="space-y-4 rounded-2xl border border-[#D96B27]/35 bg-[#1B1511] p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-white">
                Validation légale de l&apos;arrêt de chantier
              </h2>
              <span className="rounded-full border border-[#D96B27]/40 bg-[#D96B27]/15 px-2.5 py-0.5 text-[11px] font-semibold text-[#F59E0B]">
                En attente de décision du chef d&apos;entreprise
              </span>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Heure d&apos;arrêt constatée
                </label>
                <input
                  type="time"
                  value={heureArretConstatee}
                  onChange={(e) => {
                    setHeureArretConstatee(e.target.value);
                    setHeuresPerdues(calculerHeuresPerduesDepuisHeure(e.target.value));
                  }}
                  className="w-full rounded-xl border border-white/10 bg-[#120F0D] px-3 py-2 text-sm text-white focus:border-[#D96B27] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs text-gray-400 mb-1">
                  Heures perdues sur la journée
                </label>
                <input
                  type="number"
                  step="0.5"
                  min="0.5"
                  max="12"
                  value={heuresPerdues}
                  onChange={(e) => setHeuresPerdues(parseFloat(e.target.value) || 0)}
                  className="w-full rounded-xl border border-white/10 bg-[#120F0D] px-3 py-2 text-sm text-white focus:border-[#D96B27] focus:outline-none"
                />
              </div>

              <div className="flex items-end">
                <label className="flex w-full cursor-pointer items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#120F0D] px-3 py-2 text-xs text-gray-200">
                  <span>Équipe déplacée sur place avant l&apos;arrêt ?</span>
                  <input
                    type="checkbox"
                    checked={arretDecideSurPlace}
                    onChange={(e) => setArretDecideSurPlace(e.target.checked)}
                    className="h-4 w-4 rounded border-white/20 accent-[#D96B27]"
                  />
                </label>
              </div>
            </div>

            <label className="flex cursor-pointer items-start gap-2.5 rounded-xl border border-white/10 bg-[#120F0D] p-3 text-xs text-amber-100">
              <input
                type="checkbox"
                checked={repliImpossible}
                onChange={(e) => setRepliImpossible(e.target.checked)}
                className="mt-0.5 h-4 w-4 shrink-0 rounded border-white/20 accent-[#D96B27]"
              />
              <span>
                <strong className="text-[#F59E0B]">Attestation obligatoire :</strong> Je certifie qu&apos;aucun repli en atelier ou tâche à l&apos;abri n&apos;était praticable.
              </span>
            </label>

            <SignatureTactileCanvas
              value={signatureDataUrl}
              onChange={setSignatureDataUrl}
            />
          </div>
        )}

        {feedbackAction && (
          <div
            className={`rounded-xl px-4 py-2.5 text-xs font-medium ${
              feedbackAction.startsWith("✓")
                ? "border border-emerald-500/30 bg-emerald-950/30 text-emerald-200"
                : "border border-red-500/40 bg-red-950/30 text-red-200"
            }`}
          >
            {feedbackAction}
          </div>
        )}
      </div>

      {/* Rendu PDF A4 */}
      <Surface className="p-2 shadow-2xl print:border-none print:bg-[#1E1E1E] print:p-0">
        <RapportIntemperiesPDF
          rapport={rapport}
          entreprise={entreprise}
          chantier={chantier || { nom: "Chantier", adresse: null, code_postal: null, ville: null }}
        />
      </Surface>
    </div>
  );
}

export default function RapportDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-gray-400">
          Chargement du rapport…
        </div>
      }
    >
      <RapportDetailContent />
    </Suspense>
  );
}

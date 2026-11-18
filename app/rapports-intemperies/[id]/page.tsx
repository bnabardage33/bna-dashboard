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
import { Entreprise } from "@/types/entreprise";
import { Surface } from '@/components/ui/Surface';

function ajouterUnJourOuvre(dateStr: string | null | undefined): string {
  const base =
    dateStr && /^\d{4}-\d{2}-\d{2}/.test(dateStr)
      ? new Date(`${dateStr.slice(0, 10)}T12:00:00`)
      : new Date();
  if (Number.isNaN(base.getTime())) {
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    base.setTime(today.getTime());
  }
  base.setDate(base.getDate() + 1);
  while (base.getDay() === 0 || base.getDay() === 6) {
    base.setDate(base.getDate() + 1);
  }
  const yyyy = base.getFullYear();
  const mm = String(base.getMonth() + 1).padStart(2, "0");
  const dd = String(base.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
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
  const [rapportEntrepriseId, setRapportEntrepriseId] = useState<string | null>(null);
  const [decalerDateFin, setDecalerDateFin] = useState(true);
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
        heures: dataRapport.releve_horaire as { heure: string; temp: number; vent: number; rafales: number; pluie: number }[] | undefined,
      });

      setRapportEntrepriseId(dataRapport.entreprise_id ?? null);
      setChantierId(dataRapport.chantier_id ?? null);

      if (dataRapport.chantier_id) {
        const { data: ch } = await supabase
          .from("chantiers")
          .select("id, nom, adresse_chantier, metier, date_fin")
          .eq("id", dataRapport.chantier_id)
          .maybeSingle();

        if (ch) {
          setChantierDateFin(ch.date_fin ?? null);
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
    setValidantEnCours(true);
    setFeedbackAction(null);
    const { error } = await supabase
      .from("rapports_intemperies")
      .update({
        a_valider: false,
        jour_arrete: arreter,
        ampleur_impact: arreter ? "complete" : "partielle",
      })
      .eq("id", id);

    if (error) {
      setFeedbackAction(`❌ Erreur validation (${error.code ?? "SQL"}) : ${error.message}`);
      setValidantEnCours(false);
      return;
    }

    if (rapport) {
      setRapport({
        ...rapport,
        a_valider: false,
        jour_arrete: arreter,
      });
    }

    if (arreter && chantierId && rapport) {
      let nouvelleDateFin: string | null = null;
      if (decalerDateFin) {
        nouvelleDateFin = ajouterUnJourOuvre(chantierDateFin);
        const { error: errChantier } = await supabase
          .from("chantiers")
          .update({ date_fin: nouvelleDateFin })
          .eq("id", chantierId);
        if (errChantier) {
          console.error("[rapport-detail] Erreur décalage date_fin :", errChantier);
        } else {
          setChantierDateFin(nouvelleDateFin);
        }
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
            ? ` · Planning décalé au ${new Date(`${nouvelleDateFin}T12:00:00`).toLocaleDateString("fr-FR")}`
            : "";

          const { error: errAv } = await supabase.from("avancements_chantier").insert({
            entreprise_id: entId,
            chantier_id: chantierId,
            date: dateAujourdhui,
            pourcentage,
            commentaire: `🌧️ Arrêt intempéries validé (${rapport.numero}) : ${rapport.motif}${suffixPlanning}`,
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
          ? `✓ Arrêt de chantier validé (${rapport.numero}) · Date de fin décalée au ${new Date(`${nouvelleDateFin}T12:00:00`).toLocaleDateString("fr-FR")} et journalisée dans l'avancement.`
          : `✓ Arrêt de chantier validé (${rapport.numero}) et journalisé dans l'avancement.`
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
                Décaler automatiquement la date de fin du chantier (+1 jour ouvré, hors week-end) sur le planning
              </span>
            </label>
          )}
        </div>

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

// app/rapports-intemperies/[id]/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import RapportIntemperiesPDF, { RapportIntemperiesData } from "@/components/RapportIntemperiesPDF";

function RapportDetailContent() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [rapport, setRapport] = useState<RapportIntemperiesData | null>(null);
  const [chantier, setChantier] = useState<any>(null);
  const [entreprise, setEntreprise] = useState<any>({
    raison_sociale: "BNA BARDAGE",
    siret: "921 456 789 00012",
    telephone: "05 56 00 00 00",
    email: "contact@bna-bardage.fr",
    adresse: "12 Rue de l'Artisanat",
    code_postal: "33000",
    ville: "Bordeaux",
    logo_url: null,
  });
  const [loading, setLoading] = useState(true);
  const [validentEnCours, setValidantEnCours] = useState(false);

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
        cree_par: dataRapport.cree_par || "manuel",
        vigilance_officielle: dataRapport.vigilance_officielle || "jaune",
        jour_arrete: dataRapport.jour_arrete ?? false,
        a_valider: dataRapport.a_valider ?? false,
        pluie_continue: dataRapport.pluie_continue ?? false,
        motif: dataRapport.motif || "",
        risque_technique_niveau: dataRapport.risque_technique_niveau,
        risque_technique_motif: dataRapport.risque_technique_motif,
        temp_max: dataRapport.temp_max ?? null,
        temp_min: dataRapport.temp_min ?? null,
        rafales_max: dataRapport.rafales_max ?? null,
        vent_moyen: dataRapport.vent_moyen ?? null,
        pluie_cumul: dataRapport.pluie_cumul ?? null,
        materiau: dataRapport.materiau ?? null,
        acces: dataRapport.acces ?? null,
        departement: dataRapport.departement ?? null,
        vigilance_phenomene: dataRapport.vigilance_phenomene ?? null,
        mesures_prises: dataRapport.mesures_prises ?? null,
        heures: dataRapport.releve_horaire,
      });

      if (dataRapport.chantier_id) {
        const { data: ch } = await supabase
          .from("chantiers")
          .select("id, nom, adresse_chantier")
          .eq("id", dataRapport.chantier_id)
          .maybeSingle();

        if (ch) {
          setChantier({
            nom: ch.nom,
            adresse: ch.adresse_chantier,
            code_postal: "",
            ville: "",
          });
        }
      }

      setLoading(false);
    }
    charger();
  }, [id]);

  async function validerArretChantier(arreter: boolean) {
    setValidantEnCours(true);
    const { error } = await supabase
      .from("rapports_intemperies")
      .update({
        a_valider: false,
        jour_arrete: arreter,
        ampleur_impact: arreter ? "complete" : "partielle",
      })
      .eq("id", id);

    if (!error && rapport) {
      setRapport({
        ...rapport,
        a_valider: false,
        jour_arrete: arreter,
      });
    }
    setValidantEnCours(false);
  }

  function imprimer() {
    window.print();
  }

  if (loading) {
    return <div className="p-8 text-center text-sm text-slate-400">Chargement du rapport…</div>;
  }

  if (!rapport) {
    return (
      <div className="p-8 text-center">
        <p className="text-red-400">Rapport intempéries introuvable.</p>
        <Link href="/bureau/rapports-intemperies" className="mt-4 inline-block text-xs text-slate-400 hover:text-white">
          ← Retour aux rapports
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Barre d'action supérieure */}
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-700 pb-3 print:hidden">
        <button
          onClick={() => router.back()}
          className="text-xs text-slate-400 hover:text-white"
        >
          ← Retour
        </button>

        <div className="flex items-center gap-2">
          {rapport.a_valider && (
            <>
              <button
                onClick={() => validerArretChantier(true)}
                disabled={validentEnCours}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
              >
                ✓ Valider l&apos;Arrêt de Chantier
              </button>
              <button
                onClick={() => validerArretChantier(false)}
                disabled={validentEnCours}
                className="rounded-lg border border-slate-600 bg-slate-800 px-3 py-1.5 text-xs font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50"
              >
                Travail maintenu
              </button>
            </>
          )}

          <button
            onClick={imprimer}
            className="flex items-center gap-1.5 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 hover:bg-amber-400 transition-all"
          >
            <span>🖨️</span> Imprimer / Exporter PDF
          </button>
        </div>
      </div>

      {/* Rendu PDF A4 */}
      <div className="rounded-xl border border-slate-700 bg-slate-800 p-2 shadow-2xl print:border-none print:bg-white print:p-0">
        <RapportIntemperiesPDF
          rapport={rapport}
          entreprise={entreprise}
          chantier={chantier || { nom: "Chantier", adresse: null, code_postal: null, ville: null }}
        />
      </div>
    </div>
  );
}

export default function RapportDetailPage() {
  return (
    <Suspense
      fallback={
        <div className="p-8 text-center text-sm text-slate-400">
          Chargement du rapport…
        </div>
      }
    >
      <RapportDetailContent />
    </Suspense>
  );
}

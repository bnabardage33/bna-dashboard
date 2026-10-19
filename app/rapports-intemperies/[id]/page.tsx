// app/rapports-intemperies/[id]/page.tsx
"use client";

import { Suspense, useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import RapportIntemperiesPDF, { RapportIntemperiesData, Chantier } from "@/components/RapportIntemperiesPDF";
import { Entreprise } from "@/types/entreprise";
import { Surface } from '@/components/ui/Surface';

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
        departement: dataRapport.departement ?? null,
        mesures_prises: dataRapport.mesures_prises ?? null,
        heures: dataRapport.releve_horaire as { heure: string; temp: number; vent: number; rafales: number; pluie: number }[] | undefined,
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-white/10 pb-3 print:hidden">
        <button
          onClick={() => router.back()}
          className="text-xs text-gray-400 hover:text-white"
        >
          ← Retour
        </button>

        <div className="flex items-center gap-2">
          {rapport.a_valider && (
            <>
              <button
                onClick={() => validerArretChantier(true)}
                disabled={validentEnCours}
                className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-red-900/200 disabled:opacity-50"
              >
                ✓ Valider l&apos;Arrêt de Chantier
              </button>
              <button
                onClick={() => validerArretChantier(false)}
                disabled={validentEnCours}
                className="rounded-lg border border-slate-600 bg-[#1E1E1E] px-3 py-1.5 text-xs font-medium text-gray-300 hover:bg-[#1E1E1E] disabled:opacity-50"
              >
                Travail maintenu
              </button>
            </>
          )}

          <button
            onClick={imprimer}
            className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-red-600/10 hover:bg-red-700 transition-all"
          >
            <span>🖨️</span> Imprimer / Exporter PDF
          </button>
        </div>
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

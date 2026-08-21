"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase";
import RapportIntemperiesPDF, {
  RapportIntemperiesData,
} from "@/components/RapportIntemperiesPDF";

export default function RapportIntemperiesPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [rapport, setRapport] = useState<RapportIntemperiesData | null>(null);
  const [chantier, setChantier] = useState<any>(null);
  const [entreprise, setEntreprise] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [erreur, setErreur] = useState<string | null>(null);
  const [mesuresPrises, setMesuresPrises] = useState("");
  const [sauvegarde, setSauvegarde] = useState(false);

  useEffect(() => {
    async function charger() {
      setLoading(true);

      const { data: r, error: errR } = await supabase
        .from("rapports_intemperies")
        .select("*")
        .eq("id", id)
        .single();

      if (errR || !r) {
        setErreur("Rapport introuvable.");
        setLoading(false);
        return;
      }

      const { data: ch } = await supabase
        .from("chantiers")
        .select("nom, adresse_chantier")
        .eq("id", r.chantier_id)
        .single();

      const { data: ent } = await supabase
        .from("entreprise_settings")
        .select("*")
        .limit(1)
        .maybeSingle();

      setRapport({
        numero: r.numero,
        cree_le: r.cree_le,
        cree_par: r.cree_par,
        vigilance_officielle: r.vigilance_officielle,
        jour_arrete: r.jour_arrete,
        a_valider: r.a_valider,
        pluie_continue: r.pluie_continue,
        motif: r.motif,
        risque_technique_niveau: r.risque_technique_niveau,
        risque_technique_motif: r.risque_technique_motif,
        temp_max: r.temp_max,
        rafales_max: r.rafales_max,
        pluie_cumul: r.pluie_cumul,
        materiau: r.materiau,
        acces: r.acces,
        mesures_prises: r.mesures_prises,
        heures: r.releve_horaire ?? undefined,
      });
      setChantier({
        nom: ch?.nom ?? null,
        adresse: ch?.adresse_chantier ?? null,
        code_postal: null,
        ville: null,
      });
      setEntreprise({
        raison_sociale: ent?.raison_sociale ?? "Mon entreprise",
        siret: ent?.siret ?? null,
        telephone: ent?.telephone ?? null,
        email: ent?.email ?? null,
        adresse: ent?.adresse ?? null,
        code_postal: ent?.code_postal ?? null,
        ville: ent?.ville ?? null,
        logo_url: ent?.logo_url ?? null,
      });
      setMesuresPrises(r.mesures_prises ?? "");
      setLoading(false);
    }

    if (id) charger();
  }, [id]);

  async function enregistrerMesures() {
    setSauvegarde(true);
    await supabase
      .from("rapports_intemperies")
      .update({ mesures_prises: mesuresPrises })
      .eq("id", id);
    setRapport((prev) => (prev ? { ...prev, mesures_prises: mesuresPrises } : prev));
    setSauvegarde(false);
  }

  async function validerRapport() {
    await supabase
      .from("rapports_intemperies")
      .update({ valide_le: new Date().toISOString() })
      .eq("id", id);
    router.refresh();
  }

  if (loading) {
    return <p className="p-6 text-sm text-slate-400">Chargement du rapport…</p>;
  }

  if (erreur || !rapport || !chantier || !entreprise) {
    return <p className="p-6 text-sm text-red-400">{erreur ?? "Erreur de chargement."}</p>;
  }

  return (
    <div className="min-h-screen bg-slate-950 pb-10">
      {/* Barre d'actions, masquée à l'impression */}
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-800 bg-slate-950/95 p-3 print:hidden">
        <button onClick={() => router.back()} className="text-sm text-slate-400">
          ← Retour
        </button>
        <div className="flex items-center gap-2">
          {rapport.a_valider && (
            <button
              onClick={validerRapport}
              className="rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-semibold text-slate-950"
            >
              Confirmer ce rapport
            </button>
          )}
          <button
            onClick={() => window.print()}
            className="rounded-lg bg-red-600 px-3 py-1.5 text-xs font-semibold text-white"
          >
            Imprimer / PDF
          </button>
        </div>
      </div>

      <div className="pt-4">
        <RapportIntemperiesPDF rapport={rapport} chantier={chantier} entreprise={entreprise} />
      </div>

      {/* Édition des mesures prises, masquée à l'impression */}
      <div className="mx-auto mt-4 max-w-3xl px-4 print:hidden">
        <label className="text-xs font-semibold uppercase tracking-wide text-slate-400">
          Mesures prises (modifiable)
        </label>
        <textarea
          value={mesuresPrises}
          onChange={(e) => setMesuresPrises(e.target.value)}
          rows={3}
          className="mt-2 w-full rounded-lg border border-slate-700 bg-slate-900 p-3 text-sm text-white"
          placeholder="Ex : Pose suspendue à 14h, matériel sécurisé, reprise le lendemain."
        />
        <button
          onClick={enregistrerMesures}
          disabled={sauvegarde}
          className="mt-2 rounded-lg bg-slate-700 px-3 py-1.5 text-xs font-semibold text-white disabled:opacity-50"
        >
          {sauvegarde ? "Enregistrement…" : "Enregistrer"}
        </button>
      </div>
    </div>
  );
}

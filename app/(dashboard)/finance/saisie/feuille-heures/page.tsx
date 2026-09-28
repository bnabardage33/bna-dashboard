"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { TablesInsert } from "@/types/supabase";
import { UserPlus, Save, ChevronDown, ChevronUp } from "lucide-react";

type Chantier = { id: string; nom: string | null };
type Ouvrier = {
  id: string;
  full_name: string;
  qualification: string | null;
  statut_emploi: string | null;
};

type LigneSaisie = {
  ouvrier_id: string;
  heures: number;
  type_heure: "normale" | "supplementaire" | "intempéries";
  coche: boolean;
};

export default function FeuilleHeuresPage() {
  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [ouvriers, setOuvriers] = useState<Ouvrier[]>([]);
  const [chantierId, setChantierId] = useState("");
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [tauxHoraire, setTauxHoraire] = useState(28.5);
  const [lignes, setLignes] = useState<Record<string, LigneSaisie>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  // Formulaire ajout ouvrier
  const [formOuvrierOuvert, setFormOuvrierOuvert] = useState(false);
  const [nouveauNom, setNouveauNom] = useState("");
  const [nouvelleQualif, setNouvelleQualif] = useState("");
  const [nouveauStatut, setNouveauStatut] = useState<"embauche" | "interimaire">("embauche");
  const [ajoutEnCours, setAjoutEnCours] = useState(false);

  async function chargerDonnees() {
    setIsLoading(true);
    const [{ data: cData }, { data: oData }] = await Promise.all([
      supabase.from("chantiers").select("id, nom").neq("statut", "termine"),
      supabase.from("profiles").select("id, full_name, qualification, statut_emploi").order("full_name"),
    ]);
    if (cData) {
      setChantiers(cData);
      if (!chantierId && cData.length > 0) setChantierId(cData[0].id);
    }
    if (oData) {
      setOuvriers(oData);
      const initial: Record<string, LigneSaisie> = {};
      oData.forEach((o: Ouvrier) => {
        initial[o.id] = { ouvrier_id: o.id, heures: 7, type_heure: "normale", coche: false };
      });
      setLignes(initial);
    }
    setIsLoading(false);
  }

  useEffect(() => {
    chargerDonnees();
  }, []);

  function toggleCoche(id: string) {
    setLignes((prev) => ({ ...prev, [id]: { ...prev[id], coche: !prev[id].coche } }));
  }

  function majLigne(id: string, champ: "heures" | "type_heure", valeur: string | number) {
    setLignes((prev) => ({ ...prev, [id]: { ...prev[id], [champ]: valeur } }));
  }

  async function handleAjouterOuvrier(e: React.FormEvent) {
    e.preventDefault();
    if (!nouveauNom.trim()) return;
    setAjoutEnCours(true);
    const { error } = await supabase.from("profiles").insert({
      full_name: nouveauNom.trim(),
      qualification: nouvelleQualif.trim() || null,
      statut_emploi: nouveauStatut,
      role: "ouvrier",
    });
    if (!error) {
      setNouveauNom("");
      setNouvelleQualif("");
      setNouveauStatut("embauche");
      setFormOuvrierOuvert(false);
      await chargerDonnees();
    } else {
      alert("Erreur : " + error.message);
    }
    setAjoutEnCours(false);
  }

  async function handleEnregistrer() {
    if (!chantierId) {
      alert("Sélectionne un chantier.");
      return;
    }
    const selectionnes = Object.values(lignes).filter((l) => l.coche && l.heures > 0);
    if (selectionnes.length === 0) {
      alert("Coche au moins un ouvrier avec des heures.");
      return;
    }

    setIsSaving(true);
    setMessage(null);

    const inserts = selectionnes.map((l) => ({
      chantier_id: chantierId,
      user_id: l.ouvrier_id,
      date,
      heures: l.heures,
      taux_horaire_charge: tauxHoraire,
      type_heure: l.type_heure,
    }));

    const { error } = await supabase.from("pointages").insert(inserts as TablesInsert<"pointages">[]);

    if (error) {
      setMessage("❌ Erreur : " + error.message);
    } else {
      setMessage(`✓ ${selectionnes.length} pointage(s) enregistré(s) pour le ${new Date(date).toLocaleDateString("fr-FR")}.`);
      // Décoche tout après succès
      setLignes((prev) => {
        const reset: Record<string, LigneSaisie> = {};
        Object.keys(prev).forEach((k) => {
          reset[k] = { ...prev[k], coche: false };
        });
        return reset;
      });
    }
    setIsSaving(false);
  }

  return (
    <div className="min-h-screen bg-transparent p-4 lg:p-8 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <h1 className="text-2xl font-bold text-white">Feuille d'heures</h1>

        {/* Paramètres du jour */}
        <div className="rounded-xl border border-white/10 bg-[#1A1D24]/50 p-4 grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Chantier</label>
            <select
              value={chantierId}
              onChange={(e) => setChantierId(e.target.value)}
              className="w-full bg-[#242830] border border-white/10 rounded-md p-2 focus:border-white/10 outline-none"
            >
              {chantiers.map((c) => (
                <option key={c.id} value={c.id}>{c.nom}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-[#242830] border border-white/10 rounded-md p-2 focus:border-white/10 outline-none"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Taux horaire chargé (€)</label>
            <input
              type="number"
              step="0.01"
              value={tauxHoraire}
              onChange={(e) => setTauxHoraire(parseFloat(e.target.value) || 0)}
              className="w-full bg-[#242830] border border-white/10 rounded-md p-2 focus:border-white/10 outline-none"
            />
          </div>
        </div>

        {/* Formulaire ajout ouvrier (dépliable) */}
        <div className="rounded-xl border border-white/10 bg-[#1A1D24]/50 overflow-hidden">
          <button
            onClick={() => setFormOuvrierOuvert(!formOuvrierOuvert)}
            className="w-full flex items-center justify-between p-4 text-sm font-semibold text-gray-400 hover:bg-[#1A1D24]/30 transition-colors"
          >
            <span className="flex items-center gap-2">
              <UserPlus className="h-4 w-4" />
              Ajouter un ouvrier
            </span>
            {formOuvrierOuvert ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {formOuvrierOuvert && (
            <form onSubmit={handleAjouterOuvrier} className="p-4 pt-0 space-y-3 border-t border-white/10">
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Nom de l'ouvrier"
                  required
                  value={nouveauNom}
                  onChange={(e) => setNouveauNom(e.target.value)}
                  className="bg-[#242830] border border-white/10 rounded-md p-2 text-sm focus:border-white/10 outline-none"
                />
                <input
                  type="text"
                  placeholder="Qualification (ex: bardeur confirmé)"
                  value={nouvelleQualif}
                  onChange={(e) => setNouvelleQualif(e.target.value)}
                  className="bg-[#242830] border border-white/10 rounded-md p-2 text-sm focus:border-white/10 outline-none"
                />
                <select
                  value={nouveauStatut}
                  onChange={(e) => setNouveauStatut(e.target.value as "embauche" | "interimaire")}
                  className="bg-[#242830] border border-white/10 rounded-md p-2 text-sm focus:border-white/10 outline-none"
                >
                  <option value="embauche">Embauché</option>
                  <option value="interimaire">Intérimaire</option>
                </select>
              </div>
              <button
                type="submit"
                disabled={ajoutEnCours}
                className="rounded-md bg-red-600 hover:bg-red-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50 transition-colors"
              >
                {ajoutEnCours ? "Ajout..." : "Ajouter"}
              </button>
            </form>
          )}
        </div>

        {/* Tableau des ouvriers */}
        <div className="rounded-xl border border-white/10 bg-[#1A1D24]/50 p-4">
          <h2 className="text-sm font-bold text-gray-300 uppercase tracking-wide mb-3">
            Équipe ({ouvriers.length})
          </h2>

          {isLoading ? (
            <p className="text-sm text-gray-500 text-center py-6">Chargement...</p>
          ) : ouvriers.length === 0 ? (
            <p className="text-sm text-gray-500 text-center py-6">Aucun ouvrier enregistré. Ajoute-en un ci-dessus.</p>
          ) : (
            <div className="space-y-2">
              {ouvriers.map((o) => {
                const ligne = lignes[o.id];
                if (!ligne) return null;
                return (
                  <div
                    key={o.id}
                    className={`flex flex-wrap items-center gap-3 rounded-lg border p-3 transition-colors ${
                      ligne.coche ? "border-white/10 bg-red-600/5" : "border-white/10 bg-transparent/30"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={ligne.coche}
                      onChange={() => toggleCoche(o.id)}
                      className="h-5 w-5 accent-cyan-500"
                    />
                    <div className="flex-1 min-w-[120px]">
                      <p className="font-semibold text-gray-200 text-sm">{o.full_name}</p>
                      <p className="text-3xs text-gray-500">
                        {o.qualification || "—"}
                        {o.statut_emploi === "interimaire" && (
                          <span className="ml-1.5 rounded bg-red-600/20 text-gray-400 px-1.5 py-0.5 text-2xs font-bold uppercase">
                            Intérim
                          </span>
                        )}
                      </p>
                    </div>
                    <input
                      type="number"
                      step="0.5"
                      min="0"
                      max="24"
                      value={ligne.heures}
                      onChange={(e) => majLigne(o.id, "heures", parseFloat(e.target.value) || 0)}
                      disabled={!ligne.coche}
                      className="w-20 bg-[#242830] border border-white/10 rounded-md p-1.5 text-sm text-center focus:border-white/10 outline-none disabled:opacity-40"
                    />
                    <span className="text-xs text-gray-500">h</span>
                    <select
                      value={ligne.type_heure}
                      onChange={(e) => majLigne(o.id, "type_heure", e.target.value)}
                      disabled={!ligne.coche}
                      className="bg-[#242830] border border-white/10 rounded-md p-1.5 text-xs focus:border-white/10 outline-none disabled:opacity-40"
                    >
                      <option value="normale">Normale</option>
                      <option value="supplementaire">Supplémentaire</option>
                      <option value="intempéries">Intempéries</option>
                    </select>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {message && (
          <div className={`rounded-lg border p-3 text-sm ${message.startsWith("✓") ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-400" : "border-rose-500/40 bg-rose-500/10 text-rose-400"}`}>
            {message}
          </div>
        )}

        <button
          onClick={handleEnregistrer}
          disabled={isSaving}
          className="w-full flex items-center justify-center gap-2 rounded-xl bg-red-600 hover:bg-red-600 py-3 font-bold text-white disabled:opacity-50 transition-colors"
        >
          <Save className="h-5 w-5" />
          {isSaving ? "Enregistrement..." : "Enregistrer la feuille d'heures"}
        </button>
      </div>
    </div>
  );
}

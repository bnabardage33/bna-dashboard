"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Fiche = {
  id: string;
  titre: string;
  categorie: string;
  reference: string | null;
  resume: string | null;
  contenu: string | null;
  created_at: string;
};

const CATEGORIES = [
  { value: "toutes", label: "toutes" },
  { value: "dtu", label: "DTU" },
  { value: "pose", label: "pose" },
  { value: "ventilation", label: "ventilation" },
  { value: "entraxes", label: "entraxes" },
  { value: "securite", label: "securite" },
  { value: "materiaux", label: "materiaux" },
];

export default function FicheTechniquePage() {
  const [fiches, setFiches] = useState<Fiche[]>([]);
  const [loading, setLoading] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [categorie, setCategorie] = useState("toutes");
  const [modalOuvert, setModalOuvert] = useState(false);
  const [fiche, setFiche] = useState<Fiche | null>(null);

  const [form, setForm] = useState({
    titre: "",
    categorie: "pose",
    reference: "",
    resume: "",
    contenu: "",
  });

  async function fetchFiches() {
    setLoading(true);
    const { data, error } = await supabase
      .from("fiches_techniques")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) console.error(error);
    else setFiches(data as Fiche[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchFiches();
  }, []);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.titre.trim()) return;
    const { error } = await supabase.from("fiches_techniques").insert({
      titre: form.titre,
      categorie: form.categorie,
      reference: form.reference || null,
      resume: form.resume || null,
      contenu: form.contenu || null,
    });
    if (error) {
      console.error(error);
      return;
    }
    setForm({ titre: "", categorie: "pose", reference: "", resume: "", contenu: "" });
    setModalOuvert(false);
    fetchFiches();
  }

  const filtrees = fiches.filter((f) => {
    const matchCat = categorie === "toutes" || f.categorie === categorie;
    const matchRecherche =
      !recherche ||
      f.titre.toLowerCase().includes(recherche.toLowerCase()) ||
      (f.resume ?? "").toLowerCase().includes(recherche.toLowerCase());
    return matchCat && matchRecherche;
  });

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Espace technique</h1>
          <p className="text-sm text-slate-400">
            DTU, préconisations de pose, entraxes et ventilation
          </p>
        </div>
        <button
          onClick={() => setModalOuvert(true)}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
        >
          + Nouvelle fiche
        </button>
      </div>

      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher une info technique..."
        className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
      />

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategorie(c.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              categorie === c.value
                ? "bg-red-600 text-white"
                : "border border-slate-600 text-slate-300 hover:bg-slate-800"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-slate-400">Chargement…</p>}

      {!loading && filtrees.length === 0 && (
        <p className="text-sm text-slate-500">Aucune fiche trouvée.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {filtrees.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiche(f)}
            className="rounded-xl border border-slate-700 bg-slate-800 p-4 text-left hover:border-red-600/40"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-red-400">
              {f.categorie}
            </p>
            <h3 className="mt-1 font-semibold text-white">{f.titre}</h3>
            {f.reference && (
              <p className="text-xs text-slate-500">{f.reference}</p>
            )}
            {f.resume && (
              <p className="mt-2 text-sm text-slate-400">{f.resume}</p>
            )}
          </button>
        ))}
      </div>

      {fiche && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setFiche(null)}
        >
          <div
            className="max-h-[80vh] w-full max-w-lg overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-red-400">
                  {fiche.categorie}
                </p>
                <h2 className="text-lg font-semibold text-white">{fiche.titre}</h2>
                {fiche.reference && (
                  <p className="text-xs text-slate-500">{fiche.reference}</p>
                )}
              </div>
              <button
                onClick={() => setFiche(null)}
                className="text-slate-400 hover:text-white"
              >
                ✕
              </button>
            </div>
            {fiche.resume && (
              <p className="mt-3 text-sm text-slate-300">{fiche.resume}</p>
            )}
            {fiche.contenu && (
              <p className="mt-3 whitespace-pre-wrap text-sm text-slate-400">
                {fiche.contenu}
              </p>
            )}
          </div>
        </div>
      )}

      {modalOuvert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setModalOuvert(false)}
        >
          <form
            onSubmit={onSubmit}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-3 rounded-xl border border-slate-700 bg-slate-800 p-6"
          >
            <h2 className="text-lg font-semibold text-white">Nouvelle fiche technique</h2>

            <input
              value={form.titre}
              onChange={(e) => setForm((p) => ({ ...p, titre: e.target.value }))}
              placeholder="Titre"
              required
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />

            <div className="flex gap-2">
              <select
                value={form.categorie}
                onChange={(e) => setForm((p) => ({ ...p, categorie: e.target.value }))}
                className="w-1/2 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              >
                {CATEGORIES.filter((c) => c.value !== "toutes").map((c) => (
                  <option key={c.value} value={c.value}>
                    {c.label}
                  </option>
                ))}
              </select>
              <input
                value={form.reference}
                onChange={(e) => setForm((p) => ({ ...p, reference: e.target.value }))}
                placeholder="Référence (ex. DTU 41.2)"
                className="w-1/2 rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
            </div>

            <textarea
              value={form.resume}
              onChange={(e) => setForm((p) => ({ ...p, resume: e.target.value }))}
              placeholder="Résumé"
              rows={2}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />

            <textarea
              value={form.contenu}
              onChange={(e) => setForm((p) => ({ ...p, contenu: e.target.value }))}
              placeholder="Contenu détaillé"
              rows={5}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOuvert(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300 hover:bg-slate-700"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

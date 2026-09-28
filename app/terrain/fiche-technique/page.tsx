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
  fichier_url: string | null;
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
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    titre: "",
    categorie: "pose",
    reference: "",
    resume: "",
    contenu: "",
  });
  const [pdfFile, setPdfFile] = useState<File | null>(null);

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

    let fichier_url: string | null = null;

    if (pdfFile) {
      setUploading(true);
      const path = `${Date.now()}-${pdfFile.name}`;
      const { error: uploadError } = await supabase.storage
        .from("fiches-pdf")
        .upload(path, pdfFile);

      if (uploadError) {
        console.error(uploadError);
        setUploading(false);
        return;
      }

      const { data: publicUrl } = supabase.storage
        .from("fiches-pdf")
        .getPublicUrl(path);
      fichier_url = publicUrl.publicUrl;
      setUploading(false);
    }

    const { error } = await supabase.from("fiches_techniques").insert({
      titre: form.titre,
      categorie: form.categorie,
      reference: form.reference || null,
      resume: form.resume || null,
      contenu: form.contenu || null,
      fichier_url,
    });

    if (error) {
      console.error(error);
      return;
    }

    setForm({ titre: "", categorie: "pose", reference: "", resume: "", contenu: "" });
    setPdfFile(null);
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
          <p className="text-sm text-gray-400">
            DTU, préconisations de pose, entraxes et ventilation
          </p>
        </div>
        <button
          onClick={() => setModalOuvert(true)}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-900/200"
        >
          + Nouvelle fiche
        </button>
      </div>

      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher une info technique..."
        className="w-full rounded-lg border border-slate-600 bg-[#1A1D24] px-3 py-2 text-sm text-white"
      />

      <div className="flex flex-wrap gap-2">
        {CATEGORIES.map((c) => (
          <button
            key={c.value}
            onClick={() => setCategorie(c.value)}
            className={`rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
              categorie === c.value
                ? "bg-red-600 text-white"
                : "border border-slate-600 text-gray-300 hover:bg-[#1A1D24]"
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {loading && <p className="text-sm text-gray-400">Chargement…</p>}

      {!loading && filtrees.length === 0 && (
        <p className="text-sm text-gray-500">Aucune fiche trouvée.</p>
      )}

      <div className="grid gap-4 sm:grid-cols-2">
        {filtrees.map((f) => (
          <button
            key={f.id}
            onClick={() => setFiche(f)}
            className="rounded-xl border border-white/10 bg-[#1A1D24] p-4 text-left hover:border-red-600/40"
          >
            <p className="text-xs font-medium uppercase tracking-wide text-red-400">
              {f.categorie}
            </p>
            <h3 className="mt-1 font-semibold text-white">{f.titre}</h3>
            {f.reference && (
              <p className="text-xs text-gray-500">{f.reference}</p>
            )}
            {f.resume && (
              <p className="mt-2 text-sm text-gray-400">{f.resume}</p>
            )}
            {f.fichier_url && (
              <p className="mt-2 text-xs font-medium text-gray-300">📄 PDF joint</p>
            )}
          </button>
        ))}
      </div>

      {fiche && (
        <div
          className="fixed inset-0 z-[210] pt-48 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm"
          onClick={() => setFiche(null)}
        >
          <div
            className="max-h-[85vh] sm:max-h-[90dvh] w-full max-w-lg overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[#1A1D24] p-6 pb-20 sm:pb-6 shadow-2xl animate-in fade-in"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-white/10 pb-3">
              <div>
                <p className="text-xs font-bold uppercase tracking-wide text-gray-300">
                  {fiche.categorie}
                </p>
                <h2 className="text-base font-bold text-white">{fiche.titre}</h2>
                {fiche.reference && (
                  <p className="text-xs text-gray-400">{fiche.reference}</p>
                )}
              </div>
              <button
                onClick={() => setFiche(null)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1A1D24] hover:text-white"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            {fiche.resume && (
              <p className="mt-3 text-xs text-gray-300 leading-relaxed">{fiche.resume}</p>
            )}
            {fiche.contenu && (
              <p className="mt-3 whitespace-pre-wrap text-xs text-gray-400 leading-relaxed">
                {fiche.contenu}
              </p>
            )}

            {fiche.fichier_url && (
              <div className="mt-4 space-y-2">
                <a
                  href={fiche.fichier_url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-block rounded-xl bg-red-700 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-600 shadow-md"
                >
                  Ouvrir le PDF dans un nouvel onglet
                </a>
                <iframe
                  src={fiche.fichier_url}
                  className="h-80 w-full rounded-xl border border-white/10 bg-transparent"
                  title={fiche.titre}
                />
              </div>
            )}

            <div className="sticky bottom-0 z-10 -mx-6 -mb-6 mt-6 bg-[#1A1D24] px-6 py-3 border-t border-white/10 flex items-center justify-end shadow-lg">
              <button
                type="button"
                onClick={() => setFiche(null)}
                className="rounded-xl border border-slate-600 bg-[#1A1D24] px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-[#1A1D24]"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {modalOuvert && (
        <div
          className="fixed inset-0 z-[210] pt-48 flex items-center justify-center p-4 pb-32 bg-black/80 backdrop-blur-sm"
          onClick={() => setModalOuvert(false)}
        >
          <form
            onSubmit={onSubmit}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1A1D24] w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl border border-white/10 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-4 shrink-0">
              <h2 className="text-base font-bold text-white">Nouvelle Fiche Technique</h2>
              <button type="button" onClick={() => setModalOuvert(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1A1D24] hover:text-white" aria-label="Fermer">
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
              <input
                value={form.titre}
                onChange={(e) => setForm((p) => ({ ...p, titre: e.target.value }))}
                placeholder="Titre de la fiche"
                required
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-red-600 focus:outline-none"
              />

              <div className="grid grid-cols-2 gap-3">
                <select
                  value={form.categorie}
                  onChange={(e) => setForm((p) => ({ ...p, categorie: e.target.value }))}
                  className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white focus:border-red-600 focus:outline-none"
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
                  className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-red-600 focus:outline-none"
                />
              </div>

              <textarea
                value={form.resume}
                onChange={(e) => setForm((p) => ({ ...p, resume: e.target.value }))}
                placeholder="Résumé explicatif"
                rows={2}
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-red-600 focus:outline-none"
              />

              <textarea
                value={form.contenu}
                onChange={(e) => setForm((p) => ({ ...p, contenu: e.target.value }))}
                placeholder="Contenu détaillé ou prescriptions techniques"
                rows={4}
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-red-600 focus:outline-none"
              />

              <div>
                <label htmlFor="chp-joindre-un-fichier-pdf-optionnel" className="text-3xs font-semibold uppercase text-gray-400 block mb-1">
                  Joindre un fichier PDF (optionnel)
                </label>
                <input id="chp-joindre-un-fichier-pdf-optionnel"
                  type="file"
                  accept="application/pdf"
                  onChange={(e) => setPdfFile(e.target.files?.[0] ?? null)}
                  className="w-full rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white file:mr-3 file:rounded-lg file:border-0 file:bg-[#1A1D24] file:px-2.5 file:py-1 file:text-xs file:font-semibold file:text-gray-200"
                />
              </div>
            </div>

            <div className="p-4 border-t border-white/10 flex justify-end gap-3 mt-auto shrink-0 bg-[#1A1D24] rounded-b-xl z-10">
              <button
                type="button"
                onClick={() => setModalOuvert(false)}
                className="rounded-xl border border-slate-600 bg-[#1A1D24] px-4 py-2.5 text-xs font-semibold text-gray-300 hover:bg-[#1A1D24]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={uploading}
                className="rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50 shadow-md"
              >
                {uploading ? "Envoi du PDF…" : "Enregistrer"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

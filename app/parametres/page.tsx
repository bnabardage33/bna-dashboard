"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Settings = {
  raison_sociale: string;
  siret: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  assurance: string | null;
  iban: string | null;
  bic: string | null;
  seuil_ca: number;
  taux_cotisations: number;
  mentions_legales: string | null;
  logo_url: string | null;
};

export default function ParametresPage() {
  const [form, setForm] = useState<Settings | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState<"idle" | "ok" | "erreur">("idle");
  const [uploadingLogo, setUploadingLogo] = useState(false);

  useEffect(() => {
    async function charger() {
      const { data, error } = await supabase
        .from("entreprise_settings")
        .select("*")
        .eq("id", 1)
        .single();
      if (error) console.error(error);
      else setForm(data as Settings);
      setLoading(false);
    }
    charger();
  }, []);

  function update(field: keyof Settings, value: string | number) {
    setForm((f) => (f ? { ...f, [field]: value } : f));
  }

  async function handleLogoUpload(file: File | undefined) {
    if (!file) return;
    setUploadingLogo(true);
    const fileName = `logo-${Date.now()}-${file.name}`;
    const { error: uploadError } = await supabase.storage.from("photos").upload(fileName, file);
    if (!uploadError) {
      const { data } = supabase.storage.from("photos").getPublicUrl(fileName);
      update("logo_url", data.publicUrl);
    } else {
      alert("Erreur téléversement logo : " + uploadError.message);
    }
    setUploadingLogo(false);
  }

  async function enregistrer(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setSaving(true);
    setStatus("idle");
    const { error } = await supabase.from("entreprise_settings").update(form).eq("id", 1);
    setSaving(false);
    setStatus(error ? "erreur" : "ok");
    setTimeout(() => setStatus("idle"), 3000);
  }

  if (loading || !form) return <p className="text-sm text-slate-400">Chargement…</p>;

  return (
    <form onSubmit={enregistrer} className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Réglages</h1>
          <p className="text-sm text-slate-400">
            Identité de l&apos;entreprise — utilisée sur les devis et factures.
          </p>
        </div>
        <div className="flex items-center gap-3">
          {status === "ok" && <span className="text-sm text-emerald-400">✓ Enregistré</span>}
          {status === "erreur" && <span className="text-sm text-red-400">✕ Erreur</span>}
          <button
            type="submit"
            disabled={saving}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500 disabled:opacity-50"
          >
            {saving ? "Enregistrement…" : "Enregistrer"}
          </button>
        </div>
      </div>

      <div className="grid gap-4 rounded-xl border border-slate-700 bg-slate-800 p-6 sm:grid-cols-2">
        <Field label="Raison sociale" value={form.raison_sociale} onChange={(v) => update("raison_sociale", v)} />
        <Field label="SIRET" value={form.siret ?? ""} onChange={(v) => update("siret", v)} />
        <Field label="Téléphone" value={form.telephone ?? ""} onChange={(v) => update("telephone", v)} />
        <Field label="Email" value={form.email ?? ""} onChange={(v) => update("email", v)} />
        <Field label="Adresse" value={form.adresse ?? ""} onChange={(v) => update("adresse", v)} full />
        <Field label="Code postal" value={form.code_postal ?? ""} onChange={(v) => update("code_postal", v)} />
        <Field label="Ville" value={form.ville ?? ""} onChange={(v) => update("ville", v)} />
        <Field label="Assurance décennale" value={form.assurance ?? ""} onChange={(v) => update("assurance", v)} full />
        <Field label="IBAN" value={form.iban ?? ""} onChange={(v) => update("iban", v)} />
        <Field label="BIC" value={form.bic ?? ""} onChange={(v) => update("bic", v)} />
        <Field
          label="Seuil CA régime simplifié (€)"
          value={String(form.seuil_ca)}
          onChange={(v) => update("seuil_ca", parseFloat(v) || 0)}
        />
        <Field
          label="Taux cotisations (%)"
          value={String(form.taux_cotisations)}
          onChange={(v) => update("taux_cotisations", parseFloat(v) || 0)}
        />

        {/* Logo de l'entreprise */}
        <div className="sm:col-span-2 rounded-lg border border-slate-600 bg-slate-900/50 p-4">
          <label className="text-xs font-bold uppercase tracking-wide text-slate-400">
            Logo de l&apos;entreprise (affiché sur les devis, factures & bons de commande)
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {form.logo_url ? (
              <div className="flex items-center gap-3 rounded-lg border border-slate-700 bg-white p-2">
                <img src={form.logo_url} alt="Logo entreprise" className="h-12 w-auto object-contain" />
              </div>
            ) : (
              <div className="flex h-12 w-28 items-center justify-center rounded-lg border border-dashed border-slate-600 text-xs text-slate-500">
                Aucun logo
              </div>
            )}
            <div className="flex-1 min-w-[200px]">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleLogoUpload(e.target.files?.[0])}
                disabled={uploadingLogo}
                className="w-full text-xs text-slate-400 file:mr-3 file:rounded-lg file:border-0 file:bg-red-600 file:px-3 file:py-1.5 file:text-xs file:font-semibold file:text-white hover:file:bg-red-500"
              />
              {uploadingLogo && <p className="mt-1 text-xs text-amber-400">Envoi du logo en cours…</p>}
            </div>
            {form.logo_url && (
              <button
                type="button"
                onClick={() => update("logo_url", "")}
                className="text-xs text-slate-400 hover:text-red-400"
              >
                Supprimer
              </button>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <label className="text-xs uppercase tracking-wide text-slate-500">
          Mentions légales (documents)
        </label>
        <textarea
          className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-900 p-3 text-sm text-slate-100"
          rows={3}
          value={form.mentions_legales ?? ""}
          onChange={(e) => update("mentions_legales", e.target.value)}
        />
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="text-xs uppercase tracking-wide text-slate-500">{label}</label>
      <input
        className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-2.5 text-sm text-slate-100"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

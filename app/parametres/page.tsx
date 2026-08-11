"use client";

import { useState } from "react";

export default function ParametresPage() {
  const [form, setForm] = useState({
    raisonSociale: "BNA BARDAGE",
    siret: "",
    telephone: "",
    email: "",
    adresse: "",
    tvaIntracommunautaire: "",
    assuranceDecennale: "",
    iban: "",
    bic: "",
    seuilCA: "77700",
    tauxCotisations: "21.98",
    mentionsLegales: "",
  });

  function update(field: string, value: string) {
    setForm((prev) => ({ ...prev, [field]: value }));
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Réglages</h1>
          <p className="text-sm text-slate-400">
            Identité de l&apos;entreprise et paramètres du régime simplifié.
          </p>
        </div>
        <button className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500">
          Enregistrer
        </button>
      </div>

      <div className="grid gap-4 rounded-xl border border-slate-700 bg-slate-800 p-6 sm:grid-cols-2">
        <Field label="Raison sociale" value={form.raisonSociale} onChange={(v) => update("raisonSociale", v)} />
        <Field label="SIRET" value={form.siret} onChange={(v) => update("siret", v)} />
        <Field label="Téléphone" value={form.telephone} onChange={(v) => update("telephone", v)} />
        <Field label="Email" value={form.email} onChange={(v) => update("email", v)} />
        <Field label="Adresse" value={form.adresse} onChange={(v) => update("adresse", v)} full />
        <Field label="TVA intracommunautaire" value={form.tvaIntracommunautaire} onChange={(v) => update("tvaIntracommunautaire", v)} />
        <Field label="Assurance décennale" value={form.assuranceDecennale} onChange={(v) => update("assuranceDecennale", v)} />
        <Field label="IBAN" value={form.iban} onChange={(v) => update("iban", v)} />
        <Field label="BIC" value={form.bic} onChange={(v) => update("bic", v)} />
        <Field label="Seuil CA régime simplifié (€)" value={form.seuilCA} onChange={(v) => update("seuilCA", v)} />
        <Field label="Taux cotisations (%)" value={form.tauxCotisations} onChange={(v) => update("tauxCotisations", v)} />
      </div>

      <div className="rounded-xl border border-slate-700 bg-slate-800 p-6">
        <label className="text-xs uppercase tracking-wide text-slate-500">
          Mentions légales (documents)
        </label>
        <textarea
          className="mt-2 w-full rounded-lg border border-slate-600 bg-slate-900 p-3 text-sm text-slate-100"
          rows={4}
          value={form.mentionsLegales}
          onChange={(e) => update("mentionsLegales", e.target.value)}
        />
      </div>
    </div>
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

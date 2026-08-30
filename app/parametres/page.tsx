// app/parametres/page.tsx
"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Building2, ShieldCheck, Scale, FileText, Check, AlertCircle } from "lucide-react";

export type Settings = {
  raison_sociale: string;
  siret: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  assurance: string | null;
  assurance_nom?: string | null;
  assurance_numero_police?: string | null;
  assurance_zone_geo?: string | null;
  mediateur_nom?: string | null;
  mediateur_contact?: string | null;
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
      try {
        const { data, error } = await supabase
          .from("entreprise_settings")
          .select("*")
          .eq("id", 1)
          .single();

        if (error) {
          alert("Erreur de chargement des paramètres : " + error.message);
        }

        const fb = data || {
          raison_sociale: "",
          siret: "",
          telephone: "",
          email: "",
          adresse: "",
          code_postal: "",
          ville: "",
          assurance: "",
          assurance_nom: "",
          assurance_numero_police: "",
          assurance_zone_geo: "",
          mediateur_nom: "",
          mediateur_contact: "",
          iban: "",
          bic: "",
          seuil_ca: 0,
          taux_cotisations: 0,
          mentions_legales: "",
          logo_url: "",
        };

        setForm({
          ...fb,
          assurance_nom: fb.assurance_nom || fb.assurance || "AXA Courtage / SMABTP",
          assurance_numero_police: fb.assurance_numero_police || "DEC-2024-884920",
          assurance_zone_geo: fb.assurance_zone_geo || "France métropolitaine et Corse",
          mediateur_nom: fb.mediateur_nom || "CM2C (Centre de la Médiation de la Consommation)",
          mediateur_contact: fb.mediateur_contact || "https://www.cm2c.net - 14 rue Saint Jean 75017 Paris",
        } as Settings);
      } catch (err: any) {
        alert("Exception de chargement : " + (err?.message || String(err)));
      } finally {
        setLoading(false);
      }
    }
    charger();
  }, []);

  function update(field: keyof Settings, value: string | number) {
    setForm((f) => (f ? { ...f, [field]: value } : f));
  }

  async function handleLogoUpload(file: File | undefined) {
    if (!file) return;
    setUploadingLogo(true);
    const fileName = `logo-${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, "_")}`;
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

    // Garantir la cohérence entre assurance_nom et assurance pour rétro-compatibilité
    const payload = {
      ...form,
      assurance: form.assurance_nom || form.assurance,
    };

    const { error } = await supabase.from("entreprise_settings").update(payload).eq("id", 1);
    setSaving(false);
    if (error) {
      alert("Erreur de sauvegarde : " + error.message);
      setStatus("erreur");
    } else {
      setStatus("ok");
    }
    setTimeout(() => setStatus("idle"), 3500);
  }

  if (loading || !form) {
    return (
      <div className="p-12 text-center text-xs text-gray-400">
        Chargement des paramètres de l&apos;entreprise…
      </div>
    );
  }

  return (
    <form onSubmit={enregistrer} className="space-y-6">
      {/* En-tête Réglages */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Réglages &amp; Données Juridiques</h1>
          <p className="text-xs text-gray-400">
            Identité légale, garanties décennales, médiation BTP et coordonnées de l&apos;entreprise.
          </p>
        </div>

        <div className="flex items-center gap-3">
          {status === "ok" && (
            <span className="flex items-center gap-1 text-xs font-semibold text-gray-400 animate-in fade-in">
              <Check className="h-4 w-4" />
              <span>Paramètres enregistrés</span>
            </span>
          )}
          {status === "erreur" && (
            <span className="flex items-center gap-1 text-xs font-semibold text-red-400 animate-in fade-in">
              <AlertCircle className="h-4 w-4" />
              <span>Erreur de sauvegarde</span>
            </span>
          )}
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-slate-950 shadow-lg shadow-red-600/10 hover:bg-red-700 disabled:opacity-50 transition-all"
          >
            {saving ? "Enregistrement…" : "Enregistrer les modifications"}
          </button>
        </div>
      </div>

      {/* 1. Bloc : Coordonnées de l'entreprise */}
      <div className="rounded-2xl border border-white/10 bg-[#1A1D24] p-5 shadow-md space-y-4">
        <div className="flex items-center gap-2.5 border-b border-white/10/80 pb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/15 text-gray-300">
            <Building2 className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Coordonnées &amp; Identité de l&apos;Entreprise</h2>
            <p className="text-[11px] text-gray-400">Informations affichées sur les devis, factures, PV et commandes</p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Raison sociale *" value={form.raison_sociale} onChange={(v) => update("raison_sociale", v)} />
          <Field label="Numéro SIRET *" value={form.siret ?? ""} onChange={(v) => update("siret", v)} />
          <Field label="Téléphone de contact *" value={form.telephone ?? ""} onChange={(v) => update("telephone", v)} />
          <Field label="Email professionnel *" value={form.email ?? ""} onChange={(v) => update("email", v)} />
          <Field label="Adresse postale *" value={form.adresse ?? ""} onChange={(v) => update("adresse", v)} full />
          <Field label="Code postal *" value={form.code_postal ?? ""} onChange={(v) => update("code_postal", v)} />
          <Field label="Ville *" value={form.ville ?? ""} onChange={(v) => update("ville", v)} />
          <Field label="IBAN pour virements" value={form.iban ?? ""} onChange={(v) => update("iban", v)} />
          <Field label="Code BIC / SWIFT" value={form.bic ?? ""} onChange={(v) => update("bic", v)} />
          <Field
            label="Seuil CA régime simplifié (€)"
            value={String(form.seuil_ca)}
            onChange={(v) => update("seuil_ca", parseFloat(v) || 0)}
          />
          <Field
            label="Taux cotisations sociales (%)"
            value={String(form.taux_cotisations)}
            onChange={(v) => update("taux_cotisations", parseFloat(v) || 0)}
          />
        </div>

        {/* Téléversement du Logo */}
        <div className="rounded-xl border border-white/10/80 bg-transparent/60 p-4">
          <label className="text-xs font-bold uppercase tracking-wide text-gray-400">
            Logo Officiel de l&apos;entreprise (PDF &amp; Écran)
          </label>
          <div className="mt-3 flex flex-wrap items-center gap-4">
            {form.logo_url ? (
              <div className="flex items-center gap-3 rounded-xl border border-white/10 bg-[#1A1D24] p-2.5 shadow-sm">
                <img src={form.logo_url} alt="Logo entreprise" className="h-16 w-auto object-contain" />
              </div>
            ) : (
              <div className="flex h-16 w-32 items-center justify-center rounded-xl border border-dashed border-slate-600 text-xs text-gray-400">
                /logo-bna.png (défaut)
              </div>
            )}
            <div className="flex-1 min-w-[200px]">
              <input
                type="file"
                accept="image/*"
                onChange={(e) => handleLogoUpload(e.target.files?.[0])}
                disabled={uploadingLogo}
                className="w-full text-xs text-gray-400 file:mr-3 file:rounded-xl file:border-0 file:bg-red-700 file:px-3.5 file:py-2 file:text-xs file:font-bold file:text-white hover:file:bg-red-600 cursor-pointer"
              />
              {uploadingLogo && <p className="mt-1 text-xs text-gray-400 font-semibold">Téléversement du logo…</p>}
            </div>
            {form.logo_url && (
              <button
                type="button"
                onClick={() => update("logo_url", "")}
                className="text-xs font-semibold text-gray-400 hover:text-red-400 transition-colors"
              >
                Réinitialiser
              </button>
            )}
          </div>
        </div>
      </div>

      {/* 2. Bloc : Assurance Décennale & RCP */}
      <div className="rounded-2xl border border-white/10 bg-[#1A1D24] p-5 shadow-md space-y-4">
        <div className="flex items-center gap-2.5 border-b border-white/10/80 pb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/15 text-gray-400">
            <ShieldCheck className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Assurance Décennale &amp; Responsabilité Civile Pro</h2>
            <p className="text-[11px] text-gray-400">
              Obligations légales (Loi Spinetta / Art. L.241-1 C. Assurances) injectées automatiquement dans les CGV et devis
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-3">
          <Field
            label="Nom de l'assureur décennale *"
            value={form.assurance_nom ?? form.assurance ?? ""}
            onChange={(v) => {
              update("assurance_nom", v);
              update("assurance", v);
            }}
            placeholder="Ex: AXA Courtage / SMABTP / QBE"
          />
          <Field
            label="N° de contrat / police décennale *"
            value={form.assurance_numero_police ?? ""}
            onChange={(v) => update("assurance_numero_police", v)}
            placeholder="Ex: DEC-2024-884920"
          />
          <Field
            label="Zone géographique couverte *"
            value={form.assurance_zone_geo ?? "France métropolitaine et Corse"}
            onChange={(v) => update("assurance_zone_geo", v)}
            placeholder="Ex: France métropolitaine et Corse"
          />
        </div>
      </div>

      {/* 3. Bloc : Médiateur de la Consommation */}
      <div className="rounded-2xl border border-white/10 bg-[#1A1D24] p-5 shadow-md space-y-4">
        <div className="flex items-center gap-2.5 border-b border-white/10/80 pb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/15 text-gray-400">
            <Scale className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Médiateur de la Consommation (Art. L.616-1)</h2>
            <p className="text-[11px] text-gray-400">
              Médiation BTP obligatoire pour les clients particuliers, mentionnée dans les Conditions Générales de Vente
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Nom de l'organisme de médiation *"
            value={form.mediateur_nom ?? "CM2C (Centre de la Médiation de la Consommation)"}
            onChange={(v) => update("mediateur_nom", v)}
            placeholder="Ex: CM2C / Médiateur du BTP"
          />
          <Field
            label="Site Internet / Contact du médiateur *"
            value={form.mediateur_contact ?? "https://www.cm2c.net - 14 rue Saint Jean 75017 Paris"}
            onChange={(v) => update("mediateur_contact", v)}
            placeholder="Ex: https://www.cm2c.net - 14 rue Saint Jean 75017 Paris"
          />
        </div>
      </div>

      {/* 4. Bloc : Mentions Légales */}
      <div className="rounded-2xl border border-white/10 bg-[#1A1D24] p-5 shadow-md space-y-3">
        <div className="flex items-center gap-2.5 border-b border-white/10/80 pb-3">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-red-600/15 text-gray-300">
            <FileText className="h-4 w-4" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Mentions Légales &amp; Pied de Page des Documents</h2>
            <p className="text-[11px] text-gray-400">Texte libre imprimé en bas des devis et factures</p>
          </div>
        </div>

        <textarea
          className="w-full rounded-xl border border-slate-600 bg-transparent p-3.5 text-xs text-white focus:border-red-600 focus:outline-none leading-relaxed"
          rows={3}
          value={form.mentions_legales ?? ""}
          onChange={(e) => update("mentions_legales", e.target.value)}
          placeholder="Ex: TVA non applicable, art. 293 B du CGI (ou numéro TVA intracommunautaire), dispensé d'immatriculation au RCS..."
        />
      </div>
    </form>
  );
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  full,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  full?: boolean;
}) {
  return (
    <div className={full ? "sm:col-span-2" : ""}>
      <label className="text-xs font-semibold text-gray-300">{label}</label>
      <input
        className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent p-2.5 text-xs text-white placeholder-slate-500 focus:border-red-600 focus:outline-none"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}

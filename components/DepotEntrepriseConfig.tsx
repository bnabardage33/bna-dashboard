"use client";

import { useState } from "react";
import { Building2, ChevronDown, ChevronUp, MapPin, Save, Loader2 } from "lucide-react";
import { supabase } from "@/lib/supabase";

export type EntrepriseDepot = {
  id: string;
  adresse_depot: string | null;
  depot_lat: number | null;
  depot_lng: number | null;
  effectif_plus_10: boolean;
};

export default function DepotEntrepriseConfig({
  entreprise,
  onSaved,
}: {
  entreprise: EntrepriseDepot | null;
  onSaved: (maj: EntrepriseDepot) => void;
}) {
  const [ouvert, setOuvert] = useState(false);
  const [adresse, setAdresse] = useState(entreprise?.adresse_depot ?? "");
  const [effectifPlus10, setEffectifPlus10] = useState(
    Boolean(entreprise?.effectif_plus_10)
  );
  const [saving, setSaving] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  if (!entreprise) return null;

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (!entreprise) return;
    setSaving(true);
    setFeedback(null);

    try {
      let lat = entreprise.depot_lat;
      let lng = entreprise.depot_lng;

      if (adresse.trim()) {
        const res = await fetch("/api/geocoder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adresse: adresse.trim() }),
        });
        const json = (await res.json()) as {
          lat?: number;
          lng?: number;
          error?: string;
        };
        if (!res.ok || typeof json.lat !== "number" || typeof json.lng !== "number") {
          setFeedback(`⚠️ Géocodage : ${json.error ?? "adresse introuvable"}`);
          setSaving(false);
          return;
        }
        lat = json.lat;
        lng = json.lng;
      }

      const { error } = await supabase
        .from("entreprises")
        .update({
          adresse_depot: adresse.trim() || null,
          depot_lat: lat,
          depot_lng: lng,
          effectif_plus_10: effectifPlus10,
        })
        .eq("id", entreprise.id);

      if (error) {
        setFeedback(`❌ Erreur (${error.code ?? "SQL"}) : ${error.message}`);
      } else {
        onSaved({
          id: entreprise.id,
          adresse_depot: adresse.trim() || null,
          depot_lat: lat,
          depot_lng: lng,
          effectif_plus_10: effectifPlus10,
        });
        setFeedback(
          lat && lng
            ? `✓ Dépôt enregistré (${lat.toFixed(4)}, ${lng.toFixed(4)}) · Grille ${effectifPlus10 ? "≥ 10" : "< 10"} salariés`
            : `✓ Paramètres dépôt enregistrés`
        );
      }
    } catch (err) {
      setFeedback(`❌ ${err instanceof Error ? err.message : "Erreur"}`);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="mb-5 rounded-xl border border-white/10 bg-[#1B1511] overflow-hidden">
      <button
        type="button"
        onClick={() => setOuvert(!ouvert)}
        className="flex w-full items-center justify-between px-4 py-3 text-left text-xs font-semibold text-gray-200 hover:bg-white/[0.03]"
      >
        <span className="flex items-center gap-2">
          <Building2 className="h-4 w-4 text-[#D96B27]" />
          <span>
            Dépôt &amp; Grille FFB Gironde ({entreprise.effectif_plus_10 ? "≥ 10 salariés" : "< 10 salariés"})
          </span>
          {entreprise.depot_lat && entreprise.depot_lng ? (
            <span className="rounded-full border border-emerald-500/30 bg-emerald-950/30 px-2 py-0.5 text-[10px] text-emerald-300">
              GPS OK
            </span>
          ) : (
            <span className="rounded-full border border-[#D96B27]/40 bg-[#D96B27]/15 px-2 py-0.5 text-[10px] text-[#F59E0B]">
              À configurer
            </span>
          )}
        </span>
        {ouvert ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </button>

      {ouvert && (
        <form onSubmit={handleSave} className="space-y-3 border-t border-white/10 p-4 text-xs">
          <div>
            <label className="mb-1 flex items-center gap-1.5 text-gray-400">
              <MapPin className="h-3.5 w-3.5 text-[#D96B27]" />
              Adresse du dépôt / siège (pour calcul distance à vol d&apos;oiseau)
            </label>
            <input
              type="text"
              value={adresse}
              onChange={(e) => setAdresse(e.target.value)}
              placeholder="Ex: 12 Rue de l'Artisanat, 33000 Bordeaux"
              className="w-full rounded-lg border border-white/10 bg-[#120F0D] px-3 py-2 text-sm text-white placeholder:text-gray-500 focus:border-[#D96B27] focus:outline-none"
            />
          </div>

          <label className="flex cursor-pointer items-center gap-2 text-gray-200">
            <input
              type="checkbox"
              checked={effectifPlus10}
              onChange={(e) => setEffectifPlus10(e.target.checked)}
              className="h-4 w-4 rounded border-white/20 accent-[#D96B27]"
            />
            <span>Entreprise de 10 salariés et plus (grille FFB ≥ 10 salariés)</span>
          </label>

          {feedback && (
            <p className="rounded-lg border border-white/10 bg-[#120F0D] px-3 py-2 text-xs text-amber-100">
              {feedback}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-lg bg-[#D96B27] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#E07A38] disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
            Enregistrer &amp; géocoder le dépôt
          </button>
        </form>
      )}
    </div>
  );
}

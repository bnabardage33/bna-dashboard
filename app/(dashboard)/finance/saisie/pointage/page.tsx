"use client";

import { useState, useEffect, useMemo } from "react";
import { supabase } from "@/lib/supabase";
import { obtenirContexteEntreprise } from "@/lib/contexteEntreprise";
import type { TablesInsert } from "@/types/supabase";
import { METIER_BADGE_CONFIG, normaliserMetierCode } from "@/lib/metierBadge";
import {
  AlerteIntemperiePointage,
  calculerIndemnitesPointage,
  deduireHeuresARattraper,
  useArretIntemperieJour,
  type TypeHeurePointage,
} from "@/components/AlerteIntemperiePointage";
import DepotEntrepriseConfig, { type EntrepriseDepot } from "@/components/DepotEntrepriseConfig";
import {
  calculerCoutHoraireRessource,
  calculerDistanceVolOiseauKm,
  determinerZoneFFB,
  obtenirIndemnitesFFBGironde,
} from "@/lib/baremeFFBGironde";
import { fmtEuro } from "@/lib/financeCalculs";
import { useRouter } from "next/navigation";

type ChantierSelect = {
  id: string;
  nom: string | null;
  metier?: string | null;
  adresse_chantier?: string | null;
  zone_deplacement?: string | null;
  distance_vol_oiseau_km?: number | null;
  taux_tva?: number | null;
};

type OuvrierSelect = {
  id: string;
  full_name: string;
  role: string | null;
  statut_emploi: string | null;
  agence_interim: string | null;
  type_contrat_interim: string | null;
  taux_horaire_brut: number | null;
  coefficient_agence: number | null;
};

export default function SaisiePointage() {
  const router = useRouter();

  const [chantiers, setChantiers] = useState<ChantierSelect[]>([]);
  const [ouvriers, setOuvriers] = useState<OuvrierSelect[]>([]);
  const [entreprise, setEntreprise] = useState<EntrepriseDepot | null>(null);

  const [formData, setFormData] = useState({
    chantier_id: "",
    date: new Date().toISOString().slice(0, 10),
    ouvrier_id: "",
    heures: 7,
    taux_horaire_charge: 28.5,
    type_heure: "productive" as TypeHeurePointage,
    phase_travail: "general",
    panier_repas: 10.8,
    indemnite_transport: 0,
    indemnite_trajet: 0,
  });

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    let isMounted = true;
    const fetchSelects = async () => {
      const entId = await obtenirContexteEntreprise();
      const [cRes, oRes, eRes] = await Promise.all([
        supabase
          .from("chantiers")
          .select("id, nom, metier, adresse_chantier, zone_deplacement, distance_vol_oiseau_km, taux_tva")
          .in("statut", ["en_cours", "prevu"]),
        supabase
          .from("profiles")
          .select("id, full_name, role, statut_emploi, agence_interim, type_contrat_interim, taux_horaire_brut, coefficient_agence"),
        supabase
          .from("entreprises")
          .select("id, adresse_depot, depot_lat, depot_lng, effectif_plus_10")
          .eq("id", entId)
          .maybeSingle(),
      ]);

      if (!isMounted) return;
      if (cRes.data) setChantiers(cRes.data as ChantierSelect[]);
      if (oRes.data) {
        setOuvriers(
          (oRes.data as OuvrierSelect[]).filter(
            (o) => !o.role || ["ouvrier", "chef", "admin"].includes(o.role)
          )
        );
      }
      if (eRes.data) {
        setEntreprise(eRes.data as EntrepriseDepot);
      }
    };
    void fetchSelects();
    return () => {
      isMounted = false;
    };
  }, []);

  const chantierSelectionne = useMemo(
    () => chantiers.find((c) => c.id === formData.chantier_id) ?? null,
    [chantiers, formData.chantier_id]
  );

  const ouvrierSelectionne = useMemo(
    () => ouvriers.find((o) => o.id === formData.ouvrier_id) ?? null,
    [ouvriers, formData.ouvrier_id]
  );

  const coutRessource = useMemo(
    () => calculerCoutHoraireRessource(ouvrierSelectionne, 28.5),
    [ouvrierSelectionne]
  );

  // Calcul automatique de la zone FFB si le chantier n'en a pas encore et que le dépôt est géocodé
  useEffect(() => {
    if (
      !chantierSelectionne ||
      chantierSelectionne.zone_deplacement ||
      !chantierSelectionne.adresse_chantier ||
      !entreprise?.depot_lat ||
      !entreprise?.depot_lng
    ) {
      return;
    }

    let actif = true;
    async function calculerZoneAuto() {
      if (!chantierSelectionne?.adresse_chantier || !entreprise?.depot_lat || !entreprise?.depot_lng) {
        return;
      }
      try {
        const res = await fetch("/api/geocoder", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ adresse: chantierSelectionne.adresse_chantier }),
        });
        if (!res.ok) return;
        const json = (await res.json()) as { lat?: number; lng?: number };
        if (typeof json.lat !== "number" || typeof json.lng !== "number") return;

        const distKm = calculerDistanceVolOiseauKm(
          entreprise.depot_lat,
          entreprise.depot_lng,
          json.lat,
          json.lng
        );
        const zone = determinerZoneFFB(distKm);

        await supabase
          .from("chantiers")
          .update({
            zone_deplacement: zone,
            distance_vol_oiseau_km: distKm,
          })
          .eq("id", chantierSelectionne.id);

        if (actif) {
          setChantiers((prev) =>
            prev.map((c) =>
              c.id === chantierSelectionne.id
                ? { ...c, zone_deplacement: zone, distance_vol_oiseau_km: distKm }
                : c
            )
          );
        }
      } catch {
        // Silencieux : l'utilisateur peut saisir manuellement
      }
    }
    void calculerZoneAuto();
    return () => {
      actif = false;
    };
  }, [chantierSelectionne, entreprise]);

  // Pré-remplissage intelligent des indemnités FFB & du coût horaire selon ressource + chantier
  useEffect(() => {
    if (!ouvrierSelectionne && !chantierSelectionne) return;

    const estGerant = coutRessource.statut === "gerant_tns";
    const ffb = estGerant
      ? { panier_repas: 0, indemnite_transport: 0, indemnite_trajet: 0 }
      : obtenirIndemnitesFFBGironde(
          chantierSelectionne?.zone_deplacement ?? "1A",
          Boolean(entreprise?.effectif_plus_10)
        );

    setFormData((prev) => ({
      ...prev,
      taux_horaire_charge: ouvrierSelectionne
        ? coutRessource.tauxHoraireHT
        : prev.taux_horaire_charge,
      panier_repas: ffb.panier_repas,
      indemnite_transport: ffb.indemnite_transport,
      indemnite_trajet: ffb.indemnite_trajet,
    }));
  }, [
    ouvrierSelectionne,
    chantierSelectionne?.id,
    chantierSelectionne?.zone_deplacement,
    entreprise?.effectif_plus_10,
    coutRessource.statut,
    coutRessource.tauxHoraireHT,
  ]);

  const { rapportArrete } = useArretIntemperieJour(formData.chantier_id, formData.date);

  const indemnitesCalculees = calculerIndemnitesPointage(
    {
      panier: formData.panier_repas,
      transport: formData.indemnite_transport,
      trajet: formData.indemnite_trajet,
    },
    rapportArrete
  );

  const heuresFacturees =
    formData.type_heure === "recuperation_intemperie"
      ? Math.min(1, Math.max(0, formData.heures || 0))
      : formData.heures || 0;

  const coutMainOeuvreHT =
    Math.round(heuresFacturees * (formData.taux_horaire_charge || 0) * 100) / 100;
  const coutTotalJourneeHT =
    Math.round(
      (coutMainOeuvreHT +
        indemnitesCalculees.panier +
        indemnitesCalculees.transport +
        indemnitesCalculees.trajet) *
        100
    ) / 100;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setSuccess(false);

    try {
      if (!formData.chantier_id || !formData.ouvrier_id) {
        throw new Error("Chantier et Ouvrier sont requis.");
      }
      if (rapportArrete && formData.type_heure === "productive") {
        throw new Error(
          `Arrêt intempéries validé (${rapportArrete.numero}) à cette date : la saisie d'heures productives est bloquée. Basculez en « Intempérie ».`
        );
      }

      const { error: insertError } = await supabase.from("pointages").insert({
        chantier_id: formData.chantier_id,
        user_id: formData.ouvrier_id,
        heures: heuresFacturees,
        taux_horaire_charge: formData.taux_horaire_charge,
        date: formData.date,
        type_heure: formData.type_heure,
        phase_travail: formData.phase_travail,
        panier_repas: indemnitesCalculees.panier,
        indemnite_transport: indemnitesCalculees.transport,
        indemnite_trajet: indemnitesCalculees.trajet,
      } as TablesInsert<"pointages">);

      if (insertError) throw insertError;

      if (formData.type_heure === "recuperation_intemperie") {
        await deduireHeuresARattraper(formData.chantier_id, heuresFacturees);
      }

      setSuccess(true);
      setTimeout(() => setSuccess(false), 3000);

      setFormData((prev) => ({
        ...prev,
        ouvrier_id: "",
        heures: 7,
        type_heure: "productive",
        phase_travail: "general",
      }));
    } catch (err) {
      setError((err as Error).message || "Erreur lors de l'enregistrement");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-xl mx-auto p-6 bg-[#1B1511] rounded-xl border border-white/10 mt-8 text-white">
      <h1 className="text-2xl font-bold mb-4">Saisie Pointage</h1>

      <DepotEntrepriseConfig
        entreprise={entreprise}
        onSaved={(maj) => setEntreprise(maj)}
      />

      {error && (
        <div className="mb-4 p-3 bg-rose-500/10 border border-rose-500/30 text-rose-400 rounded-md text-sm">
          {error}
        </div>
      )}
      {success && (
        <div className="mb-4 p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 rounded-md text-sm font-medium">
          Pointage enregistré avec succès !
        </div>
      )}

      <div className="mb-4">
        <AlerteIntemperiePointage
          rapport={rapportArrete}
          bloqueProductive={formData.type_heure === "productive"}
          onBasculerIntemperie={() =>
            setFormData((prev) => ({ ...prev, type_heure: "intemperie" }))
          }
          regleIndemnite={indemnitesCalculees.regle}
        />
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label htmlFor="chp-chantier" className="block text-sm text-gray-400 mb-1">
            Chantier
          </label>
          <select
            id="chp-chantier"
            required
            className="w-full bg-[#120F0D] border border-white/10 rounded-md p-2 focus:border-[#D96B27] outline-none"
            value={formData.chantier_id}
            onChange={(e) => setFormData({ ...formData, chantier_id: e.target.value })}
          >
            <option value="">Sélectionner un chantier</option>
            {chantiers.map((c) => (
              <option key={c.id} value={c.id}>
                [{METIER_BADGE_CONFIG[normaliserMetierCode(c.metier)].label}] {c.nom}
                {c.zone_deplacement ? ` · Zone ${c.zone_deplacement}` : ""}
              </option>
            ))}
          </select>
          {chantierSelectionne && (
            <p className="mt-1 text-[11px] text-amber-200/80">
              TVA chantier : {chantierSelectionne.taux_tva ?? 20}%
              {chantierSelectionne.zone_deplacement
                ? ` · Zone FFB ${chantierSelectionne.zone_deplacement}${
                    chantierSelectionne.distance_vol_oiseau_km != null
                      ? ` (${chantierSelectionne.distance_vol_oiseau_km} km à vol d'oiseau)`
                      : ""
                  }`
                : " · Zone FFB par défaut 1A (configurez le dépôt ci-dessus pour calculer automatiquement)"}
            </p>
          )}
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="chp-date" className="block text-sm text-gray-400 mb-1">
              Date
            </label>
            <input
              id="chp-date"
              type="date"
              required
              className="w-full bg-[#120F0D] border border-white/10 rounded-md p-2 focus:border-[#D96B27] outline-none"
              value={formData.date}
              onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            />
          </div>
          <div>
            <label htmlFor="chp-ouvrier" className="block text-sm text-gray-400 mb-1">
              Ressource / Ouvrier
            </label>
            <select
              id="chp-ouvrier"
              required
              className="w-full bg-[#120F0D] border border-white/10 rounded-md p-2 focus:border-[#D96B27] outline-none"
              value={formData.ouvrier_id}
              onChange={(e) => setFormData({ ...formData, ouvrier_id: e.target.value })}
            >
              <option value="">Sélectionner</option>
              {ouvriers.map((o) => (
                <option key={o.id} value={o.id}>
                  {o.full_name || o.id} (
                  {o.statut_emploi === "interimaire"
                    ? "Intérimaire"
                    : o.statut_emploi === "gerant_tns"
                    ? "Gérant TNS"
                    : "Salarié"}
                  )
                </option>
              ))}
            </select>
          </div>
        </div>

        {ouvrierSelectionne && (
          <div className="rounded-lg border border-white/10 bg-[#120F0D] px-3 py-2 text-xs text-gray-300">
            {coutRessource.detail}
          </div>
        )}

        <div className="grid grid-cols-2 gap-4">
          <div>
            <label htmlFor="chp-heures" className="block text-sm text-gray-400 mb-1">
              Heures
            </label>
            <input
              id="chp-heures"
              type="number"
              step="0.5"
              min="0.5"
              max="24"
              required
              className="w-full bg-[#120F0D] border border-white/10 rounded-md p-2 focus:border-[#D96B27] outline-none"
              value={formData.heures}
              onChange={(e) => setFormData({ ...formData, heures: parseFloat(e.target.value) })}
            />
          </div>
          <div>
            <label htmlFor="chp-taux-horaire-charge" className="block text-sm text-gray-400 mb-1">
              Taux horaire HT imputé (€)
            </label>
            <input
              id="chp-taux-horaire-charge"
              type="number"
              step="0.01"
              min="0"
              required
              className="w-full bg-[#120F0D] border border-white/10 rounded-md p-2 focus:border-[#D96B27] outline-none"
              value={formData.taux_horaire_charge}
              onChange={(e) =>
                setFormData({ ...formData, taux_horaire_charge: parseFloat(e.target.value) })
              }
            />
          </div>
        </div>

        <div className="grid grid-cols-3 gap-3">
          <div>
            <label htmlFor="chp-panier" className="block text-xs text-gray-400 mb-1">
              Panier FFB (€)
            </label>
            <input
              id="chp-panier"
              type="number"
              step="0.01"
              min="0"
              disabled={Boolean(rapportArrete)}
              className="w-full bg-[#120F0D] border border-white/10 rounded-md p-2 text-sm disabled:opacity-60 outline-none"
              value={indemnitesCalculees.panier}
              onChange={(e) =>
                setFormData({ ...formData, panier_repas: parseFloat(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <label htmlFor="chp-transport" className="block text-xs text-gray-400 mb-1">
              Transport FFB (€)
            </label>
            <input
              id="chp-transport"
              type="number"
              step="0.01"
              min="0"
              disabled={Boolean(rapportArrete)}
              className="w-full bg-[#120F0D] border border-white/10 rounded-md p-2 text-sm disabled:opacity-60 outline-none"
              value={indemnitesCalculees.transport}
              onChange={(e) =>
                setFormData({ ...formData, indemnite_transport: parseFloat(e.target.value) || 0 })
              }
            />
          </div>
          <div>
            <label htmlFor="chp-trajet" className="block text-xs text-gray-400 mb-1">
              Trajet FFB (€)
            </label>
            <input
              id="chp-trajet"
              type="number"
              step="0.01"
              min="0"
              disabled={Boolean(rapportArrete)}
              className="w-full bg-[#120F0D] border border-white/10 rounded-md p-2 text-sm disabled:opacity-60 outline-none"
              value={indemnitesCalculees.trajet}
              onChange={(e) =>
                setFormData({ ...formData, indemnite_trajet: parseFloat(e.target.value) || 0 })
              }
            />
          </div>
        </div>

        <div>
          <label htmlFor="chp-phase-de-travail" className="block text-sm text-gray-400 mb-1">
            Phase de travail
          </label>
          <select
            id="chp-phase-de-travail"
            required
            className="w-full bg-[#120F0D] border border-white/10 rounded-md p-2 focus:border-[#D96B27] outline-none"
            value={formData.phase_travail}
            onChange={(e) => setFormData({ ...formData, phase_travail: e.target.value })}
          >
            <option value="ossature">🏗️ Pose Ossature (DTU 45.4)</option>
            <option value="isolation">🌡️ Pose Isolation (ITE)</option>
            <option value="bardage">🪵 Pose Bardage (DTU 41.2)</option>
            <option value="finitions">✨ Finitions &amp; Profilés</option>
            <option value="general">📁 Nettoyage / Repli général</option>
          </select>
        </div>

        <div>
          <label id="grp-type-d-heure" className="block text-sm text-gray-400 mb-1">
            Type d&apos;heure
          </label>
          <div
            role="group"
            aria-labelledby="grp-type-d-heure"
            className="grid grid-cols-2 sm:grid-cols-4 gap-2"
          >
            {(
              [
                { value: "productive", label: "Productive" },
                { value: "intemperie", label: "Intempérie" },
                { value: "recuperation_intemperie", label: "Récup. intemp. (max 1h/j)" },
                { value: "supplementaire", label: "Supplémentaire" },
              ] as const
            ).map((opt) => (
              <button
                key={opt.value}
                type="button"
                onClick={() => setFormData({ ...formData, type_heure: opt.value })}
                className={`py-2 px-2 text-xs font-medium rounded-md border transition-colors ${
                  formData.type_heure === opt.value
                    ? "bg-[#D96B27]/25 border-[#D96B27] text-amber-200"
                    : "border-white/10 bg-transparent text-gray-400 hover:bg-[#120F0D]"
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
          {formData.type_heure === "recuperation_intemperie" && (
            <p className="mt-1 text-[11px] text-amber-200/80">
              Récupération intempéries : sans majoration +25 %, plafonnée à 1 h/jour et déduite automatiquement de heures_a_rattraper.
            </p>
          )}
        </div>

        {/* Récapitulatif Coût total HT imputé au chantier */}
        <div className="rounded-xl border border-[#D96B27]/35 bg-[#120F0D] p-3.5 text-xs">
          <div className="flex items-center justify-between text-gray-300">
            <span>Main-d&apos;œuvre HT ({heuresFacturees} h)</span>
            <span className="font-semibold text-white">{fmtEuro(coutMainOeuvreHT)}</span>
          </div>
          <div className="mt-1 flex items-center justify-between text-gray-400">
            <span>Panier + Transport + Trajet</span>
            <span>
              {fmtEuro(
                indemnitesCalculees.panier +
                  indemnitesCalculees.transport +
                  indemnitesCalculees.trajet
              )}
            </span>
          </div>
          <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-2 text-sm font-bold text-[#F59E0B]">
            <span>Coût total HT imputé au chantier</span>
            <span>{fmtEuro(coutTotalJourneeHT)}</span>
          </div>
        </div>

        <div className="pt-2 flex justify-between items-center">
          <button
            type="button"
            onClick={() => router.back()}
            className="text-sm font-medium text-gray-400 hover:text-gray-200"
          >
            Retour
          </button>
          <button
            type="submit"
            disabled={loading}
            className="px-6 py-2 bg-[#D96B27] hover:bg-[#E07A38] text-white rounded-lg font-semibold disabled:opacity-50 transition-colors"
          >
            {loading ? "Enregistrement..." : "Enregistrer le pointage"}
          </button>
        </div>
      </form>
    </div>
  );
}

"use client";

import React, { useState, useEffect } from "react";
import Link from "next/link";
import {
  Sparkles,
  Loader2,
  MapPin,
  Building2,
  Save,
  Check,
  Copy,
  ArrowRight,
  Car,
  Calculator,
  Trash2,
  Link as LinkIcon,
  CheckCircle,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { Materiau, Acces, LABELS_MATERIAU, LABELS_ACCES } from "@/lib/meteoAlerte";
import { useDeplacements } from "@/hooks/useDeplacements";
import { fmtEuro } from "@/lib/financeCalculs";
import { composerAdresseDepart } from "@/lib/deplacement/adresse";

// Réexport de compatibilité pour les contrats de tests existants
export { default as FraisDeplacementTab } from "@/components/FraisDeplacementTab";

export interface BardageGeneralDeplacementsModuleProps {
  chantierId: string;
  nom: string;
  clientId: string;
  clientNom?: string;
  adresseChantier: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  statut: string;
  codeAcces: string | null;
  materiauStructurel?: Materiau;
  moyenAcces?: Acces;
  zoneVent?: number;
  checklist?: Record<string, boolean>;
  devisLikables?: { id: string; numero: string }[];
  adresseDepartDefaut?: string | null;
  onChantierMisAJour?: () => void;
}

export default function BardageGeneralDeplacementsModule({
  chantierId,
  nom,
  clientNom,
  adresseChantier,
  dateDebut: initialDateDebut,
  dateFin: initialDateFin,
  statut: initialStatut,
  codeAcces,
  materiauStructurel = "bois",
  moyenAcces = "echafaudage",
  zoneVent = 1,
  devisLikables = [],
  adresseDepartDefaut = null,
  onChantierMisAJour,
}: BardageGeneralDeplacementsModuleProps) {
  // 1. États du formulaire d'informations générales
  const [statut, setStatut] = useState(initialStatut || "prevu");
  const [dateDebut, setDateDebut] = useState(initialDateDebut || "");
  const [dateFin, setDateFin] = useState(initialDateFin || "");
  const [adresse, setAdresse] = useState(adresseChantier || "");
  const [isSaving, setIsSaving] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // 2. Moteur de gestion des déplacements (Harmonisation 1:1 sur le Hub Terrasse)
  const {
    historique,
    isLoadingHistorique,
    evaluerTrajet,
    isEvaluating,
    evalError,
    evaluation,
    enregistrerDeplacement,
    isSaving: isSavingDeplacement,
    supprimerDeplacement,
    lierAuDevis,
    isLinking,
    resetEvaluation,
  } = useDeplacements(chantierId);

  const [adresseDepart, setAdresseDepart] = useState("");
  const [adresseArrivee, setAdresseArrivee] = useState(adresseChantier || "");
  const [selectedDevisId, setSelectedDevisId] = useState<Record<string, string>>({});

  // Charger l'adresse par défaut de l'entreprise (Dépôt)
  useEffect(() => {
    async function chargerAdresseEntreprise() {
      if (adresseDepartDefaut) {
        setAdresseDepart(adresseDepartDefaut);
        return;
      }
      const { data } = await supabase
        .from("entreprise_settings")
        .select("adresse, code_postal, ville")
        .limit(1)
        .maybeSingle();

      if (data) {
        const adr = composerAdresseDepart(data);
        if (adr) setAdresseDepart(adr);
      }
    }
    chargerAdresseEntreprise();
  }, [adresseDepartDefaut]);

  // Synchroniser l'adresse d'arrivée si l'adresse du chantier change
  useEffect(() => {
    if (adresseChantier) {
      setAdresseArrivee(adresseChantier);
    }
  }, [adresseChantier]);

  // Actions de calcul & gestion des déplacements
  const handleEvaluer = () => {
    if (!adresseDepart.trim() || !adresseArrivee.trim()) return;
    evaluerTrajet(adresseDepart, adresseArrivee);
  };

  const handleEnregistrer = () => {
    enregistrerDeplacement(adresseDepart, adresseArrivee).then(() => {
      resetEvaluation();
    });
  };

  const handleDelete = (id: string, devisId: string | null) => {
    if (devisId) {
      alert("Action impossible : déplacement déjà rattaché à un devis.");
      return;
    }
    if (window.confirm("Voulez-vous vraiment supprimer ce trajet enregistré ?")) {
      supprimerDeplacement(id);
    }
  };

  const handleLier = (deplacementId: string) => {
    const devisId = selectedDevisId[deplacementId];
    if (!devisId) return;
    if (
      window.confirm(
        "Voulez-vous vraiment inclure ce déplacement dans le devis sélectionné ? Cette action est irréversible."
      )
    ) {
      lierAuDevis(deplacementId, devisId);
    }
  };

  const totalHT = historique.reduce((acc, curr) => acc + (curr.montant_ht || 0), 0);
  const totalKmAR = historique.reduce(
    (acc, curr) => acc + (curr.distance_aller_km + curr.distance_retour_km),
    0
  );

  // 3. PPSPS Express IA (Conserve le contexte technique métier en arrière-plan)
  const [consignesSecurite, setConsignesSecurite] = useState<string | null>(null);
  const [isGeneratingSecurite, setIsGeneratingSecurite] = useState(false);

  async function genererSecuriteIA() {
    setIsGeneratingSecurite(true);
    const contexte = `Chantier: ${nom}\nMatériau: ${LABELS_MATERIAU[materiauStructurel] || "Bois"}\nMoyen d'accès: ${LABELS_ACCES[moyenAcces] || "Pied d'œuvre"}\nZone vent: ${zoneVent}`;

    try {
      const res = await fetch("/api/ia-securite", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contexte }),
      });
      if (!res.ok) throw new Error("Erreur IA");
      const data = await res.json();
      setConsignesSecurite(data.texte);
    } catch {
      alert("Impossible de générer les consignes.");
    } finally {
      setIsGeneratingSecurite(false);
    }
  }

  async function handleSauvegarder(e: React.FormEvent) {
    e.preventDefault();
    setIsSaving(true);
    setSaveSuccess(false);

    // Sauvegarde ciblée exclusivement sur les informations générales du chantier
    // Sans écraser ni altérer les données techniques métier (matériau, moyen d'accès, zone de vent, checklist)
    const { error } = await supabase
      .from("chantiers")
      .update({
        statut,
        date_debut: dateDebut || null,
        date_fin: dateFin || null,
        adresse_chantier: adresse.trim() || null,
      })
      .eq("id", chantierId);

    setIsSaving(false);
    if (!error) {
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 2500);
      onChantierMisAJour?.();
    } else {
      alert("Erreur enregistrement : " + error.message);
    }
  }

  function handleCopierCode() {
    if (!codeAcces) return;
    navigator.clipboard.writeText(codeAcces);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2000);
  }

  return (
    <div className="space-y-6">
      {/* 1. Bloc Sécurité & PPSPS Express IA */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
              <Sparkles className="h-5 w-5" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-[#23272B] tracking-tight">
                PPSPS Express (Consignes de Sécurité IA)
              </h3>
              <p className="text-xs text-[#777777]">
                Génération instantanée des 5 règles d&apos;or de sécurité selon le matériau et l&apos;accès en hauteur.
              </p>
            </div>
          </div>

          {!consignesSecurite && (
            <button
              type="button"
              onClick={genererSecuriteIA}
              disabled={isGeneratingSecurite}
              className="flex items-center gap-1.5 rounded-xl bg-[#B85B2B] hover:bg-[#D97732] active:scale-[0.98] px-3.5 py-2 text-xs font-bold text-white transition shadow-xs disabled:opacity-50"
            >
              {isGeneratingSecurite ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Sparkles className="h-3.5 w-3.5" />
              )}
              {isGeneratingSecurite ? "Génération en cours..." : "Générer les consignes"}
            </button>
          )}
        </div>

        {consignesSecurite && (
          <div className="mt-4 rounded-xl border border-[#B85B2B]/20 bg-[#FDFBF9] p-4 text-xs text-[#23272B] whitespace-pre-wrap leading-relaxed">
            {consignesSecurite}
            <div className="mt-3 flex justify-end">
              <button
                type="button"
                onClick={() => setConsignesSecurite(null)}
                className="text-xs font-semibold text-[#777777] hover:text-[#23272B] underline"
              >
                Fermer les consignes
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2. Formulaire des Informations Générales du Chantier (Épuré et Réorganisé) */}
      <form onSubmit={handleSauvegarder}>
        <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)] space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0F0F0] pb-3">
            <div className="flex items-center gap-2">
              <Building2 className="h-5 w-5 text-[#B85B2B]" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#23272B]">
                Informations Générales du Chantier
              </h3>
            </div>
            {codeAcces && (
              <button
                type="button"
                onClick={handleCopierCode}
                className="flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white px-3 py-1.5 text-xs font-semibold text-[#23272B] transition"
                title="Copier le code d'accès client"
              >
                {copiedCode ? (
                  <Check size={13} className="text-emerald-600" />
                ) : (
                  <Copy size={13} className="text-[#B85B2B]" />
                )}
                <span>Code client : <strong>{codeAcces}</strong></span>
              </button>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div>
              <label className="text-xs font-semibold text-[#777777]">Client</label>
              <p className="mt-1 font-bold text-xs text-[#23272B] px-3 py-2 rounded-xl bg-[#F8F9FA] border border-[#E5E5E5]">
                {clientNom || "Client non renseigné"}
              </p>
            </div>

            <div>
              <label className="text-xs font-semibold text-[#777777]">Date de début</label>
              <input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-[#777777]">Date de fin prévisionnelle</label>
              <input
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
              />
            </div>

            <div className="sm:col-span-2">
              <label className="text-xs font-semibold text-[#777777]">Adresse du chantier</label>
              <input
                type="text"
                value={adresse}
                onChange={(e) => {
                  setAdresse(e.target.value);
                  setAdresseArrivee(e.target.value);
                }}
                placeholder="Ex. 12 rue des Vignes, 33000 Bordeaux"
                className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
              />
              {adresse && (
                <a
                  href={`https://www.google.com/maps/dir/?api=1&destination=${encodeURIComponent(
                    adresse
                  )}&travelmode=driving`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1.5 inline-flex items-center gap-1 text-2xs font-semibold text-[#B85B2B] hover:underline"
                >
                  <MapPin size={11} /> Ouvrir l&apos;itinéraire GPS (Google Maps)
                </a>
              )}
            </div>

            <div>
              <label className="text-xs font-semibold text-[#777777]">Statut opérationnel</label>
              <select
                value={statut}
                onChange={(e) => setStatut(e.target.value)}
                className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-3 py-2 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
              >
                <option value="prevu">Prévu</option>
                <option value="en_cours">En cours</option>
                <option value="termine">Terminé</option>
              </select>
            </div>
          </div>

          {/* Action d'enregistrement dédiée aux informations générales */}
          <div className="pt-3 border-t border-[#F0F0F0] flex flex-wrap items-center justify-between gap-3">
            <p className="text-2xs text-[#777777]">
              L&apos;adresse alimente le calcul automatique des trajets et des frais de déplacement ci-dessous.
            </p>
            <div className="flex items-center gap-3">
              {saveSuccess && (
                <span className="text-xs font-bold text-emerald-600 animate-in fade-in">
                  ✓ Informations enregistrées avec succès
                </span>
              )}
              <button
                type="submit"
                disabled={isSaving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#B85B2B] hover:bg-[#D97732] active:scale-[0.98] px-4 py-2 text-xs font-bold text-white transition shadow-xs disabled:opacity-50"
              >
                {isSaving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Save size={14} />
                )}
                <span>{isSaving ? "Enregistrement..." : "Enregistrer les modifications"}</span>
              </button>
            </div>
          </div>
        </div>
      </form>

      {/* 3. Frais de Déplacement & Trajets Associés (HARMONISÉ SUR LE HUB TERRASSE - THEME CLAIR BNA) */}
      <section className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#F0F0F0] pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
              <Car className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-[#23272B]">
                Frais de Déplacement &amp; Trajets Associés
              </h3>
              <p className="text-xs text-[#777777]">
                Calcul kilométrique, barème d&apos;indemnités et liaison directe avec les devis bardage
              </p>
            </div>
          </div>

          {historique.length > 0 && (
            <div className="flex items-center gap-3 rounded-xl bg-[#F8F9FA] px-3.5 py-1.5 border border-[#E5E5E5]">
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#777777]">Total trajets</p>
                <p className="text-sm font-bold text-[#B85B2B]">{fmtEuro(totalHT)}</p>
              </div>
              <div className="h-6 w-px bg-gray-200" />
              <div className="text-right">
                <p className="text-[10px] font-bold uppercase tracking-wider text-[#777777]">Cumul distance</p>
                <p className="text-sm font-bold text-[#23272B]">{totalKmAR.toFixed(1)} km</p>
              </div>
            </div>
          )}
        </div>

        {/* Formulaire de calcul d'un trajet */}
        <div className="mb-6 rounded-2xl border border-[#E5E5E5] bg-[#F8F9FA] p-4 sm:p-5">
          <p className="mb-3 text-xs font-bold uppercase tracking-wider text-[#B85B2B]">
            Évaluer un trajet pour ce chantier
          </p>
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-semibold text-[#777777]">
                Départ (Dépôt / Entreprise)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={adresseDepart}
                  onChange={(e) => setAdresseDepart(e.target.value)}
                  placeholder="Adresse de départ..."
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
                />
                <MapPin className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
              </div>
            </div>

            <div>
              <label className="mb-1 block text-xs font-semibold text-[#777777]">
                Arrivée (Adresse Bardage)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={adresseArrivee}
                  onChange={(e) => setAdresseArrivee(e.target.value)}
                  placeholder="Adresse du chantier bardage..."
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
                />
                <MapPin className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
              </div>
            </div>
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <span className="text-xs text-gray-500">
              Barème fiscal appliqué automatiquement via OpenStreetMap / OSRM
            </span>
            <button
              type="button"
              onClick={handleEvaluer}
              disabled={isEvaluating || !adresseDepart.trim() || !adresseArrivee.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#B85B2B] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#D97732] active:scale-[0.98] disabled:opacity-50"
            >
              <Calculator className="h-4 w-4" />
              {isEvaluating ? "Calcul de distance..." : "Calculer le trajet"}
            </button>
          </div>

          {evalError && (
            <div className="mt-3 rounded-xl border border-red-200 bg-red-50 p-2.5 text-xs text-red-700">
              {evalError}
            </div>
          )}

          {evaluation && (
            <div className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 animate-in fade-in">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-emerald-900">
                    Trajet calculé : Aller {evaluation.distanceAllerKm} km · Retour {evaluation.distanceRetourKm} km
                  </p>
                  <p className="text-xs text-emerald-700">
                    Indemnité kilométrique : {evaluation.tarifKm} €/km · Total HT :{" "}
                    <strong>{fmtEuro(evaluation.montantHt)}</strong>
                  </p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={resetEvaluation}
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50 active:scale-[0.98]"
                  >
                    Effacer
                  </button>
                  <button
                    type="button"
                    onClick={handleEnregistrer}
                    disabled={isSavingDeplacement}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700 active:scale-[0.98]"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    {isSavingDeplacement ? "Enregistrement..." : "Conserver ce déplacement"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Historique des trajets enregistrés pour ce chantier */}
        <div>
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#777777]">
            Trajets &amp; Déplacements Enregistrés ({historique.length})
          </h4>

          {isLoadingHistorique ? (
            <p className="py-4 text-center text-xs text-gray-400">Chargement des trajets...</p>
          ) : historique.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-500">
              Aucun déplacement n&apos;est encore associé à ce chantier bardage. Utilisez le formulaire ci-dessus pour évaluer et enregistrer un premier trajet.
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-[#E5E5E5]">
              <table className="w-full text-left text-xs min-w-[600px]">
                <thead className="bg-[#F7F7F6] text-[#777777]">
                  <tr>
                    <th className="px-4 py-2.5 font-bold">Date</th>
                    <th className="px-4 py-2.5 font-bold">Trajet Aller / Retour</th>
                    <th className="px-4 py-2.5 font-bold">Distance A/R</th>
                    <th className="px-4 py-2.5 font-bold">Montant HT</th>
                    <th className="px-4 py-2.5 font-bold">Devis associé</th>
                    <th className="px-4 py-2.5 text-right font-bold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F0F0] text-[#23272B]">
                  {historique.map((dep) => (
                    <tr key={dep.id} className="hover:bg-gray-50/70">
                      <td className="px-4 py-3 font-medium whitespace-nowrap">
                        {new Date(dep.date).toLocaleDateString("fr-FR")}
                      </td>
                      <td className="px-4 py-3">
                        <div className="max-w-xs truncate text-[11px] text-gray-500">
                          De : {dep.adresse_depart || "Dépôt"}
                        </div>
                        <div className="max-w-xs truncate text-[11px] font-semibold text-[#23272B]">
                          À : {dep.adresse_arrivee || "Chantier"}
                        </div>
                      </td>
                      <td className="px-4 py-3 font-semibold whitespace-nowrap">
                        {(dep.distance_aller_km + dep.distance_retour_km).toFixed(1)} km
                      </td>
                      <td className="px-4 py-3 font-bold text-[#B85B2B] whitespace-nowrap">
                        {fmtEuro(dep.montant_ht)}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        {dep.devis_id ? (
                          <span className="inline-flex items-center gap-1 rounded-md bg-emerald-50 px-2 py-0.5 text-[11px] font-bold text-emerald-700 border border-emerald-200">
                            <CheckCircle className="h-3 w-3" /> Devis rattaché
                          </span>
                        ) : devisLikables.length > 0 ? (
                          <div className="flex items-center gap-1.5">
                            <select
                              value={selectedDevisId[dep.id] || ""}
                              onChange={(e) =>
                                setSelectedDevisId((prev) => ({
                                  ...prev,
                                  [dep.id]: e.target.value,
                                }))
                              }
                              className="rounded-lg border border-[#E5E5E5] bg-white px-2 py-1 text-[11px] text-[#23272B] focus:outline-none"
                            >
                              <option value="">Sélectionner devis...</option>
                              {devisLikables.map((d) => (
                                <option key={d.id} value={d.id}>
                                  Devis n° {d.numero}
                                </option>
                              ))}
                            </select>
                            <button
                              type="button"
                              onClick={() => handleLier(dep.id)}
                              disabled={isLinking || !selectedDevisId[dep.id]}
                              className="rounded-lg bg-[#23272B] px-2 py-1 text-[11px] font-bold text-white hover:bg-[#B85B2B] disabled:opacity-40"
                              title="Lier au devis"
                            >
                              <LinkIcon className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <span className="text-[11px] text-gray-400">Non rattaché</span>
                        )}
                      </td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => handleDelete(dep.id, dep.devis_id)}
                          className="rounded p-1 text-gray-400 hover:text-red-600"
                          title="Supprimer ce déplacement"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* 4. Fin de Chantier & PV de Réception */}
      <div className="rounded-2xl sm:rounded-3xl border border-emerald-200 bg-emerald-50/50 p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)] flex flex-wrap items-center justify-between gap-4">
        <div>
          <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-900">
            🏁 Fin de Chantier &amp; Procès-Verbal de Réception
          </h4>
          <p className="mt-1 text-xs text-emerald-800/80">
            Rédiger le procès-verbal, consigner les réserves éventuelles, faire signer le client et déclencher la garantie décennale.
          </p>
        </div>

        <Link
          href={`/bureau/fin-chantier?chantierId=${chantierId}`}
          className="flex items-center gap-1.5 rounded-xl bg-emerald-700 hover:bg-emerald-800 px-4 py-2 text-xs font-bold text-white transition shadow-xs"
        >
          <span>Établir le PV de Réception</span>
          <ArrowRight size={13} />
        </Link>
      </div>
    </div>
  );
}

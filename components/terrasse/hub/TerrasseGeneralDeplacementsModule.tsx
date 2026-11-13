"use client";

import React, { useState, useEffect, useRef } from "react";
import {
  Building2,
  MapPin,
  Calendar,
  User,
  Car,
  Calculator,
  Trash2,
  Link as LinkIcon,
  CheckCircle,
  Clock,
  KeyRound,
  Save,
  AlertCircle,
  Copy,
  Check,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { useDeplacements } from "@/hooks/useDeplacements";
import { fmtEuro } from "@/lib/financeCalculs";
import { composerAdresseDepart } from "@/lib/deplacement/adresse";

export interface TerrasseGeneralDeplacementsModuleProps {
  chantierId: string;
  nom: string;
  clientId: string;
  clientNom?: string;
  adresseChantier: string | null;
  dateDebut: string | null;
  dateFin: string | null;
  statut: string;
  codeAcces: string | null;
  contactChantier?: string | null;
  notesTerrain?: string | null;
  onChantierMisAJour?: () => void;
  devisLikables?: { id: string; numero: string }[];
}

export default function TerrasseGeneralDeplacementsModule({
  chantierId,
  nom,
  clientNom,
  adresseChantier,
  dateDebut: initialDateDebut,
  dateFin: initialDateFin,
  statut: initialStatut,
  codeAcces,
  contactChantier: initialContact,
  notesTerrain: initialNotes,
  onChantierMisAJour,
  devisLikables = [],
}: TerrasseGeneralDeplacementsModuleProps) {
  // 1. États du chantier
  const [statut, setStatut] = useState(initialStatut || "prevu");
  const [dateDebut, setDateDebut] = useState(initialDateDebut || "");
  const [dateFin, setDateFin] = useState(initialDateFin || "");
  const [contact, setContact] = useState(initialContact || "");
  const [notes, setNotes] = useState(initialNotes || "");
  const [savingGeneral, setSavingGeneral] = useState(false);
  const [successGeneral, setSuccessGeneral] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // 2. Gestion des déplacements (Hook réutilisé)
  const {
    historique,
    isLoadingHistorique,
    evaluerTrajet,
    isEvaluating,
    evalError,
    evaluation,
    enregistrerDeplacement,
    isSaving,
    saveError,
    supprimerDeplacement,
    lierAuDevis,
    isLinking,
    resetEvaluation,
  } = useDeplacements(chantierId);

  const [adresseDepart, setAdresseDepart] = useState("");
  const [adresseArrivee, setAdresseArrivee] = useState(adresseChantier || "");
  const [selectedDevisId, setSelectedDevisId] = useState<Record<string, string>>({});

  // Charger l'adresse par défaut de l'entreprise
  useEffect(() => {
    async function chargerAdresseEntreprise() {
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
  }, []);

  async function handleSauvegarderGeneral(e: React.FormEvent) {
    e.preventDefault();
    setSavingGeneral(true);
    setSuccessGeneral(false);

    const { error } = await supabase
      .from("chantiers")
      .update({
        statut,
        date_debut: dateDebut || null,
        date_fin: dateFin || null,
        contact_chantier: contact || null,
        notes_terrain: notes || null,
      })
      .eq("id", chantierId);

    setSavingGeneral(false);
    if (!error) {
      setSuccessGeneral(true);
      setTimeout(() => setSuccessGeneral(false), 3000);
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

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. Informations Générales & Organisationnelles */}
      <section className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#F0F0F0] pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
              <Building2 className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-[#23272B]">
                Informations Générales du Chantier
              </h3>
              <p className="text-xs text-[#777777]">
                Identification, calendrier prévisionnel et accès chantier
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {codeAcces && (
              <button
                type="button"
                onClick={handleCopierCode}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F7F7F6] px-3 py-1.5 text-xs font-semibold text-[#23272B] transition-colors hover:border-[#B85B2B]"
                title="Copier le code portail client"
              >
                <KeyRound className="h-3.5 w-3.5 text-[#B85B2B]" />
                <span>Portail client : {codeAcces}</span>
                {copiedCode ? (
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                ) : (
                  <Copy className="h-3.5 w-3.5 text-gray-400" />
                )}
              </button>
            )}
          </div>
        </div>

        <form onSubmit={handleSauvegarderGeneral} className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#777777]">
                Statut du chantier
              </label>
              <select
                value={statut}
                onChange={(e) => setStatut(e.target.value)}
                className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-sm font-semibold text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
              >
                <option value="prevu">Prévu (En attente)</option>
                <option value="en_cours">En cours de pose</option>
                <option value="termine">Terminé & Réceptionné</option>
                <option value="bloque">Interrompu / Bloqué</option>
              </select>
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#777777]">
                Date début prévisionnelle
              </label>
              <input
                type="date"
                value={dateDebut}
                onChange={(e) => setDateDebut(e.target.value)}
                className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#777777]">
                Date fin estimée
              </label>
              <input
                type="date"
                value={dateFin}
                onChange={(e) => setDateFin(e.target.value)}
                className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
              />
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#777777]">
                Contact sur place / Téléphone
              </label>
              <input
                type="text"
                value={contact}
                onChange={(e) => setContact(e.target.value)}
                placeholder="Ex : M. Dupont - 06 12 34 56 78"
                className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
              />
            </div>

            <div>
              <label className="mb-1 block text-xs font-bold uppercase tracking-wider text-[#777777]">
                Consignes d&apos;accès & Terrain
              </label>
              <input
                type="text"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Ex : Portail côté jardin, point d'eau disponible"
                className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
              />
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2">
            {successGeneral && (
              <span className="flex items-center gap-1.5 text-xs font-bold text-emerald-600">
                <Check className="h-4 w-4" /> Enregistré avec succès
              </span>
            )}
            <button
              type="submit"
              disabled={savingGeneral}
              className="inline-flex items-center gap-2 rounded-xl bg-[#23272B] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#B85B2B] disabled:opacity-50"
            >
              <Save className="h-4 w-4" />
              {savingGeneral ? "Enregistrement..." : "Sauvegarder les infos générales"}
            </button>
          </div>
        </form>
      </section>

      {/* 2. Frais de Déplacement Intégrés (FUSION OBLIGATOIRE) */}
      <section className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-[#F0F0F0] pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
              <Car className="h-5 w-5" />
            </span>
            <div>
              <h3 className="text-lg font-bold text-[#23272B]">
                Frais de Déplacement & Trajets Associés
              </h3>
              <p className="text-xs text-[#777777]">
                Calcul kilométrique, barème d&apos;indemnités et liaison directe avec les devis terrasse
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

        {/* Formulaire d'évaluation */}
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
                Arrivée (Adresse Terrasse)
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={adresseArrivee}
                  onChange={(e) => setAdresseArrivee(e.target.value)}
                  placeholder="Adresse du chantier terrasse..."
                  className="w-full rounded-xl border border-[#E5E5E5] bg-white px-3 py-2 text-sm text-[#23272B] focus:border-[#B85B2B] focus:outline-none"
                />
                <MapPin className="pointer-events-none absolute right-3 top-2.5 h-4 w-4 text-gray-400" />
              </div>
            </div>
          </div>

          <div className="mt-3 flex items-center justify-between">
            <span className="text-xs text-gray-500">
              Barème fiscal appliqué automatiquement via OpenStreetMap / OSRM
            </span>
            <button
              type="button"
              onClick={handleEvaluer}
              disabled={isEvaluating || !adresseDepart.trim() || !adresseArrivee.trim()}
              className="inline-flex items-center gap-2 rounded-xl bg-[#B85B2B] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#D97732] disabled:opacity-50"
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
                    className="rounded-lg border border-gray-300 bg-white px-3 py-1.5 text-xs font-semibold text-gray-700 hover:bg-gray-50"
                  >
                    Effacer
                  </button>
                  <button
                    type="button"
                    onClick={handleEnregistrer}
                    disabled={isSaving}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-1.5 text-xs font-bold text-white shadow-sm hover:bg-emerald-700"
                  >
                    <CheckCircle className="h-3.5 w-3.5" />
                    {isSaving ? "Enregistrement..." : "Conserver ce déplacement"}
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Historique des trajets enregistrés pour ce chantier */}
        <div>
          <h4 className="mb-3 text-xs font-bold uppercase tracking-wider text-[#777777]">
            Trajets & Déplacements Enregistrés ({historique.length})
          </h4>

          {isLoadingHistorique ? (
            <p className="py-4 text-center text-xs text-gray-400">Chargement des trajets...</p>
          ) : historique.length === 0 ? (
            <div className="rounded-2xl border border-dashed border-gray-200 p-6 text-center text-xs text-gray-500">
              Aucun déplacement n&apos;est encore associé à ce chantier terrasse. Utilisez le formulaire ci-dessus pour évaluer et enregistrer un premier trajet.
            </div>
          ) : (
            <div className="overflow-hidden rounded-xl border border-[#E5E5E5]">
              <table className="w-full text-left text-xs">
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
                      <td className="px-4 py-3 font-medium">
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
                      <td className="px-4 py-3 font-semibold">
                        {(dep.distance_aller_km + dep.distance_retour_km).toFixed(1)} km
                      </td>
                      <td className="px-4 py-3 font-bold text-[#B85B2B]">
                        {fmtEuro(dep.montant_ht)}
                      </td>
                      <td className="px-4 py-3">
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
                      <td className="px-4 py-3 text-right">
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
    </div>
  );
}

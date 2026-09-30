"use client";
import React, { useState } from "react";
import { useDeplacements } from "@/hooks/useDeplacements";
import { MapPin, Calculator, Trash2, Car, Link as LinkIcon, CheckCircle } from "lucide-react";
import { Surface } from "@/components/ui/Surface";
import { fmtEuro } from "@/lib/financeCalculs";

export default function FraisDeplacementTab({
  chantierId,
  adresseChantier,
  devisLies = []
}: {
  chantierId: string;
  adresseChantier: string | null;
  // Contrat MINIMAL réellement consommé par la liste de sélection : l'identifiant
  // (clé React + valeur de l'option) et le numéro (libellé). Ni `lignes`, ni
  // `objet`, ni `montant_ht` ne sont lus ici — le type local `DevisLie` de
  // app/terrain/chantier/[id]/page.tsx les fournit bien, mais ce composant ne doit
  // pas dépendre d'un type privé d'une autre page pour deux champs.
  devisLies?: { id: string; numero: string }[];
}) {
  const {
    historique,
    isLoadingHistorique,
    errorHistorique,
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
    resetEvaluation
  } = useDeplacements(chantierId);

  const [adresseDepart, setAdresseDepart] = useState("");
  const [adresseArrivee, setAdresseArrivee] = useState(adresseChantier || "");
  const [selectedDevisId, setSelectedDevisId] = useState<Record<string, string>>({});

  const totalHT = historique.reduce((acc, curr) => acc + (curr.montant_ht || 0), 0);

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
      alert("Action impossible : déplacement déjà lié au devis.");
      return;
    }
    if (window.confirm("Voulez-vous vraiment supprimer ce déplacement ?")) {
      supprimerDeplacement(id);
    }
  };

  const handleLier = (deplacementId: string) => {
    const devisId = selectedDevisId[deplacementId];
    if (!devisId) return;
    if (window.confirm("Voulez-vous vraiment inclure ce déplacement dans le devis sélectionné ? Cette action est irréversible.")) {
      lierAuDevis(deplacementId, devisId);
    }
  };

  const handleChangeInput = (e: React.ChangeEvent<HTMLInputElement>, setter: React.Dispatch<React.SetStateAction<string>>) => {
    setter(e.target.value);
    if (evaluation) resetEvaluation();
  };

  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mt-4">
      {/* Colonne Gauche : Évaluation */}
      <Surface className="p-6 shadow-sm space-y-6">
        <h3 className="text-lg font-semibold text-white flex items-center gap-2">
          <MapPin className="w-5 h-5 text-gray-400" /> 
          Calculer un trajet
        </h3>
        
        <div className="space-y-4">
          <div>
            <label className="block text-sm text-gray-400 mb-1">Adresse de départ (Entrepôt/Domicile)</label>
            <input
              type="text"
              value={adresseDepart}
              onChange={(e) => handleChangeInput(e, setAdresseDepart)}
              className="w-full bg-[#2A2D35] border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all"
              placeholder="Ex: 12 rue de la Paix, Paris"
            />
          </div>
          <div>
            <label className="block text-sm text-gray-400 mb-1">Adresse du chantier (Arrivée)</label>
            <input
              type="text"
              value={adresseArrivee}
              onChange={(e) => handleChangeInput(e, setAdresseArrivee)}
              className="w-full bg-[#2A2D35] border border-white/10 rounded-lg px-4 py-2 text-white placeholder-gray-500 focus:border-red-500 focus:ring-1 focus:ring-red-500 outline-none transition-all"
              placeholder="Adresse du chantier"
            />
          </div>

          {evalError && (
            <div className="text-red-500 text-sm bg-red-500/10 p-3 rounded-lg border border-red-500/20">
              {evalError}
            </div>
          )}

          <button
            onClick={handleEvaluer}
            disabled={isEvaluating || !adresseDepart.trim() || !adresseArrivee.trim()}
            className="w-full bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white font-medium py-2 rounded-lg transition-colors flex items-center justify-center gap-2"
          >
            <Calculator className="w-4 h-4" />
            {isEvaluating ? "Calcul en cours..." : "Calculer le trajet"}
          </button>
        </div>

        {evaluation && (
          <div className="bg-green-500/10 border border-green-500/20 rounded-lg p-4 space-y-4">
            <div className="grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-400 block">Distance (Aller-retour)</span>
                <span className="text-white font-medium">{evaluation.distanceAllerKm + evaluation.distanceRetourKm} km</span>
              </div>
              <div>
                <span className="text-gray-400 block">Tarif applicable</span>
                <span className="text-white font-medium">{fmtEuro(evaluation.tarifKm)}/km</span>
              </div>
              <div className="col-span-2 pt-2 border-t border-green-500/20">
                <span className="text-gray-400 block">Montant estimé HT</span>
                <span className="text-green-400 text-xl font-bold">{fmtEuro(evaluation.montantHt)}</span>
              </div>
            </div>

            {saveError && (
              <div className="text-red-500 text-sm bg-red-500/10 p-2 rounded-lg border border-red-500/20 mt-2">
                {saveError}
              </div>
            )}

            <button
              onClick={handleEnregistrer}
              disabled={isSaving}
              className="w-full bg-red-600 hover:bg-red-700 disabled:opacity-50 text-white font-bold py-2 rounded-lg shadow-lg transition-all"
            >
              {isSaving ? "Enregistrement..." : "Enregistrer ce déplacement"}
            </button>
          </div>
        )}
      </Surface>

      {/* Colonne Droite : Historique */}
      <Surface className="p-6 shadow-sm flex flex-col min-h-[300px]">
        <div className="flex justify-between items-center mb-6">
          <h3 className="text-lg font-semibold text-white flex items-center gap-2">
            <Car className="w-5 h-5 text-gray-400" /> 
            Historique
          </h3>
          <div className="text-right">
            <span className="text-sm text-gray-400 block">Total engagé HT</span>
            <span className="text-white font-bold text-lg">{fmtEuro(totalHT)}</span>
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {isLoadingHistorique ? (
            <div className="text-gray-500 text-sm text-center py-8 animate-pulse">Chargement de l'historique...</div>
          ) : errorHistorique ? (
            <div className="text-red-500 text-sm text-center py-8">{errorHistorique}</div>
          ) : historique.length === 0 ? (
            <div className="text-gray-500 text-sm text-center py-8">Aucun déplacement enregistré pour ce chantier.</div>
          ) : (
            <div className="space-y-3">
              {historique.map((dep) => (
                <div key={dep.id} className="bg-[#2A2D35] p-4 rounded-lg flex flex-col gap-3 group">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="text-white text-sm font-medium">{new Date(dep.date).toLocaleDateString("fr-FR")}</div>
                      <div className="text-gray-400 text-xs">{(dep.distance_aller_km + dep.distance_retour_km)} km à {fmtEuro(dep.tarif_km)}/km</div>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className="text-white font-bold">{fmtEuro(dep.montant_ht)}</span>
                      {!dep.devis_id && (
                        <button
                          onClick={() => handleDelete(dep.id, dep.devis_id)}
                          className="text-gray-500 hover:text-red-500 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity p-1"
                          title="Supprimer"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Zone liaison devis */}
                  <div className="pt-2 border-t border-white/5">
                    {dep.devis_id ? (
                      <div className="flex items-center gap-1.5 text-xs text-green-400 font-medium">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Inclus dans devis
                      </div>
                    ) : (
                      <div className="flex items-center gap-2">
                        <select
                          className="text-xs bg-[#1A1D24] text-white border border-white/10 rounded px-2 py-1 outline-none focus:border-gray-400"
                          value={selectedDevisId[dep.id] || ""}
                          onChange={(e) => setSelectedDevisId(prev => ({ ...prev, [dep.id]: e.target.value }))}
                        >
                          <option value="">-- Lier à un devis --</option>
                          {devisLies.map(d => (
                            <option key={d.id} value={d.id}>{d.numero || "Devis sans numéro"}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleLier(dep.id)}
                          disabled={!selectedDevisId[dep.id] || isLinking}
                          className="text-xs bg-gray-700 hover:bg-gray-600 disabled:opacity-50 text-white px-3 py-1 rounded transition-colors flex items-center gap-1.5"
                        >
                          <LinkIcon className="w-3 h-3" />
                          Lier
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </Surface>
    </div>
  );
}

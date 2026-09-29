import { useState, useCallback, useEffect } from "react";

export type FraisDeplacement = {
  id: string;
  date: string;
  adresse_depart: string | null;
  adresse_arrivee: string | null;
  distance_aller_km: number;
  distance_retour_km: number;
  tarif_km: number;
  montant_ht: number;
  statut: "prevu" | "effectue" | "annule";
  devis_id: string | null;
};

export type EvaluationResult = {
  distanceAllerKm: number;
  distanceRetourKm: number;
  tarifKm: number;
  montantHt: number;
};

export function useDeplacements(chantierId: string) {
  const [historique, setHistorique] = useState<FraisDeplacement[]>([]);
  const [isLoadingHistorique, setIsLoadingHistorique] = useState(false);
  const [errorHistorique, setErrorHistorique] = useState<string | null>(null);

  const fetchHistorique = useCallback(async () => {
    setIsLoadingHistorique(true);
    setErrorHistorique(null);
    try {
      const res = await fetch(`/api/deplacements?chantier_id=${chantierId}`);
      if (!res.ok) throw new Error("Erreur lors du chargement de l'historique.");
      const data = await res.json();
      setHistorique(data);
    } catch (e: any) {
      setErrorHistorique(e.message || "Erreur réseau.");
    } finally {
      setIsLoadingHistorique(false);
    }
  }, [chantierId]);

  useEffect(() => {
    fetchHistorique();
  }, [fetchHistorique]);

  const [isEvaluating, setIsEvaluating] = useState(false);
  const [evalError, setEvalError] = useState<string | null>(null);
  const [evaluation, setEvaluation] = useState<EvaluationResult | null>(null);

  const evaluerTrajet = async (adresseDepart: string, adresseArrivee: string) => {
    setIsEvaluating(true);
    setEvalError(null);
    setEvaluation(null);
    try {
      const res = await fetch("/api/deplacements/evaluer", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ adresse_depart: adresseDepart, adresse_arrivee: adresseArrivee })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'évaluation.");
      setEvaluation(data);
    } catch (e: any) {
      setEvalError(e.message || "Erreur réseau.");
    } finally {
      setIsEvaluating(false);
    }
  };

  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const enregistrerDeplacement = async (adresseDepart: string, adresseArrivee: string) => {
    if (!evaluation) return;
    setIsSaving(true);
    setSaveError(null);
    try {
      const payload = {
        chantier_id: chantierId,
        date: new Date().toISOString().split('T')[0],
        adresse_depart: adresseDepart,
        adresse_arrivee: adresseArrivee,
        distance_aller_km: evaluation.distanceAllerKm,
        distance_retour_km: evaluation.distanceRetourKm,
        tarif_km: evaluation.tarifKm, 
        statut: "effectue"
      };

      const res = await fetch("/api/deplacements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'enregistrement.");
      
      setEvaluation(null);
      await fetchHistorique();
    } catch (e: any) {
      setSaveError(e.message || "Erreur réseau.");
    } finally {
      setIsSaving(false);
    }
  };

  const supprimerDeplacement = async (id: string) => {
    try {
      const res = await fetch(`/api/deplacements/${id}`, { method: "DELETE" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la suppression.");
      await fetchHistorique();
    } catch (e: any) {
      alert(e.message);
    }
  };

  const [isLinking, setIsLinking] = useState(false);

  const lierAuDevis = async (deplacementId: string, devisId: string) => {
    setIsLinking(true);
    try {
      const res = await fetch(`/api/deplacements/${deplacementId}/lier`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devis_id: devisId })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de la liaison au devis.");
      alert("Déplacement lié au devis avec succès.");
      await fetchHistorique();
    } catch (e: any) {
      alert(e.message);
    } finally {
      setIsLinking(false);
    }
  };

  return {
    historique,
    isLoadingHistorique,
    errorHistorique,
    fetchHistorique,
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
    resetEvaluation: () => setEvaluation(null)
  };
}

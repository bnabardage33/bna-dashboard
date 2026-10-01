import { useState, useCallback, useEffect } from "react";

// `catch (e: any)` laissait passer une branche d'erreur muette : sur une valeur
// qui n'est pas une Error, `e.message` vaut undefined, l'affichage retombait
// silencieusement sur le repli et la vraie cause disparaissait des logs.
const messageErreur = (e: unknown, repli: string): string =>
  e instanceof Error ? e.message : repli;

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
  // Lieu retenu pour chaque extrémité du trajet (optionnels : absents si le
  // serveur répond sans, ce qui ne doit pas masquer un résultat valide).
  libelleDepart?: string;
  libelleArrivee?: string;
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
    } catch (e: unknown) {
      setErrorHistorique(messageErreur(e, "Erreur réseau."));
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
    } catch (e: unknown) {
      setEvalError(messageErreur(e, "Erreur réseau."));
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
    } catch (e: unknown) {
      setSaveError(messageErreur(e, "Erreur réseau."));
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
    } catch (e: unknown) {
      alert(messageErreur(e, "Erreur lors de la suppression."));
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
    } catch (e: unknown) {
      alert(messageErreur(e, "Erreur lors de la liaison au devis."));
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

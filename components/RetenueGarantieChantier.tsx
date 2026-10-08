"use client";

import { useEffect, useState, useCallback } from "react";
import { fmtEuro } from "@/lib/financeCalculs";
import { Surface } from "@/components/ui/Surface";
import {
  ShieldCheck,
  AlertTriangle,
  CheckCircle2,
  Lock,
  Unlock,
  History,
  FileText,
  DollarSign,
  Loader2,
  Info,
} from "lucide-react";
import type { MotifLiberationRetenue, StatutRetenueGarantie } from "@/types/finance";

export interface RetenueGarantieChantierProps {
  chantierId: string;
  chantierNom?: string;
  className?: string;
  onUpdate?: () => void;
}

interface CompteData {
  id: string | null;
  chantier_id: string;
  entreprise_id: string;
  taux_applicable_pct: number;
  type_garantie: string;
  montant_retenu_cumule_ht: number;
  montant_retenu_cumule_ttc: number;
  montant_libere_cumule_ttc: number;
  montant_restant_a_liberer_ttc: number;
  statut: StatutRetenueGarantie | "non_constituee";
}

interface LiberationItem {
  id: string;
  date_liberation: string;
  montant_libere_ttc: number;
  montant_libere_ht: number;
  motif: MotifLiberationRetenue;
  document_ref: string | null;
  observations: string | null;
}

interface FactureItem {
  id: string;
  numero: string;
  date_emission: string | null;
  statut: string;
  tva_pct: number;
  retenue_garantie_pct: number;
  montant_retenue_ht: number;
  montant_retenue_ttc: number;
  net_a_payer_ttc: number;
}

interface PVItem {
  id: string;
  numero: string;
  date_reception: string;
  statut: "sans_reserve" | "avec_reserves" | "reserves_levees" | "refuse" | string;
  reserves: unknown;
  observations: string | null;
}

interface SyntheseData {
  montant_retenu_cumule_ttc: number;
  montant_libere_cumule_ttc: number;
  montant_restant_a_liberer_ttc: number;
  statut: string;
  peut_liberer_reserves: boolean;
  pv_purges_count: number;
  pv_avec_reserves_count: number;
}

interface ApiResponse {
  ok: boolean;
  data?: {
    compte: CompteData;
    liberations: LiberationItem[];
    factures: FactureItem[];
    pv_receptions: PVItem[];
    synthese: SyntheseData;
  };
  error?: string;
}

const LABELS_STATUT: Record<string, { label: string; color: string }> = {
  non_constituee: { label: "Non constituée", color: "bg-slate-500/20 text-slate-300 border-slate-500/30" },
  en_cours: { label: "En cours de retenue", color: "bg-amber-500/20 text-amber-300 border-amber-500/30" },
  liberable: { label: "Libérable (réserves levées)", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
  liberee_partiellement: { label: "Libérée partiellement", color: "bg-sky-500/20 text-sky-300 border-sky-500/30" },
  liberee_totalement: { label: "Soldée & Libérée", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" },
};

const MOTIFS_LIBERATION: { id: MotifLiberationRetenue; label: string; requirePV: boolean }[] = [
  { id: "levee_reserves", label: "Levée formelle des réserves de chantier (PV purgé requis)", requirePV: true },
  { id: "echeance_1_an_gpa", label: "Échéance de 1 an — Garantie de Parfait Achèvement (GPA)", requirePV: false },
  { id: "accord_amiable", label: "Accord amiable / protocole transactionnel", requirePV: false },
  { id: "substitution_caution", label: "Substitution par caution bancaire à 100 %", requirePV: false },
];

export default function RetenueGarantieChantier({
  chantierId,
  chantierNom,
  className = "",
  onUpdate,
}: RetenueGarantieChantierProps) {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [compte, setCompte] = useState<CompteData | null>(null);
  const [liberations, setLiberations] = useState<LiberationItem[]>([]);
  const [factures, setFactures] = useState<FactureItem[]>([]);
  const [pvReceptions, setPvReceptions] = useState<PVItem[]>([]);
  const [synthese, setSynthese] = useState<SyntheseData | null>(null);

  // Modal de libération
  const [modalLiberation, setModalLiberation] = useState(false);
  const [montantALiberer, setMontantALiberer] = useState<string>("");
  const [motifSelectionne, setMotifSelectionne] = useState<MotifLiberationRetenue>("levee_reserves");
  const [pvChoisiId, setPvChoisiId] = useState<string>("");
  const [observations, setObservations] = useState("");
  const [documentRef, setDocumentRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [erreurModal, setErreurModal] = useState<string | null>(null);
  const [succesModal, setSuccesModal] = useState<string | null>(null);

  const chargerCompte = useCallback(async () => {
    if (!chantierId) return;
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/chantiers/${chantierId}/retenue-garantie`);
      const json: ApiResponse = await res.json();
      if (!res.ok || !json.ok || !json.data) {
        throw new Error(json.error || "Impossible de charger la retenue de garantie.");
      }
      setCompte(json.data.compte);
      setLiberations(json.data.liberations);
      setFactures(json.data.factures);
      setPvReceptions(json.data.pv_receptions);
      setSynthese(json.data.synthese);

      // Pré-sélection du premier PV sans réserve ou levé si disponible
      const pvPurge = json.data.pv_receptions.find(
        (p) => p.statut === "sans_reserve" || p.statut === "reserves_levees"
      );
      if (pvPurge) setPvChoisiId(pvPurge.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Erreur inattendue.");
    } finally {
      setLoading(false);
    }
  }, [chantierId]);

  useEffect(() => {
    chargerCompte();
  }, [chargerCompte]);

  // Ouvrir le modal de libération
  function ouvrirModal() {
    setErreurModal(null);
    setSuccesModal(null);
    const restant = compte?.montant_restant_a_liberer_ttc ?? 0;
    setMontantALiberer(restant > 0 ? String(restant) : "");
    setMotifSelectionne("levee_reserves");
    setObservations("");
    setDocumentRef("");
    setModalLiberation(true);
  }

  // Soumission de la libération via l'API sécurisée Phase 4 (RPC PostgreSQL)
  async function executerLiberation(e: React.FormEvent) {
    e.preventDefault();
    setErreurModal(null);
    setSuccesModal(null);

    const montant = parseFloat(montantALiberer.replace(",", "."));
    if (!Number.isFinite(montant) || montant <= 0) {
      setErreurModal("Veuillez saisir un montant strictement positif.");
      return;
    }

    if (motifSelectionne === "levee_reserves" && !pvChoisiId) {
      setErreurModal("Un PV de réception sans réserve ou avec réserves levées est obligatoire.");
      return;
    }

    setSubmitting(true);
    try {
      const res = await fetch(`/api/chantiers/${chantierId}/retenue-garantie/liberer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          montant_ttc: montant,
          motif: motifSelectionne,
          pv_reception_id: motifSelectionne === "levee_reserves" ? pvChoisiId : null,
          observations: observations.trim() || null,
          document_ref: documentRef.trim() || null,
        }),
      });

      const json = await res.json();
      if (!res.ok || !json.ok) {
        throw new Error(json.error || "Échec de l'opération de libération.");
      }

      setSuccesModal(`Libération de ${fmtEuro(montant)} enregistrée avec succès.`);
      await chargerCompte();
      onUpdate?.();
      setTimeout(() => {
        setModalLiberation(false);
      }, 1200);
    } catch (err) {
      setErreurModal(err instanceof Error ? err.message : "Erreur lors de la libération.");
    } finally {
      setSubmitting(false);
    }
  }

  if (loading) {
    return (
      <div className={`rounded-2xl border border-white/10 bg-[#1E1E1E]/40 p-8 text-center text-xs text-gray-400 ${className}`}>
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-red-500 mb-2" />
        Chargement du compte de retenue de garantie…
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-2xl border border-rose-500/30 bg-rose-950/20 p-6 text-xs text-rose-300 ${className}`}>
        <div className="flex items-center gap-2 font-bold mb-1">
          <AlertTriangle className="h-4 w-4" /> Erreur de chargement
        </div>
        <p>{error}</p>
        <button
          onClick={chargerCompte}
          className="mt-3 rounded-xl border border-rose-500/40 px-3 py-1 text-2xs font-semibold hover:bg-rose-500/10"
        >
          Réessayer
        </button>
      </div>
    );
  }

  const montantRetenu = compte?.montant_retenu_cumule_ttc ?? 0;
  const montantLibere = compte?.montant_libere_cumule_ttc ?? 0;
  const montantRestant = compte?.montant_restant_a_liberer_ttc ?? 0;
  const statutInfo = LABELS_STATUT[compte?.statut ?? "non_constituee"] || LABELS_STATUT.non_constituee;

  const pvPurges = pvReceptions.filter(
    (p) => p.statut === "sans_reserve" || p.statut === "reserves_levees"
  );
  const pvEnReserves = pvReceptions.filter((p) => p.statut === "avec_reserves");
  const peutLiberer = montantRestant > 0 && pvPurges.length > 0;

  return (
    <div className={`space-y-5 ${className}`}>
      {/* En-tête & Statut */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="rounded-xl bg-red-600/20 p-2 text-red-500 border border-red-600/30">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white flex items-center gap-2">
              Retenue de Garantie (5 % BTP)
              <span className={`text-3xs font-bold uppercase px-2 py-0.5 rounded-full border ${statutInfo.color}`}>
                {statutInfo.label}
              </span>
            </h2>
            <p className="text-2xs text-gray-400">
              Garantie légale Loi n° 71-584 du 16 juillet 1971 {chantierNom ? `— ${chantierNom}` : ""}
            </p>
          </div>
        </div>

        {montantRestant > 0 && (
          <button
            onClick={ouvrirModal}
            className="flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-700 px-3.5 py-1.5 text-xs font-bold text-white shadow-lg shadow-red-600/10 transition-all"
          >
            <Unlock className="h-3.5 w-3.5" />
            Libérer la retenue ({fmtEuro(montantRestant)})
          </button>
        )}
      </div>

      {/* Cartes financières de synthèse */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Surface className="p-4 shadow-sm" radius="2xl">
          <p className="text-3xs uppercase font-bold tracking-wider text-gray-400">Cumul Retenu (TTC)</p>
          <p className="text-xl font-black text-white font-mono mt-0.5">{fmtEuro(montantRetenu)}</p>
          <p className="text-3xs text-gray-500 mt-1">
            Assiette HT : {fmtEuro(compte?.montant_retenu_cumule_ht ?? 0)}
          </p>
        </Surface>

        <Surface className="p-4 shadow-sm" radius="2xl">
          <p className="text-3xs uppercase font-bold tracking-wider text-gray-400">Cumul Restitué (TTC)</p>
          <p className="text-xl font-black text-emerald-400 font-mono mt-0.5">{fmtEuro(montantLibere)}</p>
          <p className="text-3xs text-gray-500 mt-1">
            {liberations.length} versement(s) libéré(s)
          </p>
        </Surface>

        <Surface
          className={`p-4 shadow-sm border ${
            montantRestant > 0 ? "border-amber-500/40 bg-amber-950/10" : "border-emerald-500/30 bg-emerald-950/10"
          }`}
          radius="2xl"
        >
          <div className="flex items-center justify-between">
            <p className="text-3xs uppercase font-bold tracking-wider text-gray-400">Solde Restant à Libérer</p>
            {montantRestant > 0 ? (
              <Lock className="h-3.5 w-3.5 text-amber-400" />
            ) : (
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
            )}
          </div>
          <p
            className={`text-xl font-black font-mono mt-0.5 ${
              montantRestant > 0 ? "text-amber-300" : "text-emerald-400"
            }`}
          >
            {fmtEuro(montantRestant)}
          </p>
          <p className="text-3xs text-gray-400 mt-1">
            {montantRestant === 0 ? "Totalement restitué au titulaire" : "Détenu sous séquestre"}
          </p>
        </Surface>
      </div>

      {/* Alerte contextuelle sur l'état des réserves */}
      {montantRestant > 0 && (
        <div
          className={`rounded-2xl border p-4 text-xs ${
            peutLiberer
              ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-300"
              : pvEnReserves.length > 0
              ? "border-amber-500/40 bg-amber-950/20 text-amber-300"
              : "border-white/10 bg-white/5 text-gray-300"
          }`}
        >
          <div className="flex items-start gap-2.5">
            {peutLiberer ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-400 mt-0.5" />
            ) : pvEnReserves.length > 0 ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400 mt-0.5" />
            ) : (
              <Info className="h-4 w-4 shrink-0 text-gray-400 mt-0.5" />
            )}
            <div>
              <p className="font-bold">
                {peutLiberer
                  ? "Levée des réserves constatée — La retenue peut être débloquée"
                  : pvEnReserves.length > 0
                  ? "Réserves en cours — Libération verrouillée pour motif 'Levée des réserves'"
                  : "En attente de réception des travaux"}
              </p>
              <p className="text-2xs opacity-90 mt-0.5 leading-relaxed">
                {peutLiberer
                  ? `Au moins un PV de réception (${pvPurges.map((p) => p.numero).join(", ")}) est purgé de réserve. Vous pouvez procéder à la restitution des fonds.`
                  : pvEnReserves.length > 0
                  ? `Le PV ${pvEnReserves.map((p) => p.numero).join(", ")} comporte des réserves actives. La retenue légale de 5 % garantit la reprise des malfaçons jusqu'à leur levée formelle.`
                  : "Aucun PV de réception sans réserve n'est enregistré. La libération reste possible sur les motifs dérogatoires (1 an GPA, caution ou accord amiable)."}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Factures ayant constitué la retenue */}
      {factures.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-[#1E1E1E]/50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
            <FileText className="h-3.5 w-3.5 text-red-500" />
            Factures actives avec retenue de garantie
          </div>
          <div className="divide-y divide-white/5 text-xs">
            {factures.map((fac) => (
              <div key={fac.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <span className="font-mono font-bold text-gray-300">{fac.numero}</span>
                  <span className="text-2xs text-gray-500 ml-2">
                    {fac.date_emission ? new Date(fac.date_emission).toLocaleDateString("fr-FR") : "—"}
                  </span>
                  <span className="ml-2 rounded bg-white/5 px-1.5 py-0.5 text-3xs text-gray-400">
                    TVA {fac.tva_pct} %
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-2xs text-amber-400 font-mono font-semibold">
                    Retenue {fac.retenue_garantie_pct} % : -{fmtEuro(fac.montant_retenue_ttc)}
                  </div>
                  <div className="text-3xs text-gray-400">
                    Net payé : <span className="text-gray-200 font-semibold">{fmtEuro(fac.net_a_payer_ttc)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historique des libérations */}
      {liberations.length > 0 && (
        <div className="rounded-2xl border border-white/10 bg-[#1E1E1E]/50 p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-200">
            <History className="h-3.5 w-3.5 text-emerald-400" />
            Historique des libérations de retenue
          </div>
          <div className="divide-y divide-white/5 text-xs">
            {liberations.map((lib) => {
              const motifObj = MOTIFS_LIBERATION.find((m) => m.id === lib.motif);
              return (
                <div key={lib.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-gray-200">
                      {motifObj?.label || lib.motif}
                    </p>
                    <p className="text-3xs text-gray-500 mt-0.5">
                      Libéré le {new Date(lib.date_liberation).toLocaleDateString("fr-FR")}
                      {lib.document_ref && ` · Réf: ${lib.document_ref}`}
                    </p>
                    {lib.observations && (
                      <p className="text-3xs text-gray-400 italic mt-0.5">
                        « {lib.observations} »
                      </p>
                    )}
                  </div>
                  <div className="text-right font-mono font-bold text-emerald-400 shrink-0">
                    +{fmtEuro(lib.montant_libere_ttc)}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Modal de restitution / libération */}
      {modalLiberation && (
        <div
          className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setModalLiberation(false)}
        >
          <form
            onSubmit={executerLiberation}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1E1E1E] w-full max-w-lg rounded-2xl border border-white/10 shadow-2xl p-5 space-y-4 animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Unlock className="h-4 w-4 text-red-500" />
                Libérer la Retenue de Garantie
              </h3>
              <button
                type="button"
                onClick={() => setModalLiberation(false)}
                className="text-gray-400 hover:text-white text-sm"
              >
                ✕
              </button>
            </div>

            {erreurModal && (
              <div className="rounded-xl border border-rose-500/40 bg-rose-950/20 p-3 text-xs text-rose-300">
                {erreurModal}
              </div>
            )}

            {succesModal && (
              <div className="rounded-xl border border-emerald-500/40 bg-emerald-950/20 p-3 text-xs text-emerald-300">
                {succesModal}
              </div>
            )}

            {/* Montant TTC */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-gray-300">Montant TTC à libérer (€) *</label>
                <button
                  type="button"
                  onClick={() => setMontantALiberer(String(montantRestant))}
                  className="text-3xs font-semibold text-red-400 hover:underline"
                >
                  Tout libérer ({fmtEuro(montantRestant)})
                </button>
              </div>
              <input
                type="number"
                step="0.01"
                min="0.01"
                max={montantRestant}
                value={montantALiberer}
                onChange={(e) => setMontantALiberer(e.target.value)}
                placeholder="Ex: 600.00"
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none font-mono"
                required
              />
              <p className="text-3xs text-gray-500">
                Solde maximum disponible : {fmtEuro(montantRestant)}
              </p>
            </div>

            {/* Motif légal */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-gray-300">Motif de libération *</label>
              <select
                value={motifSelectionne}
                onChange={(e) => setMotifSelectionne(e.target.value as MotifLiberationRetenue)}
                className="w-full rounded-xl border border-slate-600 bg-[#1E1E1E] px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
              >
                {MOTIFS_LIBERATION.map((m) => (
                  <option key={m.id} value={m.id}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Sélection du PV si levee_reserves */}
            {motifSelectionne === "levee_reserves" && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold text-gray-300">PV de réception purgé de réserves *</label>
                {pvPurges.length > 0 ? (
                  <select
                    value={pvChoisiId}
                    onChange={(e) => setPvChoisiId(e.target.value)}
                    className="w-full rounded-xl border border-slate-600 bg-[#1E1E1E] px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                    required
                  >
                    <option value="">-- Sélectionner un PV purgé --</option>
                    {pvPurges.map((pv) => (
                      <option key={pv.id} value={pv.id}>
                        {pv.numero} — {pv.statut === "sans_reserve" ? "Sans réserve" : "Réserves levées"} ({new Date(pv.date_reception).toLocaleDateString("fr-FR")})
                      </option>
                    ))}
                  </select>
                ) : (
                  <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-2.5 text-2xs text-amber-300">
                    ⚠️ Aucun PV sans réserve ou avec réserves levées n&apos;est disponible. Vous devez d&apos;abord lever les réserves dans l&apos;onglet Réceptions.
                  </div>
                )}
              </div>
            )}

            {/* Réf document & Observations */}
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-2xs font-semibold text-gray-300">Réf. règlement / virement</label>
                <input
                  type="text"
                  value={documentRef}
                  onChange={(e) => setDocumentRef(e.target.value)}
                  placeholder="Ex: VIR-2026-442"
                  className="w-full rounded-xl border border-slate-600 bg-transparent px-3 py-1.5 text-xs text-white focus:border-red-600 focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-2xs font-semibold text-gray-300">Observations</label>
                <input
                  type="text"
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Note interne..."
                  className="w-full rounded-xl border border-slate-600 bg-transparent px-3 py-1.5 text-xs text-white focus:border-red-600 focus:outline-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2.5 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setModalLiberation(false)}
                className="rounded-xl border border-slate-600 px-3.5 py-1.5 text-xs text-gray-300 hover:bg-white/5"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting || (motifSelectionne === "levee_reserves" && !pvChoisiId)}
                className="flex items-center gap-1.5 rounded-xl bg-red-600 hover:bg-red-700 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-md"
              >
                {submitting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                Valider la libération
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

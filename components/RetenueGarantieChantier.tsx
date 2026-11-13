"use client";

import { useEffect, useState, useCallback } from "react";
import { fmtEuro } from "@/lib/financeCalculs";
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
  non_constituee: {
    label: "Non constituée",
    color: "bg-[#B85B2B]/10 text-[#B85B2B] border-[#B85B2B]/20",
  },
  en_cours: {
    label: "En cours de retenue",
    color: "bg-amber-50 text-amber-800 border-amber-200",
  },
  liberable: {
    label: "Libérable (réserves levées)",
    color: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
  liberee_partiellement: {
    label: "Libérée partiellement",
    color: "bg-sky-50 text-sky-800 border-sky-200",
  },
  liberee_totalement: {
    label: "Soldée & Libérée",
    color: "bg-emerald-50 text-emerald-800 border-emerald-200",
  },
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
      <div className={`rounded-2xl border border-[#E5E5E5] bg-[#F8F9FA] p-8 text-center text-xs text-[#777777] ${className}`}>
        <Loader2 className="mx-auto h-5 w-5 animate-spin text-[#B85B2B] mb-2" />
        Chargement du compte de retenue de garantie…
      </div>
    );
  }

  if (error) {
    return (
      <div className={`rounded-2xl border border-rose-200 bg-rose-50 p-6 text-xs text-rose-800 ${className}`}>
        <div className="flex items-center gap-2 font-bold mb-1 text-rose-900">
          <AlertTriangle className="h-4 w-4 text-rose-600" /> Erreur de chargement
        </div>
        <p className="text-rose-700">{error}</p>
        <button
          onClick={chargerCompte}
          className="mt-3 rounded-xl border border-rose-300 bg-white px-3 py-1 text-2xs font-semibold text-rose-800 hover:bg-rose-100 transition"
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
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#F0F0F0] pb-4">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl border border-[#B85B2B]/20 bg-[#B85B2B]/10 text-[#B85B2B]">
            <ShieldCheck className="h-5 w-5" />
          </div>
          <div>
            <h2 className="text-sm sm:text-base font-bold text-[#23272B] flex flex-wrap items-center gap-2">
              <span>Retenue de Garantie (5 % BTP)</span>
              <span className={`inline-flex items-center text-xs font-semibold px-2.5 py-0.5 rounded-full border ${statutInfo.color}`}>
                {statutInfo.label}
              </span>
            </h2>
            <p className="text-xs text-[#777777] mt-0.5 font-normal">
              Garantie légale Loi n° 71-584 du 16 juillet 1971 {chantierNom ? `— ${chantierNom}` : ""}
            </p>
          </div>
        </div>

        {montantRestant > 0 && (
          <button
            onClick={ouvrirModal}
            className="flex items-center gap-1.5 rounded-xl bg-[#B85B2B] hover:bg-[#a04e24] px-3.5 py-2 text-xs font-bold text-white shadow-sm transition-all"
          >
            <Unlock className="h-3.5 w-3.5" />
            Libérer la retenue ({fmtEuro(montantRestant)})
          </button>
        )}
      </div>

      {/* Cartes financières de synthèse */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-2xl border border-[#E5E5E5] bg-[#F8F9FA] p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#777777]">Cumul Retenu (TTC)</p>
          <p className="text-xl sm:text-2xl font-black text-[#23272B] font-mono mt-1">{fmtEuro(montantRetenu)}</p>
          <p className="text-xs text-[#777777] mt-1">
            Assiette HT : {fmtEuro(compte?.montant_retenu_cumule_ht ?? 0)}
          </p>
        </div>

        <div className="rounded-2xl border border-[#E5E5E5] bg-[#F8F9FA] p-4 shadow-sm">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#777777]">Cumul Restitué (TTC)</p>
          <p className="text-xl sm:text-2xl font-black text-emerald-600 font-mono mt-1">{fmtEuro(montantLibere)}</p>
          <p className="text-xs text-[#777777] mt-1">
            {liberations.length} versement(s) libéré(s)
          </p>
        </div>

        <div
          className={`rounded-2xl border p-4 shadow-sm ${
            montantRestant > 0
              ? "border-[#B85B2B]/25 bg-[#B85B2B]/5"
              : "border-emerald-200 bg-emerald-50/50"
          }`}
        >
          <div className="flex items-center justify-between">
            <p className="text-[11px] font-bold uppercase tracking-wider text-[#777777]">Solde Restant à Libérer</p>
            {montantRestant > 0 ? (
              <Lock className="h-4 w-4 text-[#B85B2B]" />
            ) : (
              <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            )}
          </div>
          <p
            className={`text-xl sm:text-2xl font-black font-mono mt-1 ${
              montantRestant > 0 ? "text-[#B85B2B]" : "text-emerald-600"
            }`}
          >
            {fmtEuro(montantRestant)}
          </p>
          <p className={`text-xs mt-1 ${montantRestant === 0 ? "text-emerald-700 font-medium" : "text-[#777777]"}`}>
            {montantRestant === 0 ? "Totalement restitué au titulaire" : "Détenu sous séquestre"}
          </p>
        </div>
      </div>

      {/* Alerte contextuelle sur l'état des réserves */}
      {montantRestant > 0 && (
        <div
          className={`rounded-2xl border p-4 text-xs ${
            peutLiberer
              ? "border-emerald-200 bg-emerald-50 text-emerald-900"
              : pvEnReserves.length > 0
              ? "border-amber-200 bg-amber-50 text-amber-900"
              : "border-[#E5E5E5] bg-[#F8F9FA] text-[#23272B]"
          }`}
        >
          <div className="flex items-start gap-2.5">
            {peutLiberer ? (
              <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
            ) : pvEnReserves.length > 0 ? (
              <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600 mt-0.5" />
            ) : (
              <Info className="h-4 w-4 shrink-0 text-[#777777] mt-0.5" />
            )}
            <div>
              <p className="font-bold">
                {peutLiberer
                  ? "Levée des réserves constatée — La retenue peut être débloquée"
                  : pvEnReserves.length > 0
                  ? "Réserves en cours — Libération verrouillée pour motif 'Levée des réserves'"
                  : "En attente de réception des travaux"}
              </p>
              <p
                className={`text-2xs mt-0.5 leading-relaxed ${
                  peutLiberer
                    ? "text-emerald-800"
                    : pvEnReserves.length > 0
                    ? "text-amber-800"
                    : "text-[#777777]"
                }`}
              >
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
        <div className="rounded-2xl border border-[#E5E5E5] bg-[#F8F9FA] p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#23272B]">
            <FileText className="h-3.5 w-3.5 text-[#B85B2B]" />
            Factures actives avec retenue de garantie
          </div>
          <div className="divide-y divide-[#E5E5E5] text-xs">
            {factures.map((fac) => (
              <div key={fac.id} className="py-2.5 flex items-center justify-between gap-3">
                <div>
                  <span className="font-mono font-bold text-[#23272B]">{fac.numero}</span>
                  <span className="text-2xs text-[#777777] ml-2">
                    {fac.date_emission ? new Date(fac.date_emission).toLocaleDateString("fr-FR") : "—"}
                  </span>
                  <span className="ml-2 rounded bg-white px-1.5 py-0.5 text-3xs font-semibold text-[#777777] border border-[#E5E5E5]">
                    TVA {fac.tva_pct} %
                  </span>
                </div>
                <div className="text-right">
                  <div className="text-2xs text-[#B85B2B] font-mono font-semibold">
                    Retenue {fac.retenue_garantie_pct} % : -{fmtEuro(fac.montant_retenue_ttc)}
                  </div>
                  <div className="text-3xs text-[#777777]">
                    Net payé : <span className="text-[#23272B] font-semibold">{fmtEuro(fac.net_a_payer_ttc)}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Historique des libérations */}
      {liberations.length > 0 && (
        <div className="rounded-2xl border border-[#E5E5E5] bg-[#F8F9FA] p-4 space-y-3">
          <div className="flex items-center gap-2 text-xs font-bold text-[#23272B]">
            <History className="h-3.5 w-3.5 text-emerald-600" />
            Historique des libérations de retenue
          </div>
          <div className="divide-y divide-[#E5E5E5] text-xs">
            {liberations.map((lib) => {
              const motifObj = MOTIFS_LIBERATION.find((m) => m.id === lib.motif);
              return (
                <div key={lib.id} className="py-2.5 flex items-start justify-between gap-3">
                  <div>
                    <p className="font-semibold text-[#23272B]">
                      {motifObj?.label || lib.motif}
                    </p>
                    <p className="text-3xs text-[#777777] mt-0.5">
                      Libéré le {new Date(lib.date_liberation).toLocaleDateString("fr-FR")}
                      {lib.document_ref && ` · Réf: ${lib.document_ref}`}
                    </p>
                    {lib.observations && (
                      <p className="text-3xs text-[#777777] italic mt-0.5">
                        « {lib.observations} »
                      </p>
                    )}
                  </div>
                  <div className="text-right font-mono font-bold text-emerald-600 shrink-0">
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
          className="fixed inset-0 z-[220] flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
          onClick={() => setModalLiberation(false)}
        >
          <form
            onSubmit={executerLiberation}
            onClick={(e) => e.stopPropagation()}
            className="bg-white w-full max-w-lg rounded-2xl border border-[#E5E5E5] shadow-2xl p-5 sm:p-6 space-y-4 animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-[#F0F0F0] pb-3">
              <h3 className="text-sm font-bold text-[#23272B] flex items-center gap-2">
                <Unlock className="h-4 w-4 text-[#B85B2B]" />
                Libérer la Retenue de Garantie
              </h3>
              <button
                type="button"
                onClick={() => setModalLiberation(false)}
                className="text-[#777777] hover:text-[#23272B] text-base leading-none p-1"
              >
                ✕
              </button>
            </div>

            {erreurModal && (
              <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-xs text-rose-800">
                {erreurModal}
              </div>
            )}

            {succesModal && (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-xs text-emerald-800">
                {succesModal}
              </div>
            )}

            {/* Montant TTC */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between text-xs">
                <label className="font-semibold text-[#23272B]">Montant TTC à libérer (€) *</label>
                <button
                  type="button"
                  onClick={() => setMontantALiberer(String(montantRestant))}
                  className="text-3xs font-semibold text-[#B85B2B] hover:underline"
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
                className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3 py-2 text-xs text-[#23272B] focus:border-[#B85B2B] focus:bg-white focus:outline-none font-mono"
                required
              />
              <p className="text-3xs text-[#777777]">
                Solde maximum disponible : {fmtEuro(montantRestant)}
              </p>
            </div>

            {/* Motif légal */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-[#23272B]">Motif de libération *</label>
              <select
                value={motifSelectionne}
                onChange={(e) => setMotifSelectionne(e.target.value as MotifLiberationRetenue)}
                className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3 py-2 text-xs text-[#23272B] focus:border-[#B85B2B] focus:bg-white focus:outline-none"
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
                <label className="text-xs font-semibold text-[#23272B]">PV de réception purgé de réserves *</label>
                {pvPurges.length > 0 ? (
                  <select
                    value={pvChoisiId}
                    onChange={(e) => setPvChoisiId(e.target.value)}
                    className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3 py-2 text-xs text-[#23272B] focus:border-[#B85B2B] focus:bg-white focus:outline-none"
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
                  <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-2xs text-amber-800">
                    ⚠️ Aucun PV sans réserve ou avec réserves levées n&apos;est disponible. Vous devez d&apos;abord lever les réserves dans l&apos;onglet Réceptions.
                  </div>
                )}
              </div>
            )}

            {/* Réf document & Observations */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="space-y-1">
                <label className="text-2xs font-semibold text-[#23272B]">Réf. règlement / virement</label>
                <input
                  type="text"
                  value={documentRef}
                  onChange={(e) => setDocumentRef(e.target.value)}
                  placeholder="Ex: VIR-2026-442"
                  className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3 py-1.5 text-xs text-[#23272B] focus:border-[#B85B2B] focus:bg-white focus:outline-none"
                />
              </div>
              <div className="space-y-1">
                <label className="text-2xs font-semibold text-[#23272B]">Observations</label>
                <input
                  type="text"
                  value={observations}
                  onChange={(e) => setObservations(e.target.value)}
                  placeholder="Note interne..."
                  className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3 py-1.5 text-xs text-[#23272B] focus:border-[#B85B2B] focus:bg-white focus:outline-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex justify-end gap-2.5 pt-3 border-t border-[#F0F0F0]">
              <button
                type="button"
                onClick={() => setModalLiberation(false)}
                className="rounded-xl border border-[#E5E5E5] bg-white px-3.5 py-1.5 text-xs font-semibold text-[#23272B] hover:bg-[#F8F9FA] transition"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={submitting || (motifSelectionne === "levee_reserves" && !pvChoisiId)}
                className="flex items-center gap-1.5 rounded-xl bg-[#B85B2B] hover:bg-[#a04e24] px-4 py-1.5 text-xs font-bold text-white disabled:opacity-40 disabled:cursor-not-allowed shadow-sm transition"
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

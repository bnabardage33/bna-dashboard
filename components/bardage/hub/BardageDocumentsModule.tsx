"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { fmtEuro } from "@/lib/financeCalculs";
import RetenueGarantieChantier from "@/components/RetenueGarantieChantier";
import {
  FileSpreadsheet,
  FileText,
  DollarSign,
  ShoppingCart,
  ShieldCheck,
  Plus,
} from "lucide-react";

type DevisLie = {
  id: string;
  client_id: string | null;
  chantier_id: string | null;
  numero: string;
  objet: string | null;
  date_emission: string;
  statut: string;
  lignes: { designation: string; qte: number; pu_ht: number }[];
  tva_pct: number;
};

type FactureLiee = {
  id: string;
  client_id: string | null;
  numero: string;
  objet: string | null;
  date_emission: string;
  statut: string;
  type_facture: string;
  lignes: { designation: string; qte: number; pu_ht: number }[];
  tva_pct: number;
};

type CommandeLiee = {
  id: string;
  designation: string;
  quantite: number | null;
  unite: string | null;
  montant_ht: number | null;
  statut: string;
  date_livraison_prevue: string | null;
  fournisseurs: { nom: string } | null;
};

type PvReceptionListe = {
  id: string;
  numero: string;
  date_reception: string;
  statut: string;
  reserves?: { levee: boolean }[];
};

export interface BardageDocumentsModuleProps {
  chantierId: string;
  chantierNom: string;
  clientId: string;
  onDevisCountChange?: (count: number) => void;
}

export default function BardageDocumentsModule({
  chantierId,
  chantierNom,
  clientId,
  onDevisCountChange,
}: BardageDocumentsModuleProps) {
  const [devisLies, setDevisLies] = useState<DevisLie[]>([]);
  const [facturesLiees, setFacturesLiees] = useState<FactureLiee[]>([]);
  const [commandesLiees, setCommandesLiees] = useState<CommandeLiee[]>([]);
  const [pvsLies, setPvsLies] = useState<PvReceptionListe[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchDocuments = useCallback(async () => {
    if (!clientId && !chantierId) return;
    setLoading(true);

    try {
      const [coRes, devisRes, facturesRes, pvsRes] = await Promise.all([
        supabase
          .from("commandes")
          .select("*, fournisseurs(nom)")
          .eq("chantier_id", chantierId)
          .order("created_at", { ascending: false }),
        supabase
          .from("devis")
          .select("id, client_id, chantier_id, numero, objet, date_emission, statut, lignes, tva_pct")
          .eq("client_id", clientId)
          .order("date_emission", { ascending: false }),
        supabase
          .from("factures")
          .select("id, client_id, numero, objet, date_emission, statut, type_facture, lignes, tva_pct")
          .eq("client_id", clientId)
          .order("date_emission", { ascending: false }),
        supabase
          .from("pv_receptions")
          .select("*")
          .eq("chantier_id", chantierId)
          .order("date_reception", { ascending: false }),
      ]);

      if (coRes.data) setCommandesLiees(coRes.data as CommandeLiee[]);
      if (devisRes.data) {
        const d = devisRes.data as DevisLie[];
        setDevisLies(d);
        onDevisCountChange?.(d.length);
      }
      if (facturesRes.data) setFacturesLiees(facturesRes.data as FactureLiee[]);
      if (pvsRes.data) setPvsLies(pvsRes.data as unknown as PvReceptionListe[]);
    } catch (e) {
      console.error("Erreur chargement documents bardage:", e);
    } finally {
      setLoading(false);
    }
  }, [chantierId, clientId, onDevisCountChange]);

  useEffect(() => {
    fetchDocuments();
  }, [fetchDocuments]);

  // Totaux financiers
  const totalDeviseHt = devisLies.reduce(
    (s, d) => s + (d.lignes || []).reduce((acc, l) => acc + l.qte * l.pu_ht, 0),
    0
  );

  const totalFactureTtc = facturesLiees.reduce((s, f) => {
    const ht = (f.lignes || []).reduce((acc, l) => acc + l.qte * l.pu_ht, 0);
    return s + ht * (1 + (f.tva_pct || 10) / 100);
  }, 0);

  const totalAchatsHt = commandesLiees.reduce((s, c) => s + (c.montant_ht || 0), 0);

  return (
    <div className="space-y-6">
      {/* 1. Synthèse financière */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.03)] text-center">
          <p className="text-3xs uppercase tracking-wider font-semibold text-[#8E7F74]">Total Devisé HT</p>
          <p className="mt-1 text-xl font-bold text-[#F5EFEA]">{fmtEuro(totalDeviseHt)}</p>
          <p className="text-3xs text-[#8E7F74]">{devisLies.length} devis rattaché(s)</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.03)] text-center">
          <p className="text-3xs uppercase tracking-wider font-semibold text-[#D96B27]">Total Facturé TTC</p>
          <p className="mt-1 text-xl font-bold text-[#D96B27]">{fmtEuro(totalFactureTtc)}</p>
          <p className="text-3xs text-[#8E7F74]">{facturesLiees.length} facture(s)</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 shadow-[0_10px_30px_rgba(0,0,0,0.03)] text-center">
          <p className="text-3xs uppercase tracking-wider font-semibold text-[#8E7F74]">Achats Matériaux HT</p>
          <p className="mt-1 text-xl font-bold text-[#F5EFEA]">{fmtEuro(totalAchatsHt)}</p>
          <p className="text-3xs text-[#8E7F74]">{commandesLiees.length} commande(s) fournisseur</p>
        </div>
      </div>

      {loading ? (
        <p className="py-6 text-center text-xs text-[#8E7F74]">Chargement des documents du chantier...</p>
      ) : (
        <div className="space-y-6">
          {/* 2. Devis Client */}
          <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <FileSpreadsheet className="h-5 w-5 text-[#D96B27]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#F5EFEA]">
                  Devis Client
                </h3>
              </div>
              <Link
                href="/bureau/devis-factures"
                className="flex items-center gap-1 text-xs font-bold text-[#D96B27] hover:underline"
              >
                <Plus size={13} />
                <span>Nouveau devis</span>
              </Link>
            </div>

            {devisLies.length === 0 ? (
              <p className="py-3 text-xs text-[#8E7F74]">Aucun devis lié pour ce client.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 bg-[#120F0D] text-3xs font-semibold uppercase text-[#8E7F74]">
                      <th className="p-3">Numéro</th>
                      <th className="p-3">Objet</th>
                      <th className="p-3">Date</th>
                      <th className="p-3 text-right">Total HT</th>
                      <th className="p-3">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {devisLies.map((d) => {
                      const ht = (d.lignes || []).reduce((s, l) => s + l.qte * l.pu_ht, 0);
                      return (
                        <tr key={d.id} className="hover:bg-[#120F0D] transition-colors">
                          <td className="p-3 font-bold text-[#F5EFEA]">{d.numero}</td>
                          <td className="p-3 text-[#B8A99E]">{d.objet || "—"}</td>
                          <td className="p-3 text-[#8E7F74]">
                            {new Date(d.date_emission).toLocaleDateString("fr-FR")}
                          </td>
                          <td className="p-3 text-right font-bold text-[#F5EFEA]">{fmtEuro(ht)}</td>
                          <td className="p-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-3xs font-bold uppercase ${
                                d.statut === "accepte" || d.statut === "signe"
                                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-200"
                                  : d.statut === "refuse"
                                  ? "bg-red-500/15 text-red-900 border border-red-200"
                                  : "bg-[#120F0D] text-[#8E7F74] border border-white/10"
                              }`}
                            >
                              {d.statut}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 3. Factures & Acomptes */}
          <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <FileText className="h-5 w-5 text-[#D96B27]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#F5EFEA]">
                  Factures & Acomptes
                </h3>
              </div>
              <Link
                href="/bureau/factures"
                className="flex items-center gap-1 text-xs font-bold text-[#D96B27] hover:underline"
              >
                <Plus size={13} />
                <span>Nouvelle facture</span>
              </Link>
            </div>

            {facturesLiees.length === 0 ? (
              <p className="py-3 text-xs text-[#8E7F74]">Aucune facture pour ce client.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 bg-[#120F0D] text-3xs font-semibold uppercase text-[#8E7F74]">
                      <th className="p-3">Numéro</th>
                      <th className="p-3">Type</th>
                      <th className="p-3">Objet</th>
                      <th className="p-3">Date</th>
                      <th className="p-3 text-right">Total TTC</th>
                      <th className="p-3">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {facturesLiees.map((f) => {
                      const ht = (f.lignes || []).reduce((s, l) => s + l.qte * l.pu_ht, 0);
                      const ttc = ht * (1 + (f.tva_pct || 10) / 100);
                      return (
                        <tr key={f.id} className="hover:bg-[#120F0D] transition-colors">
                          <td className="p-3 font-bold text-[#F5EFEA]">{f.numero}</td>
                          <td className="p-3">
                            <span className="rounded-md bg-[#221B17] px-2 py-0.5 text-3xs uppercase font-medium text-[#F5EFEA]">
                              {f.type_facture || "totale"}
                            </span>
                          </td>
                          <td className="p-3 text-[#B8A99E]">{f.objet || "—"}</td>
                          <td className="p-3 text-[#8E7F74]">
                            {new Date(f.date_emission).toLocaleDateString("fr-FR")}
                          </td>
                          <td className="p-3 text-right font-bold text-[#F5EFEA]">{fmtEuro(ttc)}</td>
                          <td className="p-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-3xs font-bold uppercase ${
                                f.statut === "payee"
                                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-200"
                                  : f.statut === "envoyee"
                                  ? "bg-sky-50 text-sky-800 border border-sky-200"
                                  : "bg-[#120F0D] text-[#8E7F74] border border-white/10"
                              }`}
                            >
                              {f.statut}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 4. Procès-Verbaux de Réception */}
          <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-5 w-5 text-[#D96B27]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#F5EFEA]">
                  Procès-Verbaux de Réception (Fin de Chantier)
                </h3>
              </div>
              <Link
                href={`/bureau/fin-chantier?chantierId=${chantierId}`}
                className="flex items-center gap-1 text-xs font-bold text-[#D96B27] hover:underline"
              >
                <Plus size={13} />
                <span>Rédiger un PV</span>
              </Link>
            </div>

            {pvsLies.length === 0 ? (
              <p className="py-3 text-xs text-[#8E7F74]">Aucun procès-verbal émis pour ce chantier.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 bg-[#120F0D] text-3xs font-semibold uppercase text-[#8E7F74]">
                      <th className="p-3">Numéro</th>
                      <th className="p-3">Date</th>
                      <th className="p-3">Statut</th>
                      <th className="p-3 text-center">Réserves</th>
                      <th className="p-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {pvsLies.map((p) => {
                      const nbRes = (p.reserves || []).length;
                      const nbLevees = (p.reserves || []).filter((r) => r.levee).length;
                      return (
                        <tr key={p.id} className="hover:bg-[#120F0D] transition-colors">
                          <td className="p-3 font-bold font-mono text-[#F5EFEA]">{p.numero}</td>
                          <td className="p-3 text-[#8E7F74]">
                            {new Date(p.date_reception).toLocaleDateString("fr-FR")}
                          </td>
                          <td className="p-3">
                            <span
                              className={`rounded-full px-2.5 py-0.5 text-3xs font-bold uppercase ${
                                p.statut === "sans_reserve"
                                  ? "bg-emerald-500/15 text-emerald-300 border border-emerald-200"
                                  : p.statut === "reserves_levees"
                                  ? "bg-sky-50 text-sky-800 border border-sky-200"
                                  : "bg-amber-500/15 text-amber-900 border border-amber-200"
                              }`}
                            >
                              {p.statut === "sans_reserve"
                                ? "Sans réserve"
                                : p.statut === "reserves_levees"
                                ? "Réserves levées"
                                : "Avec réserves"}
                            </span>
                          </td>
                          <td className="p-3 text-center text-[#8E7F74]">
                            {nbRes === 0 ? "—" : `${nbLevees}/${nbRes} levée(s)`}
                          </td>
                          <td className="p-3 text-right">
                            <Link
                              href="/bureau/fin-chantier"
                              className="rounded-xl bg-[#120F0D] hover:bg-[#D96B27] hover:text-white border border-white/10 px-2.5 py-1 text-2xs font-bold text-[#F5EFEA] transition"
                            >
                              Gérer / PDF →
                            </Link>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* 5. Retenue de Garantie (5%) */}
          <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)] space-y-4">
            <RetenueGarantieChantier
              chantierId={chantierId}
              chantierNom={chantierNom}
            />
          </div>

          {/* 6. Commandes Fournisseurs & Matériaux */}
          <div className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)] space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <ShoppingCart className="h-5 w-5 text-[#D96B27]" />
                <h3 className="text-xs font-bold uppercase tracking-wider text-[#F5EFEA]">
                  Commandes Fournisseurs & Achats Matériaux
                </h3>
              </div>
              <Link
                href="/bureau/fournisseurs"
                className="flex items-center gap-1 text-xs font-bold text-[#D96B27] hover:underline"
              >
                <Plus size={13} />
                <span>Gérer les achats</span>
              </Link>
            </div>

            {commandesLiees.length === 0 ? (
              <p className="py-3 text-xs text-[#8E7F74]">Aucune commande fournisseur pour ce chantier.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead>
                    <tr className="border-b border-white/10 bg-[#120F0D] text-3xs font-semibold uppercase text-[#8E7F74]">
                      <th className="p-3">Fournisseur</th>
                      <th className="p-3">Désignation</th>
                      <th className="p-3">Quantité</th>
                      <th className="p-3 text-right">Montant HT</th>
                      <th className="p-3">Livraison</th>
                      <th className="p-3">Statut</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/10">
                    {commandesLiees.map((c) => (
                      <tr key={c.id} className="hover:bg-[#120F0D] transition-colors">
                        <td className="p-3 font-bold text-[#F5EFEA]">
                          {c.fournisseurs?.nom || "Fournisseur"}
                        </td>
                        <td className="p-3 text-[#B8A99E]">{c.designation}</td>
                        <td className="p-3 text-[#8E7F74]">
                          {c.quantite ? `${c.quantite} ${c.unite || ""}` : "—"}
                        </td>
                        <td className="p-3 text-right font-bold text-[#F5EFEA]">
                          {c.montant_ht ? fmtEuro(c.montant_ht) : "—"}
                        </td>
                        <td className="p-3 text-[#8E7F74]">
                          {c.date_livraison_prevue
                            ? new Date(c.date_livraison_prevue).toLocaleDateString("fr-FR")
                            : "—"}
                        </td>
                        <td className="p-3">
                          <span
                            className={`rounded-full px-2.5 py-0.5 text-3xs font-bold uppercase ${
                              c.statut === "livree"
                                ? "bg-emerald-500/15 text-emerald-300 border border-emerald-200"
                                : c.statut === "commandee"
                                ? "bg-sky-50 text-sky-800 border border-sky-200"
                                : "bg-[#120F0D] text-[#8E7F74] border border-white/10"
                            }`}
                          >
                            {c.statut}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

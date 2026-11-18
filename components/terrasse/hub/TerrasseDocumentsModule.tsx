"use client";

import React, { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import {
  FileSpreadsheet,
  FileText,
  Plus,
  ArrowRight,
  ExternalLink,
  ShieldCheck,
  CheckCircle,
  Receipt,
  Download,
  Boxes,
} from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fmtEuro } from "@/lib/financeCalculs";
import RetenueGarantieChantier from "@/components/RetenueGarantieChantier";

export interface TerrasseDocumentsModuleProps {
  chantierId: string;
  chantierNom: string;
  clientId: string;
  clientNom?: string;
  surfaceM2?: number;
}

interface DevisDoc {
  id: string;
  numero: string;
  objet: string | null;
  date_emission: string;
  statut: string;
  montant_ht?: number;
  tva_pct: number;
}

interface FactureDoc {
  id: string;
  numero: string;
  objet: string | null;
  date_emission: string;
  statut: string;
  type_facture: string;
  tva_pct: number;
}

export default function TerrasseDocumentsModule({
  chantierId,
  chantierNom,
  clientId,
  clientNom,
  surfaceM2 = 24.0,
}: TerrasseDocumentsModuleProps) {
  const [devis, setDevis] = useState<DevisDoc[]>([]);
  const [factures, setFactures] = useState<FactureDoc[]>([]);
  const [loading, setLoading] = useState(true);

  const chargerDocuments = useCallback(async () => {
    setLoading(true);
    try {
      const [resDevis, resFactures] = await Promise.all([
        supabase
          .from("devis")
          .select("*")
          .eq("chantier_id", chantierId)
          .order("created_at", { ascending: false }),
        supabase
          .from("factures")
          .select("*")
          .eq("chantier_id", chantierId)
          .order("created_at", { ascending: false }),
      ]);

      if (resDevis.data) setDevis(resDevis.data as unknown as DevisDoc[]);
      if (resFactures.data) setFactures(resFactures.data as unknown as FactureDoc[]);
    } catch (err) {
      console.error("Erreur chargement documents terrasse :", err);
    } finally {
      setLoading(false);
    }
  }, [chantierId]);

  useEffect(() => {
    chargerDocuments();
  }, [chargerDocuments]);

  return (
    <div className="space-y-6 animate-in fade-in duration-200">
      {/* 1. En-tête & Action Devis Calepinage */}
      <section className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <div className="flex flex-wrap items-center justify-between gap-4 border-b border-white/10 pb-4">
          <div className="flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl border border-[#D96B27]/20 bg-[#D96B27]/10 text-[#D96B27]">
              <FileSpreadsheet className="h-6 w-6" />
            </span>
            <div>
              <p className="text-xs font-bold uppercase tracking-[2px] text-[#D96B27]">
                Gestion Contractuelle & Facturation
              </p>
              <h3 className="text-xl font-bold text-[#F5EFEA]">
                Documents Financiers — {chantierNom}
              </h3>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Link
              href={`/bureau/devis-factures?chantier_id=${chantierId}`}
              className="inline-flex items-center gap-2 rounded-xl bg-[#D96B27] px-4 py-2 text-xs font-bold text-white shadow-sm transition-all hover:bg-[#E07A38] active:scale-[0.98]"
            >
              <Plus className="h-4 w-4" />
              Nouveau Devis Terrasse
            </Link>
          </div>
        </div>

        {/* Encadré d'action directe : Devis depuis calepinage */}
        <div className="mt-5 rounded-2xl border border-[#D96B27]/25 bg-[#D96B27]/5 p-4 sm:p-5 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex items-start gap-3">
            <Boxes className="h-5 w-5 text-[#D96B27] shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-[#F5EFEA]">
                Chiffrage Instantané depuis le Calepinage Terrasse
              </h4>
              <p className="text-xs text-[#8E7F74] mt-0.5">
                Générez automatiquement un devis détaillé avec les métrés exacts ({surfaceM2.toFixed(1)} m² de lames, lambourdes, plots réglables, fixations et main-d&apos;œuvre).
              </p>
            </div>
          </div>

          <Link
            href={`/bureau/devis-factures?chantier_id=${chantierId}&from_terrasse=1`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#D96B27]/40 bg-[#1B1511] px-4 py-2 text-xs font-bold text-[#D96B27] shadow-sm hover:bg-[#D96B27] hover:text-white transition-all shrink-0 self-start sm:self-auto"
          >
            <span>Pré-remplir un devis</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* 2. Liste des devis rattachés */}
      <section className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <div className="mb-4 flex items-center justify-between">
          <h4 className="text-xs font-bold uppercase tracking-wider text-[#8E7F74]">
            Devis Associés au Chantier ({devis.length})
          </h4>
        </div>

        {loading ? (
          <p className="py-4 text-center text-xs text-gray-400">Chargement des devis...</p>
        ) : devis.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-gray-500">
            Aucun devis n&apos;est actuellement rattaché à ce chantier terrasse.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F7F6] text-[#8E7F74]">
                <tr>
                  <th className="px-4 py-2.5 font-bold">N° Devis</th>
                  <th className="px-4 py-2.5 font-bold">Date d&apos;émission</th>
                  <th className="px-4 py-2.5 font-bold">Objet</th>
                  <th className="px-4 py-2.5 font-bold">Statut</th>
                  <th className="px-4 py-2.5 text-right font-bold">Accès</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-[#F5EFEA]">
                {devis.map((d) => (
                  <tr key={d.id} className="hover:bg-[#120F0D]">
                    <td className="px-4 py-3 font-bold text-[#D96B27]">{d.numero}</td>
                    <td className="px-4 py-3 font-medium">
                      {new Date(d.date_emission).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-3 text-[#B8A99E]">{d.objet || "Pose de terrasse"}</td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-white/10 bg-[#120F0D] px-2 py-0.5 text-[11px] font-bold text-[#B8A99E]">
                        {d.statut}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/bureau/devis-factures?devis_id=${d.id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#D96B27] hover:underline"
                      >
                        <span>Ouvrir</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 3. Liste des factures rattachées */}
      <section className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <h4 className="mb-4 text-xs font-bold uppercase tracking-wider text-[#8E7F74]">
          Factures & Situations de Travaux ({factures.length})
        </h4>

        {loading ? (
          <p className="py-4 text-center text-xs text-gray-400">Chargement des factures...</p>
        ) : factures.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-white/10 p-6 text-center text-xs text-gray-500">
            Aucune facture n&apos;a encore été émise pour ce chantier terrasse.
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-white/10">
            <table className="w-full text-left text-xs">
              <thead className="bg-[#F7F7F6] text-[#8E7F74]">
                <tr>
                  <th className="px-4 py-2.5 font-bold">N° Facture</th>
                  <th className="px-4 py-2.5 font-bold">Type</th>
                  <th className="px-4 py-2.5 font-bold">Date</th>
                  <th className="px-4 py-2.5 font-bold">Statut</th>
                  <th className="px-4 py-2.5 text-right font-bold">Accès</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/10 text-[#F5EFEA]">
                {factures.map((f) => (
                  <tr key={f.id} className="hover:bg-[#120F0D]">
                    <td className="px-4 py-3 font-bold text-[#F5EFEA]">{f.numero}</td>
                    <td className="px-4 py-3 font-medium capitalize">{f.type_facture || "Acompte"}</td>
                    <td className="px-4 py-3">
                      {new Date(f.date_emission).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="px-4 py-3">
                      <span className="rounded-md border border-white/10 bg-[#120F0D] px-2 py-0.5 text-[11px] font-bold text-[#B8A99E]">
                        {f.statut}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <Link
                        href={`/bureau/devis-factures?facture_id=${f.id}`}
                        className="inline-flex items-center gap-1 text-[11px] font-bold text-[#D96B27] hover:underline"
                      >
                        <span>Détail</span>
                        <ExternalLink className="h-3 w-3" />
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* 4. Retenue de Garantie (5%) */}
      <section className="rounded-2xl sm:rounded-3xl border border-white/10 bg-[#1B1511] p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
        <RetenueGarantieChantier
          chantierId={chantierId}
          chantierNom={chantierNom}
        />
      </section>
    </div>
  );
}

"use client";

import { useCallback, useEffect, useState } from "react";
import type { ReactNode } from "react";
import { fmtEuro } from "@/lib/financeCalculs";
import {
  Wallet, TrendingUp, TrendingDown, AlertTriangle, Landmark, PenLine, Check,
  Loader2, RotateCcw, ArrowRight, Building2, PiggyBank
} from "lucide-react";

type ChantierRentabilite = {
  id: string;
  nom: string;
  statut: string;
  budget: number;
  depenses: number;
  marge: number;
};

type Alerte = {
  id: string;
  niveau: "rouge" | "orange" | "vert";
  type: string;
  message: string;
  sous_message?: string;
  montant?: number;
  action?: { label: string; href?: string; mailto?: string };
};

type ReponseDashboard = {
  parametres: { tresorerie_actuelle: number; charges_fixes_mensuelles: number };
  ca_encaisse_mois: number;
  ca_en_attente: number;
  depenses_a_payer: number;
  depenses_a_payer_par_fournisseur: { nom: string; email: string | null; montant: number }[];
  treso_j15: number;
  treso_j30: number;
  projection: number[];
  alertes: Alerte[];
  top_chantiers_rentables: ChantierRentabilite[];
  top_chantiers_pertes: ChantierRentabilite[];
};

const COULEURS_NIVEAU = {
  rouge: { border: "border-rose-500/40", bg: "bg-rose-500/10", text: "text-rose-400", dot: "bg-rose-500", label: "border-rose-500/40 text-rose-400 bg-rose-500/10" },
  orange: { border: "border-amber-500/40", bg: "bg-amber-500/10", text: "text-amber-400", dot: "bg-amber-500", label: "border-amber-500/40 text-amber-400 bg-amber-500/10" },
  vert: { border: "border-emerald-500/40", bg: "bg-emerald-500/10", text: "text-emerald-400", dot: "bg-emerald-500", label: "border-emerald-500/40 text-emerald-400 bg-emerald-500/10" },
};

export default function DashboardPatronPage() {
  const [data, setData] = useState<ReponseDashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [editTreso, setEditTreso] = useState(false);
  const [inputTreso, setInputTreso] = useState("");
  const [savingTreso, setSavingTreso] = useState(false);

  const charger = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/dashboard-patron", { cache: "no-store" });
      if (!res.ok) throw new Error(`Erreur API (${res.status})`);
      const json = await res.json();
      if (json.error) throw new Error(json.error);
      setData(json);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    charger();
  }, [charger]);

  const enregistrerTreso = async () => {
    const val = parseFloat(inputTreso.replace(",", "."));
    if (Number.isNaN(val)) {
      setEditTreso(false);
      return;
    }
    setSavingTreso(true);
    try {
      const res = await fetch("/api/dashboard-patron", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tresorerie_actuelle: val }),
      });
      if (!res.ok) throw new Error("Erreur sauvegarde");
      setEditTreso(false);
      await charger();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setSavingTreso(false);
    }
  };

  if (loading && !data) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="animate-spin text-white" size={28} />
      </div>
    );
  }

  if (!data) {
    return (
      <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-400">
        Impossible de charger le dashboard : {error}
      </div>
    );
  }

  const { parametres, ca_encaisse_mois, ca_en_attente, depenses_a_payer, treso_j15, treso_j30, projection } = data;

  const maxAbs = Math.max(...projection.map((v) => Math.abs(v)), 1);
  const hauteurBarre = (v: number) => `${Math.max(6, (Math.abs(v) / maxAbs) * 80)}%`;

  const nbRouges = data.alertes.filter((a) => a.niveau === "rouge").length;

  const Carte = ({
    titre, valeur, editable, negative, icone, sous,
  }: {
    titre: string; valeur: string; editable?: boolean; negative?: boolean; icone: ReactNode; sous?: string;
  }) => (
    <div className="rounded-2xl border border-white/10 bg-[#1A1D24] p-4 flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-xs font-bold uppercase tracking-wide text-gray-500 flex items-center gap-1.5">
          {icone}
          {titre}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <span className={`text-3xl font-black ${negative ? "text-rose-400" : "text-white"}`}>{valeur}</span>
        {editable && (
          <button
            onClick={() => { setEditTreso(true); setInputTreso(String(parametres.tresorerie_actuelle)); }}
            className="text-gray-500 hover:text-white transition-colors"
            title="Modifier la trésorerie actuelle"
          >
            <PenLine className="h-4 w-4" />
          </button>
        )}
      </div>
      {sous && <p className="text-[11px] text-gray-500">{sous}</p>}
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Dashboard Patron — Trésorerie</h1>
          <p className="text-xs text-gray-400">
            {new Date().toLocaleDateString("fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" })} · Découvert détecté dans les 15 jours ?
          </p>
        </div>
        {nbRouges > 0 && (
          <span className="flex items-center gap-2 rounded-full border border-rose-500/40 bg-rose-500/10 px-4 py-1.5 text-xs font-bold text-rose-400">
            <AlertTriangle size={14} /> {nbRouges} alerte{nbRouges > 1 ? "s" : ""} prioritaire{nbRouges > 1 ? "s" : ""}
          </span>
        )}
      </div>

      {editTreso && (
        <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-4 flex items-center gap-3">
          <div>
            <p className="text-xs font-bold uppercase tracking-wide text-gray-500">Trésorerie actuelle (€)</p>
            <input
              autoFocus
              type="number"
              value={inputTreso}
              onChange={(e) => setInputTreso(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && enregistrerTreso()}
              className="mt-1 rounded-lg border border-white/10 bg-[#0B0F19] px-3 py-2 text-sm text-white w-40"
            />
          </div>
          <button
            onClick={enregistrerTreso}
            disabled={savingTreso}
            className="flex items-center gap-1.5 rounded-lg bg-red-600 px-4 py-2 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {savingTreso ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
            Enregistrer
          </button>
          <button onClick={() => setEditTreso(false)} className="text-xs text-gray-400 hover:text-white">
            Annuler
          </button>
        </div>
      )}

      {error && (
        <div className="rounded-xl border border-rose-500/30 bg-rose-500/10 p-3 text-xs text-rose-400">
          {error}
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Carte
          titre="Tréso aujourd'hui"
          icone={<Wallet className="h-3.5 w-3.5" />}
          valeur={fmtEuro(parametres.tresorerie_actuelle)}
          editable
          sous={`CA encaissé ce mois : ${fmtEuro(ca_encaisse_mois)}`}
        />
        <Carte
          titre="Tréso J+15"
          icone={<TrendingDown className="h-3.5 w-3.5" />}
          valeur={fmtEuro(treso_j15)}
          negative={treso_j15 < 0}
          sous="Si tout est confirmé"
        />
        <Carte
          titre="Tréso J+30"
          icone={<TrendingUp className="h-3.5 w-3.5" />}
          valeur={fmtEuro(treso_j30)}
          negative={treso_j30 < 0}
          sous={`Dépenses à payer : ${fmtEuro(depenses_a_payer)}`}
        />
        <Carte
          titre="CA en attente"
          icone={<Landmark className="h-3.5 w-3.5" />}
          valeur={fmtEuro(ca_en_attente)}
          sous="Factures + devis signés non facturés"
        />
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#1A1D24] p-4">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-bold text-white flex items-center gap-2">
            <PiggyBank className="h-4 w-4 text-gray-400" />
            Projection trésorerie — 30 prochains jours
          </h2>
          <span className="text-xs text-gray-500">Jours : {projection.length}</span>
        </div>
        <div className="flex items-end gap-[2px] h-32">
          {projection.map((v, i) => {
            const pos = v >= 0;
            return (
              <div
                key={i}
                className="flex-1 rounded-t-sm flex flex-col justify-end h-full"
                title={`J+${i + 1} : ${fmtEuro(v)}`}
              >
                <div
                  className={`w-full ${pos ? "bg-emerald-500/70" : "bg-rose-500/70"}`}
                  style={{ height: hauteurBarre(v) }}
                />
              </div>
            );
          })}
        </div>
        <div className="flex justify-between text-[10px] text-gray-500 mt-2">
          <span>J+1</span>
          <span>J+7</span>
          <span>J+15</span>
          <span>J+22</span>
          <span>J+30</span>
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4 items-start">
        <div className="lg:col-span-1 rounded-2xl border border-white/10 bg-[#1A1D24] p-4">
          <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <Building2 className="h-4 w-4 text-emerald-400" />
            Top 3 chantiers rentables
          </h2>
          <div className="space-y-2">
            {data.top_chantiers_rentables.map((c, i) => (
              <div key={c.id} className="rounded-lg border border-white/10 bg-[#0B0F19]/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-white truncate">{i + 1}. {c.nom}</span>
                  <span className="text-xs font-bold text-emerald-400">{fmtEuro(c.marge)}</span>
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  Budget {fmtEuro(c.budget)} · Consommé {fmtEuro(c.depenses)}
                </div>
              </div>
            ))}
            {data.top_chantiers_rentables.length === 0 && (
              <p className="text-xs text-gray-500 italic">Aucun chantier budgété</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-1 rounded-2xl border border-white/10 bg-[#1A1D24] p-4">
          <h2 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
            <TrendingDown className="h-4 w-4 text-rose-400" />
            Top 3 qui perdent de l&apos;argent
          </h2>
          <div className="space-y-2">
            {data.top_chantiers_pertes.map((c, i) => (
              <div key={c.id} className="rounded-lg border border-rose-500/20 bg-[#0B0F19]/50 p-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-medium text-white truncate">{i + 1}. {c.nom}</span>
                  <span className="text-xs font-bold text-rose-400">-{fmtEuro(Math.abs(c.marge))}</span>
                </div>
                <div className="text-[10px] text-gray-500 mt-0.5">
                  Budget {fmtEuro(c.budget)} · Consommé {fmtEuro(c.depenses)}
                </div>
              </div>
            ))}
            {data.top_chantiers_pertes.length === 0 && (
              <p className="text-xs text-gray-500 italic">Aucun chantier en perte</p>
            )}
          </div>
        </div>

        <div className="lg:col-span-1 rounded-2xl border border-white/10 bg-[#1A1D24] p-4">
          <h2 className="text-sm font-bold text-white mb-3">Dépenses à payer par fournisseur</h2>
          <div className="space-y-2">
            {data.depenses_a_payer_par_fournisseur.slice(0, 6).map((f) => (
              <div key={f.nom} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-gray-300 truncate">{f.nom}</span>
                <span className="text-rose-400 font-bold shrink-0">{fmtEuro(f.montant)}</span>
              </div>
            ))}
            {data.depenses_a_payer_par_fournisseur.length === 0 && (
              <p className="text-xs text-gray-500 italic">Aucune dépense en attente</p>
            )}
          </div>
          <p className="text-[10px] text-gray-500 mt-3 border-t border-white/10 pt-2">
            Total à payer : <span className="text-rose-400 font-bold">{fmtEuro(depenses_a_payer)}</span>
            {parametres.charges_fixes_mensuelles > 0 && (
              <span> · dont charges fixes {fmtEuro(parametres.charges_fixes_mensuelles)}/mois (reparties sur la projection)</span>
            )}
          </p>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 bg-[#1A1D24] p-4">
        <h2 className="text-sm font-bold text-white mb-3">Alertes</h2>
        <div className="space-y-2">
          {data.alertes.map((a) => {
            const coul = COULEURS_NIVEAU[a.niveau];
            return (
              <div key={a.id} className={`flex items-center gap-3 rounded-xl border ${coul.border} ${coul.bg} p-3`}>
                <span className={`h-2 w-2 rounded-full shrink-0 ${coul.dot}`} />
                <div className="flex-1 min-w-0">
                  <p className={`text-sm font-medium ${coul.text}`}>{a.message}</p>
                  {a.sous_message && <p className="text-xs text-gray-400">{a.sous_message}</p>}
                </div>
                {typeof a.montant === "number" && (
                  <span className={`text-sm font-bold shrink-0 ${coul.text}`}>{fmtEuro(a.montant)}</span>
                )}
                {a.action && (
                  <div className="flex items-center gap-1.5 shrink-0">
                    {a.action.mailto && (
                      <a href={a.action.mailto} className="text-xs font-medium text-gray-200 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                        Relancer
                      </a>
                    )}
                    {a.action.href && (
                      <a href={a.action.href} className="flex items-center gap-1 text-xs font-medium text-gray-200 hover:text-white px-3 py-1.5 rounded-lg bg-white/5 border border-white/10">
                        {a.action.label}
                        <ArrowRight size={12} />
                      </a>
                    )}
                  </div>
                )}
              </div>
            );
          })}
          {data.alertes.length === 0 && (
            <p className="text-xs text-gray-500 italic">Aucune alerte</p>
          )}
        </div>
      </div>

      <div className="flex justify-end">
        <button
          onClick={charger}
          className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-white transition-colors"
        >
          <RotateCcw size={12} /> Actualiser
        </button>
      </div>
    </div>
  );
}
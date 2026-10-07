"use client";

import { memo, useDeferredValue, useMemo, useState } from "react";
import type { ChantierZone, Module, ModuleGroup, Percage } from "@/types/calepinage";
import { couleurGroupe } from "@/lib/calepinage/palette";
import {
  formaterSurface,
  lignesBordereau,
  totauxBordereau,
  type LigneBordereau,
} from "@/lib/calepinage/bordereau";

// Bordereau de débit mobile-first : vue de LECTURE sur les groupes / modules déjà
// calculés. Cartes (pas de tableau horizontal), filtres rapides, recherche,
// barre de résumé sticky et exports Excel / PDF générés côté serveur.

export type FormatExport = "excel" | "pdf";

export interface BordereauDebitProps {
  groups: ModuleGroup[];
  modules: Module[];
  zone: ChantierZone;
  percages?: Percage[];
  /** Appelé APRÈS un export réussi (le téléchargement est géré par le composant). */
  onExport?: (format: FormatExport) => void;
}

const ROUTES: Record<FormatExport, string> = {
  excel: "/api/calepinage/export/excel",
  pdf: "/api/calepinage/export/pdf",
};
const EXTENSIONS: Record<FormatExport, string> = { excel: "xlsx", pdf: "pdf" };

type Filtre = { type: "tous" } | { type: "coupes" } | { type: "materiau"; valeur: string };

/** « 1000 × 600 », « 1000x600 », « 1000 » → forme comparable. */
const normaliser = (s: string): string =>
  s.toLowerCase().replace(/[×*]/g, "x").replace(/\s+/g, "");

const messageErreur = (e: unknown, repli: string): string =>
  e instanceof Error ? e.message : repli;

const CarteGroupe = memo(function CarteGroupe({
  ligne,
  couleur,
  infoPercages,
}: {
  ligne: LigneBordereau;
  couleur: string;
  infoPercages?: string;
}) {
  return (
    <li
      className="space-y-1.5 rounded-xl border border-[#333] bg-[#1E1E1E] p-3 pl-4"
      style={{ borderLeft: `6px solid ${couleur}` }}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-base font-bold text-white">{ligne.groupNumber}</span>
        <span className="rounded-full bg-[#2a2a2a] px-2.5 py-0.5 text-sm font-bold text-white">
          ×{ligne.quantite}
        </span>
      </div>
      <p className="text-sm text-gray-300">
        {ligne.largeurMm} × {ligne.hauteurMm} mm
      </p>
      <p className="text-sm font-bold text-white">{formaterSurface(ligne.surfaceM2)}</p>
      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <span className="rounded-full bg-[#2a2a2a] px-2.5 py-0.5 text-xs font-bold text-gray-300">
          {ligne.traitement}
        </span>
        <span className="rounded-full bg-[#2a2a2a] px-2.5 py-0.5 text-xs font-bold text-gray-300">
          {ligne.materiau}
        </span>
        {ligne.nbCoupes > 0 && (
          <span className="rounded-full bg-orange-500/20 px-2.5 py-0.5 text-xs font-bold text-orange-400">
            COUPE
          </span>
        )}
        {infoPercages && (
          <span className="rounded-full bg-blue-500/15 px-2.5 py-0.5 text-xs font-bold text-blue-300">
            {infoPercages}
          </span>
        )}
      </div>
    </li>
  );
});

function Chip({
  actif,
  onClick,
  children,
}: {
  actif: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      aria-pressed={actif}
      onClick={onClick}
      className={`h-10 shrink-0 rounded-full border px-4 text-sm font-bold ${
        actif
          ? "border-red-500 bg-red-600/20 text-white"
          : "border-[#333] bg-[#1E1E1E] text-gray-400"
      }`}
    >
      {children}
    </button>
  );
}

export default function BordereauDebit({
  groups,
  modules,
  zone,
  percages,
  onExport,
}: BordereauDebitProps) {
  const [filtre, setFiltre] = useState<Filtre>({ type: "tous" });
  const [recherche, setRecherche] = useState("");
  const rechercheDifferee = useDeferredValue(recherche);
  const [exportEnCours, setExportEnCours] = useState<FormatExport | null>(null);
  const [erreurExport, setErreurExport] = useState<string | null>(null);

  const lignes = useMemo(() => lignesBordereau(groups, modules), [groups, modules]);
  const totaux = useMemo(() => totauxBordereau(groups), [groups]);
  const numeros = useMemo(() => groups.map((g) => g.group_number), [groups]);

  const infosPercagesParGroupe = useMemo(() => {
    if (!percages || percages.length === 0) return new Map<string, string>();
    const percagesParModule = new Map<string, Percage[]>();
    for (const p of percages) {
      const list = percagesParModule.get(p.module_id) || [];
      list.push(p);
      percagesParModule.set(p.module_id, list);
    }

    const res = new Map<string, string>();
    for (const g of groups) {
      const mods = modules.filter((m) => m.group_number === g.group_number);
      const modRef = mods.find((m) => !m.is_cut) || mods[0];
      if (!modRef) continue;
      const trous = percagesParModule.get(modRef.id) || [];
      if (trous.length === 0) continue;

      const nbFixes = trous.filter((t) => t.type === "fixe").length;
      const nbCoulissants = trous.filter((t) => t.type === "coulissante").length;
      const diam = trous[0]?.diameter_mm ?? 8;

      let detail = "";
      if (nbFixes > 0 && nbCoulissants > 0) {
        detail = ` (${nbFixes} fixes, ${nbCoulissants} coulissants)`;
      } else if (nbFixes > 0) {
        detail = " (fixes)";
      } else if (nbCoulissants > 0) {
        detail = " (coulissants)";
      }

      res.set(g.group_number, `${trous.length} trous Ø${diam}${detail}`);
    }
    return res;
  }, [groups, modules, percages]);

  // Matériaux réellement présents → chips dynamiques.
  const materiaux = useMemo(
    () => [...new Set(lignes.map((l) => l.materiau))].sort((a, b) => a.localeCompare(b, "fr")),
    [lignes],
  );

  const visibles = useMemo(() => {
    const q = normaliser(rechercheDifferee);
    return lignes.filter((l) => {
      if (filtre.type === "coupes" && l.nbCoupes === 0) return false;
      if (filtre.type === "materiau" && l.materiau !== filtre.valeur) return false;
      if (!q) return true;
      return (
        normaliser(l.groupNumber).includes(q) ||
        `${l.largeurMm}x${l.hauteurMm}`.includes(q) ||
        `${l.hauteurMm}x${l.largeurMm}`.includes(q)
      );
    });
  }, [lignes, filtre, rechercheDifferee]);

  async function exporter(format: FormatExport) {
    if (exportEnCours) return;
    setExportEnCours(format);
    setErreurExport(null);
    try {
      const res = await fetch(ROUTES[format], {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ zone_id: zone.id }),
      });
      if (!res.ok) {
        const corps: unknown = await res.json().catch(() => null);
        const msg =
          corps && typeof corps === "object" && "error" in corps && typeof corps.error === "string"
            ? corps.error
            : `Échec de l'export (${res.status})`;
        throw new Error(msg);
      }
      const nom =
        /filename="([^"]+)"/.exec(res.headers.get("Content-Disposition") ?? "")?.[1] ??
        `bordereau.${EXTENSIONS[format]}`;
      const url = URL.createObjectURL(await res.blob());
      const a = document.createElement("a");
      a.href = url;
      a.download = nom;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      onExport?.(format);
    } catch (e: unknown) {
      setErreurExport(messageErreur(e, "Échec de l'export"));
    } finally {
      setExportEnCours(null);
    }
  }

  const boutonExport = (format: FormatExport, label: string) => (
    <button
      key={format}
      type="button"
      onClick={() => void exporter(format)}
      disabled={exportEnCours !== null || lignes.length === 0}
      aria-busy={exportEnCours === format}
      className="flex h-10 items-center gap-2 rounded-full border border-[#333] bg-[#1E1E1E] px-4 text-sm font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
    >
      {exportEnCours === format && (
        <span
          aria-hidden
          className="h-4 w-4 animate-spin rounded-full border-2 border-white/40 border-t-white"
        />
      )}
      {label}
    </button>
  );

  return (
    <div className="flex min-h-full flex-col bg-[#121212] text-white">
      {/* 1. Header */}
      <header className="space-y-3 p-4 pb-2">
        <div>
          <h1 className="text-lg font-bold">Bordereau de débit</h1>
          <p className="truncate text-sm text-gray-400">
            {zone.nom} · {formaterSurface(totaux.surfaceM2)}
          </p>
        </div>
        <div className="flex gap-2">
          {boutonExport("excel", "Excel")}
          {boutonExport("pdf", "PDF")}
        </div>
        {erreurExport && (
          <p role="alert" className="text-sm font-bold text-red-400">
            {erreurExport}
          </p>
        )}
      </header>

      {/* 5. Recherche + 4. Filtres rapides */}
      <div className="space-y-2 px-4 pb-3">
        <input
          type="search"
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="N° de groupe ou dimensions (ex. 1000 × 600)"
          aria-label="Rechercher un groupe"
          className="h-12 w-full rounded-xl border border-[#333] bg-[#1E1E1E] px-4 text-base text-white outline-none placeholder:text-gray-500 focus:border-red-500"
        />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip actif={filtre.type === "tous"} onClick={() => setFiltre({ type: "tous" })}>
            Tous
          </Chip>
          <Chip actif={filtre.type === "coupes"} onClick={() => setFiltre({ type: "coupes" })}>
            Coupés
          </Chip>
          {materiaux.map((m) => (
            <Chip
              key={m}
              actif={filtre.type === "materiau" && filtre.valeur === m}
              onClick={() => setFiltre({ type: "materiau", valeur: m })}
            >
              {m}
            </Chip>
          ))}
        </div>
      </div>

      {/* 2. Liste de cartes */}
      <main className="flex-1 px-4 pb-4">
        {lignes.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#333] p-4 text-center text-sm text-gray-400">
            Aucun module calculé. Lancez le calcul du calepinage.
          </p>
        ) : visibles.length === 0 ? (
          <p className="rounded-xl border border-dashed border-[#333] p-4 text-center text-sm text-gray-400">
            Aucun groupe ne correspond.
          </p>
        ) : (
          <ul className="space-y-2">
            {visibles.map((l) => (
              <CarteGroupe
                key={l.groupNumber}
                ligne={l}
                couleur={couleurGroupe(l.groupNumber, numeros)}
                infoPercages={infosPercagesParGroupe.get(l.groupNumber)}
              />
            ))}
          </ul>
        )}
      </main>

      {/* 3. Barre de résumé sticky */}
      <footer className="sticky bottom-0 z-10 grid grid-cols-3 gap-2 border-t border-[#333] bg-[#121212] p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] text-center">
        <div>
          <p className="text-base font-bold">{totaux.nbModules}</p>
          <p className="text-xs text-gray-400">modules</p>
        </div>
        <div>
          <p className="text-base font-bold">{formaterSurface(totaux.surfaceM2)}</p>
          <p className="text-xs text-gray-400">surface</p>
        </div>
        <div>
          <p className="text-base font-bold">{totaux.nbGroupes}</p>
          <p className="text-xs text-gray-400">groupes</p>
        </div>
      </footer>
    </div>
  );
}

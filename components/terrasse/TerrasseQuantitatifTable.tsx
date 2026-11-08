"use client";

import React from "react";
import { useRouter } from "next/navigation";
import type { ResultatCalculTerrasse } from "@/lib/terrasse/types";
import { fmtEuro } from "@/lib/financeCalculs";
import { ShoppingCart, PackageCheck, Layers, Ruler } from "lucide-react";

interface TerrasseQuantitatifTableProps {
  resultat: ResultatCalculTerrasse;
  chantierId: string;
  chantierNom: string;
}

const CLE_PREFILL_COMMANDE = "bna_prefill_commande";

export default function TerrasseQuantitatifTable({
  resultat,
  chantierId,
  chantierNom,
}: TerrasseQuantitatifTableProps) {
  const router = useRouter();

  const handleCreerCommande = () => {
    // Préparer les lignes pour la commande fournisseur (exclusion formelle des prestations de main-d'œuvre)
    const lignesFournitures = (resultat.chiffrage.lignes || [])
      .filter((l) => {
        const cat = (l.categorie || "").toLowerCase();
        const code = (l.code || "").toUpperCase();
        const unite = (l.unite || "").toLowerCase();
        // Exclusion formelle de toute prestation / main-d'œuvre
        if (
          cat.includes("main") ||
          cat.includes("oeuvre") ||
          cat.includes("pose") ||
          cat.includes("prestation")
        ) {
          return false;
        }
        if (code.startsWith("MO-") || code.startsWith("PREST-")) {
          return false;
        }
        if (unite === "h" || unite === "heure" || unite === "heures") {
          return false;
        }
        return true;
      })
      .map((l) => ({
        designation: l.designation,
        quantite: l.quantite,
        unite: l.unite,
        pu_ht: l.prixUnitaireHt,
      }));

    const zoneNom = `Fournitures Terrasse Bois DTU 51.4 — ${resultat.surfaceBruteM2} m²`;

    try {
      localStorage.setItem(
        CLE_PREFILL_COMMANDE,
        JSON.stringify({
          // Clés camelCase lues par app/bureau/fournisseurs/page.tsx
          chantierId: chantierId || "",
          chantierNom: chantierNom || "",
          zoneNom,
          // Clés snake_case historiques préservées
          chantier_id: chantierId || "",
          chantier_nom: chantierNom || "",
          designation_globale: zoneNom,
          lignes: lignesFournitures,
        })
      );
      router.push("/bureau/fournisseurs");
    } catch (e) {
      console.error("Erreur pré-remplissage commande :", e);
    }
  };

  return (
    <div className="space-y-4">
      {/* Grille de synthèse KPIs */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-2xl border border-white/10 bg-[#16181d] p-3 text-center shadow-md">
          <p className="text-3xs font-semibold uppercase tracking-wider text-gray-400">Surface platelage</p>
          <p className="mt-1 text-lg font-bold text-white">{resultat.surfaceNetteM2} m²</p>
          <p className="text-3xs text-gray-500">Brut : {resultat.surfaceBruteM2} m²</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#16181d] p-3 text-center shadow-md">
          <p className="text-3xs font-semibold uppercase tracking-wider text-amber-400">Lames à commander</p>
          <p className="mt-1 text-lg font-bold text-amber-400">{resultat.lames.surfaceACommanderM2} m²</p>
          <p className="text-3xs text-gray-500">{resultat.lames.nbLamesStandard} lames std</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#16181d] p-3 text-center shadow-md">
          <p className="text-3xs font-semibold uppercase tracking-wider text-orange-400">Lambourdes</p>
          <p className="mt-1 text-lg font-bold text-orange-400">{resultat.lambourdes.lineaireAvecChutesMl} ml</p>
          <p className="text-3xs text-gray-500">{resultat.lambourdes.nbBarres} barres</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#16181d] p-3 text-center shadow-md">
          <p className="text-3xs font-semibold uppercase tracking-wider text-yellow-400">Plots réglables</p>
          <p className="mt-1 text-lg font-bold text-yellow-400">{resultat.plots.nbPlotsTotal} u</p>
          <p className="text-3xs text-gray-500">{resultat.plots.densiteParM2} / m²</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-[#16181d] p-3 text-center shadow-md">
          <p className="text-3xs font-semibold uppercase tracking-wider text-sky-400">Fixations</p>
          <p className="mt-1 text-lg font-bold text-sky-400">{resultat.fixations.nbVisOuClipsTotal} u</p>
          <p className="text-3xs text-gray-500">{resultat.fixations.nbBoites} boîtes</p>
        </div>

        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-950/20 p-3 text-center shadow-md">
          <p className="text-3xs font-semibold uppercase tracking-wider text-emerald-400">Total Fournitures HT</p>
          <p className="mt-1 text-lg font-bold text-emerald-400">
            {fmtEuro(resultat.chiffrage.totalHt)}
          </p>
          <p className="text-3xs text-emerald-500/70">Indicatif marché pro</p>
        </div>
      </div>

      {/* Séparation Q_net / Q_tech / Q_appro & Scénarios admissibles (Terrasse Pro) */}
      {resultat.terrassePro && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
            <div className="rounded-2xl border border-white/10 bg-[#14161b] p-3.5 shadow-md">
              <p className="text-3xs font-bold uppercase tracking-wider text-sky-400">
                1. Quantitatif Net Géométrique (Q_net)
              </p>
              <p className="mt-1 text-xs text-gray-300">
                Surface nette :{" "}
                <span className="font-bold text-white">
                  {resultat.terrassePro.quantities.geometricNet.netDeckingAreaM2} m²
                </span>{" "}
                (réservations déduites :{" "}
                {resultat.terrassePro.quantities.geometricNet.reservationsDeductedAreaM2} m²)
              </p>
              <p className="mt-0.5 text-3xs text-gray-400">
                Lames nettes : {resultat.terrassePro.quantities.geometricNet.totalBladeNetLinearMeters} ml •{" "}
                Segments posés : {resultat.terrassePro.geometry.blades.length} (tous ≥ 400 mm)
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#14161b] p-3.5 shadow-md">
              <p className="text-3xs font-bold uppercase tracking-wider text-amber-400">
                2. Quantitatif Technique Découpe 1D (Q_tech)
              </p>
              <p className="mt-1 text-xs text-gray-300">
                Barres débitées :{" "}
                <span className="font-bold text-white">
                  {resultat.terrassePro.quantities.technicalCut.bladesByCommercialLength[0]?.count ?? 0} lames
                </span>{" "}
                &{" "}
                <span className="font-bold text-white">
                  {resultat.terrassePro.quantities.technicalCut.joistsByCommercialLength[0]?.count ?? 0} lambourdes
                </span>
              </p>
              <p className="mt-0.5 text-3xs text-gray-400">
                Chute lames : {resultat.terrassePro.quantities.technicalCut.globalBladeWasteRatePercent}% •{" "}
                Chutes réemployées ♻️ :{" "}
                <span className="font-bold text-emerald-400">
                  {resultat.terrassePro.geometry.blades.filter((b) => b.isFromOffcutReuse).length}
                </span>
              </p>
            </div>

            <div className="rounded-2xl border border-white/10 bg-[#14161b] p-3.5 shadow-md">
              <p className="text-3xs font-bold uppercase tracking-wider text-emerald-400">
                3. Approvisionnement (+3% Tri DTU & Colisage)
              </p>
              <p className="mt-1 text-xs text-gray-300">
                À commander :{" "}
                <span className="font-bold text-white">
                  {resultat.terrassePro.quantities.commercialSupply.totalBladesToOrderCount} lames
                </span>{" "}
                (dont +{resultat.terrassePro.quantities.commercialSupply.dtu3PercentSortingMarginBladesCount} marge 3%)
              </p>
              <p className="mt-0.5 text-3xs text-gray-400">
                Fixations : Inox {resultat.terrassePro.quantities.commercialSupply.fastenerSpec.stainlessGrade}
                {resultat.terrassePro.quantities.commercialSupply.fastenerSpec.diameterMm
                  ? ` Ø${resultat.terrassePro.quantities.commercialSupply.fastenerSpec.diameterMm}x${resultat.terrassePro.quantities.commercialSupply.fastenerSpec.minLengthMm} mm`
                  : " (Clips composites)"}{" "}
                ({resultat.terrassePro.quantities.commercialSupply.fastenerBoxesCount} btes)
              </p>
            </div>
          </div>

          {resultat.terrassePro.topAdmissibleScenarios &&
            resultat.terrassePro.topAdmissibleScenarios.length > 0 && (
              <div className="rounded-2xl border border-white/10 bg-[#14161b] p-3.5 shadow-md">
                <p className="text-3xs font-bold uppercase tracking-wider text-amber-300 mb-2">
                  Scénarios d&apos;Optimisation 1D Admissibles (Tous segments ≥ 400 mm & appuis DTU 51.4 validés)
                </p>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  {resultat.terrassePro.topAdmissibleScenarios.map((sc) => (
                    <div
                      key={`${sc.rank}-${sc.poseMode}-${sc.commercialLengthMm}`}
                      className={`flex items-center justify-between rounded-xl px-3 py-2 text-xs border ${
                        sc.rank === 1
                          ? "bg-emerald-950/30 border-emerald-500/40 text-white"
                          : "bg-black/30 border-white/10 text-gray-300"
                      }`}
                    >
                      <div>
                        <span
                          className={`inline-block rounded px-1.5 py-0.5 text-[10px] font-extrabold mr-2 ${
                            sc.rank === 1
                              ? "bg-emerald-500 text-black"
                              : "bg-white/10 text-gray-300"
                          }`}
                        >
                          #{sc.rank} {sc.rank === 1 ? "Optimal" : "Alternative"}
                        </span>
                        <span className="font-semibold">{sc.label}</span>
                      </div>
                      <div className="text-right">
                        <span className="font-bold text-amber-300">
                          {sc.totalBladesToOrderCount} lames
                        </span>{" "}
                        <span className="text-3xs text-gray-400">
                          (chute {sc.wasteRatePercent}%)
                        </span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
        </div>
      )}

      {/* Tableau détaillé des approvisionnements */}
      <div className="rounded-2xl border border-white/10 bg-[#14161b] overflow-hidden shadow-xl">
        <div className="flex items-center justify-between p-4 border-b border-white/5">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-white flex items-center gap-2">
              <PackageCheck className="h-4 w-4 text-emerald-400" />
              Nomenclature & Quantitatif Détaillé
            </h3>
            <p className="text-3xs text-gray-400 mt-0.5">
              Calculé automatiquement d&apos;après les règles du DTU 51.4 et les coefficients de marge
            </p>
          </div>

          <button
            onClick={handleCreerCommande}
            className="flex items-center gap-1.5 rounded-xl bg-red-600 px-3.5 py-2 text-xs font-bold text-white hover:bg-red-700 transition shadow-md"
          >
            <ShoppingCart size={14} />
            Créer le Bon de Commande Fournisseur
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="border-b border-white/5 bg-black/40 text-3xs font-semibold uppercase text-gray-400">
              <tr>
                <th className="px-4 py-3">Code</th>
                <th className="px-4 py-3">Catégorie</th>
                <th className="px-4 py-3">Désignation</th>
                <th className="px-4 py-3 text-right">Quantité</th>
                <th className="px-4 py-3 text-center">Unité</th>
                <th className="px-4 py-3 text-right">P.U. HT</th>
                <th className="px-4 py-3 text-right">Total HT</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {resultat.chiffrage.lignes.map((l) => (
                <tr key={l.code} className="hover:bg-white/[0.02] transition-colors">
                  <td className="px-4 py-3 font-mono text-3xs text-gray-500">{l.code}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md bg-white/5 px-2 py-0.5 text-3xs font-medium text-gray-300">
                      {l.categorie}
                    </span>
                  </td>
                  <td className="px-4 py-3 font-medium text-white">{l.designation}</td>
                  <td className="px-4 py-3 text-right font-bold text-white">
                    {l.quantite.toLocaleString("fr-FR")}
                  </td>
                  <td className="px-4 py-3 text-center text-gray-400">{l.unite}</td>
                  <td className="px-4 py-3 text-right text-gray-400">
                    {fmtEuro(l.prixUnitaireHt)}
                  </td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-400">
                    {fmtEuro(l.totalHt)}
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot className="border-t border-white/10 bg-black/50 font-bold">
              <tr>
                <td colSpan={6} className="px-4 py-3.5 text-right text-gray-300 text-xs">
                  TOTAL ESTIMATIF FOURNITURES :
                </td>
                <td className="px-4 py-3.5 text-right text-emerald-400 text-sm">
                  {fmtEuro(resultat.chiffrage.totalHt)} HT
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
  );
}

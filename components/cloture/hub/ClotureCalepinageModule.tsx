"use client";

import React, { useEffect, useMemo, useState } from "react";
import dynamic from "next/dynamic";
import {
  AlertTriangle,
  Check,
  Download,
  Save,
  Sliders,
  Clock,
  Layers,
  Box,
} from "lucide-react";
import {
  FENCE_MATERIAL_PRESETS,
  type FenceConfig,
  type FenceEndsConfig,
  type FenceGroundType,
  type FenceMaterial,
  type FenceShape,
  type GestionPenteType,
  type SegmentId,
} from "@/lib/cloture/calepinageCloture";
import { calculerChiffrageCloture } from "@/lib/cloture/calculs";
import { fmtEuro } from "@/lib/financeCalculs";
import {
  ElevationPlan2DSvg,
  PlanCalepinage4Cotes2DSvg,
} from "@/components/cloture/CloturePlan2DSvg";

const ClotureVue3D = dynamic(() => import("@/components/cloture/ClotureVue3D"), {
  ssr: false,
  loading: () => (
    <div className="flex h-[380px] items-center justify-center rounded-2xl border border-[#E5E5E5] bg-white text-xs text-[#777777]">
      Chargement de la maquette 3D...
    </div>
  ),
});

interface ClotureCalepinageModuleProps {
  chantierId: string;
  onLineaireChange?: (lineaireM: number) => void;
}

export default function ClotureCalepinageModule({
  chantierId,
  onLineaireChange,
}: ClotureCalepinageModuleProps) {
  const [forme, setForme] = useState<FenceShape>("DROITE");
  const [materiau, setMateriau] = useState<FenceMaterial>("COMPOSITE");
  const [segA, setSegA] = useState(12.5);
  const [segB, setSegB] = useState(8.0);
  const [segC, setSegC] = useState(12.5);
  const [segD, setSegD] = useState(8.0);
  const [hauteurUtile, setHauteurUtile] = useState(1.8);
  const [longueurLameBrute, setLongueurLameBrute] = useState(1.8);
  const [hauteurLame, setHauteurLame] = useState(0.15);
  const [extremites, setExtremites] = useState<FenceEndsConfig>("LIBRE");
  const [typePoseSol, setTypePoseSol] = useState<FenceGroundType>("DIRECT_SOL");

  // Options enrichies
  const [presenceSoubassement, setPresenceSoubassement] = useState(false);
  const [hauteurSoubassementM, setHauteurSoubassementM] = useState(0.25);
  const [gestionPente, setGestionPente] = useState<GestionPenteType>("PLAT");
  const [deniveleA, setDeniveleA] = useState(0);
  const [deniveleB, setDeniveleB] = useState(0);
  const [presencePortillon, setPresencePortillon] = useState(false);
  const [segmentPortillon, setSegmentPortillon] = useState<SegmentId>("A");
  const [largeurPortillonM, setLargeurPortillonM] = useState(1.0);
  const [inclureMainOeuvre, setInclureMainOeuvre] = useState(true);

  const [selectedSide, setSelectedSide] = useState<SegmentId>("A");
  const [ongletVisu, setOngletVisu] = useState<"2d" | "3d">("2d");
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  useEffect(() => {
    let actif = true;
    fetch(`/api/chantiers/${chantierId}/cloture`)
      .then((r) => (r.ok ? r.json() : null))
      .then((json) => {
        if (!actif || !json?.ok || !json?.data?.cloture) return;
        const c = json.data.cloture;
        const troncons = (json.data.troncons ?? []) as Array<{
          code_segment: string;
          longueur_m: number;
          denivele_m?: number;
          presence_portillon?: boolean;
          largeur_portillon_m?: number | null;
        }>;
        if (c.forme) setForme(c.forme);
        if (c.materiau) setMateriau(c.materiau);
        if (c.hauteur_utile_m) setHauteurUtile(Number(c.hauteur_utile_m));
        if (c.longueur_lame_brute_m) setLongueurLameBrute(Number(c.longueur_lame_brute_m));
        if (c.hauteur_lame_m) setHauteurLame(Number(c.hauteur_lame_m));
        if (c.extremites) setExtremites(c.extremites);
        if (c.type_pose_sol) setTypePoseSol(c.type_pose_sol);
        setPresenceSoubassement(Boolean(c.presence_soubassement));
        if (c.hauteur_soubassement_m) setHauteurSoubassementM(Number(c.hauteur_soubassement_m));
        if (c.gestion_pente) setGestionPente(c.gestion_pente);

        for (const t of troncons) {
          if (t.code_segment === "A") {
            setSegA(Number(t.longueur_m));
            setDeniveleA(Number(t.denivele_m ?? 0));
          } else if (t.code_segment === "B") {
            setSegB(Number(t.longueur_m));
            setDeniveleB(Number(t.denivele_m ?? 0));
          } else if (t.code_segment === "C") {
            setSegC(Number(t.longueur_m));
          } else if (t.code_segment === "D") {
            setSegD(Number(t.longueur_m));
          }
          if (t.presence_portillon && t.largeur_portillon_m) {
            setPresencePortillon(true);
            setSegmentPortillon(t.code_segment as SegmentId);
            setLargeurPortillonM(Number(t.largeur_portillon_m));
          }
        }
      })
      .catch(() => null);
    return () => {
      actif = false;
    };
  }, [chantierId]);

  const config: FenceConfig = useMemo(
    () => ({
      forme,
      segments: { A: segA, B: segB, C: segC, D: segD },
      hauteurUtile,
      materiau,
      longueurLameBrute,
      hauteurLame,
      extremites,
      typePoseSol,
      presenceSoubassement,
      hauteurSoubassementM,
      gestionPente,
      denivelesSegments: { A: deniveleA, B: deniveleB },
      portillons: presencePortillon
        ? [{ segment: segmentPortillon, largeurM: largeurPortillonM }]
        : [],
    }),
    [
      forme,
      segA,
      segB,
      segC,
      segD,
      hauteurUtile,
      materiau,
      longueurLameBrute,
      hauteurLame,
      extremites,
      typePoseSol,
      presenceSoubassement,
      hauteurSoubassementM,
      gestionPente,
      deniveleA,
      deniveleB,
      presencePortillon,
      segmentPortillon,
      largeurPortillonM,
    ]
  );

  const chiffrage = useMemo(
    () => calculerChiffrageCloture(config, { inclureMainOeuvre }),
    [config, inclureMainOeuvre]
  );

  const result = chiffrage.calepinage;

  useEffect(() => {
    onLineaireChange?.(result.lineaireTotalM);
  }, [result.lineaireTotalM, onLineaireChange]);

  const activeSegment =
    result.segmentsActifs.find((s) => s.id === selectedSide) ?? result.segmentsActifs[0];

  async function sauvegarderConfiguration() {
    setSaving(true);
    setSaveMessage(null);
    try {
      const res = await fetch(`/api/chantiers/${chantierId}/cloture`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ config }),
      });
      const json = await res.json().catch(() => null);
      if (!res.ok || !json?.ok) {
        alert("Erreur sauvegarde : " + (json?.error || "Erreur serveur"));
        return;
      }
      setSaveMessage("Calepinage & quantitatif sauvegardés");
      setTimeout(() => setSaveMessage(null), 3500);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-6">
      {/* Barre d'actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#E5E5E5] bg-white p-4 shadow-xs">
        <div className="flex items-center gap-2.5">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[#B85B2B]/10 text-[#B85B2B]">
            <Sliders className="h-5 w-5" />
          </div>
          <div>
            <h3 className="text-sm font-bold text-[#23272B]">
              Paramétrage &amp; Calepinage Clôture
            </h3>
            <p className="text-xs text-[#777777]">
              {result.lineaireTotalM.toFixed(2)} ml · {result.nbTraveesTotal} travées ·{" "}
              {result.totalPoteauxComplets} poteaux · Chute {result.tauxChuteGlobalPct.toFixed(1)} %
            </p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] p-1 text-xs font-bold">
            <button
              type="button"
              onClick={() => setOngletVisu("2d")}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 ${
                ongletVisu === "2d" ? "bg-white text-[#B85B2B] shadow-xs" : "text-[#666666]"
              }`}
            >
              <Layers className="h-3.5 w-3.5" /> Plan 2D
            </button>
            <button
              type="button"
              onClick={() => setOngletVisu("3d")}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 ${
                ongletVisu === "3d" ? "bg-white text-[#B85B2B] shadow-xs" : "text-[#666666]"
              }`}
            >
              <Box className="h-3.5 w-3.5" /> Vue 3D
            </button>
          </div>

          <a
            href={`/api/chantiers/${chantierId}/cloture/export?format=csv`}
            className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white px-3.5 py-2 text-xs font-bold text-[#23272B]"
          >
            <Download className="h-3.5 w-3.5 text-[#B85B2B]" /> Export Excel / CSV
          </a>

          <button
            type="button"
            onClick={sauvegarderConfiguration}
            disabled={saving}
            className="inline-flex items-center gap-1.5 rounded-xl bg-[#B85B2B] hover:bg-[#D97732] px-4 py-2 text-xs font-bold text-white shadow-xs disabled:opacity-60"
          >
            {saveMessage ? <Check className="h-3.5 w-3.5" /> : <Save className="h-3.5 w-3.5" />}
            {saving ? "Enregistrement..." : saveMessage || "Enregistrer"}
          </button>
        </div>
      </div>

      {/* Formulaire de paramétrage */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4 space-y-3 text-xs shadow-xs">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#B85B2B]">
            1. Géométrie &amp; Longueurs
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-[#555555]">Forme</label>
              <select
                value={forme}
                onChange={(e) => setForme(e.target.value as FenceShape)}
                className="mt-1 w-full rounded-xl border border-[#E5E5E5] px-2.5 py-2 text-[#23272B]"
              >
                <option value="DROITE">1 Côté (I)</option>
                <option value="EN_L">2 Côtés (L)</option>
                <option value="EN_U">3 Côtés (U)</option>
                <option value="4_COTES">4 Côtés</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-[#555555]">Extrémités</label>
              <select
                value={extremites}
                onChange={(e) => setExtremites(e.target.value as FenceEndsConfig)}
                className="mt-1 w-full rounded-xl border border-[#E5E5E5] px-2.5 py-2 text-[#23272B]"
              >
                <option value="LIBRE">Libre / Boucle</option>
                <option value="DEPART_MUR">Départ mur</option>
                <option value="ENTRE_MURS">Entre 2 murs</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-[#555555]">Côté A (m)</label>
              <input
                type="number"
                step="0.1"
                value={segA}
                onChange={(e) => setSegA(parseFloat(e.target.value) || 0.5)}
                className="mt-1 w-full rounded-xl border border-[#E5E5E5] px-2.5 py-1.5 text-[#23272B]"
              />
            </div>
            {forme !== "DROITE" && (
              <div>
                <label className="font-semibold text-[#555555]">Côté B (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={segB}
                  onChange={(e) => setSegB(parseFloat(e.target.value) || 0.5)}
                  className="mt-1 w-full rounded-xl border border-[#E5E5E5] px-2.5 py-1.5 text-[#23272B]"
                />
              </div>
            )}
            {(forme === "EN_U" || forme === "4_COTES") && (
              <div>
                <label className="font-semibold text-[#555555]">Côté C (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={segC}
                  onChange={(e) => setSegC(parseFloat(e.target.value) || 0.5)}
                  className="mt-1 w-full rounded-xl border border-[#E5E5E5] px-2.5 py-1.5 text-[#23272B]"
                />
              </div>
            )}
            {forme === "4_COTES" && (
              <div>
                <label className="font-semibold text-[#555555]">Côté D (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={segD}
                  onChange={(e) => setSegD(parseFloat(e.target.value) || 0.5)}
                  className="mt-1 w-full rounded-xl border border-[#E5E5E5] px-2.5 py-1.5 text-[#23272B]"
                />
              </div>
            )}
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4 space-y-3 text-xs shadow-xs">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#B85B2B]">
            2. Matériau, Lames &amp; Pose
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-[#555555]">Matériau</label>
              <select
                value={materiau}
                onChange={(e) => {
                  const m = e.target.value as FenceMaterial;
                  setMateriau(m);
                  setLongueurLameBrute(FENCE_MATERIAL_PRESETS[m].defaultBladeLengthM);
                  setHauteurLame(FENCE_MATERIAL_PRESETS[m].defaultBladeHeightM);
                }}
                className="mt-1 w-full rounded-xl border border-[#E5E5E5] px-2.5 py-2 text-[#23272B]"
              >
                <option value="COMPOSITE">Composite</option>
                <option value="BOIS">Bois</option>
                <option value="ALU">Aluminium</option>
              </select>
            </div>
            <div>
              <label className="font-semibold text-[#555555]">Pose</label>
              <select
                value={typePoseSol}
                onChange={(e) => setTypePoseSol(e.target.value as FenceGroundType)}
                className="mt-1 w-full rounded-xl border border-[#E5E5E5] px-2.5 py-2 text-[#23272B]"
              >
                <option value="DIRECT_SOL">Scellement sol</option>
                <option value="SUR_MURET">Platines muret</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            <div>
              <label className="font-semibold text-[#555555]">H. utile (m)</label>
              <input
                type="number"
                step="0.05"
                value={hauteurUtile}
                onChange={(e) => setHauteurUtile(parseFloat(e.target.value) || 1.8)}
                className="mt-1 w-full rounded-xl border border-[#E5E5E5] px-2.5 py-1.5 text-[#23272B]"
              />
            </div>
            <div>
              <label className="font-semibold text-[#555555]">L. lame (m)</label>
              <input
                type="number"
                step="0.1"
                value={longueurLameBrute}
                onChange={(e) => setLongueurLameBrute(parseFloat(e.target.value) || 1.8)}
                className="mt-1 w-full rounded-xl border border-[#E5E5E5] px-2.5 py-1.5 text-[#23272B]"
              />
            </div>
            <div>
              <label className="font-semibold text-[#555555]">H. lame (m)</label>
              <input
                type="number"
                step="0.005"
                value={hauteurLame}
                onChange={(e) => setHauteurLame(parseFloat(e.target.value) || 0.15)}
                className="mt-1 w-full rounded-xl border border-[#E5E5E5] px-2.5 py-1.5 text-[#23272B]"
              />
            </div>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5E5E5] bg-white p-4 space-y-3 text-xs shadow-xs">
          <p className="text-[11px] font-extrabold uppercase tracking-wider text-[#B85B2B]">
            3. Soubassement, Redans &amp; Portillon
          </p>
          <div className="flex items-center justify-between gap-2">
            <label className="flex items-center gap-2 font-semibold text-[#23272B] cursor-pointer">
              <input
                type="checkbox"
                checked={presenceSoubassement}
                onChange={(e) => setPresenceSoubassement(e.target.checked)}
              />
              <span>Soubassement béton</span>
            </label>
            {presenceSoubassement && (
              <select
                value={hauteurSoubassementM}
                onChange={(e) => setHauteurSoubassementM(parseFloat(e.target.value))}
                className="rounded-lg border border-[#E5E5E5] px-2 py-1 text-xs"
              >
                <option value={0.25}>250 mm</option>
                <option value={0.5}>500 mm</option>
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className="font-semibold text-[#555555]">Gestion pente</label>
              <select
                value={gestionPente}
                onChange={(e) => setGestionPente(e.target.value as GestionPenteType)}
                className="mt-1 w-full rounded-xl border border-[#E5E5E5] px-2.5 py-1.5 text-[#23272B]"
              >
                <option value="PLAT">Terrain plat</option>
                <option value="REDANS">Redans (escalier)</option>
                <option value="SUIVI_PENTE">Suivi de pente</option>
              </select>
            </div>
            {gestionPente !== "PLAT" && (
              <div>
                <label className="font-semibold text-[#555555]">Dénivelé A (m)</label>
                <input
                  type="number"
                  step="0.1"
                  value={deniveleA}
                  onChange={(e) => setDeniveleA(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full rounded-xl border border-[#E5E5E5] px-2.5 py-1.5 text-[#23272B]"
                />
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2 pt-1">
            <label className="flex items-center gap-2 font-semibold text-[#23272B] cursor-pointer">
              <input
                type="checkbox"
                checked={presencePortillon}
                onChange={(e) => setPresencePortillon(e.target.checked)}
              />
              <span>Portillon</span>
            </label>
            {presencePortillon && (
              <>
                <select
                  value={segmentPortillon}
                  onChange={(e) => setSegmentPortillon(e.target.value as SegmentId)}
                  className="rounded-lg border border-[#E5E5E5] px-2 py-1 text-xs"
                >
                  {result.segmentsActifs.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.label}
                    </option>
                  ))}
                </select>
                <input
                  type="number"
                  step="0.05"
                  value={largeurPortillonM}
                  onChange={(e) => setLargeurPortillonM(parseFloat(e.target.value) || 1.0)}
                  className="w-16 rounded-lg border border-[#E5E5E5] px-2 py-1 text-xs"
                />
                <span className="text-[#777777]">m</span>
              </>
            )}
          </div>
        </div>
      </div>

      {result.alerteChuteElevee && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-amber-300 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-900">
          <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
          <span>
            Attention : le taux de chute global est élevé ({result.tauxChuteGlobalPct.toFixed(1)} % &gt; 15 %). Pensez à ajuster la longueur de lame brute pour optimiser le calepinage.
          </span>
        </div>
      )}

      {/* Visualisation 2D ou 3D */}
      {ongletVisu === "2d" ? (
        <div className="space-y-4">
          <PlanCalepinage4Cotes2DSvg
            result={result}
            selectedSide={selectedSide}
            onSelectSide={(s) => setSelectedSide(s)}
          />
          {activeSegment && <ElevationPlan2DSvg result={result} segment={activeSegment} />}
        </div>
      ) : (
        <ClotureVue3D result={result} />
      )}

      {/* Quantitatif, Temps de pose & Chiffrage */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-2xl border border-[#E5E5E5] bg-white p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-[#23272B]">
              Quantitatif &amp; Chiffrage estimatif
            </h4>
            <label className="flex items-center gap-2 text-xs font-semibold text-[#23272B] cursor-pointer">
              <input
                type="checkbox"
                checked={inclureMainOeuvre}
                onChange={(e) => setInclureMainOeuvre(e.target.checked)}
              />
              <span>Inclure main-d&apos;œuvre</span>
            </label>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-[#F8F9FA] text-[11px] uppercase text-[#777777] border-b border-[#E5E5E5]">
                <tr>
                  <th className="px-3 py-2 text-left">Poste</th>
                  <th className="px-3 py-2 text-right">Qté</th>
                  <th className="px-3 py-2 text-right">PU HT</th>
                  <th className="px-3 py-2 text-right">Total HT</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#F0F0F0]">
                {chiffrage.lignesDevis.map((l, idx) => (
                  <tr key={idx}>
                    <td className="px-3 py-2">
                      <p className="font-semibold text-[#23272B]">{l.designation}</p>
                      {l.description && (
                        <p className="text-[11px] text-[#777777]">{l.description}</p>
                      )}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">
                      {l.qte} {l.unite}
                    </td>
                    <td className="px-3 py-2 text-right font-mono">{fmtEuro(l.pu_ht)}</td>
                    <td className="px-3 py-2 text-right font-mono font-bold text-[#23272B]">
                      {fmtEuro(l.qte * l.pu_ht)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl bg-[#F8F9FA] p-3.5 border border-[#E5E5E5] text-xs">
            <span>
              Fournitures : <strong className="font-mono">{fmtEuro(chiffrage.totalFournituresHT)}</strong>
            </span>
            <span>
              Main-d&apos;œuvre : <strong className="font-mono">{fmtEuro(chiffrage.totalMainOeuvreHT)}</strong>
            </span>
            <span className="text-sm font-extrabold text-[#B85B2B]">
              Total HT : <span className="font-mono">{fmtEuro(chiffrage.totalHT)}</span>
            </span>
          </div>
        </div>

        <div className="rounded-2xl border border-[#E5E5E5] bg-white p-5 shadow-xs space-y-3">
          <div className="flex items-center gap-2">
            <Clock className="h-4 w-4 text-[#B85B2B]" />
            <h4 className="text-sm font-bold text-[#23272B]">Temps de pose prévu</h4>
          </div>
          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-[#666666]">Implantation &amp; scellements</span>
              <span className="font-mono font-bold">
                {chiffrage.tempsPose.parPhase.implantation_scellement} h
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666666]">Pose poteaux &amp; soubassements</span>
              <span className="font-mono font-bold">
                {chiffrage.tempsPose.parPhase.pose_poteaux_soubassement} h
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666666]">Pose lames / panneaux</span>
              <span className="font-mono font-bold">
                {chiffrage.tempsPose.parPhase.pose_panneaux_lames} h
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-[#666666]">Portillons &amp; finitions</span>
              <span className="font-mono font-bold">
                {chiffrage.tempsPose.parPhase.portillons_finitions} h
              </span>
            </div>
            <div className="flex justify-between border-t border-[#F0F0F0] pt-2 text-sm font-extrabold text-[#B85B2B]">
              <span>Total main-d&apos;œuvre</span>
              <span className="font-mono">{chiffrage.tempsPose.totalHeures} h</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

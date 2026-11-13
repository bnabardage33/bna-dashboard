"use client";

import React, { useState, useEffect, useCallback, useMemo, useRef } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import type { TablesInsert, Json } from "@/types/supabase";
import ZoneCard, {
  Zone,
  LigneCommande,
  ConfigTechnique,
  calculerZone,
} from "@/components/ZoneCard";
import type { ResultatMetre } from "@/lib/metre-serialization";
import CommandeModal from "@/components/CommandeModal";
import { calculerBesoinsBardage } from "@/lib/poseCalcul";
import {
  SlidersHorizontal,
  Plus,
  Package,
  Layers,
  FileSpreadsheet,
  Check,
  ChevronDown,
  ChevronUp,
} from "lucide-react";

export interface BardageCalepinageModuleProps {
  chantierId: string;
  chantierNom: string;
  zoneVent: number;
  initialConfigTechnique: ConfigTechnique;
  onSurfacesSync?: (surfaceM2: number, coupesMl: number, singularites: number) => void;
  onConfigSaved?: (config: ConfigTechnique) => void;
}

export default function BardageCalepinageModule({
  chantierId,
  chantierNom,
  zoneVent,
  initialConfigTechnique,
  onSurfacesSync,
  onConfigSaved,
}: BardageCalepinageModuleProps) {
  const [zones, setZones] = useState<Zone[]>([]);
  const [loadingZones, setLoadingZones] = useState(true);
  const [configDraft, setConfigDraft] = useState<ConfigTechnique>(initialConfigTechnique);
  const [configOpen, setConfigOpen] = useState(false);
  const [configSaved, setConfigSaved] = useState(false);

  const [commandeModalData, setCommandeModalData] = useState<{
    isOpen: boolean;
    lignes: LigneCommande[];
    zoneNom: string;
    zoneId: string;
    chantierNom: string;
  }>({
    isOpen: false,
    lignes: [],
    zoneNom: "",
    zoneId: "",
    chantierNom,
  });

  // Coefficient de perte effectif
  const coefPerteEffectif = useMemo(() => {
    const raw = configDraft?.coef_perte_rendement;
    if (typeof raw === "number" && Number.isFinite(raw) && raw >= 1) {
      return raw === 1.8 ? 1.10 : raw;
    }
    return 1.10;
  }, [configDraft?.coef_perte_rendement]);

  // Chargement des zones de bardage
  const fetchZones = useCallback(async () => {
    setLoadingZones(true);
    const { data, error } = await supabase
      .from("chantier_zones")
      .select("*")
      .eq("chantier_id", chantierId)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Erreur chargement zones:", error);
    } else {
      setZones(
        (data as unknown as Zone[]).map((z) => ({
          ...z,
          ouvertures: z.ouvertures || [],
          resultats_techniques:
            z.resultats_techniques && typeof z.resultats_techniques === "object"
              ? (z.resultats_techniques as ResultatMetre)
              : null,
        }))
      );
    }
    setLoadingZones(false);
  }, [chantierId]);

  useEffect(() => {
    fetchZones();
  }, [fetchZones]);

  // Totaux calculés en direct
  const totaux = useMemo(() => {
    const sum = zones.reduce(
      (acc, z) => {
        const c = calculerZone(z, coefPerteEffectif);
        return {
          bruteFacade: acc.bruteFacade + c.bruteFacade,
          brutePignon: acc.brutePignon + c.brutePignon,
          ouvertures: acc.ouvertures + c.totalOuvertures,
          nette: acc.nette + c.surfaceNette,
          totalCoupesML: acc.totalCoupesML + (c.totalCoupesML || 0),
        };
      },
      { bruteFacade: 0, brutePignon: 0, ouvertures: 0, nette: 0, totalCoupesML: 0 }
    );
    return {
      ...sum,
      aCommander: sum.nette * coefPerteEffectif,
    };
  }, [zones, coefPerteEffectif]);

  // Référence pour mémoriser les dernières surfaces synchronisées et éviter les boucles
  const dernieresSurfacesSyncRef = useRef<{
    chantierId: string;
    surface_m2: number;
    quantite_coupes_ml: number;
    singularites_nb: number;
  } | null>(null);

  const onSurfacesSyncRef = useRef(onSurfacesSync);
  useEffect(() => {
    onSurfacesSyncRef.current = onSurfacesSync;
  }, [onSurfacesSync]);

  // Synchronisation des surfaces vers le parent et la base de données
  useEffect(() => {
    if (zones.length === 0 && loadingZones) return;

    const surface_m2 = parseFloat(totaux.nette.toFixed(2));
    const quantite_coupes_ml = parseFloat(totaux.totalCoupesML.toFixed(2));
    const singularites_nb = totaux.ouvertures;

    // Idempotence : Ne synchroniser que si les valeurs métier utiles ont réellement changé
    const precedent = dernieresSurfacesSyncRef.current;
    if (
      precedent &&
      precedent.chantierId === chantierId &&
      precedent.surface_m2 === surface_m2 &&
      precedent.quantite_coupes_ml === quantite_coupes_ml &&
      precedent.singularites_nb === singularites_nb
    ) {
      return;
    }

    dernieresSurfacesSyncRef.current = {
      chantierId,
      surface_m2,
      quantite_coupes_ml,
      singularites_nb,
    };

    onSurfacesSyncRef.current?.(surface_m2, quantite_coupes_ml, singularites_nb);

    supabase
      .from("chantiers")
      .update({ surface_m2, quantite_coupes_ml, singularites_nb })
      .eq("id", chantierId)
      .then(
        ({ error }) => {
          if (error) {
            console.error("Erreur sync surfaces -> chantier:", {
              message: error.message || "Erreur Supabase inconnue",
              code: error.code || null,
              details: error.details || null,
              hint: error.hint || null,
              contexte: {
                chantierId,
                surface_m2,
                quantite_coupes_ml,
                singularites_nb,
              },
            });
          }
        },
        (err: unknown) => {
          console.error("Erreur inattendue sync surfaces -> chantier:", {
            message: err instanceof Error ? err.message : String(err),
            nom: err instanceof Error ? err.name : "UnknownError",
            cause: err instanceof Error && err.cause ? String(err.cause) : null,
            contexte: {
              chantierId,
              surface_m2,
              quantite_coupes_ml,
              singularites_nb,
            },
          });
        }
      );
  }, [totaux.nette, totaux.totalCoupesML, totaux.ouvertures, chantierId, zones.length, loadingZones]);

  function majConfigTechnique(patch: Partial<ConfigTechnique>) {
    setConfigDraft((prev) => ({ ...prev, ...patch }));
  }

  async function sauvegarderConfigTechnique() {
    setConfigSaved(false);
    const { error } = await supabase
      .from("chantiers")
      .update({
        type_isolant: configDraft.type_isolant,
        epaisseur_isolant_mm: configDraft.epaisseur_isolant_mm,
        surface_paquet_m2: configDraft.surface_paquet_m2,
        zone_vent_rive: configDraft.zone_vent_rive,
        coef_perte_rendement: configDraft.coef_perte_rendement,
      })
      .eq("id", chantierId);

    if (error) {
      alert("Erreur lors de l'enregistrement technique : " + error.message);
      return;
    }

    setConfigSaved(true);
    setTimeout(() => setConfigSaved(false), 2500);
    onConfigSaved?.(configDraft);
  }

  async function ajouterZone() {
    const { data, error } = await supabase
      .from("chantier_zones")
      .insert(({
        chantier_id: chantierId,
        type: "facade",
        nom: `Zone ${zones.length + 1}`,
        largeur: 0,
        hauteur_mur: 0,
        materiau: "lames",
        ouvertures: [],
        famille_pose: null,
        angle: false,
      } as Omit<TablesInsert<"chantier_zones">, "entreprise_id">) as TablesInsert<"chantier_zones">)
      .select()
      .single();

    if (error) {
      console.error(error);
      return;
    }
    setZones((z) => [...z, { ...(data as unknown as Zone), ouvertures: [] }]);
  }

  async function updateZone(zone: Zone) {
    setZones((zs) => zs.map((z) => (z.id === zone.id ? zone : z)));
    const { error } = await supabase
      .from("chantier_zones")
      .update({
        type: zone.type,
        nom: zone.nom,
        largeur: zone.largeur,
        hauteur_mur: zone.hauteur_mur,
        hauteur_faite: zone.hauteur_faite,
        materiau: zone.materiau,
        ouvertures: zone.ouvertures,
        famille_pose: zone.famille_pose,
        angle: zone.angle,
        largeur_lame_mm: zone.largeur_lame_mm,
        module_largeur_mm: zone.module_largeur_mm ?? null,
        module_hauteur_mm: zone.module_hauteur_mm ?? null,
        plaque_longueur_mm: zone.plaque_longueur_mm,
        plaque_largeur_mm: zone.plaque_largeur_mm,
        sens_pose: zone.sens_pose,
      })
      .eq("id", zone.id);

    if (error) {
      console.error(error);
      alert("Erreur sauvegarde zone : " + error.message);
    }
  }

  async function supprimerZone(zoneId: string) {
    const { error } = await supabase.from("chantier_zones").delete().eq("id", zoneId);
    if (!error) setZones((zs) => zs.filter((z) => z.id !== zoneId));
  }

  async function persisterResultatZone(zoneId: string, resultat: ResultatMetre) {
    setZones((zs) =>
      zs.map((z) => (z.id === zoneId ? { ...z, resultats_techniques: resultat } : z))
    );
    await supabase
      .from("chantier_zones")
      .update({ resultats_techniques: resultat as unknown as Json })
      .eq("id", zoneId);
  }

  function handleCreerCommande(lignes: LigneCommande[], zoneNom: string, zoneId: string) {
    setCommandeModalData({
      isOpen: true,
      lignes,
      zoneNom,
      zoneId,
      chantierNom,
    });
  }

  function handleCreerCommandeQuincaillerie() {
    const surfaceCalcul = totaux.nette > 0 ? totaux.nette : totaux.aCommander;
    const { mlChevrons, nbEquerres, nbChevilles, nbVisAutoForeuses } =
      calculerBesoinsBardage(surfaceCalcul);

    const lignesQuincaillerie: LigneCommande[] = [
      { designation: "Chevrons d'ossature bois", quantite: mlChevrons, unite: "ml" },
      { designation: "Équerres de fixation bardage", quantite: nbEquerres, unite: "unité" },
      { designation: "Chevilles d'ancrage façade", quantite: nbChevilles, unite: "unité" },
      { designation: "Vis auto-foreuses (blocage équerres)", quantite: nbVisAutoForeuses, unite: "unité" },
    ];

    setCommandeModalData({
      isOpen: true,
      lignes: lignesQuincaillerie,
      zoneNom: "Quincaillerie Globale",
      zoneId: "global-quincaillerie",
      chantierNom,
    });
  }

  return (
    <div className="space-y-6">
      {/* 1. Raccourci vers Devis */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 shadow-[0_10px_30px_rgba(0,0,0,0.03)] flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-xs font-bold uppercase tracking-wider text-[#23272B]">
            Chiffrage & Génération de Devis
          </h3>
          <p className="mt-0.5 text-xs text-[#777777]">
            Chiffre directement ce chantier sur la base des résultats techniques et métrés persistés.
          </p>
        </div>

        <Link
          href={`/bureau/devis-factures?chantier_id=${encodeURIComponent(chantierId)}`}
          className="flex items-center gap-1.5 rounded-xl bg-[#B85B2B] hover:bg-[#D97732] px-4 py-2 text-xs font-bold text-white transition shadow-xs"
        >
          <FileSpreadsheet size={13} />
          <span>Générer un devis →</span>
        </Link>
      </div>

      {/* 2. Tiroir Configuration Technique */}
      <div className="rounded-2xl sm:rounded-3xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-[0_10px_30px_rgba(0,0,0,0.03)] space-y-4">
        <button
          type="button"
          onClick={() => setConfigOpen(!configOpen)}
          className="w-full flex items-center justify-between text-left cursor-pointer group focus:outline-hidden"
          aria-expanded={configOpen}
        >
          <div className="flex items-center gap-2.5">
            <SlidersHorizontal className="h-5 w-5 text-[#B85B2B]" />
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-[#23272B] group-hover:text-[#B85B2B] transition-colors">
                Configuration Technique du Chantier (Isolant & Chutes)
              </h3>
              <p className="text-3xs text-[#777777]">
                Valeurs globales appliquées au calcul d&apos;isolant, des rives et de l&apos;équerrerie.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="hidden sm:inline-block rounded-md bg-[#F8F9FA] px-2 py-0.5 text-3xs font-semibold text-[#777777] border border-[#E5E5E5]">
              Persistée
            </span>
            {configOpen ? <ChevronUp size={16} className="text-[#B85B2B]" /> : <ChevronDown size={16} className="text-[#777777]" />}
          </div>
        </button>

        {configOpen && (
          <div className="pt-3 border-t border-[#F0F0F0] space-y-4 animate-in fade-in duration-150">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <div>
                <label className="text-3xs font-semibold text-[#777777]">Type d&apos;isolant</label>
                <select
                  value={configDraft.type_isolant ?? ""}
                  onChange={(e) =>
                    majConfigTechnique({
                      type_isolant: (e.target.value || null) as ConfigTechnique["type_isolant"],
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-2.5 py-1.5 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                >
                  <option value="">— (secours : laine de roche)</option>
                  <option value="laine_roche">Laine de roche (Fixrock)</option>
                  <option value="laine_verre">Laine de verre (ISOVER)</option>
                  <option value="sans_isolant">Sans isolant rapporté</option>
                </select>
              </div>

              <div>
                <label className="text-3xs font-semibold text-[#777777]">Épaisseur isolant</label>
                <select
                  value={configDraft.epaisseur_isolant_mm ?? ""}
                  onChange={(e) =>
                    majConfigTechnique({
                      epaisseur_isolant_mm:
                        e.target.value === "" ? null : parseInt(e.target.value, 10),
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-2.5 py-1.5 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                >
                  <option value="">— (secours : 120 mm)</option>
                  <option value={0}>0 mm (Lame d&apos;air seule)</option>
                  <option value={80}>80 mm (R = 2.25)</option>
                  <option value={100}>100 mm (R = 2.85)</option>
                  <option value={120}>120 mm (R = 3.40 — Standard)</option>
                  <option value={140}>140 mm (R = 4.00)</option>
                  <option value={160}>160 mm (R = 4.55)</option>
                  <option value={180}>180 mm (R = 5.10)</option>
                  <option value={200}>200 mm (R = 5.70 — Haute perf.)</option>
                </select>
              </div>

              <div>
                <label className="text-3xs font-semibold text-[#777777]">Surface / Paquet (m²)</label>
                <input
                  type="number"
                  min={0.1}
                  step={0.1}
                  placeholder="4.8"
                  value={configDraft.surface_paquet_m2 ?? ""}
                  onChange={(e) =>
                    majConfigTechnique({
                      surface_paquet_m2:
                        e.target.value === "" ? null : parseFloat(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-2.5 py-1.5 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                />
              </div>

              <div>
                <label className="text-3xs font-semibold text-[#777777]">Rives renforcées (40 cm)</label>
                <div className="mt-1 flex gap-1 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] p-0.5">
                  {[
                    { v: null, l: "Auto" },
                    { v: true, l: "Oui" },
                    { v: false, l: "Non" },
                  ].map((opt) => (
                    <button
                      key={String(opt.v)}
                      type="button"
                      onClick={() => majConfigTechnique({ zone_vent_rive: opt.v })}
                      className={`flex-1 rounded-lg px-2 py-1 text-3xs font-bold transition ${
                        configDraft.zone_vent_rive === opt.v
                          ? "bg-[#B85B2B] text-white shadow-2xs"
                          : "text-[#777777] hover:text-[#23272B]"
                      }`}
                    >
                      {opt.l}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="text-3xs font-semibold text-[#B85B2B]">Coef chute matériaux</label>
                <input
                  type="number"
                  min={1}
                  step={0.01}
                  placeholder="ex: 1.10 (+10%)"
                  value={configDraft.coef_perte_rendement ?? ""}
                  onChange={(e) =>
                    majConfigTechnique({
                      coef_perte_rendement:
                        e.target.value === "" ? null : parseFloat(e.target.value),
                    })
                  }
                  className="mt-1 w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] hover:bg-white focus:bg-white px-2.5 py-1.5 text-xs font-semibold text-[#23272B] focus:border-[#B85B2B]"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              {configSaved && (
                <span className="text-xs font-bold text-emerald-600">✓ Enregistré</span>
              )}
              <button
                type="button"
                onClick={sauvegarderConfigTechnique}
                className="flex items-center gap-1.5 rounded-xl bg-[#B85B2B] hover:bg-[#D97732] px-3.5 py-1.5 text-xs font-bold text-white transition shadow-xs"
              >
                <Check size={13} />
                <span>Enregistrer la configuration</span>
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 3. Grille de Synthèse des Surfaces */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
        <div className="rounded-2xl border border-[#E5E5E5] bg-white p-3.5 text-center shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
          <p className="text-3xs font-semibold uppercase tracking-wider text-[#777777]">Brut façades</p>
          <p className="mt-1 text-base sm:text-lg font-bold text-[#23272B]">{totaux.bruteFacade.toFixed(1)} m²</p>
        </div>

        <div className="rounded-2xl border border-[#E5E5E5] bg-white p-3.5 text-center shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
          <p className="text-3xs font-semibold uppercase tracking-wider text-[#777777]">Brut pignons</p>
          <p className="mt-1 text-base sm:text-lg font-bold text-[#23272B]">{totaux.brutePignon.toFixed(1)} m²</p>
        </div>

        <div className="rounded-2xl border border-[#E5E5E5] bg-white p-3.5 text-center shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
          <p className="text-3xs font-semibold uppercase tracking-wider text-[#777777]">Ouvertures</p>
          <p className="mt-1 text-base sm:text-lg font-bold text-[#23272B]">{totaux.ouvertures.toFixed(1)} m²</p>
        </div>

        <div className="rounded-2xl border border-[#E5E5E5] bg-white p-3.5 text-center shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
          <p className="text-3xs font-semibold uppercase tracking-wider text-[#B85B2B]">Total net</p>
          <p className="mt-1 text-base sm:text-lg font-bold text-[#B85B2B]">{totaux.nette.toFixed(1)} m²</p>
        </div>

        <div className="rounded-2xl border border-emerald-200 bg-emerald-50/60 p-3.5 text-center shadow-[0_10px_30px_rgba(0,0,0,0.03)]">
          <p className="text-3xs font-semibold uppercase tracking-wider text-emerald-800">À commander</p>
          <p className="mt-1 text-base sm:text-lg font-bold text-emerald-700">{totaux.aCommander.toFixed(1)} m²</p>
        </div>
      </div>

      {/* 4. Bouton Commande Quincaillerie */}
      <button
        type="button"
        onClick={handleCreerCommandeQuincaillerie}
        className="w-full flex items-center justify-center gap-2 rounded-2xl bg-[#B85B2B] hover:bg-[#D97732] py-3 text-xs sm:text-sm font-bold text-white transition-all shadow-xs"
      >
        <Package size={15} />
        <span>Générer le Bon de Commande Quincaillerie (Chevrons, Équerres, Vis)</span>
      </button>

      {/* 5. Liste des Zones de Bardage */}
      <div className="space-y-4">
        {zones.map((zone) => (
          <ZoneCard
            key={zone.id}
            zone={zone}
            zoneVent={zoneVent}
            configTechnique={configDraft}
            onChange={updateZone}
            onDelete={supprimerZone}
            onCreerCommande={handleCreerCommande}
            onPersistResult={(resultat) => persisterResultatZone(zone.id, resultat)}
          />
        ))}

        <button
          type="button"
          onClick={ajouterZone}
          className="w-full flex items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-[#E5E5E5] bg-white py-3.5 text-xs sm:text-sm font-bold text-[#777777] hover:text-[#B85B2B] hover:border-[#B85B2B]/40 hover:bg-[#FDFBF9] transition"
        >
          <Plus size={15} />
          <span>Ajouter une nouvelle zone / façade de bardage</span>
        </button>
      </div>

      {/* Modal de Commande Fournisseur */}
      <CommandeModal
        isOpen={commandeModalData.isOpen}
        onClose={() => setCommandeModalData({ ...commandeModalData, isOpen: false })}
        lignesInitiales={commandeModalData.lignes}
        chantierId={chantierId}
        chantierNom={commandeModalData.chantierNom}
        zoneNom={commandeModalData.zoneNom}
        zoneId={commandeModalData.zoneId}
      />
    </div>
  );
}

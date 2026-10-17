// components/catalogue/ProductFormModal.tsx
//
// Modal de création/édition COMMUN aux deux catalogues. Le rendu des champs
// « Dimensions » et « Tarifs » est piloté par `type` ; toute la conversion vers
// la base passe par `mappers.ts`.

"use client";

import { useEffect, useState } from "react";
import { Plus, Save, Trash2, X } from "lucide-react";
import { fmtEuro } from "@/lib/financeCalculs";
import {
  ENUMS_CAT_ACCESSOIRE,
  ENUMS_TYPE_MATERIAL,
  LIBELLES_ACCESSOIRE,
  LIBELLES_TYPE_MATERIAL,
  UNITES_VENTE,
  emptyForType,
  type CatalogueType,
  type CatAccessoireTerrasse,
  type DimensionItem,
  type NatureCout,
  type ProductDraft,
  type ProductDraftPatch,
  type TypeMaterialTerrasse,
} from "./types";
import { useScraping } from "./useScraping";

export interface ProductFormModalProps {
  open: boolean;
  type: CatalogueType;
  initial?: ProductDraft | null;
  /** Terrasse accessoire uniquement : catégorie pré-sélectionnée à la création. */
  initialCategorie?: CatAccessoireTerrasse | null;
  /** Bardage uniquement : type de coût pré-sélectionné à la création. */
  typeCoutDefaut?: NatureCout;
  /** Terrasse accessoire uniquement : type de coût pré-sélectionné à la création. */
  initialTypeCout?: NatureCout;
  onClose: () => void;
  onSave: (values: ProductDraft) => void | Promise<void>;
}

type Onglet = "general" | "dimensions" | "tarifs";

const labelCls = "block text-xs font-semibold text-gray-400 mb-1";
const inputCls = "w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white";
const blocCls = "rounded-lg border border-slate-600 p-3 space-y-3";

/** Fusion d'un patch scrapé dans l'état courant (conserve les champs vides). */
function appliquerPatch(prev: ProductDraft, patch: ProductDraftPatch): ProductDraft {
  if (prev.kind !== patch.kind) return prev;

  const definis = Object.fromEntries(
    Object.entries(patch).filter(([, v]) => {
      if (v === undefined || v === null) return false;
      if (typeof v === "string" && v.trim() === "") return false;
      if (Array.isArray(v) && v.length === 0) return false;
      return true;
    })
  );

  let suivant = { ...prev, ...definis } as ProductDraft;

  // Bardage : fusionner la dimension scrapée dans la première ligne existante
  // (comportement historique : on remplace la 1ʳᵉ, on ne perd pas les autres).
  if (
    prev.kind === "BARDAGE" &&
    patch.kind === "BARDAGE" &&
    patch.dimensions_disponibles &&
    patch.dimensions_disponibles.length > 0
  ) {
    const inc = patch.dimensions_disponibles[0];
    const base = prev.dimensions_disponibles;
    const fusion: DimensionItem =
      base.length > 0
        ? {
            longueur_mm: inc.longueur_mm ?? base[0].longueur_mm,
            largeur_mm: inc.largeur_mm ?? base[0].largeur_mm,
            epaisseur_mm: inc.epaisseur_mm ?? base[0].epaisseur_mm,
          }
        : { longueur_mm: inc.longueur_mm, largeur_mm: inc.largeur_mm, epaisseur_mm: inc.epaisseur_mm };
    suivant = {
      ...(suivant as Extract<ProductDraft, { kind: "BARDAGE" }>),
      dimensions_disponibles: base.length > 0 ? [fusion, ...base.slice(1)] : [fusion],
    };
  }

  return suivant;
}

/** État de départ : édition fournie, sinon brouillon vide (Bardage : `typeCoutDefaut`). */
function valeurInitiale(
  type: CatalogueType,
  initial: ProductDraft | null,
  typeCoutDefaut?: NatureCout,
  initialCategorie?: CatAccessoireTerrasse | null,
  initialTypeCout?: NatureCout
): ProductDraft {
  if (initial) return initial;
  const vide = emptyForType(type);
  if (vide.kind === "BARDAGE" && typeCoutDefaut) {
    return { ...vide, type_cout: typeCoutDefaut };
  }
  // Création d'un accessoire : on injecte la catégorie et le type de coût
  // pré-sélectionnés (onglet métier actif côté catalogue Terrasse), sans
  // casser l'union. Onglet « Prestations » ⇒ `type_cout: "main_oeuvre"`.
  if (vide.kind === "TERRASSE_ACCESSOIRE") {
    return {
      ...vide,
      ...(initialCategorie ? { categorie: initialCategorie } : {}),
      ...(initialTypeCout ? { type_cout: initialTypeCout } : {}),
    };
  }
  return vide;
}

export default function ProductFormModal({
  open,
  type,
  initial = null,
  initialCategorie,
  typeCoutDefaut,
  initialTypeCout,
  onClose,
  onSave,
}: ProductFormModalProps) {
  const [values, setValues] = useState<ProductDraft>(() =>
    valeurInitiale(type, initial, typeCoutDefaut, initialCategorie, initialTypeCout)
  );
  const [activeTab, setActiveTab] = useState<Onglet>("general");
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    if (open) {
      setValues(valeurInitiale(type, initial, typeCoutDefaut, initialCategorie, initialTypeCout));
      setActiveTab("general");
    }
  }, [open, initial, type, typeCoutDefaut, initialCategorie, initialTypeCout]);

  const { importUrl, setImportUrl, isScraping, scrape } = useScraping(type, (patch) => {
    setValues((prev) => appliquerPatch(prev, patch));
  });

  if (!open) return null;

  const patch = (p: Record<string, unknown>) =>
    setValues((prev) => ({ ...prev, ...p } as ProductDraft));

  // Synchronisation HT ↔ TTC (Bardage) : identique au modal historique.
  const modifierPuHt = (valeur: string) => {
    const n = parseFloat(valeur.replace(",", ".")) || 0;
    patch({
      pu_ht: valeur,
      prix_ttc: valeur.trim() === "" ? "" : (n * 1.2).toFixed(2).replace(".", ","),
    });
  };
  const modifierPrixTtc = (valeur: string) => {
    const n = parseFloat(valeur.replace(",", ".")) || 0;
    patch({
      prix_ttc: valeur,
      pu_ht: valeur.trim() === "" ? "" : (n / 1.2).toFixed(2).replace(".", ","),
    });
  };

  // Prestation = main-d'œuvre, quel que soit le catalogue ; côté Terrasse elle
  // reste stockée dans la table accessoires, distinguée par `type_cout`.
  const estMainOeuvre =
    (values.kind === "BARDAGE" || values.kind === "TERRASSE_ACCESSOIRE") &&
    values.type_cout === "main_oeuvre";
  const estPrestationAccessoire =
    values.kind === "TERRASSE_ACCESSOIRE" && values.type_cout === "main_oeuvre";
  const afficheDimensions = values.kind !== "TERRASSE_ACCESSOIRE" && !estMainOeuvre;

  const titre = (() => {
    if (values.kind === "TERRASSE_LAME") return initial ? "Modifier la lame" : "Nouvelle lame";
    if (values.kind === "TERRASSE_ACCESSOIRE") {
      if (estPrestationAccessoire) return initial ? "Modifier la prestation" : "Nouvelle prestation";
      return initial ? "Modifier l'accessoire" : "Nouvel accessoire";
    }
    if (estMainOeuvre) return initial ? "Modifier la main-d'œuvre" : "Nouvelle Main-d'œuvre";
    return initial ? "Modifier le matériau" : "Nouveau matériau";
  })();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!values.designation.trim()) {
      alert("La désignation est obligatoire.");
      return;
    }
    setIsSubmitting(true);
    try {
      await onSave(values);
    } finally {
      setIsSubmitting(false);
    }
  };

  const ongletBtn = (id: Onglet, libelle: string) => (
    <button
      type="button"
      onClick={() => setActiveTab(id)}
      className={`pb-2 text-sm font-medium border-b-2 transition-colors ${
        activeTab === id
          ? "border-cyan-500 text-white"
          : "border-transparent text-gray-500 hover:text-gray-300"
      }`}
    >
      {libelle}
    </button>
  );

  return (
    <div className="fixed inset-0 z-[210] flex items-center justify-center p-2 bg-black/80 backdrop-blur-sm">
      <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-transparent shadow-2xl flex flex-col max-h-[92vh]">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
          <h2 className="text-xl font-bold text-white">{titre}</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Onglets */}
        <div className="flex px-4 pt-2 border-b border-gray-700/50 space-x-4 bg-[#1E1E1E]">
          {ongletBtn("general", "Général")}
          {afficheDimensions &&
            ongletBtn("dimensions", values.kind === "BARDAGE" ? "Dimensions & Décor" : "Dimensions")}
          {ongletBtn("tarifs", "Tarifs")}
        </div>

        <form onSubmit={handleSubmit} className="flex-1 flex flex-col overflow-hidden">
          <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3">
            {/* ── Bloc Auto-remplir (tous types) ───────────────────────── */}
            {activeTab === "general" && !estMainOeuvre && (
              <div className="bg-cyan-900/20 border border-cyan-500/30 p-4 rounded-lg">
                <label htmlFor="chp-auto-url" className="block text-xs font-semibold text-cyan-400 mb-2">
                  ⚡ Auto-remplir via une adresse Web (Optionnel)
                </label>
                <div className="flex gap-2">
                  <input
                    id="chp-auto-url"
                    type="url"
                    placeholder="Collez l'URL d'un produit (Leroy Merlin, Point.P...)"
                    value={importUrl}
                    onChange={(e) => setImportUrl(e.target.value)}
                    className="flex-1 rounded border border-cyan-500/50 bg-transparent p-2 text-sm text-white focus:border-cyan-400"
                  />
                  <button
                    type="button"
                    onClick={scrape}
                    disabled={isScraping || !importUrl}
                    className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm font-bold disabled:opacity-50"
                  >
                    {isScraping ? "Recherche..." : "Importer"}
                  </button>
                </div>
              </div>
            )}

            {/* ── GÉNÉRAL ──────────────────────────────────────────────── */}
            {activeTab === "general" && values.kind === "BARDAGE" && (
              <>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="chp-type-presta" className={labelCls}>Type de prestation</label>
                    <select
                      id="chp-type-presta"
                      value={values.type_cout}
                      onChange={(e) =>
                        patch({ type_cout: e.target.value === "main_oeuvre" ? "main_oeuvre" : "matiere" })
                      }
                      className={inputCls}
                    >
                      <option value="matiere">Matériau (fourniture)</option>
                      <option value="main_oeuvre">Main-d&apos;œuvre (prestation)</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="chp-famille" className={labelCls}>Famille Professionnelle</label>
                    <select
                      id="chp-famille"
                      required
                      value={values.famille_label}
                      onChange={(e) => {
                        patch({ famille_label: e.target.value, categorie: e.target.value });
                      }}
                      className={inputCls}
                    >
                      <option value="">Sélectionner une famille</option>
                      <option value="Ossature & Fixations">Ossature &amp; Fixations</option>
                      <option value="Isolation & Étanchéité">Isolation &amp; Étanchéité</option>
                      <option value="Parements & Bardages">Parements &amp; Bardages</option>
                      <option value="Profilés & Finitions">Profilés &amp; Finitions</option>
                      <option value="Main-d'œuvre">Main-d&apos;œuvre</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label htmlFor="chp-designation" className={labelCls}>Désignation (titre de la fiche)</label>
                  <input
                    id="chp-designation"
                    required
                    type="text"
                    value={values.designation}
                    onChange={(e) => patch({ designation: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="chp-description" className={labelCls}>Description</label>
                  <textarea
                    id="chp-description"
                    rows={2}
                    value={values.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="chp-designation-devis" className="block text-xs font-semibold text-cyan-400 mb-1">
                    Désignation complète pour le devis (Normes DTU, ACERMI...)
                  </label>
                  <textarea
                    id="chp-designation-devis"
                    rows={3}
                    value={values.designation_devis}
                    onChange={(e) => patch({ designation_devis: e.target.value })}
                    className={inputCls}
                  />
                </div>
              </>
            )}

            {activeTab === "general" && values.kind === "TERRASSE_LAME" && (
              <>
                <div>
                  <label htmlFor="chp-designation-lame" className={labelCls}>Désignation</label>
                  <input
                    id="chp-designation-lame"
                    required
                    type="text"
                    value={values.designation}
                    onChange={(e) => patch({ designation: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="chp-description-lame" className={labelCls}>Description</label>
                  <textarea
                    id="chp-description-lame"
                    rows={2}
                    value={values.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="chp-ref-fournisseur" className={labelCls}>Référence fournisseur</label>
                    <input
                      id="chp-ref-fournisseur"
                      type="text"
                      value={values.reference_fournisseur}
                      onChange={(e) => patch({ reference_fournisseur: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                  <div>
                    <label htmlFor="chp-essence" className={labelCls}>Essence</label>
                    <input
                      id="chp-essence"
                      type="text"
                      placeholder="ex : Ipé, Teck..."
                      value={values.essence}
                      onChange={(e) => patch({ essence: e.target.value })}
                      className={inputCls}
                    />
                  </div>
                </div>
                <div>
                  <label htmlFor="chp-type-material" className={labelCls}>Type de matériau</label>
                  <select
                    id="chp-type-material"
                    value={values.type_material}
                    onChange={(e) => patch({ type_material: e.target.value as TypeMaterialTerrasse | "" })}
                    className={inputCls}
                  >
                    <option value="">Sélectionner...</option>
                    {ENUMS_TYPE_MATERIAL.map((m) => (
                      <option key={m} value={m}>{LIBELLES_TYPE_MATERIAL[m]}</option>
                    ))}
                  </select>
                </div>
              </>
            )}

            {activeTab === "general" && values.kind === "TERRASSE_ACCESSOIRE" && (
              <>
                <div>
                  <label htmlFor="chp-type-presta-acc" className={labelCls}>Type de prestation</label>
                  <select
                    id="chp-type-presta-acc"
                    value={values.type_cout}
                    onChange={(e) =>
                      patch({ type_cout: e.target.value === "main_oeuvre" ? "main_oeuvre" : "matiere" })
                    }
                    className={inputCls}
                  >
                    <option value="matiere">Matériau (fourniture)</option>
                    <option value="main_oeuvre">Main-d&apos;œuvre (prestation)</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="chp-designation-acc" className={labelCls}>Désignation</label>
                  <input
                    id="chp-designation-acc"
                    required
                    type="text"
                    value={values.designation}
                    onChange={(e) => patch({ designation: e.target.value })}
                    className={inputCls}
                  />
                </div>
                <div>
                  <label htmlFor="chp-description-acc" className={labelCls}>Description</label>
                  <textarea
                    id="chp-description-acc"
                    rows={2}
                    value={values.description}
                    onChange={(e) => patch({ description: e.target.value })}
                    className={inputCls}
                  />
                </div>
                {/* Champs propres à un accessoire PHYSIQUE : masqués pour une
                    prestation. Aucune donnée n'est effacée — les valeurs
                    éventuelles restent dans le brouillon et sont réécrites. */}
                {!estPrestationAccessoire && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="chp-categorie-acc" className={labelCls}>Catégorie</label>
                      <select
                        id="chp-categorie-acc"
                        value={values.categorie}
                        onChange={(e) => patch({ categorie: e.target.value as CatAccessoireTerrasse | "" })}
                        className={inputCls}
                      >
                        <option value="">Sélectionner...</option>
                        {ENUMS_CAT_ACCESSOIRE.map((c) => (
                          <option key={c} value={c}>{LIBELLES_ACCESSOIRE[c]}</option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label htmlFor="chp-conditionnement" className={labelCls}>Conditionnement</label>
                      <input
                        id="chp-conditionnement"
                        type="text"
                        value={values.conditionnement}
                        onChange={(e) => patch({ conditionnement: e.target.value })}
                        className={inputCls}
                      />
                    </div>
                  </div>
                )}
                <div>
                  <label htmlFor="chp-unite-mesure" className={labelCls}>Unité de mesure</label>
                  <input
                    id="chp-unite-mesure"
                    type="text"
                    placeholder={estPrestationAccessoire ? "ex : heure, m² posé" : "ex : boîte de 100"}
                    value={values.unite_mesure}
                    onChange={(e) => patch({ unite_mesure: e.target.value })}
                    className={inputCls}
                  />
                </div>
                {!estPrestationAccessoire && (
                  <div>
                    <label htmlFor="chp-materiel-compatibles" className={labelCls}>
                      Matériaux compatibles (types, séparés par des virgules)
                    </label>
                    <input
                      id="chp-materiel-compatibles"
                      type="text"
                      placeholder="ex : BOIS_NATUREL, COMPOSITE"
                      value={values.materiel_compatibles.join(", ")}
                      onChange={(e) =>
                        patch({
                          materiel_compatibles: e.target.value
                            .split(",")
                            .map((s) => s.trim())
                            .filter(Boolean),
                        })
                      }
                      className={inputCls}
                    />
                  </div>
                )}
              </>
            )}

            {/* ── DIMENSIONS ───────────────────────────────────────────── */}
            {activeTab === "dimensions" && afficheDimensions && values.kind === "BARDAGE" && (
              <>
                <div role="group" aria-labelledby="grp-1-marque-decor" className={blocCls}>
                  <div id="grp-1-marque-decor" className="px-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                    1 · Marque &amp; Décor
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="chp-fabricant" className={labelCls}>Fabricant</label>
                      <input id="chp-fabricant" type="text" value={values.fabricant}
                        onChange={(e) => patch({ fabricant: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label htmlFor="chp-gamme" className={labelCls}>Gamme / Sous-Famille</label>
                      {values.famille_label === "Parements & Bardages" ? (
                        <select id="chp-gamme" value={values.gamme}
                          onChange={(e) => patch({ gamme: e.target.value })} className={inputCls}>
                          <option value="">Sélectionner...</option>
                          <option value="Bois Massif">Bois Massif</option>
                          <option value="Lame Composite">Lame Composite</option>
                          <option value="HPL (Trespa/Polyrey)">HPL (Trespa/Polyrey)</option>
                          <option value="Fibrociment">Fibrociment</option>
                        </select>
                      ) : (
                        <input id="chp-gamme" type="text" value={values.gamme}
                          onChange={(e) => patch({ gamme: e.target.value })} className={inputCls} />
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="chp-code-decor" className={labelCls}>Code Décor</label>
                      <input id="chp-code-decor" type="text" value={values.code_decor}
                        onChange={(e) => patch({ code_decor: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label htmlFor="chp-couleur" className={labelCls}>Nom / Couleur du Décor</label>
                      <input id="chp-couleur" type="text" value={values.couleur}
                        onChange={(e) => patch({ couleur: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="chp-code-ral" className={labelCls}>Code RAL</label>
                      <input id="chp-code-ral" type="text" value={values.code_ral}
                        onChange={(e) => patch({ code_ral: e.target.value })} className={inputCls} />
                    </div>
                    <div>
                      <label htmlFor="chp-finition" className={labelCls}>Finition</label>
                      <input id="chp-finition" type="text" value={values.finition}
                        onChange={(e) => patch({ finition: e.target.value })} className={inputCls} />
                    </div>
                  </div>
                </div>

                <div role="group" aria-labelledby="grp-2-dimensions" className={blocCls}>
                  <div id="grp-2-dimensions" className="px-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                    2 · Dimensions &amp; Spécifications
                  </div>
                  <div className="space-y-3">
                    {values.dimensions_disponibles.map((dim, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-[#1E1E1E]/50 p-3 rounded-lg border border-white/10">
                        <div className="flex-1 grid grid-cols-1 gap-3 sm:grid-cols-3">
                          {(["longueur_mm", "largeur_mm", "epaisseur_mm"] as const).map((champ) => (
                            <div key={champ}>
                              <label htmlFor={`chp-${champ}-${idx}`} className="block text-2xs uppercase text-gray-500 mb-1">
                                {champ === "longueur_mm" ? "Longueur" : champ === "largeur_mm" ? "Largeur" : "Épaisseur"} (mm)
                              </label>
                              <input
                                id={`chp-${champ}-${idx}`}
                                type="number"
                                min="0"
                                value={dim[champ] ?? ""}
                                onChange={(e) => {
                                  const dims = [...values.dimensions_disponibles];
                                  const valeur = e.target.value === "" ? null : parseFloat(e.target.value);
                                  dims[idx] = { ...dims[idx], [champ]: valeur };
                                  patch({ dimensions_disponibles: dims });
                                }}
                                className="w-full rounded border border-slate-600 bg-transparent px-2 py-1.5 text-sm text-white"
                              />
                            </div>
                          ))}
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            patch({ dimensions_disponibles: values.dimensions_disponibles.filter((_, i) => i !== idx) })
                          }
                          className="mt-5 p-2 text-gray-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-md"
                          aria-label={`Supprimer la dimension ${idx + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    <button
                      type="button"
                      onClick={() =>
                        patch({
                          dimensions_disponibles: [
                            ...values.dimensions_disponibles,
                            { longueur_mm: null, largeur_mm: null, epaisseur_mm: null },
                          ],
                        })
                      }
                      className="w-full py-2 border border-dashed border-slate-600 text-gray-400 rounded-lg text-sm hover:border-white/10 flex items-center justify-center gap-2"
                    >
                      <Plus className="h-4 w-4" /> Ajouter une dimension
                    </button>
                  </div>
                </div>
              </>
            )}

            {activeTab === "dimensions" && afficheDimensions && values.kind === "TERRASSE_LAME" && (
              <div className={blocCls}>
                <div className="px-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                  Dimensions de la lame
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <label htmlFor="chp-longueur" className={labelCls}>Longueur (mm)</label>
                    <input id="chp-longueur" type="number" min="0" value={values.longueur_mm ?? ""}
                      onChange={(e) => patch({ longueur_mm: e.target.value === "" ? null : Number(e.target.value) })}
                      className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="chp-largeur-utile" className={labelCls}>Largeur utile (mm)</label>
                    <input id="chp-largeur-utile" type="number" min="0" value={values.largeur_utile_mm ?? ""}
                      onChange={(e) => patch({ largeur_utile_mm: e.target.value === "" ? null : Number(e.target.value) })}
                      className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="chp-epaisseur" className={labelCls}>Épaisseur (mm)</label>
                    <input id="chp-epaisseur" type="number" min="20" max="30" value={values.epaisseur_mm ?? ""}
                      onChange={(e) => patch({ epaisseur_mm: e.target.value === "" ? null : Number(e.target.value) })}
                      className={inputCls} />
                    <p className="text-2xs text-gray-500 mt-1">Contrainte base : 20 à 30 mm.</p>
                  </div>
                </div>
              </div>
            )}

            {/* ── TARIFS ───────────────────────────────────────────────── */}
            {activeTab === "tarifs" && values.kind === "BARDAGE" && (
              <div role="group" aria-labelledby="grp-3-fournisseur-tarifs" className={blocCls}>
                <div id="grp-3-fournisseur-tarifs" className="px-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                  3 · Fournisseur &amp; Tarifs
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="chp-fournisseur" className={labelCls}>Fournisseur</label>
                    <input id="chp-fournisseur" type="text" value={values.fournisseur}
                      onChange={(e) => patch({ fournisseur: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="chp-unite" className={labelCls}>Unité de vente</label>
                    <select id="chp-unite" value={values.unite}
                      onChange={(e) => patch({ unite: e.target.value })} className={inputCls}>
                      {UNITES_VENTE.map((u) => <option key={u} value={u}>{u}</option>)}
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="chp-pu-ht" className={labelCls}>Prix Unitaire HT (€)</label>
                    <input id="chp-pu-ht" type="text" inputMode="decimal" value={values.pu_ht}
                      onChange={(e) => modifierPuHt(e.target.value)} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="chp-pu-revient" className={labelCls}>Coût de revient HT (€)</label>
                    <input id="chp-pu-revient" type="text" inputMode="decimal" value={values.pu_revient}
                      onChange={(e) => patch({ pu_revient: e.target.value })} className={inputCls} />
                  </div>
                </div>
                <div>
                  <label htmlFor="chp-prix-ttc" className={labelCls}>
                    Prix TTC (€) <span className="text-gray-500">(TVA 20%)</span>
                  </label>
                  <input id="chp-prix-ttc" type="text" inputMode="decimal" value={values.prix_ttc}
                    onChange={(e) => modifierPrixTtc(e.target.value)} className={inputCls} />
                </div>
                {estMainOeuvre && (() => {
                  const vente = parseFloat(values.pu_ht.replace(",", ".")) || 0;
                  const revient = parseFloat(values.pu_revient.replace(",", ".")) || 0;
                  if (vente > 0 && revient > 0) {
                    const marge = vente - revient;
                    const margePct = (marge / vente) * 100;
                    return (
                      <div className="mt-3 flex items-center justify-between rounded bg-violet-900/30 px-3 py-2 border border-violet-500/20">
                        <span className="text-xs font-medium text-violet-300">Marge brute estimée</span>
                        <span className={`text-sm font-bold ${marge >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                          {fmtEuro(marge)} <span className="text-xs opacity-70">({margePct.toFixed(1)}%)</span>
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            )}

            {activeTab === "tarifs" && values.kind === "TERRASSE_LAME" && (
              <div className={blocCls}>
                <div className="px-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                  Fournisseur &amp; Tarifs
                </div>
                <div>
                  <label htmlFor="chp-fournisseur" className={labelCls}>Fournisseur</label>
                  <input id="chp-fournisseur" type="text" value={values.fournisseur}
                    onChange={(e) => patch({ fournisseur: e.target.value })} className={inputCls} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="chp-prix-m2" className={labelCls}>Prix au m² HT (€)</label>
                    <input id="chp-prix-m2" type="text" inputMode="decimal" value={values.prix_m2_ht}
                      onChange={(e) => patch({ prix_m2_ht: e.target.value })} className={inputCls} />
                  </div>
                  <div>
                    <label htmlFor="chp-prix-lame" className={labelCls}>Prix à la lame HT (€)</label>
                    <input id="chp-prix-lame" type="text" inputMode="decimal" value={values.prix_unitaire_lame}
                      onChange={(e) => patch({ prix_unitaire_lame: e.target.value })} className={inputCls} />
                  </div>
                </div>
              </div>
            )}

            {activeTab === "tarifs" && values.kind === "TERRASSE_ACCESSOIRE" && (
              <div className={blocCls}>
                <div className="px-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                  Fournisseur &amp; Tarifs
                </div>
                <div className={`grid gap-3 ${estPrestationAccessoire ? "grid-cols-1" : "grid-cols-2"}`}>
                  <div>
                    <label htmlFor="chp-fournisseur" className={labelCls}>Fournisseur</label>
                    <input id="chp-fournisseur" type="text" value={values.fournisseur}
                      onChange={(e) => patch({ fournisseur: e.target.value })} className={inputCls} />
                  </div>
                  {!estPrestationAccessoire && (
                    <div>
                      <label htmlFor="chp-conditionnement-tarif" className={labelCls}>Conditionnement</label>
                      <input id="chp-conditionnement-tarif" type="text" value={values.conditionnement}
                        onChange={(e) => patch({ conditionnement: e.target.value })} className={inputCls} />
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="chp-unite-mesure-tarif" className={labelCls}>Unité de mesure</label>
                    <input id="chp-unite-mesure-tarif" type="text" value={values.unite_mesure}
                      onChange={(e) => patch({ unite_mesure: e.target.value })} className={inputCls} />
                  </div>
                  {estPrestationAccessoire ? (
                    <div>
                      <label htmlFor="chp-pu-ht-acc" className={labelCls}>Prix unitaire HT (€)</label>
                      <input id="chp-pu-ht-acc" type="text" inputMode="decimal" value={values.pu_ht}
                        onChange={(e) => patch({ pu_ht: e.target.value })} className={inputCls} />
                    </div>
                  ) : (
                    <div>
                      <label htmlFor="chp-prix-conditionnement" className={labelCls}>Prix conditionnement HT (€)</label>
                      <input id="chp-prix-conditionnement" type="text" inputMode="decimal" value={values.prix_conditionnement}
                        onChange={(e) => patch({ prix_conditionnement: e.target.value })} className={inputCls} />
                    </div>
                  )}
                </div>
                {estPrestationAccessoire && (
                  <>
                    <div>
                      <label htmlFor="chp-pu-revient-acc" className={labelCls}>Coût de revient HT (€)</label>
                      <input id="chp-pu-revient-acc" type="text" inputMode="decimal" value={values.pu_revient}
                        onChange={(e) => patch({ pu_revient: e.target.value })} className={inputCls} />
                    </div>
                    {(() => {
                      const vente = parseFloat(values.pu_ht.replace(",", ".")) || 0;
                      const revient = parseFloat(values.pu_revient.replace(",", ".")) || 0;
                      if (vente > 0 && revient > 0) {
                        const marge = vente - revient;
                        const margePct = (marge / vente) * 100;
                        return (
                          <div className="mt-3 flex items-center justify-between rounded bg-violet-900/30 px-3 py-2 border border-violet-500/20">
                            <span className="text-xs font-medium text-violet-300">Marge brute estimée</span>
                            <span className={`text-sm font-bold ${marge >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                              {fmtEuro(marge)} <span className="text-xs opacity-70">({margePct.toFixed(1)}%)</span>
                            </span>
                          </div>
                        );
                      }
                      return null;
                    })()}
                  </>
                )}
              </div>
            )}
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-gray-700 flex justify-end gap-3 mt-auto shrink-0 bg-[#1E1E1E] rounded-b-xl">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="rounded-lg px-4 py-2 text-sm font-medium text-gray-300 hover:bg-[#1E1E1E] disabled:opacity-50"
            >
              Annuler
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 disabled:opacity-50 transition-colors"
            >
              {isSubmitting ? (
                <span className="flex items-center gap-2">
                  <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Enregistrement...
                </span>
              ) : (
                <>
                  <Save className="h-4 w-4" /> Enregistrer
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

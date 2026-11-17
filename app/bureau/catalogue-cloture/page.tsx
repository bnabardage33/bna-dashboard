"use client";

import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Edit2, Fence, Plus, Search, Trash2, Check, X } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
import { fmtEuro } from "@/lib/financeCalculs";
import CadencesMainOeuvreSection from "@/components/catalogue/CadencesMainOeuvreSection";
import { normaliserUniteVente, UNITES_VENTE } from "@/components/catalogue/types";
import {
  CADENCES_DEFAUT,
  calculerTarifMainOeuvre,
  fusionnerCadencesDepuisCatalogueTemps,
  getPresetsCadenceMainOeuvre,
  type CadencesTempsPose,
} from "@/lib/tempsPoseCalcul";
import {
  calculerIndicateurMargeTarif,
  calculerPrixVenteDepuisRevient,
  estContexteOssature,
  GAMME_MATERIAU_CONFIG,
  GAMMES_MATERIAU_ORDRE,
  getGammeBadgeClasses,
  getGammeLibellesContextuels,
  getRalHexColor,
  normaliserGammeMateriau,
  parseNombreDecimal,
  type GammeMateriau,
} from "@/types/catalogue";

interface ArticleCatalogueCloture {
  id: string;
  categorie: string;
  materiau: string;
  gamme_qualite?: GammeMateriau;
  reference: string | null;
  designation: string;
  longueur_m: number | null;
  hauteur_m: number | null;
  coloris: string | null;
  unite: string;
  prix_achat_ht: number;
  prix_vente_ht: number;
  actif: boolean;
}

const CATEGORIES = [
  { id: "tous", label: "Toutes" },
  { id: "lame", label: "Lames" },
  { id: "panneau", label: "Panneaux" },
  { id: "poteau", label: "Poteaux" },
  { id: "soubassement", label: "Soubassements" },
  { id: "platine", label: "Platines" },
  { id: "portillon", label: "Portillons" },
  { id: "accessoire", label: "Accessoires" },
];

export default function CatalogueCloturePage() {
  const [articles, setArticles] = useState<ArticleCatalogueCloture[]>([]);
  const [loading, setLoading] = useState(true);
  const [categorie, setCategorie] = useState("tous");
  const [gammeFiltre, setGammeFiltre] = useState<"toutes" | GammeMateriau>("toutes");
  const [recherche, setRecherche] = useState("");
  const [modalOuvert, setModalOuvert] = useState(false);

  // Formulaire ajout / édition article
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formCat, setFormCat] = useState("lame");
  const [formMat, setFormMat] = useState("COMPOSITE");
  const [formGamme, setFormGamme] = useState<GammeMateriau>("standard");
  const [formRef, setFormRef] = useState("");
  const [formDesignation, setFormDesignation] = useState("");
  const [formColoris, setFormColoris] = useState("");
  const [formLongueur, setFormLongueur] = useState("1.80");
  const [formHauteur, setFormHauteur] = useState("0.15");
  const [formUnite, setFormUnite] = useState("U");
  const [formPrixAchat, setFormPrixAchat] = useState("12");
  const [formPrixVente, setFormPrixVente] = useState("15.60");
  const [prixVenteModifieManuellement, setPrixVenteModifieManuellement] = useState(false);
  const [formModeMainOeuvre, setFormModeMainOeuvre] = useState(false);
  const [formTempsUnitaireH, setFormTempsUnitaireH] = useState("");
  const [presetCadenceId, setPresetCadenceId] = useState("");
  const [cadencesMo, setCadencesMo] = useState<CadencesTempsPose>({ ...CADENCES_DEFAUT });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!modalOuvert || typeof supabase?.from !== "function") return;
    let actif = true;
    supabase
      .from("catalogue_temps")
      .select("nom_tache, temps_unitaire_heure, entreprise_id")
      .then(({ data, error }) => {
        if (!actif || error || !data) return;
        const tries = [...data].sort((a, b) => {
          if (a.entreprise_id && !b.entreprise_id) return 1;
          if (!a.entreprise_id && b.entreprise_id) return -1;
          return 0;
        });
        setCadencesMo(fusionnerCadencesDepuisCatalogueTemps(tries));
      });
    return () => {
      actif = false;
    };
  }, [modalOuvert]);

  const appliquerCalculMainOeuvreCloture = (
    tempsStr: string,
    uniteCible: string,
    gammeCible: GammeMateriau
  ) => {
    const res = calculerTarifMainOeuvre({
      tempsUnitaireH: parseNombreDecimal(tempsStr),
      unite: uniteCible,
      gamme: gammeCible,
      tauxHoraireVente: cadencesMo.taux_horaire_vente_ht,
      tauxHoraireCharge: cadencesMo.taux_horaire_charge_ht,
    });
    if (!res.estHoraire && res.tempsUnitaireH <= 0) return;
    setFormPrixAchat(res.puRevient.toFixed(2));
    setFormPrixVente(res.puHt.toFixed(2));
    setPrixVenteModifieManuellement(false);
  };

  const ouvrirEditionCloture = (a: ArticleCatalogueCloture) => {
    setEditingId(a.id);
    setFormCat(a.categorie);
    setFormMat(a.materiau);
    setFormGamme(normaliserGammeMateriau(a.gamme_qualite));
    setFormRef(a.reference ?? "");
    setFormDesignation(a.designation);
    setFormColoris(a.coloris ?? "");
    setFormLongueur(a.longueur_m != null ? String(a.longueur_m) : "");
    setFormHauteur(a.hauteur_m != null ? String(a.hauteur_m) : "");
    setFormUnite(normaliserUniteVente(a.unite, "U"));
    setFormPrixAchat(String(a.prix_achat_ht ?? 0));
    setFormPrixVente(String(a.prix_vente_ht ?? 0));
    setPrixVenteModifieManuellement((a.prix_vente_ht ?? 0) > 0);
    setFormModeMainOeuvre(false);
    setFormTempsUnitaireH("");
    setPresetCadenceId("");
    setModalOuvert(true);
  };

  const modifierClotureGamme = (nouvelleGamme: GammeMateriau) => {
    setFormGamme(nouvelleGamme);
    if (formModeMainOeuvre) {
      appliquerCalculMainOeuvreCloture(formTempsUnitaireH, formUnite, nouvelleGamme);
      return;
    }
    const revient = parseNombreDecimal(formPrixAchat);
    if (revient > 0) {
      setFormPrixVente(
        calculerPrixVenteDepuisRevient(revient, nouvelleGamme).toFixed(2)
      );
      setPrixVenteModifieManuellement(false);
    }
  };

  const modifierCloturePrixAchat = (valeur: string) => {
    setFormPrixAchat(valeur);
    if (formModeMainOeuvre) return;
    const revient = parseNombreDecimal(valeur);
    const venteActuelle = parseNombreDecimal(formPrixVente);
    if (!prixVenteModifieManuellement || venteActuelle <= 0) {
      if (revient > 0) {
        setFormPrixVente(
          calculerPrixVenteDepuisRevient(revient, formGamme).toFixed(2)
        );
      } else if (!prixVenteModifieManuellement) {
        setFormPrixVente("");
      }
    }
  };

  const modifierCloturePrixVente = (valeur: string) => {
    setFormPrixVente(valeur);
    setPrixVenteModifieManuellement(parseNombreDecimal(valeur) > 0);
  };

  const appliquerCoefCloture = () => {
    const revient = parseNombreDecimal(formPrixAchat);
    if (revient <= 0) return;
    setFormPrixVente(calculerPrixVenteDepuisRevient(revient, formGamme).toFixed(2));
    setPrixVenteModifieManuellement(false);
  };

  const chargerArticles = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("catalogue_cloture")
      .select("*")
      .order("categorie")
      .order("designation");
    if (!error && data) {
      setArticles(data as unknown as ArticleCatalogueCloture[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    chargerArticles();
  }, [chargerArticles]);

  const articlesFiltres = useMemo(() => {
    const q = recherche.trim().toLowerCase();
    return articles.filter((a) => {
      if (categorie !== "tous" && a.categorie !== categorie) return false;
      if (
        gammeFiltre !== "toutes" &&
        normaliserGammeMateriau(a.gamme_qualite) !== gammeFiltre
      ) {
        return false;
      }
      if (!q) return true;
      return (
        a.designation.toLowerCase().includes(q) ||
        (a.reference ?? "").toLowerCase().includes(q) ||
        (a.coloris ?? "").toLowerCase().includes(q) ||
        a.materiau.toLowerCase().includes(q)
      );
    });
  }, [articles, categorie, gammeFiltre, recherche]);

  async function creerArticle(e: React.FormEvent) {
    e.preventDefault();
    if (!formDesignation.trim()) return;
    setSaving(true);
    try {
      const ctx = await resoudreContexteEntreprise(null);
      if (!ctx.entreprise_id) {
        alert("Contexte entreprise introuvable.");
        return;
      }
      const payload = {
        categorie: formCat,
        materiau: formMat,
        gamme_qualite: formGamme,
        reference: formRef.trim() || null,
        designation: formDesignation.trim(),
        coloris: formColoris.trim() || null,
        longueur_m: parseFloat(formLongueur.replace(",", ".")) || null,
        hauteur_m: parseFloat(formHauteur.replace(",", ".")) || null,
        unite: normaliserUniteVente(formUnite, "U"),
        prix_achat_ht: parseFloat(formPrixAchat.replace(",", ".")) || 0,
        prix_vente_ht: parseFloat(formPrixVente.replace(",", ".")) || 0,
      };
      const { error } = editingId
        ? await supabase
            .from("catalogue_cloture")
            .update(payload)
            .eq("id", editingId)
            .eq("entreprise_id", ctx.entreprise_id)
        : await supabase.from("catalogue_cloture").insert({
            entreprise_id: ctx.entreprise_id,
            ...payload,
          });
      if (error) {
        alert("Erreur : " + error.message);
        return;
      }
      setModalOuvert(false);
      setEditingId(null);
      setFormDesignation("");
      setFormRef("");
      setFormColoris("");
      await chargerArticles();
    } finally {
      setSaving(false);
    }
  }

  async function supprimerArticle(id: string, designation: string) {
    if (!window.confirm(`Supprimer « ${designation} » du catalogue Clôture ?`)) return;
    const { error } = await supabase.from("catalogue_cloture").delete().eq("id", id);
    if (error) {
      console.error("Erreur suppression catalogue_cloture :", error);
      if (error.code === "23503") {
        alert(
          `Impossible de supprimer « ${designation} » : cet article est déjà référencé dans un chantier ou un devis.`
        );
      } else {
        alert(`Impossible de supprimer cet article : ${error.message}`);
      }
      return;
    }
    setArticles((prev) => prev.filter((item) => item.id !== id));
    await chargerArticles();
  }

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-[#23272B] p-4 sm:p-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <section className="rounded-2xl border border-[#E5E5E5] bg-white p-6 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[#B85B2B]/10 border border-[#B85B2B]/20 text-[#B85B2B]">
                <Fence className="h-6 w-6" />
              </div>
              <div>
                <h1 className="text-xl font-bold text-[#23272B]">
                  Catalogue Clôture &amp; Brise-vue
                </h1>
                <p className="text-xs text-[#777777]">
                  Lames, poteaux, soubassements béton, platines, portillons et cadences de pose
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setEditingId(null);
                setFormDesignation("");
                setFormRef("");
                setFormColoris("");
                setPrixVenteModifieManuellement(false);
                setModalOuvert(true);
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-[#B85B2B] hover:bg-[#D97732] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-all"
            >
              <Plus className="h-4 w-4" />
              Nouvel article Clôture
            </button>
          </div>

          <div className="mt-5 flex flex-col gap-3 pt-4 border-t border-[#F0F0F0] sm:flex-row sm:items-center sm:justify-between">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                value={recherche}
                onChange={(e) => setRecherche(e.target.value)}
                placeholder="Rechercher par désignation, référence, matériau..."
                className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] pl-9 pr-4 py-2 text-xs text-[#23272B] focus:border-[#B85B2B] focus:bg-white focus:outline-none"
              />
              <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#999999]" />
            </div>

            <div className="flex flex-wrap items-center gap-1.5">
              <select
                aria-label="Filtrer par gamme matériau"
                value={gammeFiltre}
                onChange={(e) =>
                  setGammeFiltre(
                    e.target.value === "toutes"
                      ? "toutes"
                      : normaliserGammeMateriau(e.target.value)
                  )
                }
                className="rounded-lg border border-[#E5E5E5] bg-[#F8F9FA] px-3 py-1.5 text-xs text-[#23272B] focus:border-[#B85B2B] focus:bg-white focus:outline-none"
              >
                <option value="toutes">Toutes gammes</option>
                {GAMMES_MATERIAU_ORDRE.map((g) => (
                  <option key={g} value={g}>
                    {GAMME_MATERIAU_CONFIG[g].labelClient}
                  </option>
                ))}
              </select>
              {CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategorie(c.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold transition-all ${
                    categorie === c.id
                      ? "bg-[#B85B2B] text-white"
                      : "bg-[#F8F9FA] text-[#666666] hover:text-[#23272B]"
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          </div>
        </section>

        <CadencesMainOeuvreSection metier="cloture" />

        <section className="rounded-2xl border border-[#E5E5E5] bg-white overflow-hidden shadow-xs">
          {loading ? (
            <div className="p-8 text-center text-xs text-[#777777]">
              Chargement du catalogue Clôture...
            </div>
          ) : articlesFiltres.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <p className="text-sm font-bold text-[#23272B]">
                Aucun article Clôture enregistré
              </p>
              <p className="text-xs text-[#777777]">
                Ajoutez vos lames, poteaux, soubassements et portillons pour les chiffrages automatiques.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F8F9FA] text-[11px] uppercase tracking-wider text-[#777777] border-b border-[#E5E5E5]">
                  <tr>
                    <th className="px-4 py-3">Catégorie</th>
                    <th className="px-4 py-3">Matériau</th>
                    <th className="px-4 py-3">Désignation</th>
                    <th className="px-4 py-3 text-right">Dimensions</th>
                    <th className="px-4 py-3 text-right">Achat HT</th>
                    <th className="px-4 py-3 text-right">Vente HT</th>
                    <th className="px-4 py-3 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#F0F0F0]">
                  {articlesFiltres.map((a) => (
                    <tr key={a.id} className="hover:bg-[#F8F9FA]/60">
                      <td className="px-4 py-3 font-semibold uppercase text-[#B85B2B]">
                        {a.categorie}
                      </td>
                      <td className="px-4 py-3 text-[#555555]">{a.materiau}</td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-[#23272B]">{a.designation}</p>
                          {(() => {
                            const gammeNorm = normaliserGammeMateriau(a.gamme_qualite);
                            const ctxGamme = estContexteOssature({
                              categorie: a.categorie,
                              materiau: a.materiau,
                              designation: a.designation,
                            });
                            const lib = getGammeLibellesContextuels(gammeNorm, ctxGamme);
                            return (
                              <span
                                className={`inline-block rounded-full px-2 py-0.5 text-[10px] ${getGammeBadgeClasses(
                                  gammeNorm
                                )}`}
                                title={lib.labelInterne}
                              >
                                {lib.labelClient}
                              </span>
                            );
                          })()}
                        </div>
                        <div className="flex flex-wrap items-center gap-2 mt-0.5">
                          {a.reference && (
                            <p className="text-[11px] text-[#888888] font-mono">Réf: {a.reference}</p>
                          )}
                          {a.coloris && (() => {
                            const ralHex = getRalHexColor(a.coloris);
                            return (
                              <span className="inline-flex items-center gap-1 rounded border border-[#E5E5E5] bg-[#F8F9FA] px-1.5 py-0.5 text-[10px] font-medium text-[#444444]">
                                {ralHex && (
                                  <span
                                    className="inline-block h-2 w-2 rounded-full border border-black/25 shrink-0"
                                    style={{ backgroundColor: ralHex }}
                                    aria-hidden="true"
                                  />
                                )}
                                Décor : {a.coloris}
                              </span>
                            );
                          })()}
                        </div>
                      </td>
                      <td className="px-4 py-3 text-right text-[#666666] font-mono">
                        {a.longueur_m ? `${a.longueur_m}m` : "—"}
                        {a.hauteur_m ? ` × ${Math.round(a.hauteur_m * 1000)}mm` : ""}
                      </td>
                      <td className="px-4 py-3 text-right font-mono text-[#666666]">
                        {fmtEuro(a.prix_achat_ht)}
                      </td>
                      <td className="px-4 py-3 text-right font-mono font-bold text-[#23272B]">
                        {fmtEuro(a.prix_vente_ht)} / {normaliserUniteVente(a.unite, "U")}
                      </td>
                      <td className="px-4 py-3 text-right">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              ouvrirEditionCloture(a);
                            }}
                            className="text-slate-400 hover:text-[#23272B] hover:bg-[#F3F3F1] p-1.5 rounded-lg transition-colors"
                            title="Modifier la fiche article"
                            aria-label={`Modifier ${a.designation}`}
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              supprimerArticle(a.id, a.designation);
                            }}
                            className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                            title="Supprimer cet article"
                            aria-label="Supprimer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>

      {modalOuvert && (
        <div
          className="fixed inset-0 z-[210] pt-48 flex items-center justify-center p-4 pb-28 bg-black/80 backdrop-blur-sm"
          onClick={() => setModalOuvert(false)}
        >
          <form
            onSubmit={creerArticle}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg rounded-2xl bg-[#0B0F19] border border-slate-700 shadow-2xl overflow-hidden text-white"
          >
            <div className="flex items-center justify-between border-b border-slate-700 bg-[#111827] p-4">
              <h2 className="text-base font-bold text-white">
                {editingId ? "Modifier l'article Clôture" : "Nouvel article Catalogue Clôture"}
              </h2>
              <button
                type="button"
                onClick={() => setModalOuvert(false)}
                className="rounded-lg p-1 text-slate-400 hover:text-white"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
            <div className="p-4 space-y-3 text-xs bg-[#0B0F19]">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-300">Catégorie</label>
                  <select
                    value={formCat}
                    onChange={(e) => setFormCat(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-[#151C2C] px-3 py-2 text-white focus:border-[#E30613] focus:outline-none"
                  >
                    {CATEGORIES.filter((c) => c.id !== "tous").map((c) => (
                      <option key={c.id} value={c.id} className="bg-[#151C2C] text-white">
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="font-semibold text-slate-300">Matériau</label>
                  <select
                    value={formMat}
                    onChange={(e) => setFormMat(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-[#151C2C] px-3 py-2 text-white focus:border-[#E30613] focus:outline-none"
                  >
                    <option value="COMPOSITE" className="bg-[#151C2C] text-white">Composite</option>
                    <option value="BOIS" className="bg-[#151C2C] text-white">Bois</option>
                    <option value="ALU" className="bg-[#151C2C] text-white">Aluminium</option>
                    <option value="BETON" className="bg-[#151C2C] text-white">Béton</option>
                    <option value="ACIER" className="bg-[#151C2C] text-white">Acier</option>
                  </select>
                </div>
              </div>
              {(() => {
                const ctxForm = estContexteOssature({
                  categorie: formCat,
                  materiau: formMat,
                  designation: formDesignation,
                });
                return (
                  <div>
                    <label htmlFor="cloture-gamme-qualite" className="font-semibold text-slate-300">
                      {ctxForm === "ossature"
                        ? "Classe d'emploi bois (EN 335)"
                        : "Gamme matériau (Qualité)"}
                    </label>
                    <select
                      id="cloture-gamme-qualite"
                      value={formGamme}
                      onChange={(e) => modifierClotureGamme(normaliserGammeMateriau(e.target.value))}
                      className="mt-1 w-full rounded-xl border border-slate-700 bg-[#151C2C] px-3 py-2 text-white focus:border-[#E30613] focus:outline-none"
                    >
                      {GAMMES_MATERIAU_ORDRE.map((g) => {
                        const lib = getGammeLibellesContextuels(g, ctxForm);
                        const label =
                          ctxForm === "ossature" || lib.labelClient === lib.labelInterne
                            ? lib.labelInterne
                            : `${lib.labelClient} / ${lib.labelInterne}`;
                        return (
                          <option key={g} value={g} className="bg-[#151C2C] text-white">
                            {label}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                );
              })()}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="font-semibold text-slate-300">Désignation</label>
                  <input
                    required
                    value={formDesignation}
                    onChange={(e) => setFormDesignation(e.target.value)}
                    placeholder="Ex: Lame composite anthracite 1.80m"
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-[#151C2C] px-3 py-2 text-white placeholder:text-slate-500 focus:border-[#E30613] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-300">Référence</label>
                  <input
                    value={formRef}
                    onChange={(e) => setFormRef(e.target.value)}
                    placeholder="CLO-LAM-01"
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-[#151C2C] px-3 py-2 text-white placeholder:text-slate-500 focus:border-[#E30613] focus:outline-none"
                  />
                </div>
              </div>
              <div>
                <label className="font-semibold text-slate-300">Couleur / Décor / Code RAL</label>
                <input
                  value={formColoris}
                  onChange={(e) => setFormColoris(e.target.value)}
                  placeholder="Ex: Gris Anthracite RAL 7016"
                  className="mt-1 w-full rounded-xl border border-slate-700 bg-[#151C2C] px-3 py-2 text-white placeholder:text-slate-500 focus:border-[#E30613] focus:outline-none"
                />
              </div>
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="font-semibold text-slate-300">Longueur (m)</label>
                  <input
                    value={formLongueur}
                    onChange={(e) => setFormLongueur(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-[#151C2C] px-3 py-2 text-white focus:border-[#E30613] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-300">Hauteur (m)</label>
                  <input
                    value={formHauteur}
                    onChange={(e) => setFormHauteur(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-[#151C2C] px-3 py-2 text-white focus:border-[#E30613] focus:outline-none"
                  />
                </div>
                <div>
                  <label className="font-semibold text-slate-300">Unité</label>
                  <select
                    value={normaliserUniteVente(formUnite, "U")}
                    onChange={(e) => {
                      const newUnite = e.target.value;
                      setFormUnite(newUnite);
                      if (formModeMainOeuvre) {
                        appliquerCalculMainOeuvreCloture(formTempsUnitaireH, newUnite, formGamme);
                      }
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-[#151C2C] px-3 py-2 text-white focus:border-[#E30613] focus:outline-none"
                  >
                    {UNITES_VENTE.map((u) => (
                      <option key={u} value={u} className="bg-[#151C2C] text-white">
                        {u}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="rounded-xl border border-slate-700 bg-[#111827] p-3 space-y-2">
                <label className="flex items-center gap-2 cursor-pointer text-xs font-semibold text-slate-200">
                  <input
                    type="checkbox"
                    checked={formModeMainOeuvre}
                    onChange={(e) => {
                      const checked = e.target.checked;
                      setFormModeMainOeuvre(checked);
                      if (checked) {
                        appliquerCalculMainOeuvreCloture(formTempsUnitaireH, formUnite, formGamme);
                      }
                    }}
                    className="h-4 w-4 rounded border-slate-600 bg-[#151C2C] accent-[#E30613]"
                  />
                  Calculer comme prestation Main-d&apos;œuvre (taux horaires catalogue_temps)
                </label>
                {formModeMainOeuvre && (() => {
                  const presets = getPresetsCadenceMainOeuvre(cadencesMo, "cloture");
                  return (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                      <div>
                        <label className="font-semibold text-slate-300">Cadence rapide</label>
                        <select
                          value={presetCadenceId}
                          onChange={(e) => {
                            const id = e.target.value;
                            setPresetCadenceId(id);
                            const preset = presets.find((p) => p.id === id);
                            if (!preset) return;
                            const tStr = String(preset.tempsH);
                            setFormTempsUnitaireH(tStr);
                            setFormUnite(preset.unite);
                            appliquerCalculMainOeuvreCloture(tStr, preset.unite, formGamme);
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-[#151C2C] px-3 py-2 text-white focus:border-[#E30613] focus:outline-none"
                        >
                          <option value="">Choisir une cadence...</option>
                          {presets.map((p) => (
                            <option key={p.id} value={p.id} className="bg-[#151C2C] text-white">
                              {p.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="font-semibold text-slate-300">
                          Temps unitaire prévu (h / {normaliserUniteVente(formUnite, "U")})
                        </label>
                        <input
                          type="text"
                          inputMode="decimal"
                          placeholder="Ex: 0.65"
                          value={formTempsUnitaireH}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormTempsUnitaireH(val);
                            setPresetCadenceId("");
                            appliquerCalculMainOeuvreCloture(val, formUnite, formGamme);
                          }}
                          className="mt-1 w-full rounded-xl border border-slate-700 bg-[#151C2C] px-3 py-2 text-white focus:border-[#E30613] focus:outline-none"
                        />
                      </div>
                    </div>
                  );
                })()}
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-semibold text-slate-300">Coût de revient / Achat € HT</label>
                  <input
                    value={formPrixAchat}
                    onChange={(e) => modifierCloturePrixAchat(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-[#151C2C] px-3 py-2 text-white focus:border-[#E30613] focus:outline-none"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <label className="font-semibold text-slate-300">Prix vente € HT</label>
                    {!formModeMainOeuvre && parseNombreDecimal(formPrixAchat) > 0 && (
                      <button
                        type="button"
                        onClick={appliquerCoefCloture}
                        className="rounded border border-amber-500/40 bg-amber-500/10 px-1.5 py-0.5 text-[10px] font-bold text-amber-300 hover:bg-amber-500/20 transition-colors"
                      >
                        Appliquer coef ×{GAMME_MATERIAU_CONFIG[formGamme].margeCibleDefaut.toFixed(2)}
                      </button>
                    )}
                  </div>
                  <input
                    value={formPrixVente}
                    onChange={(e) => modifierCloturePrixVente(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-700 bg-[#151C2C] px-3 py-2 text-white focus:border-[#E30613] focus:outline-none"
                  />
                </div>
              </div>
              {(() => {
                const vente = parseNombreDecimal(formPrixVente);
                const revient = parseNombreDecimal(formPrixAchat);
                if (formModeMainOeuvre) {
                  const calc = calculerTarifMainOeuvre({
                    tempsUnitaireH: parseNombreDecimal(formTempsUnitaireH),
                    unite: formUnite,
                    gamme: formGamme,
                    tauxHoraireVente: cadencesMo.taux_horaire_vente_ht,
                    tauxHoraireCharge: cadencesMo.taux_horaire_charge_ht,
                  });
                  const marge = Number((vente - revient).toFixed(2));
                  const margePct = vente > 0 ? (marge / vente) * 100 : 0;
                  const fmtDec = (n: number) => n.toFixed(2).replace(".", ",");
                  return (
                    <div className="rounded-xl border border-slate-700 bg-[#151C2C] px-3 py-2 text-[11px] text-slate-300">
                      {calc.estHoraire || calc.tempsUnitaireH > 0 ? (
                        <span>
                          Cadence : <strong className="text-white">{fmtDec(calc.tempsUnitaireH)} h</strong> × coef pose{" "}
                          <strong className="text-white">{calc.coefTempsPose.toFixed(2)}</strong> ={" "}
                          <strong className="text-white">{fmtDec(calc.tempsAjusteH)} h</strong> • Revient :{" "}
                          <strong className="text-white">{fmtEuro(revient || calc.puRevient)} HT</strong> ({fmtDec(calc.tauxHoraireCharge)} €/h) • Vente :{" "}
                          <strong className="text-white">{fmtEuro(vente || calc.puHt)} HT</strong> ({fmtDec(calc.tauxHoraireVente)} €/h) •{" "}
                          <span className={`font-bold ${marge >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                            Marge : {marge >= 0 ? "+" : ""}{fmtEuro(marge)} HT ({margePct.toFixed(1)} %)
                          </span>
                        </span>
                      ) : (
                        <span>
                          Taux entreprise : Vente {fmtDec(calc.tauxHoraireVente)} €/h · Chargé {fmtDec(calc.tauxHoraireCharge)} €/h · Coef pose ×{calc.coefTempsPose.toFixed(2)}
                        </span>
                      )}
                    </div>
                  );
                }
                const ind = calculerIndicateurMargeTarif(vente, revient, formGamme);
                return (
                  <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 bg-[#151C2C] px-3 py-2 text-[11px]">
                    <span className="text-slate-300">
                      Coef gamme <strong className="text-white">{ind.labelClient}</strong> : ×{ind.coef.toFixed(2)}
                    </span>
                    {vente > 0 && revient > 0 ? (
                      <span className={`font-bold ${ind.margeEuro >= 0 ? "text-emerald-400" : "text-rose-400"}`}>
                        Marge : {ind.margeEuro >= 0 ? "+" : ""}{fmtEuro(ind.margeEuro)} HT ({ind.margePct.toFixed(1)} %)
                      </span>
                    ) : (
                      <span className="text-slate-400">Saisissez un coût d&apos;achat HT</span>
                    )}
                  </div>
                );
              })()}
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-700/80 bg-[#111827] p-4">
              <button
                type="button"
                onClick={() => setModalOuvert(false)}
                className="rounded-xl border border-slate-700 bg-[#151C2C] px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#E30613] hover:bg-red-700 px-4 py-2 text-xs font-bold text-white transition-colors"
              >
                <Check className="h-4 w-4" />
                {saving ? "Enregistrement..." : editingId ? "Enregistrer" : "Ajouter"}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

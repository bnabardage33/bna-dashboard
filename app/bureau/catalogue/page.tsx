"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Edit2, Trash2, Search, ArrowLeft, Save, X } from "lucide-react";
import Link from "next/link";
import { fmtEuro } from "@/lib/financeCalculs";

type CategorieOuvrage = "bardage" | "etancheite" | "habillage" | "isolation" | "installation";

type Ouvrage = {
  id: string;
  // Identification
  categorie: string;
  famille_label: string;
  designation: string;
  description?: string;
  // Marque & Décor
  fabricant?: string;
  gamme?: string;
  code_decor?: string;
  couleur?: string;
  finition?: string;
  // Dimensions & Spécifications
  longueur_mm?: number | null;
  largeur_mm?: number | null;
  epaisseur_mm?: number | null;
  // Fournisseur & Tarifs
  fournisseur?: string;
  unite: string;
  pu_ht: number;
  prix_ttc?: number | null;
};

type FormState = Omit<Ouvrage, "id">;

const emptyForm: FormState = {
  categorie: "bardage",
  famille_label: "",
  designation: "",
  description: "",
  fabricant: "",
  gamme: "",
  code_decor: "",
  couleur: "",
  finition: "",
  longueur_mm: null,
  largeur_mm: null,
  epaisseur_mm: null,
  fournisseur: "",
  unite: "m²",
  pu_ht: 0,
  prix_ttc: null,
};

export default function CataloguePage() {
  const [ouvrages, setOuvrages] = useState<Ouvrage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("Toutes");
  const [activeFabricant, setActiveFabricant] = useState<string>("All");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOuvrage, setEditingOuvrage] = useState<Ouvrage | null>(null);

  const [formData, setFormData] = useState<FormState>(emptyForm);

  const set = (field: keyof FormState, value: FormState[keyof FormState]) =>
    setFormData((prev) => ({ ...prev, [field]: value }));

  const categories = ["Toutes", "bardage", "etancheite", "habillage", "isolation", "installation"];

  const fetchCatalogue = async () => {
    setIsLoading(true);
    const { data, error } = await supabase
      .from("catalogue_ouvrages")
      .select("*")
      .order("categorie")
      .order("designation");
      
    if (error) {
      console.error(error);
      // Fallback si la table n'existe pas encore
      if (error.code === '42P01') {
        alert("La table 'catalogue_ouvrages' n'existe pas encore. Veuillez exécuter le script SQL fourni.");
      }
    } else {
      setOuvrages(data || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchCatalogue();
  }, []);

  const handleOpenModal = (ouvrage?: Ouvrage) => {
    if (ouvrage) {
      setEditingOuvrage(ouvrage);
      // eslint-disable-next-line @typescript-eslint/no-unused-vars
      const { id, ...rest } = ouvrage;
      setFormData({ ...emptyForm, ...rest });
    } else {
      setEditingOuvrage(null);
      setFormData(emptyForm);
    }
    setIsModalOpen(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (editingOuvrage) {
      // Update
      const { error } = await supabase
        .from("catalogue_ouvrages")
        .update(formData)
        .eq("id", editingOuvrage.id);
      if (!error) {
        setIsModalOpen(false);
        fetchCatalogue();
      }
    } else {
      // Insert
      const { error } = await supabase
        .from("catalogue_ouvrages")
        .insert(formData);
      if (!error) {
        setIsModalOpen(false);
        fetchCatalogue();
      }
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Supprimer cet ouvrage du catalogue ?")) return;
    await supabase.from("catalogue_ouvrages").delete().eq("id", id);
    fetchCatalogue();
  };

  const filteredOuvrages = ouvrages.filter((o) => {
    const matchesCat = activeCategory === "Toutes" || o.categorie === activeCategory;
    const matchesFab = activeFabricant === "All" || o.fabricant === activeFabricant;
    const lowerSearch = searchQuery.toLowerCase();
    const matchesSearch = o.designation.toLowerCase().includes(lowerSearch) ||
      (o.description && o.description.toLowerCase().includes(lowerSearch)) ||
      (o.couleur && o.couleur.toLowerCase().includes(lowerSearch)) ||
      (o.code_decor && o.code_decor.toLowerCase().includes(lowerSearch));
    return matchesCat && matchesFab && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-slate-900 p-4 lg:p-8 text-slate-100">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <Link
              href="/bureau"
              className="inline-flex items-center gap-2 text-sm text-slate-400 hover:text-cyan-400 transition-colors mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour au Bureau
            </Link>
            <h1 className="text-3xl font-bold text-slate-100">Catalogue des Ouvrages</h1>
            <p className="text-sm text-slate-400 mt-1">
              Gérez votre bibliothèque de prix pour la création des devis.
            </p>
          </div>
          <button
            onClick={() => handleOpenModal()}
            className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-500 transition-colors"
          >
            <Plus className="h-4 w-4" />
            Nouvel Ouvrage
          </button>
        </header>

        {/* Filtres */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-slate-800/50 p-4 rounded-xl border border-slate-700">
          {/* Catégorie */}
          <div className="flex flex-wrap gap-2">
            {categories.map((cat) => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${
                  activeCategory === cat
                    ? "bg-cyan-500/20 text-cyan-400 border border-cyan-500/50"
                    : "bg-slate-800 text-slate-400 border border-slate-700 hover:border-slate-500"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>
          {/* Fabricant */}
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-400">Fabricant</label>
            <select
              value={activeFabricant}
              onChange={(e) => setActiveFabricant(e.target.value)}
              className="rounded border border-slate-600 bg-slate-900 p-1 text-xs text-slate-200"
            >
              <option value="All">Tous</option>
              {Array.from(new Set(ouvrages.map((o) => o.fabricant).filter(Boolean)))
                .sort()
                .map((fab) => (
                  <option key={fab} value={fab}>
                    {fab}
                  </option>
                ))}
            </select>
          </div>
          {/* Recherche texte */}
          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="text"
              placeholder="Rechercher (couleur / code décor)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 py-2 pl-9 pr-4 text-sm text-slate-200 outline-none focus:border-cyan-400"
            />
          </div>

          {/* Reset Filters Button */}
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setActiveFabricant('All');
              setActiveCategory('Toutes');
            }}
            className="ml-2 rounded bg-slate-700 px-3 py-1 text-xs text-slate-200 hover:bg-slate-600"
          >
            Réinitialiser
          </button>
        </div>

        {/* Liste */}
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-cyan-400 border-t-transparent"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOuvrages.map((o) => (
              <div key={o.id} className="flex flex-col rounded-xl border border-slate-700 bg-slate-800/50 p-5 hover:border-cyan-500/50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <span className="inline-block px-2 py-1 bg-slate-700 text-slate-300 text-[10px] font-bold uppercase tracking-wider rounded">
                    {o.famille_label}
                  </span>
                  <div className="flex gap-2">
                    <button onClick={() => handleOpenModal(o)} className="text-slate-500 hover:text-cyan-400">
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(o.id)} className="text-slate-500 hover:text-rose-400">
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <h3 className="font-bold text-slate-200 text-sm leading-tight mb-2">
                  {o.designation}
                </h3>
                <p className="text-xs text-slate-400 line-clamp-3 mb-4 flex-grow">
                  {o.description}
                </p>
                <div className="mt-auto flex items-end justify-between border-t border-slate-700 pt-3">
                  <span className="text-xs font-medium text-slate-500">Unité : {o.unite}</span>
                  <span className="text-lg font-black text-cyan-400">{fmtEuro(o.pu_ht)} HT</span>
                  {o.prix_ttc !== undefined && (
                    <span className="text-sm font-medium text-slate-400">{fmtEuro(o.prix_ttc)} TTC</span>
                  )}
                </div>
              </div>
            ))}
            {filteredOuvrages.length === 0 && (
              <div className="col-span-full py-12 text-center text-slate-500">
                Aucun ouvrage trouvé pour cette recherche.
              </div>
            )}
          </div>
        )}

        {/* Modal Ajout/Edition */}
        {isModalOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
            <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-800 shadow-2xl flex flex-col max-h-[90vh]">
              {/* Header fixe */}
              <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-slate-700">
                <h2 className="text-xl font-bold text-slate-100">
                  {editingOuvrage ? "Modifier le matériau" : "Nouveau matériau"}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Formulaire scrollable */}
              <form onSubmit={handleSave} className="overflow-y-auto px-6 py-4 space-y-6">

                {/* ── En-tête : Catégorie + Famille + Désignation ─────────── */}
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Catégorie</label>
                    <select
                      required
                      value={formData.categorie}
                      onChange={(e) => set("categorie", e.target.value)}
                      className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100"
                    >
                      {categories.filter((c) => c !== "Toutes").map((c) => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Famille (ex&nbsp;: Bardage HPL)</label>
                    <input
                      required
                      type="text"
                      placeholder="Bardage HPL"
                      value={formData.famille_label ?? ""}
                      onChange={(e) => set("famille_label", e.target.value)}
                      className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-400 mb-1">Désignation (titre de la fiche)</label>
                  <input
                    required
                    type="text"
                    placeholder="ex&nbsp;: Trespa Meteon – Blanc Ménuires B015"
                    value={formData.designation ?? ""}
                    onChange={(e) => set("designation", e.target.value)}
                    className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100"
                  />
                </div>

                {/* ── Section 1 : Marque & Décor ─────────────────────────── */}
                <fieldset className="rounded-lg border border-slate-600 p-4 space-y-4">
                  <legend className="px-2 text-xs font-bold uppercase tracking-widest text-cyan-400">
                    1 · Marque &amp; Décor
                  </legend>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Fabricant</label>
                      <input
                        type="text"
                        placeholder="ex&nbsp;: Polyrey, Trespa"
                        value={formData.fabricant ?? ""}
                        onChange={(e) => set("fabricant", e.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Gamme</label>
                      <input
                        type="text"
                        placeholder="ex&nbsp;: Reysipur"
                        value={formData.gamme ?? ""}
                        onChange={(e) => set("gamme", e.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Code Décor</label>
                      <input
                        type="text"
                        placeholder="ex&nbsp;: B015"
                        value={formData.code_decor ?? ""}
                        onChange={(e) => set("code_decor", e.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Nom / Couleur du Décor</label>
                      <input
                        type="text"
                        placeholder="ex&nbsp;: Blanc Ménuires"
                        value={formData.couleur ?? ""}
                        onChange={(e) => set("couleur", e.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-400 mb-1">Finition</label>
                    <input
                      type="text"
                      placeholder="ex&nbsp;: FA Satin"
                      value={formData.finition ?? ""}
                      onChange={(e) => set("finition", e.target.value)}
                      className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100"
                    />
                  </div>
                </fieldset>

                {/* ── Section 2 : Dimensions & Spécifications ────────────── */}
                <fieldset className="rounded-lg border border-slate-600 p-4 space-y-4">
                  <legend className="px-2 text-xs font-bold uppercase tracking-widest text-cyan-400">
                    2 · Dimensions &amp; Spécifications
                  </legend>

                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Longueur (mm)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="3050"
                        value={formData.longueur_mm ?? ""}
                        onChange={(e) => set("longueur_mm", e.target.value === "" ? null : parseFloat(e.target.value))}
                        className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Largeur (mm)</label>
                      <input
                        type="number"
                        min="0"
                        step="1"
                        placeholder="1310"
                        value={formData.largeur_mm ?? ""}
                        onChange={(e) => set("largeur_mm", e.target.value === "" ? null : parseFloat(e.target.value))}
                        className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Épaisseur (mm)</label>
                      <input
                        type="number"
                        min="0"
                        step="0.5"
                        placeholder="6"
                        value={formData.epaisseur_mm ?? ""}
                        onChange={(e) => set("epaisseur_mm", e.target.value === "" ? null : parseFloat(e.target.value))}
                        className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100"
                      />
                    </div>
                  </div>
                </fieldset>

                {/* ── Section 3 : Fournisseur & Tarifs ──────────────────── */}
                <fieldset className="rounded-lg border border-slate-600 p-4 space-y-4">
                  <legend className="px-2 text-xs font-bold uppercase tracking-widest text-cyan-400">
                    3 · Fournisseur &amp; Tarifs
                  </legend>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Fournisseur</label>
                      <input
                        type="text"
                        placeholder="ex&nbsp;: Dispano, Barillet"
                        value={formData.fournisseur ?? ""}
                        onChange={(e) => set("fournisseur", e.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Unité de vente</label>
                      <select
                        required
                        value={formData.unite}
                        onChange={(e) => set("unite", e.target.value)}
                        className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100"
                      >
                        <option value="m²">m²</option>
                        <option value="U">U (Unité)</option>
                        <option value="ml">ml</option>
                        <option value="forfait">Forfait</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">Prix Unitaire HT (€)</label>
                      <input
                        required
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={formData.pu_ht}
                        onChange={(e) => {
                          const ht = parseFloat(e.target.value) || 0;
                          setFormData((prev) => ({
                            ...prev,
                            pu_ht: ht,
                            prix_ttc: Math.round(ht * 1.2 * 100) / 100,
                          }));
                        }}
                        className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Prix TTC (€)
                        <span className="ml-1 text-[10px] font-normal text-slate-500">(calculé auto à +20%)</span>
                      </label>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        placeholder="0.00"
                        value={formData.prix_ttc ?? ""}
                        onChange={(e) => set("prix_ttc", e.target.value === "" ? null : parseFloat(e.target.value))}
                        className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100"
                      />
                    </div>
                  </div>
                </fieldset>

                {/* ── Boutons ─────────────────────────────────────────────── */}
                <div className="flex justify-end gap-3 pb-2">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700"
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-500"
                  >
                    <Save className="h-4 w-4" />
                    Enregistrer
                  </button>
                </div>
              </form>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}


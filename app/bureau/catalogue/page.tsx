"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Edit2, Trash2, Search, ArrowLeft, Save, X, Upload } from "lucide-react";
import Link from "next/link";
import { fmtEuro } from "@/lib/financeCalculs";
import Papa from "papaparse";

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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

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
    setIsSubmitting(true);

    const numericHt = parseFloat(String(formData.pu_ht).replace(',', '.')) || 0;
    // Si l'utilisateur a saisi un TTC précis manuellement, on le garde, sinon on le calcule
    const numericTtc = formData.prix_ttc != null && String(formData.prix_ttc) !== "" 
      ? parseFloat(String(formData.prix_ttc).replace(',', '.'))
      : parseFloat((numericHt * 1.2).toFixed(2));
    // Coercition numérique stricte pour éviter tout rejet Supabase
    const rawPayload = {
      ...formData,
      pu_ht: numericHt,
      prix_ttc: numericTtc,
      longueur_mm: formData.longueur_mm != null ? Number(formData.longueur_mm) : null,
      largeur_mm: formData.largeur_mm != null ? Number(formData.largeur_mm) : null,
      epaisseur_mm: formData.epaisseur_mm != null ? Number(formData.epaisseur_mm) : null,
      // Chaînes optionnelles : null plutôt que "" pour Supabase
      fabricant: formData.fabricant?.trim() || null,
      gamme: formData.gamme?.trim() || null,
      code_decor: formData.code_decor?.trim() || null,
      couleur: formData.couleur?.trim() || null,
      finition: formData.finition?.trim() || null,
      fournisseur: formData.fournisseur?.trim() || null,
      description: formData.description?.trim() || null,
    };

    // Filtrer les valeurs null pour ne pas crasher si la colonne n'existe pas encore dans Supabase
    const payload = Object.fromEntries(
      Object.entries(rawPayload).filter(([_, v]) => v != null)
    );

    try {
      let error;
      if (editingOuvrage) {
        ({ error } = await supabase
          .from("catalogue_ouvrages")
          .update(payload)
          .eq("id", editingOuvrage.id));
      } else {
        ({ error } = await supabase
          .from("catalogue_ouvrages")
          .insert(payload));
      }

      if (error) {
        console.error("Supabase error:", error);
        alert(`Erreur Supabase : ${error.message}\n\nCode : ${error.code}`);
      } else {
        setIsModalOpen(false);
        await fetchCatalogue();
      }
    } catch (err) {
      console.error("Erreur inattendue :", err);
      alert("Une erreur inattendue s'est produite. Vérifiez la console.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm("Supprimer cet ouvrage du catalogue ?")) return;
    await supabase.from("catalogue_ouvrages").delete().eq("id", id);
    fetchCatalogue();
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        const data = results.data as any[];
        let countNew = 0;
        let countUpdated = 0;
        
        for (const row of data) {
          if (!row.designation) continue;

          // Construire le payload de base avec les valeurs du CSV, ou valeurs par défaut si vide
          const pu_ht = Number(row.pu_ht?.replace(',', '.') || 0);
          const prix_ttc = row.prix_ttc ? Number(row.prix_ttc.replace(',', '.')) : Math.round(pu_ht * 1.2 * 100) / 100;
          
          const payload: any = {
            designation: row.designation.trim(),
            categorie: row.categorie?.trim() || "bardage",
            famille_label: row.famille_label?.trim() || "Import CSV",
            unite: row.unite?.trim() || "m²",
            pu_ht,
            prix_ttc,
            fabricant: row.fabricant?.trim() || null,
            gamme: row.gamme?.trim() || null,
            code_decor: row.code_decor?.trim() || null,
            couleur: row.couleur?.trim() || null,
            finition: row.finition?.trim() || null,
            fournisseur: row.fournisseur?.trim() || null,
            description: row.description?.trim() || null,
            longueur_mm: row.longueur_mm ? Number(row.longueur_mm) : null,
            largeur_mm: row.largeur_mm ? Number(row.largeur_mm) : null,
            epaisseur_mm: row.epaisseur_mm ? Number(row.epaisseur_mm) : null,
          };

          // On retire les nulls pour éviter les crash si base pas à jour
          const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v != null));

          // Vérifie s'il existe déjà (recherche par designation)
          const existing = ouvrages.find(o => o.designation.toLowerCase() === row.designation.trim().toLowerCase());
          
          if (existing) {
            const { error } = await supabase.from("catalogue_ouvrages").update(cleanPayload).eq("id", existing.id);
            if (!error) countUpdated++;
          } else {
            const { error } = await supabase.from("catalogue_ouvrages").insert(cleanPayload);
            if (!error) countNew++;
          }
        }
        
        alert(`Import terminé !\n${countNew} nouveaux matériaux créés.\n${countUpdated} matériaux mis à jour.`);
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        fetchCatalogue();
      },
      error: (err) => {
        console.error("Erreur parsing CSV:", err);
        alert("Erreur lors de la lecture du fichier CSV.");
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    });
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
          <div className="flex items-center gap-3">
            <input
              type="file"
              accept=".csv"
              ref={fileInputRef}
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              disabled={isImporting}
              className="flex items-center gap-2 rounded-lg bg-slate-700 px-4 py-2 text-sm font-bold text-white hover:bg-slate-600 transition-colors disabled:opacity-50"
            >
              {isImporting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {isImporting ? "Importation..." : "Importer CSV"}
            </button>
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-500 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nouvel Ouvrage
            </button>
          </div>
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
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-32 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-xl border border-slate-700 bg-slate-900 shadow-2xl flex flex-col max-h-[80vh]">
              {/* Header fixe */}
              <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
                <h2 className="text-xl font-bold text-slate-100">
                  {editingOuvrage ? "Modifier le matériau" : "Nouveau matériau"}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-slate-400 hover:text-white">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Formulaire avec scroll séparé et footer statique */}
              <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
                <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-6">

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
                        type="text"
                        placeholder="0.00"
                        value={formData.pu_ht}
                        onChange={(e) => {
                          const val = e.target.value;
                          const numericHt = parseFloat(val.replace(',', '.')) || 0;
                          setFormData((prev) => ({
                            ...prev,
                            pu_ht: val as any,
                            prix_ttc: val === "" ? "" as any : parseFloat((numericHt * 1.2).toFixed(2))
                          }));
                        }}
                        className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-400 mb-1">
                        Prix TTC (€)
                        <span className="ml-1 text-[10px] font-normal text-slate-500">(TVA 20%)</span>
                      </label>
                      <input
                        type="text"
                        placeholder="0.00"
                        value={formData.prix_ttc ?? ""}
                        onChange={(e) => {
                          const val = e.target.value;
                          const numericTtc = parseFloat(val.replace(',', '.')) || 0;
                          setFormData((prev) => ({
                            ...prev,
                            prix_ttc: val as any,
                            pu_ht: val === "" ? "" as any : parseFloat((numericTtc / 1.2).toFixed(2))
                          }));
                        }}
                        className="w-full rounded border border-slate-600 bg-slate-900 p-2 text-sm text-slate-100 focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500"
                      />
                    </div>
                  </div>
                </fieldset>

                </div> {/* Fin du contenu scrollable */}

                {/* ── Boutons (Static Footer) ─────────────────────────────── */}
                <div className="p-4 border-t border-gray-700 flex justify-end gap-3 mt-auto shrink-0 bg-slate-800 rounded-b-xl z-10">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-slate-300 hover:bg-slate-700 disabled:opacity-50"
                    disabled={isSubmitting}
                  >
                    Annuler
                  </button>
                  <button
                    type="submit"
                    disabled={isSubmitting}
                    className="flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-bold text-white hover:bg-cyan-500 disabled:opacity-50 transition-colors"
                  >
                    {isSubmitting ? (
                      <span className="flex items-center gap-2">
                        <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                        Enregistrement...
                      </span>
                    ) : (
                      <>
                        <Save className="h-4 w-4" />
                        Enregistrer
                      </>
                    )}
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

"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Edit2, Trash2, Search, ArrowLeft, Upload } from "lucide-react";
import Link from "next/link";
import { fmtEuro } from "@/lib/financeCalculs";
import Papa from "papaparse";
import type { CatalogueItem } from "@/types/finance";
import type { TablesInsert, TablesUpdate } from "@/types/supabase";
import ProductFormModal, {
  type ProductImportCandidates,
} from "@/components/catalogue/ProductFormModal";
import { fromRow, toInsertPayload } from "@/components/catalogue/mappers";
import { emptyBardage, type NatureCout, type ProductDraft } from "@/components/catalogue/types";

type CategorieOuvrage = "bardage" | "etancheite" | "habillage" | "isolation" | "installation";

type DimensionItem = {
  longueur_mm?: number | null;
  largeur_mm?: number | null;
  epaisseur_mm?: number | null;
};

type Ouvrage = {
  id: string;
  // Identification
  categorie: string;
  famille_label: string;
  designation: string;
  description?: string;
  designation_devis?: string;
  // Marque & Décor
  fabricant?: string;
  gamme?: string;
  code_decor?: string;
  couleur?: string;
  code_ral?: string;
  finition?: string;
  // Dimensions & Spécifications
  longueur_mm?: number | null; // Keep for backward compatibility / fallback
  largeur_mm?: number | null;
  epaisseur_mm?: number | null;
  dimensions_disponibles?: DimensionItem[];
  // Fournisseur & Tarifs
  fournisseur?: string;
  unite: string;
  pu_ht: number;
  prix_ttc?: number | null;
  // Coût de revient & nature (IA Devis phase 1)
  pu_revient?: number | null;
  type_cout: string; // 'matiere' | 'main_oeuvre'
};

const getSousFamille = (o: Ouvrage): string => {
  const text = `${o.gamme || ''} ${o.designation || ''}`.toLowerCase();
  if (text.includes("polyrey") || text.includes("trespa") || text.includes("hpl")) return "HPL (Trespa/Polyrey)";
  if (text.includes("composite") || text.includes("coextrusion") || text.includes("ligna")) return "Lame Composite";
  if (text.includes("james hardie") || text.includes("cedral") || text.includes("fibrociment")) return "Fibrociment";
  if (text.includes("mélèze") || text.includes("meleze") || text.includes("douglas") || text.includes("sapin") || text.includes("bois")) return "Bois Massif";
  return "Autre";
};

const mapToMainFamily = (rawCat: string | null | undefined, typeCout: string | null | undefined): string => {
  if (typeCout === "main_oeuvre") return "Main-d'œuvre";
  const cat = (rawCat || "").toLowerCase();
  
  if (cat.includes("ossature") || cat.includes("fixation") || cat.includes("tasseau") || cat.includes("liteau") || cat.includes("bois") || cat.includes("structure") || cat.includes("équerre")) {
    return "Ossature & Fixations";
  }
  if (cat.includes("isol") || cat.includes("etanch") || cat.includes("étanch") || cat.includes("pare-pluie") || cat.includes("membrane")) {
    return "Isolation & Étanchéité";
  }
  if (cat.includes("finition") || cat.includes("profil") || cat.includes("angle") || cat.includes("pliage") || cat.includes("alu") || cat.includes("habillage") || cat.includes("grille") || cat.includes("bavette")) {
    return "Profilés & Finitions";
  }
  if (cat.includes("main") || cat.includes("oeuvre") || cat.includes("prestation") || cat.includes("pose") || cat.includes("heure") || cat.includes("installation")) {
    return "Main-d'œuvre";
  }
  if (cat.includes("bardage") || cat.includes("parement") || cat.includes("composite") || cat.includes("clin") || cat.includes("hpl") || cat.includes("lame") || cat.includes("trespa") || cat.includes("cedral")) {
    return "Parements & Bardages";
  }
  
  return "Parements & Bardages"; // Default fallback
};

export default function CataloguePage() {
  const [ouvrages, setOuvrages] = useState<Ouvrage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("Toutes");
  const [activeSubCategory, setActiveSubCategory] = useState<string>("Tous");
  const [activeFabricant, setActiveFabricant] = useState<string>("All");
  const [typeFiltre, setTypeFiltre] = useState<"tous" | "matiere" | "main_oeuvre">("tous");

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOuvrage, setEditingOuvrage] = useState<Ouvrage | null>(null);
  const [draftInitial, setDraftInitial] = useState<ProductDraft | null>(null);
  const [urlImportInitiale, setUrlImportInitiale] = useState("");
  const [candidatsImport, setCandidatsImport] =
    useState<ProductImportCandidates | null>(null);
  const [importContextKey, setImportContextKey] = useState(0);
  const importTraiteRef = useRef(false);
  const [typeCoutDefaut, setTypeCoutDefaut] = useState<NatureCout>("matiere");
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayCategories = ["Toutes", "Ossature & Fixations", "Isolation & Étanchéité", "Parements & Bardages", "Profilés & Finitions", "Main-d'œuvre"];

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
      setOuvrages((data as unknown as Ouvrage[]) || []);
    }
    setIsLoading(false);
  };

  useEffect(() => {
    fetchCatalogue();

    // L'URL est nettoyée synchroniquement après lecture pour éviter le rejeu
    // du même transfert au montage en mode Strict.
    if (typeof window !== "undefined" && window.location.search && !importTraiteRef.current) {
      const params = new URLSearchParams(window.location.search);
      const url = params.get("importUrl");
      const title = params.get("importTitle");

      if (url || title) {
        importTraiteRef.current = true;
        const draft = emptyBardage();
        draft.designation = title || "";

        setEditingOuvrage(null);
        setDraftInitial(draft);
        setUrlImportInitiale(url || "");
        setCandidatsImport({
          prix: params.get("importPrice") || undefined,
          fabricant: params.get("importFabricant") || undefined,
          reference: params.get("importReference") || undefined,
          unite: params.get("importUnite") || undefined,
          fournisseur: params.get("importFournisseur") || undefined,
        });
        setImportContextKey((key) => key + 1);
        setIsModalOpen(true);

        const adresse = new URL(window.location.href);
        [
          "importUrl",
          "importTitle",
          "importPrice",
          "importFabricant",
          "importReference",
          "importUnite",
          "importFournisseur",
        ].forEach((cle) => adresse.searchParams.delete(cle));
        window.history.replaceState(
          window.history.state,
          "",
          `${adresse.pathname}${adresse.search}${adresse.hash}`
        );
      }
    }
  }, []);

  const handleOpenModal = (ouvrage?: Ouvrage, typeInit?: "main_oeuvre" | "matiere") => {
    setUrlImportInitiale("");
    setCandidatsImport(null);
    setImportContextKey((key) => key + 1);
    if (ouvrage) {
      setEditingOuvrage(ouvrage);
      setTypeCoutDefaut("matiere");
      setDraftInitial(fromRow("BARDAGE", ouvrage));
    } else {
      setEditingOuvrage(null);
      setTypeCoutDefaut(typeInit === "main_oeuvre" ? "main_oeuvre" : "matiere");
      setDraftInitial(null);
    }
    setIsModalOpen(true);
  };

  const handleSave = async (values: ProductDraft) => {
    if (values.kind !== "BARDAGE") return;

    const payload = toInsertPayload(values) as TablesInsert<"catalogue_ouvrages">;

    // On retire les valeurs null/undefined pour ne pas crasher si une colonne
    // n'existe pas encore dans Supabase (comportement historique conservé).
    const propre = Object.fromEntries(
      Object.entries(payload).filter(([, v]) => v != null)
    );

    try {
      let error;
      if (editingOuvrage) {
        ({ error } = await supabase
          .from("catalogue_ouvrages")
          .update(propre as unknown as TablesUpdate<"catalogue_ouvrages">)
          .eq("id", editingOuvrage.id));
      } else {
        ({ error } = await supabase
          .from("catalogue_ouvrages")
          .insert(propre as unknown as TablesInsert<"catalogue_ouvrages">));
      }

      if (error) {
        console.error("Supabase error:", error);
        alert(`Erreur Supabase : ${error.message}\n\nCode : ${error.code}`);
      } else {
        setIsModalOpen(false);
        setEditingOuvrage(null);
        setDraftInitial(null);
        setUrlImportInitiale("");
        setCandidatsImport(null);
        setImportContextKey((key) => key + 1);
        await fetchCatalogue();
      }
    } catch (err) {
      console.error("Erreur inattendue :", err);
      alert("Une erreur inattendue s'est produite. Vérifiez la console.");
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
        const data = results.data as CatalogueItem[];
        let countNew = 0;
        let countUpdated = 0;
        
        for (const row of data) {
          if (!row.designation) continue;
          
          let finalDesignation = row.designation.trim();
          
          const L = row.longueur_mm ? Number(row.longueur_mm) : null;
          const l = row.largeur_mm ? Number(row.largeur_mm) : null;
          const ep = row.epaisseur_mm ? Number(row.epaisseur_mm) : null;

          // Si le produit a des dimensions, on les ajoute au nom pour créer une variante unique
          let dimSuffix = "";
          if (L && l) dimSuffix += `${L}x${l}`;
          if (ep) dimSuffix += dimSuffix ? ` ép.${ep}mm` : `ép.${ep}mm`;
          else if (dimSuffix) dimSuffix += " mm";

          // On évite les doublons si le nom contenait déjà "3000" par exemple
          if (dimSuffix && L && !finalDesignation.includes(String(L))) {
            finalDesignation = `${finalDesignation} — ${dimSuffix}`;
          }

          // Construire le payload de base avec les valeurs du CSV, ou valeurs par défaut si vide
          const pu_ht = Number(row.pu_ht?.replace(',', '.') || 0);
          const prix_ttc = row.prix_ttc ? Number(row.prix_ttc.replace(',', '.')) : Math.round(pu_ht * 1.2 * 100) / 100;
          
          const payload: TablesInsert<"catalogue_ouvrages"> = {
            designation: finalDesignation,
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
            longueur_mm: L,
            largeur_mm: l,
            epaisseur_mm: ep,
          };

          // On retire les nulls pour éviter les crash si base pas à jour
          const cleanPayload = Object.fromEntries(Object.entries(payload).filter(([_, v]) => v != null));

          // Vérifie s'il existe déjà (recherche par la nouvelle designation unique)
          const existing = ouvrages.find(o => o.designation.toLowerCase() === finalDesignation.toLowerCase());
          
          if (existing) {
            const { error } = await supabase.from("catalogue_ouvrages").update(cleanPayload as unknown as TablesUpdate<"catalogue_ouvrages">).eq("id", existing.id);
            if (!error) countUpdated++;
          } else {
            const { error } = await supabase.from("catalogue_ouvrages").insert(cleanPayload as unknown as TablesInsert<"catalogue_ouvrages">);
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
    const mappedCat = mapToMainFamily(o.famille_label || o.categorie, o.type_cout);
    const matchesCat = activeCategory === "Toutes" || mappedCat === activeCategory;
    const matchesSubCat = activeCategory !== "Parements & Bardages" || activeSubCategory === "Tous" || getSousFamille(o) === activeSubCategory;
    const matchesFab = activeFabricant === "All" || o.fabricant === activeFabricant;
    if (!matchesSubCat) return false;
    const matchesType =
      typeFiltre === "tous" ||
      (o.type_cout === undefined || o.type_cout === null ? "matiere" : o.type_cout) === typeFiltre;
    const lowerSearch = searchQuery.toLowerCase();
    const matchesSearch = o.designation.toLowerCase().includes(lowerSearch) ||
      (o.description && o.description.toLowerCase().includes(lowerSearch)) ||
      (o.couleur && o.couleur.toLowerCase().includes(lowerSearch)) ||
      (o.code_decor && o.code_decor.toLowerCase().includes(lowerSearch));
    return matchesCat && matchesFab && matchesType && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-transparent p-4 lg:p-8 text-white">
      <div className="mx-auto max-w-7xl space-y-6">
        <header className="flex flex-col md:flex-row md:items-end justify-between gap-4">
          <div>
            <Link
              href="/bureau"
              className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-400 transition-colors mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour au Bureau
            </Link>
            <h1 className="text-3xl font-bold text-white">Catalogue des Ouvrages</h1>
            <p className="text-sm text-gray-400 mt-1">
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
              className="flex items-center gap-2 rounded-lg bg-[#1E1E1E] px-4 py-2 text-sm font-bold text-white hover:bg-[#1E1E1E] transition-colors disabled:opacity-50"
            >
              {isImporting ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {isImporting ? "Importation..." : "Importer CSV"}
            </button>
            <button
              onClick={() => handleOpenModal(undefined, "main_oeuvre")}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500 transition-colors"
              title="Créer une prestation de main-d'œuvre (pose, dépose, finition…)"
            >
              <Plus className="h-4 w-4" />
              Nouvelle Main-d&apos;œuvre
            </button>
            <button
              onClick={() => handleOpenModal()}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nouvel Ouvrage
            </button>
          </div>
        </header>

        {/* Filtres */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[#1E1E1E]/50 p-4 rounded-xl border border-white/10">
          {/* Catégorie */}
          <div className="flex flex-wrap gap-2">
            {displayCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); setActiveSubCategory("Tous"); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${
                  activeCategory === cat
                    ? "bg-red-600/20 text-gray-400 border border-white/10"
                    : "bg-[#1E1E1E] text-gray-400 border border-white/10 hover:border-slate-500"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {activeCategory === "Parements & Bardages" && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5 mt-2 w-full">
              {["Tous", "Bois Massif", "Lame Composite", "HPL (Trespa/Polyrey)", "Fibrociment"].map((sub) => (
                <button
                  key={sub}
                  onClick={() => setActiveSubCategory(sub)}
                  className={`px-3 py-1 rounded-full text-3xs font-semibold transition-colors ${
                    activeSubCategory === sub
                      ? "bg-cyan-600/20 text-cyan-400 border border-cyan-500/30"
                      : "bg-[#1E1E1E] text-gray-500 border border-white/5 hover:border-slate-600"
                  }`}
                >
                  {sub}
                </button>
              ))}
            </div>
          )}

          {/* Type de prestation */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">Type :</span>
            {(["tous", "matiere", "main_oeuvre"] as const).map((t) => (
              <button
                key={t}
                onClick={() => setTypeFiltre(t)}
                className={`px-3 py-1 rounded-full text-xs font-semibold transition-colors border ${
                  typeFiltre === t
                    ? t === "main_oeuvre"
                      ? "bg-violet-600/30 border-violet-500/50 text-violet-300"
                      : "bg-emerald-600/20 border-emerald-500/40 text-emerald-300"
                    : "bg-[#1E1E1E] text-gray-400 border-white/10 hover:border-slate-500"
                }`}
              >
                {t === "tous" ? "Tous" : t === "matiere" ? "Matériaux" : "Main-d'œuvre"}
              </button>
            ))}
          </div>
          {/* Fabricant */}
          <div className="flex items-center gap-2">
            <label htmlFor="chp-fabricant" className="text-xs text-gray-400">Fabricant</label>
            <select id="chp-fabricant"
              value={activeFabricant}
              onChange={(e) => setActiveFabricant(e.target.value)}
              className="rounded border border-slate-600 bg-transparent p-1 text-xs text-gray-200"
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
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Rechercher (couleur / code décor)..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-transparent py-2 pl-9 pr-4 text-sm text-gray-200 outline-none focus:border-white/10"
            />
          </div>

          {/* Reset Filters Button */}
          <button
            type="button"
            onClick={() => {
              setSearchQuery('');
              setActiveFabricant('All');
              setActiveCategory('Toutes');
              setActiveSubCategory('Tous');
              setTypeFiltre('tous');
            }}
            className="ml-2 rounded bg-[#1E1E1E] px-3 py-1 text-xs text-gray-200 hover:bg-[#1E1E1E]"
          >
            Réinitialiser
          </button>
        </div>

        {/* Liste */}
        {isLoading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/10 border-t-transparent"></div>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredOuvrages.map((o) => (
              <div key={o.id} className={`flex flex-col rounded-xl border p-5 transition-colors ${o.type_cout === "main_oeuvre" ? "border-violet-500/40 bg-violet-500/[0.06] hover:border-violet-500/60" : "border-white/10 bg-[#1E1E1E]/50 hover:border-white/10"}`}>
                <div className="flex justify-between items-start mb-2">
                  <div className="flex flex-col gap-1">
                    <span
                      className={`inline-block px-2 py-1 text-2xs font-bold uppercase tracking-wider rounded w-fit ${
                        o.type_cout === "main_oeuvre"
                          ? "bg-violet-600/30 text-violet-300"
                          : "bg-emerald-600/20 text-emerald-300"
                      }`}
                    >
                      {o.type_cout === "main_oeuvre" ? "Main-d'œuvre" : "Matériau"}
                    </span>
                    <span className="inline-block px-2 py-1 bg-[#1E1E1E] text-gray-300 text-2xs font-bold uppercase tracking-wider rounded w-fit">
                      {mapToMainFamily(o.famille_label || o.categorie, o.type_cout)}
                    </span>
                  </div>
                  <div className="flex gap-2">
                    <button onClick={() => handleOpenModal(o)} className="text-gray-500 hover:text-gray-400" aria-label={`Modifier ${o.designation}`}>
                      <Edit2 className="h-4 w-4" />
                    </button>
                    <button onClick={() => handleDelete(o.id)} className="text-gray-500 hover:text-rose-400" aria-label={`Supprimer ${o.designation}`}>
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
                <h3 className="font-bold text-gray-200 text-sm leading-tight mb-1">
                  {o.designation}
                </h3>
                {(() => {
                  let text = null;

                  if (o.dimensions_disponibles && o.dimensions_disponibles.length > 0) {
                    const eps = Array.from(new Set(o.dimensions_disponibles.map(d => d.epaisseur_mm).filter(Boolean)));
                    const longs = Array.from(new Set(o.dimensions_disponibles.map(d => d.longueur_mm).filter(Boolean)));
                    // Simple formatting for multiple lengths
                    if (eps.length === 1 && longs.length > 1) {
                      text = `Ép : ${eps[0]} mm | Longueurs dispo : ${longs.map(l => (l! / 1000) + 'm').join(', ')}`;
                    } else if (o.dimensions_disponibles.length === 1) {
                      const d = o.dimensions_disponibles[0];
                      const dims = [];
                      if (d.longueur_mm) dims.push(d.longueur_mm);
                      if (d.largeur_mm) dims.push(d.largeur_mm);
                      if (dims.length === 0 && d.epaisseur_mm) {
                        text = `Ép : ${d.epaisseur_mm} mm`;
                      } else if (dims.length > 0) {
                        if (d.epaisseur_mm) dims.push(d.epaisseur_mm);
                        text = `Dim : ${dims.join(" x ")} mm`;
                      }
                    } else {
                      text = `${o.dimensions_disponibles.length} formats disponibles`;
                    }
                  } else {
                    // Fallback to legacy
                    const dims = [];
                    if (o.longueur_mm) dims.push(o.longueur_mm);
                    if (o.largeur_mm) dims.push(o.largeur_mm);
                    if (dims.length === 0 && o.epaisseur_mm) {
                      text = `Ép : ${o.epaisseur_mm} mm`;
                    } else if (dims.length > 0) {
                      if (o.epaisseur_mm) dims.push(o.epaisseur_mm);
                      text = `Dim : ${dims.join(" x ")} mm`;
                    }
                  }

                  return text ? (
                    <p className="text-3xs text-gray-400 font-mono mb-2 opacity-90">
                      {text}
                    </p>
                  ) : <div className="mb-2"></div>;
                })()}
                <p className="text-xs text-gray-500 line-clamp-3 mb-4 flex-grow">
                  {o.description}
                </p>
                <div className="mt-auto flex items-end justify-between border-t border-white/10 pt-3">
                  <span className="text-xs font-medium text-gray-500">Unité : {o.unite}</span>
                  {o.type_cout === "main_oeuvre" ? (
                    <div className="flex flex-col items-end gap-0.5">
                      <span className="text-xs font-medium text-violet-300/80">
                        Revient : {fmtEuro(o.pu_revient ?? 0)} HT
                      </span>
                      <span className="text-lg font-black text-gray-200">{fmtEuro(o.pu_ht)} HT</span>
                    </div>
                  ) : (
                    <>
                      <span className="text-lg font-black text-gray-400">{fmtEuro(o.pu_ht)} HT</span>
                      {o.prix_ttc !== undefined && (
                        <span className="text-sm font-medium text-gray-400">{fmtEuro(o.prix_ttc)} TTC</span>
                      )}
                    </>
                  )}
                </div>
              </div>
            ))}
            {filteredOuvrages.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-500">
                Aucun ouvrage trouvé pour cette recherche.
              </div>
            )}
          </div>
        )}

        {/* Modal Ajout/Édition (composant générique partagé) */}
        <ProductFormModal
          open={isModalOpen}
          type="BARDAGE"
          initial={draftInitial}
          importInitialUrl={urlImportInitiale}
          importCandidates={candidatsImport}
          importContextKey={importContextKey}
          typeCoutDefaut={typeCoutDefaut}
          onClose={() => {
            setIsModalOpen(false);
            setEditingOuvrage(null);
            setDraftInitial(null);
            setUrlImportInitiale("");
            setCandidatsImport(null);
            setImportContextKey((key) => key + 1);
          }}
          onSave={handleSave}
        />
      </div>
    </div>
  );
}

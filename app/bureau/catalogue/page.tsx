"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import { Plus, Edit2, Trash2, Search, ArrowLeft, Save, X, Upload } from "lucide-react";
import Link from "next/link";
import { fmtEuro } from "@/lib/financeCalculs";
import Papa from "papaparse";
import type { CatalogueItem } from "@/types/finance";
import type { TablesInsert, TablesUpdate } from "@/types/supabase";

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

type FormState = Omit<Ouvrage, "id" | "pu_ht" | "pu_revient" | "prix_ttc"> & {
  pu_ht: string;
  pu_revient: string;
  prix_ttc: string;
  type_cout: string;
};

const emptyForm: FormState = {
  categorie: "Parements & Bardages",
  famille_label: "Parements & Bardages",
  designation: "",
  description: "",
  designation_devis: "",
  fabricant: "",
  gamme: "",
  code_decor: "",
  couleur: "",
  code_ral: "",
  finition: "",
  longueur_mm: null,
  largeur_mm: null,
  epaisseur_mm: null,
  dimensions_disponibles: [],
  fournisseur: "",
  unite: "m²",
  pu_ht: "",
  pu_revient: "",
  type_cout: "matiere",
  prix_ttc: "",
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
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<FormState>(emptyForm);
  const [importUrl, setImportUrl] = useState("");
  const [isScraping, setIsScraping] = useState(false);

  const [activeTab, setActiveTab] = useState<"general" | "dimensions" | "tarifs">("general");

  const set = (field: keyof FormState, value: FormState[keyof FormState]) =>
    setFormData((prev) => ({ ...prev, [field]: value }));


  const displayCategories = ["Toutes", "Ossature & Fixations", "Isolation & Étanchéité", "Parements & Bardages", "Profilés & Finitions", "Main-d'œuvre"];

  const handleScrapeUrl = async () => {
    if (!importUrl) return;
    setIsScraping(true);
    try {
      const res = await fetch(`/api/scrape?url=${encodeURIComponent(importUrl)}`);
      if (!res.ok) throw new Error("Erreur de scraping");
      const data = await res.json();
      
      setFormData(prev => {
        // Préparation des dimensions
        let newDims = prev.dimensions_disponibles ? [...prev.dimensions_disponibles] : [];
        if (data.longueur_mm || data.largeur_mm || data.epaisseur_mm) {
          if (newDims.length === 0) {
            newDims.push({
              longueur_mm: data.longueur_mm,
              largeur_mm: data.largeur_mm,
              epaisseur_mm: data.epaisseur_mm
            });
          } else {
            // Remplace la première dimension si elle était vide
            newDims[0] = {
              longueur_mm: data.longueur_mm || newDims[0].longueur_mm,
              largeur_mm: data.largeur_mm || newDims[0].largeur_mm,
              epaisseur_mm: data.epaisseur_mm || newDims[0].epaisseur_mm,
            };
          }
        }

        return {
          ...prev,
          designation: data.designation || prev.designation,
          description: data.description || prev.description,
          designation_devis: data.designation_devis || prev.designation_devis,
          code_ral: data.code_ral || prev.code_ral,
          fabricant: data.fabricant || prev.fabricant,
          fournisseur: data.fournisseur || prev.fournisseur,
          prix_ttc: data.prix_ttc ? String(data.prix_ttc).replace(".", ",") : prev.prix_ttc,
          pu_ht: data.prix_ttc ? (data.prix_ttc / 1.2).toFixed(2).replace(".", ",") : prev.pu_ht,
          dimensions_disponibles: newDims
        };
      });
      alert("✅ Données importées ! Vérifiez et ajustez si besoin.");
    } catch (err) {
      console.error(err);
      alert("❌ Impossible de lire cette page. Certains sites bloquent l'accès automatique.");
    } finally {
      setIsScraping(false);
    }
  };

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

    // Vérifier s'il y a un import via le Favori (Bookmarklet)
    if (typeof window !== "undefined" && window.location.search) {
      const params = new URLSearchParams(window.location.search);
      const url = params.get('importUrl');
      const title = params.get('importTitle');
      const price = params.get('importPrice');

      if (url || title) {
        const textToSearch = `${url || ''} ${title || ''}`.toLowerCase();
        let epaisseur_mm = null;
        let largeur_mm = null;
        let longueur_mm = null;

        const dim3 = textToSearch.match(/(\d+[.,]?\d*)\s*[x*-]\s*(\d+[.,]?\d*)\s*[x*-]\s*(\d+[.,]?\d*)/);
        if (dim3) {
          const v1 = parseFloat(dim3[1].replace(',', '.'));
          const v2 = parseFloat(dim3[2].replace(',', '.'));
          const v3 = parseFloat(dim3[3].replace(',', '.'));
          const sorted = [v1, v2, v3].sort((a, b) => a - b);
          epaisseur_mm = sorted[0];
          largeur_mm = sorted[1];
          longueur_mm = sorted[2];
        } else {
          const dim2 = textToSearch.match(/(\d+[.,]?\d*)\s*[x*]\s*(\d+[.,]?\d*)/);
          if (dim2) {
            const v1 = parseFloat(dim2[1].replace(',', '.'));
            const v2 = parseFloat(dim2[2].replace(',', '.'));
            longueur_mm = Math.max(v1, v2);
            largeur_mm = Math.min(v1, v2);
          }
          const epMatch = textToSearch.match(/(?:ep|epaisseur|ép|épaisseur)\s*[-_:]?\s*(\d+[.,]?\d*)/);
          if (epMatch) {
            epaisseur_mm = parseFloat(epMatch[1].replace(',', '.'));
          } else {
            const mmMatch = textToSearch.match(/(?<![x*\d])(\d+[.,]?\d*)\s*mm/);
            if (mmMatch) epaisseur_mm = parseFloat(mmMatch[1].replace(',', '.'));
          }
        }
        if (longueur_mm !== null && longueur_mm > 0 && longueur_mm < 10) longueur_mm *= 1000;
        if (largeur_mm !== null && largeur_mm > 0 && largeur_mm < 10) largeur_mm *= 1000;
        if (longueur_mm !== null && longueur_mm >= 10 && longueur_mm <= 100) longueur_mm *= 10;
        if (largeur_mm !== null && largeur_mm >= 10 && largeur_mm <= 100) largeur_mm *= 10;

        let fournisseur = '';
        const lowerUrl = (url || '').toLowerCase();
        if (lowerUrl.includes('leroymerlin')) fournisseur = 'Leroy Merlin';
        else if (lowerUrl.includes('castorama')) fournisseur = 'Castorama';
        else if (lowerUrl.includes('bricoman')) fournisseur = 'Bricoman';
        else if (lowerUrl.includes('pointp')) fournisseur = 'Point.P';
        else if (lowerUrl.includes('dispano')) fournisseur = 'Dispano';
        else if (lowerUrl.includes('manomano')) fournisseur = 'ManoMano';

        const parsedPriceTtc = price ? parseFloat(price.replace(',', '.')) : null;

        setFormData(prev => ({
            ...prev,
            designation: title || "",
            fournisseur: fournisseur,
            prix_ttc: parsedPriceTtc !== null ? String(parsedPriceTtc).replace(".", ",") : "",
            pu_ht: parsedPriceTtc !== null ? (parsedPriceTtc / 1.2).toFixed(2).replace(".", ",") : "",
            dimensions_disponibles: (longueur_mm || largeur_mm || epaisseur_mm) ? [{ longueur_mm, largeur_mm, epaisseur_mm }] : []
        }));
        
        setIsModalOpen(true);
        // Nettoyer l'URL pour éviter que ça se rouvre au rafraîchissement
        window.history.replaceState({}, document.title, window.location.pathname);
      }
    }
  }, []);

  const handleOpenModal = (ouvrage?: Ouvrage, typeInit?: "main_oeuvre" | "matiere") => {
    if (ouvrage) {
      setEditingOuvrage(ouvrage);
      const { id, ...rest } = ouvrage;
      
      // Migration à la volée des anciennes dimensions vers le tableau
      const dims = rest.dimensions_disponibles ? [...rest.dimensions_disponibles] : [];
      if (dims.length === 0 && (rest.longueur_mm || rest.largeur_mm || rest.epaisseur_mm)) {
        dims.push({
          longueur_mm: rest.longueur_mm,
          largeur_mm: rest.largeur_mm,
          epaisseur_mm: rest.epaisseur_mm
        });
      }
      
      setFormData({
        ...emptyForm,
        ...rest,
        pu_ht: rest.pu_ht != null ? String(rest.pu_ht).replace(".", ",") : "",
        pu_revient: rest.pu_revient != null ? String(rest.pu_revient).replace(".", ",") : "",
        prix_ttc: rest.prix_ttc != null ? String(rest.prix_ttc).replace(".", ",") : "",
        dimensions_disponibles: dims,
      });
    } else {
      setEditingOuvrage(null);
      setFormData({ ...emptyForm, type_cout: typeInit === "main_oeuvre" ? "main_oeuvre" : "matiere" });
    }
    setActiveTab("general");
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

    const numericRevient = formData.pu_revient != null && String(formData.pu_revient).trim() !== ""
      ? parseFloat(String(formData.pu_revient).replace(',', '.'))
      : null;

    // Coercition numérique stricte pour éviter tout rejet Supabase
    const dimensionsFormatted = (formData.dimensions_disponibles || []).map(d => ({
      longueur_mm: d.longueur_mm != null && String(d.longueur_mm) !== "" ? Number(d.longueur_mm) : null,
      largeur_mm: d.largeur_mm != null && String(d.largeur_mm) !== "" ? Number(d.largeur_mm) : null,
      epaisseur_mm: d.epaisseur_mm != null && String(d.epaisseur_mm) !== "" ? Number(d.epaisseur_mm) : null,
    }));

    // --- Nommage intelligent : ajout des dimensions à la désignation si non présentes ---
    let finalDesignation = formData.designation.trim();
    const L = formData.longueur_mm != null ? Number(formData.longueur_mm) : null;
    const l = formData.largeur_mm != null ? Number(formData.largeur_mm) : null;
    const ep = formData.epaisseur_mm != null ? Number(formData.epaisseur_mm) : null;

    let dimSuffix = "";
    if (L && l) dimSuffix += `${L}x${l}`;
    if (ep) dimSuffix += dimSuffix ? ` ép.${ep}mm` : `ép.${ep}mm`;
    else if (dimSuffix) dimSuffix += " mm";

    if (dimSuffix && L && !finalDesignation.includes(String(L))) {
      finalDesignation = `${finalDesignation} — ${dimSuffix}`;
    }
    // ----------------------------------------------------------------------------------

    const rawPayload = {
      ...formData,
      designation: finalDesignation,
      pu_ht: numericHt,
      pu_revient: numericRevient,
      type_cout: formData.type_cout === "main_oeuvre" ? "main_oeuvre" : "matiere",
      prix_ttc: numericTtc,
      longueur_mm: formData.longueur_mm != null ? Number(formData.longueur_mm) : null,
      largeur_mm: formData.largeur_mm != null ? Number(formData.largeur_mm) : null,
      epaisseur_mm: formData.epaisseur_mm != null ? Number(formData.epaisseur_mm) : null,
      dimensions_disponibles: dimensionsFormatted,
      // Chaînes optionnelles : null plutôt que "" pour Supabase
      fabricant: formData.fabricant?.trim() || null,
      gamme: formData.gamme?.trim() || null,
      code_decor: formData.code_decor?.trim() || null,
      couleur: formData.couleur?.trim() || null,
      code_ral: formData.code_ral?.trim() || null,
      finition: formData.finition?.trim() || null,
      fournisseur: formData.fournisseur?.trim() || null,
      description: formData.description?.trim() || null,
      designation_devis: formData.designation_devis?.trim() || null,
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
          .update(payload as unknown as TablesUpdate<"catalogue_ouvrages">)
          .eq("id", editingOuvrage.id));
      } else {
        ({ error } = await supabase
          .from("catalogue_ouvrages")
          .insert(payload as unknown as TablesInsert<"catalogue_ouvrages">));
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
              className="flex items-center gap-2 rounded-lg bg-[#1A1D24] px-4 py-2 text-sm font-bold text-white hover:bg-[#1A1D24] transition-colors disabled:opacity-50"
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
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[#1A1D24]/50 p-4 rounded-xl border border-white/10">
          {/* Catégorie */}
          <div className="flex flex-wrap gap-2">
            {displayCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => { setActiveCategory(cat); setActiveSubCategory("Tous"); }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${
                  activeCategory === cat
                    ? "bg-red-600/20 text-gray-400 border border-white/10"
                    : "bg-[#1A1D24] text-gray-400 border border-white/10 hover:border-slate-500"
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
                      : "bg-[#1A1D24] text-gray-500 border border-white/5 hover:border-slate-600"
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
                    : "bg-[#1A1D24] text-gray-400 border-white/10 hover:border-slate-500"
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
            className="ml-2 rounded bg-[#1A1D24] px-3 py-1 text-xs text-gray-200 hover:bg-[#1A1D24]"
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
              <div key={o.id} className={`flex flex-col rounded-xl border p-5 transition-colors ${o.type_cout === "main_oeuvre" ? "border-violet-500/40 bg-violet-500/[0.06] hover:border-violet-500/60" : "border-white/10 bg-[#1A1D24]/50 hover:border-white/10"}`}>
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
                    <span className="inline-block px-2 py-1 bg-[#1A1D24] text-gray-300 text-2xs font-bold uppercase tracking-wider rounded w-fit">
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

        {/* Modal Ajout/Edition */}
        {isModalOpen && (
          <div className="fixed inset-0 z-[210] flex items-center justify-center p-2 bg-black/80 backdrop-blur-sm">
            <div className="w-full max-w-2xl rounded-xl border border-white/10 bg-transparent shadow-2xl flex flex-col max-h-[92vh]">
              {/* Header fixe */}
              <div className="flex items-center justify-between p-4 border-b border-gray-700 shrink-0">
                <h2 className="text-xl font-bold text-white">
                  {editingOuvrage
                    ? formData.type_cout === "main_oeuvre"
                      ? "Modifier la main-d'œuvre"
                      : "Modifier le matériau"
                    : formData.type_cout === "main_oeuvre"
                      ? "Nouvelle Main-d'œuvre"
                      : "Nouveau matériau"}
                </h2>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-400 hover:text-white" aria-label="Fermer">
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Onglets de navigation */}
              <div className="flex px-4 pt-2 border-b border-gray-700/50 space-x-4 bg-[#1A1D24]">
                <button
                  type="button"
                  onClick={() => setActiveTab('general')}
                  className={`pb-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'general' ? 'border-cyan-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                >
                  Général
                </button>
                {formData.type_cout === 'matiere' && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('dimensions')}
                    className={`pb-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'dimensions' ? 'border-cyan-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                  >
                    Dimensions & Décor
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setActiveTab('tarifs')}
                  className={`pb-2 text-sm font-medium border-b-2 transition-colors ${activeTab === 'tarifs' ? 'border-cyan-500 text-white' : 'border-transparent text-gray-500 hover:text-gray-300'}`}
                >
                  Tarifs
                </button>
              </div>

              {/* Formulaire avec scroll séparé et footer statique */}
              <form onSubmit={handleSave} className="flex-1 flex flex-col overflow-hidden">
                <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-3">
                
                {activeTab === 'general' && (
                <>
                {/* ── Auto-remplissage ─────────── */}
                {formData.type_cout === "matiere" && (
                <div className="bg-cyan-900/20 border border-cyan-500/30 p-4 rounded-lg">
                  <label htmlFor="chp-auto-remplir-via-une-adresse-web-optionnel" className="block text-xs font-semibold text-cyan-400 mb-2">
                    ⚡ Auto-remplir via une adresse Web (Optionnel)
                  </label>
                  <div className="flex gap-2">
                    <input id="chp-auto-remplir-via-une-adresse-web-optionnel"
                      type="url"
                      placeholder="Collez l'URL d'un produit (Leroy Merlin, Point.P...)"
                      value={importUrl}
                      onChange={(e) => setImportUrl(e.target.value)}
                      className="flex-1 rounded border border-cyan-500/50 bg-transparent p-2 text-sm text-white focus:border-cyan-400"
                    />
                    <button
                      type="button"
                      onClick={handleScrapeUrl}
                      disabled={isScraping || !importUrl}
                      className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-white rounded text-sm font-bold disabled:opacity-50 flex items-center gap-2"
                    >
                      {isScraping ? "Recherche..." : "Importer"}
                    </button>
                  </div>
                  <p className="text-2xs text-cyan-300 mt-2 opacity-70">
                    Copiez le lien depuis votre navigateur mobile et collez-le ici.
                  </p>
                </div>
                )}

                {/* ── Type de prestation : Matériau / Main-d'œuvre ───────── */}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label htmlFor="chp-type-de-prestation" className="block text-xs font-semibold text-gray-400 mb-1">Type de prestation</label>
                    <select id="chp-type-de-prestation"
                      value={formData.type_cout}
                      onChange={(e) => set("type_cout", e.target.value === "main_oeuvre" ? "main_oeuvre" : "matiere")}
                      className={`w-full rounded border bg-transparent p-2 text-sm text-white ${
                        formData.type_cout === "main_oeuvre"
                          ? "border-violet-500/60 text-violet-300"
                          : "border-slate-600"
                      }`}
                    >
                      <option value="matiere">Matériau (fourniture)</option>
                      <option value="main_oeuvre">Main-d'œuvre (prestation)</option>
                    </select>
                  </div>
                  <div>
                    <label htmlFor="chp-famille-professionnelle" className={`block text-xs font-semibold mb-1 ${formData.type_cout === "main_oeuvre" ? "text-violet-300" : "text-gray-400"}`}>
                      Famille Professionnelle
                    </label>
                    <select id="chp-famille-professionnelle"
                      required
                      value={formData.famille_label}
                      onChange={(e) => {
                        set("famille_label", e.target.value);
                        set("categorie", e.target.value);
                      }}
                      className={`w-full rounded border bg-transparent p-2 text-sm text-white ${formData.type_cout === "main_oeuvre" ? "border-violet-500/40" : "border-slate-600"}`}
                    >
                      <option value="">Sélectionner une famille</option>
                      <option value="Ossature & Fixations">Ossature & Fixations</option>
                      <option value="Isolation & Étanchéité">Isolation & Étanchéité</option>
                      <option value="Parements & Bardages">Parements & Bardages</option>
                      <option value="Profilés & Finitions">Profilés & Finitions</option>
                      <option value="Main-d'œuvre">Main-d'œuvre</option>
                    </select>
                  </div>
                </div>

                {formData.type_cout === "matiere" ? (
                  <>
                  {/* ── En-tête : Désignation ─────────── */}
                  <div className="grid grid-cols-1 gap-3">
                    <div>
                      <label htmlFor="chp-designation-titre-de-la-fiche" className="block text-xs font-semibold text-gray-400 mb-1">Désignation (titre de la fiche)</label>
                      <input id="chp-designation-titre-de-la-fiche"
                        required
                        type="text"
                        placeholder="ex&nbsp;: Trespa Meteon – Blanc Ménuires B015"
                        value={formData.designation ?? ""}
                        onChange={(e) => set("designation", e.target.value)}
                        className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white"
                      />
                    </div>
                  </div>
                  <div>
                    <label htmlFor="chp-description-courte-pour-la-carte" className="block text-xs font-semibold text-gray-400 mb-1">Description (courte, pour la carte)</label>
                    <textarea id="chp-description-courte-pour-la-carte"
                      rows={2}
                      placeholder="ex : Panneau HPL avec fixation apparente..."
                      value={formData.description ?? ""}
                      onChange={(e) => set("description", e.target.value)}
                      className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="chp-designation-complete-pour-le-devis-normes-dtu-acermi" className="block text-xs font-semibold text-cyan-400 mb-1">Désignation complète pour le devis (Normes DTU, ACERMI...)</label>
                    <textarea id="chp-designation-complete-pour-le-devis-normes-dtu-acermi"
                      rows={3}
                      placeholder="ex : Panneaux stratifiés compacts (HPL) conformes à la norme EN 438..."
                      value={formData.designation_devis ?? ""}
                      onChange={(e) => set("designation_devis", e.target.value)}
                      className="w-full rounded border border-cyan-500/40 bg-transparent p-2 text-sm text-white"
                    />
                  </div>
                  </>
                ) : (
                  <>
                  <div>
                    <label htmlFor="chp-designation-titre-de-la-fiche-2" className="block text-xs font-semibold text-violet-300 mb-1">Désignation (titre de la fiche)</label>
                    <input id="chp-designation-titre-de-la-fiche-2"
                      required
                      type="text"
                      placeholder="ex&nbsp;: Pose vêture HPL"
                      value={formData.designation ?? ""}
                      onChange={(e) => set("designation", e.target.value)}
                      className="w-full rounded border border-violet-500/40 bg-transparent p-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="chp-description-detail-de-la-prestation" className="block text-xs font-semibold text-gray-400 mb-1">Description (détail de la prestation)</label>
                    <textarea id="chp-description-detail-de-la-prestation"
                      rows={2}
                      placeholder="ex&nbsp;: Pose des panneaux vêture HPL sur ossature bois, fixation inox, finition soignée."
                      value={formData.description ?? ""}
                      onChange={(e) => set("description", e.target.value)}
                      className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white"
                    />
                  </div>
                  <div>
                    <label htmlFor="chp-designation-complete-pour-le-devis-normes-dtu-acermi-2" className="block text-xs font-semibold text-violet-300 mb-1">Désignation complète pour le devis (Normes DTU, ACERMI...)</label>
                    <textarea id="chp-designation-complete-pour-le-devis-normes-dtu-acermi-2"
                      rows={3}
                      placeholder="ex : Pose de panneaux selon la norme DTU 41.2, avec fixations agrées..."
                      value={formData.designation_devis ?? ""}
                      onChange={(e) => set("designation_devis", e.target.value)}
                      className="w-full rounded border border-violet-500/40 bg-transparent p-2 text-sm text-white"
                    />
                  </div>
                </>
                )}
                </>
                )}

                {activeTab === 'tarifs' && formData.type_cout === 'main_oeuvre' && (
                <>
                  {/* ── Section Prestation : Unité + Prix vente + Coût de revient ── */}
                  <div role="group" aria-labelledby="grp-prestation-vente-cout-de-revient" className="rounded-lg border border-violet-500/40 p-3 space-y-3">
                    <div id="grp-prestation-vente-cout-de-revient" className="px-2 text-xs font-bold uppercase tracking-widest text-violet-300">
                      Prestation · Vente &amp; Coût de revient
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="chp-unite-de-vente" className="block text-xs font-semibold text-gray-400 mb-1">Unité de vente</label>
                        <select id="chp-unite-de-vente"
                          required
                          value={formData.unite}
                          onChange={(e) => set("unite", e.target.value)}
                          className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white"
                        >
                          <option value="m²">m²</option>
                          <option value="ml">ml</option>
                          <option value="unité">Unité</option>
                          <option value="U">U (Unité)</option>
                          <option value="heure">Heure</option>
                          <option value="forfait">Forfait</option>
                        </select>
                      </div>
                      <div>
                        <label htmlFor="chp-prix-de-vente-ht-pu-ht" className="block text-xs font-semibold text-gray-400 mb-1">Prix de vente HT (€) — pu_ht</label>
                        <input id="chp-prix-de-vente-ht-pu-ht"
                          required
                          type="text"
                          inputMode="decimal"
                          placeholder="0.00"
                          value={formData.pu_ht}
                          onChange={(e) => {
                            const val = e.target.value;
                            const numericHt = parseFloat(val.replace(',', '.')) || 0;
                            setFormData((prev) => ({
                              ...prev,
                              pu_ht: val,
                              prix_ttc: val.trim() === "" ? "" : (numericHt * 1.2).toFixed(2).replace(".", ",")
                            }));
                          }}
                          className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white"
                        />
                      </div>
                    </div>

                    <div>
                      <label htmlFor="chp-cout-de-revient-ht-pu-revient-optionnel" className="block text-xs font-semibold text-gray-400 mb-1">
                        Coût de revient HT (€) — pu_revient
                        <span className="ml-1 text-2xs font-normal text-gray-500">(optionnel)</span>
                      </label>
                      <input id="chp-cout-de-revient-ht-pu-revient-optionnel"
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={formData.pu_revient}
                        onChange={(e) => set("pu_revient", e.target.value)}
                        className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white"
                      />
                    </div>
                    {(() => {
                      const vente = parseFloat(String(formData.pu_ht).replace(',', '.')) || 0;
                      const revient = parseFloat(String(formData.pu_revient).replace(',', '.')) || 0;
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
                  </>
                )}


                {/* ── Sections matériau (masquées en mode Main-d'œuvre) ─── */}
                {activeTab === 'dimensions' && formData.type_cout === "matiere" && (
                <>
                {/* ── Section 1 : Marque & Décor ─────────────────────────── */}
                <div role="group" aria-labelledby="grp-1-marque-decor" className="rounded-lg border border-slate-600 p-3 space-y-3">
                  <div id="grp-1-marque-decor" className="px-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                    1 · Marque &amp; Décor
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="chp-fabricant-2" className="block text-xs font-semibold text-gray-400 mb-1">Fabricant</label>
                      <input id="chp-fabricant-2"
                        type="text"
                        placeholder="ex&nbsp;: Polyrey, Trespa"
                        value={formData.fabricant ?? ""}
                        onChange={(e) => set("fabricant", e.target.value)}
                        className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="chp-gamme-sous-famille" className="block text-xs font-semibold text-gray-400 mb-1">Gamme / Sous-Famille</label>
                      {formData.famille_label === "Parements & Bardages" ? (
                        <select id="chp-gamme-sous-famille"
                          value={formData.gamme ?? ""}
                          onChange={(e) => set("gamme", e.target.value)}
                          className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white"
                        >
                          <option value="">Sélectionner...</option>
                          <option value="Bois Massif">Bois Massif</option>
                          <option value="Lame Composite">Lame Composite</option>
                          <option value="HPL (Trespa/Polyrey)">HPL (Trespa/Polyrey)</option>
                          <option value="Fibrociment">Fibrociment</option>
                        </select>
                      ) : (
                        <input id="chp-gamme-sous-famille"
                          type="text"
                          placeholder="ex&nbsp;: Reysipur"
                          value={formData.gamme ?? ""}
                          onChange={(e) => set("gamme", e.target.value)}
                          className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white"
                        />
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="chp-code-decor" className="block text-xs font-semibold text-gray-400 mb-1">Code Décor</label>
                      <input id="chp-code-decor"
                        type="text"
                        placeholder="ex&nbsp;: B015"
                        value={formData.code_decor ?? ""}
                        onChange={(e) => set("code_decor", e.target.value)}
                        className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="chp-nom-couleur-du-decor" className="block text-xs font-semibold text-gray-400 mb-1">Nom / Couleur du Décor</label>
                      <input id="chp-nom-couleur-du-decor"
                        type="text"
                        placeholder="ex&nbsp;: Blanc Ménuires"
                        value={formData.couleur ?? ""}
                        onChange={(e) => set("couleur", e.target.value)}
                        className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="chp-code-ral" className="block text-xs font-semibold text-gray-400 mb-1">Code RAL</label>
                      <input id="chp-code-ral"
                        type="text"
                        placeholder="ex&nbsp;: RAL 7016"
                        value={formData.code_ral ?? ""}
                        onChange={(e) => set("code_ral", e.target.value)}
                        className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="chp-finition" className="block text-xs font-semibold text-gray-400 mb-1">Finition</label>
                      <input id="chp-finition"
                        type="text"
                        placeholder="ex&nbsp;: FA Satin"
                        value={formData.finition ?? ""}
                        onChange={(e) => set("finition", e.target.value)}
                        className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white"
                      />
                    </div>
                  </div>
                </div>

                {/* ── Section 2 : Dimensions & Spécifications ────────────── */}
                <div role="group" aria-labelledby="grp-2-dimensions-specifications" className="rounded-lg border border-slate-600 p-3 space-y-3">
                  <div id="grp-2-dimensions-specifications" className="px-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                    2 · Dimensions &amp; Spécifications
                  </div>

                  <div className="space-y-3">
                    {(formData.dimensions_disponibles || []).map((dim, idx) => (
                      <div key={idx} className="flex items-center gap-3 bg-[#1A1D24]/50 p-3 rounded-lg border border-white/10">
                        <div className="flex-1 grid grid-cols-3 gap-3">
                          <div>
                            <label htmlFor={`chp-longueur-mm-${idx}`} className="block text-2xs uppercase text-gray-500 mb-1">Longueur (mm)</label>
                            <input id={`chp-longueur-mm-${idx}`}
                              type="number"
                              min="0"
                              placeholder="ex: 3050"
                              value={dim.longueur_mm ?? ""}
                              onChange={(e) => {
                                const newDims = [...(formData.dimensions_disponibles || [])];
                                newDims[idx].longueur_mm = e.target.value === "" ? null : parseFloat(e.target.value);
                                setFormData(prev => ({ ...prev, dimensions_disponibles: newDims }));
                              }}
                              className="w-full rounded border border-slate-600 bg-transparent px-2 py-1.5 text-sm text-white"
                            />
                          </div>
                          <div>
                            <label htmlFor={`chp-largeur-mm-${idx}`} className="block text-2xs uppercase text-gray-500 mb-1">Largeur (mm)</label>
                            <input id={`chp-largeur-mm-${idx}`}
                              type="number"
                              min="0"
                              placeholder="ex: 1310"
                              value={dim.largeur_mm ?? ""}
                              onChange={(e) => {
                                const newDims = [...(formData.dimensions_disponibles || [])];
                                newDims[idx].largeur_mm = e.target.value === "" ? null : parseFloat(e.target.value);
                                setFormData(prev => ({ ...prev, dimensions_disponibles: newDims }));
                              }}
                              className="w-full rounded border border-slate-600 bg-transparent px-2 py-1.5 text-sm text-white"
                            />
                          </div>
                          <div>
                            <label htmlFor={`chp-epaisseur-mm-${idx}`} className="block text-2xs uppercase text-gray-500 mb-1">Épaisseur (mm)</label>
                            <input id={`chp-epaisseur-mm-${idx}`}
                              type="number"
                              min="0"
                              step="0.5"
                              placeholder="ex: 6"
                              value={dim.epaisseur_mm ?? ""}
                              onChange={(e) => {
                                const newDims = [...(formData.dimensions_disponibles || [])];
                                newDims[idx].epaisseur_mm = e.target.value === "" ? null : parseFloat(e.target.value);
                                setFormData(prev => ({ ...prev, dimensions_disponibles: newDims }));
                              }}
                              className="w-full rounded border border-slate-600 bg-transparent px-2 py-1.5 text-sm text-white"
                            />
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            const newDims = [...(formData.dimensions_disponibles || [])];
                            newDims.splice(idx, 1);
                            setFormData(prev => ({ ...prev, dimensions_disponibles: newDims }));
                          }}
                          className="mt-5 p-2 text-gray-500 hover:text-rose-400 hover:bg-rose-400/10 rounded-md transition-colors"
                          aria-label={`Supprimer la dimension ${idx + 1}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    ))}
                    
                    <button
                      type="button"
                      onClick={() => {
                        setFormData(prev => ({
                          ...prev,
                          dimensions_disponibles: [
                            ...(prev.dimensions_disponibles || []),
                            { longueur_mm: null, largeur_mm: null, epaisseur_mm: null }
                          ]
                        }));
                      }}
                      className="w-full py-2 border border-dashed border-slate-600 text-gray-400 rounded-lg text-sm hover:text-gray-400 hover:border-white/10 transition-colors flex items-center justify-center gap-2"
                    >
                      <Plus className="h-4 w-4" /> Ajouter une dimension
                    </button>
                  </div>
                </div>
                </>
                )}

                {activeTab === 'tarifs' && formData.type_cout === 'matiere' && (
                  <>

                {/* ── Section 3 : Fournisseur & Tarifs ──────────────────── */}
                <div role="group" aria-labelledby="grp-3-fournisseur-tarifs" className="rounded-lg border border-slate-600 p-3 space-y-3">
                  <div id="grp-3-fournisseur-tarifs" className="px-2 text-xs font-bold uppercase tracking-widest text-gray-400">
                    3 · Fournisseur &amp; Tarifs
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="chp-fournisseur-2" className="block text-xs font-semibold text-gray-400 mb-1">Fournisseur</label>
                      <input id="chp-fournisseur-2"
                        type="text"
                        placeholder="ex&nbsp;: Dispano, Barillet"
                        value={formData.fournisseur ?? ""}
                        onChange={(e) => set("fournisseur", e.target.value)}
                        className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white"
                      />
                    </div>
                    <div>
                      <label htmlFor="chp-unite-de-vente-2" className="block text-xs font-semibold text-gray-400 mb-1">Unité de vente</label>
                      <select id="chp-unite-de-vente-2"
                        required
                        value={formData.unite}
                        onChange={(e) => set("unite", e.target.value)}
                        className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white"
                      >
                        <option value="m²">m²</option>
                        <option value="U">U (Unité)</option>
                        <option value="ml">ml</option>
                        <option value="heure">Heure</option>
                        <option value="forfait">Forfait</option>
                      </select>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="chp-prix-unitaire-ht" className="block text-xs font-semibold text-gray-400 mb-1">Prix Unitaire HT (€)</label>
                      <input id="chp-prix-unitaire-ht"
                        required
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={formData.pu_ht}
                        onChange={(e) => {
                          const val = e.target.value;
                          const numericHt = parseFloat(val.replace(',', '.')) || 0;
                          setFormData((prev) => ({
                            ...prev,
                            pu_ht: val,
                            prix_ttc: val.trim() === "" ? "" : (numericHt * 1.2).toFixed(2).replace(".", ",")
                          }));
                        }}
                        className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white focus:border-white/10 focus:ring-1 focus:ring-cyan-500"
                      />
                    </div>
                    <div>
                      <label htmlFor="chp-cout-de-revient-ht-optionnel" className="block text-xs font-semibold text-gray-400 mb-1">
                        Coût de revient HT (€)
                        <span className="ml-1 text-2xs font-normal text-gray-500">(optionnel)</span>
                      </label>
                      <input id="chp-cout-de-revient-ht-optionnel"
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={formData.pu_revient}
                        onChange={(e) => set("pu_revient", e.target.value)}
                        className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white focus:border-white/10 focus:ring-1 focus:ring-cyan-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label htmlFor="chp-prix-ttc-tva-20" className="block text-xs font-semibold text-gray-400 mb-1">
                        Prix TTC (€)
                        <span className="ml-1 text-2xs font-normal text-gray-500">(TVA 20%)</span>
                      </label>
                      <input id="chp-prix-ttc-tva-20"
                        type="text"
                        inputMode="decimal"
                        placeholder="0.00"
                        value={formData.prix_ttc}
                        onChange={(e) => {
                          const val = e.target.value;
                          const numericTtc = parseFloat(val.replace(',', '.')) || 0;
                          setFormData((prev) => ({
                            ...prev,
                            prix_ttc: val,
                            pu_ht: val.trim() === "" ? "" : (numericTtc / 1.2).toFixed(2).replace(".", ",")
                          }));
                        }}
                        className="w-full rounded border border-slate-600 bg-transparent p-2 text-sm text-white focus:border-white/10 focus:ring-1 focus:ring-cyan-500"
                      />
                    </div>
                  </div>
                </div>
                </>
                )}

                </div> {/* Fin du contenu scrollable */}

                {/* ── Boutons (Static Footer) ─────────────────────────────── */}
                <div className="p-4 border-t border-gray-700 flex justify-end gap-3 mt-auto shrink-0 bg-[#1A1D24] rounded-b-xl z-10">
                  <button
                    type="button"
                    onClick={() => setIsModalOpen(false)}
                    className="rounded-lg px-4 py-2 text-sm font-medium text-gray-300 hover:bg-[#1A1D24] disabled:opacity-50"
                    disabled={isSubmitting}
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

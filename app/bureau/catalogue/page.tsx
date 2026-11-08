"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus,
  Edit2,
  Search,
  ArrowLeft,
  Upload,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Save,
  X,
  Info,
} from "lucide-react";
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
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
import {
  resoudrePrixOuvrage,
  validerMontant,
  type LignePrixResolue,
} from "@/lib/catalogue/resoudrePrix";

function estUuid(value: string | null | undefined): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
  );
}

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
  longueur_mm?: number | null;
  largeur_mm?: number | null;
  epaisseur_mm?: number | null;
  dimensions_disponibles?: DimensionItem[];
  // Fournisseur & Tarifs communs
  fournisseur?: string;
  unite: string;
  pu_ht: number;
  prix_ttc?: number | null;
  pu_revient?: number | null;
  type_cout: string; // 'matiere' | 'main_oeuvre'
};

type OuvrageAvecResolution = Ouvrage & {
  prixResolu: LignePrixResolue;
  aUneSurcharge: boolean;
  surchargePuHt?: number | null;
  surchargePuRevient?: number | null;
};

const getSousFamille = (o: Ouvrage): string => {
  const text = `${o.gamme || ""} ${o.designation || ""}`.toLowerCase();
  if (text.includes("polyrey") || text.includes("trespa") || text.includes("hpl"))
    return "HPL (Trespa/Polyrey)";
  if (text.includes("composite") || text.includes("coextrusion") || text.includes("ligna"))
    return "Lame Composite";
  if (text.includes("james hardie") || text.includes("cedral") || text.includes("fibrociment"))
    return "Fibrociment";
  if (
    text.includes("mélèze") ||
    text.includes("meleze") ||
    text.includes("douglas") ||
    text.includes("sapin") ||
    text.includes("bois")
  )
    return "Bois Massif";
  return "Autre";
};

const mapToMainFamily = (
  rawCat: string | null | undefined,
  typeCout: string | null | undefined
): string => {
  if (typeCout === "main_oeuvre") return "Main-d'œuvre";
  const cat = (rawCat || "").toLowerCase();

  if (
    cat.includes("ossature") ||
    cat.includes("fixation") ||
    cat.includes("tasseau") ||
    cat.includes("liteau") ||
    cat.includes("bois") ||
    cat.includes("structure") ||
    cat.includes("équerre")
  ) {
    return "Ossature & Fixations";
  }
  if (
    cat.includes("isol") ||
    cat.includes("etanch") ||
    cat.includes("étanch") ||
    cat.includes("pare-pluie") ||
    cat.includes("membrane")
  ) {
    return "Isolation & Étanchéité";
  }
  if (
    cat.includes("finition") ||
    cat.includes("profil") ||
    cat.includes("angle") ||
    cat.includes("pliage") ||
    cat.includes("alu") ||
    cat.includes("habillage") ||
    cat.includes("grille") ||
    cat.includes("bavette")
  ) {
    return "Profilés & Finitions";
  }
  if (
    cat.includes("main") ||
    cat.includes("oeuvre") ||
    cat.includes("prestation") ||
    cat.includes("pose") ||
    cat.includes("heure") ||
    cat.includes("installation")
  ) {
    return "Main-d'œuvre";
  }
  if (
    cat.includes("bardage") ||
    cat.includes("parement") ||
    cat.includes("composite") ||
    cat.includes("clin") ||
    cat.includes("hpl") ||
    cat.includes("lame") ||
    cat.includes("trespa") ||
    cat.includes("cedral")
  ) {
    return "Parements & Bardages";
  }

  return "Parements & Bardages";
};

export default function CataloguePage() {
  const [entrepriseId, setEntrepriseId] = useState<string | null>(null);
  const [ouvrages, setOuvrages] = useState<OuvrageAvecResolution[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [activeCategory, setActiveCategory] = useState<string>("Toutes");
  const [activeSubCategory, setActiveSubCategory] = useState<string>("Tous");
  const [activeFabricant, setActiveFabricant] = useState<string>("All");
  const [typeFiltre, setTypeFiltre] = useState<"tous" | "matiere" | "main_oeuvre">("tous");

  // Modal Personnalisation de tarif (propre au tenant)
  const [modalPrixOuvrage, setModalPrixOuvrage] = useState<OuvrageAvecResolution | null>(null);
  const [prixSaisieHt, setPrixSaisieHt] = useState<string>("");
  const [prixSaisieRevient, setPrixSaisieRevient] = useState<string>("");
  const [isSavingPrix, setIsSavingPrix] = useState(false);

  // Modal Ajout/Édition générique conservé pour import CSV / URL (lecture et administration)
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingOuvrage, setEditingOuvrage] = useState<Ouvrage | null>(null);
  const [draftInitial, setDraftInitial] = useState<ProductDraft | null>(null);
  const [urlImportInitiale, setUrlImportInitiale] = useState("");
  const [candidatsImport, setCandidatsImport] = useState<ProductImportCandidates | null>(null);
  const [importContextKey, setImportContextKey] = useState(0);
  const importTraiteRef = useRef(false);
  const [typeCoutDefaut, setTypeCoutDefaut] = useState<NatureCout>("matiere");
  const [isImporting, setIsImporting] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const displayCategories = [
    "Toutes",
    "Ossature & Fixations",
    "Isolation & Étanchéité",
    "Parements & Bardages",
    "Profilés & Finitions",
    "Main-d'œuvre",
  ];

  const fetchCatalogue = async () => {
    setIsLoading(true);
    try {
      const { entreprise_id } = await resoudreContexteEntreprise(null);
      setEntrepriseId(entreprise_id);

      const { data: dataOuvrages, error: errorOuvrages } = await supabase
        .from("catalogue_ouvrages")
        .select("*")
        .order("categorie")
        .order("designation");

      if (errorOuvrages) {
        console.error("Erreur chargement catalogue_ouvrages :", errorOuvrages);
        if (errorOuvrages.code === "42P01") {
          alert("La table 'catalogue_ouvrages' n'existe pas encore. Veuillez exécuter le script SQL fourni.");
        }
        setIsLoading(false);
        return;
      }

      const surchargesMap = new Map<
        string,
        { pu_ht: number | null; pu_revient: number | null }
      >();

      if (estUuid(entreprise_id)) {
        const { data: dataPrix, error: errorPrix } = await supabase
          .from("catalogue_ouvrages_prix")
          .select("ouvrage_id, pu_ht, pu_revient")
          .eq("entreprise_id", entreprise_id);

        if (!errorPrix && dataPrix) {
          for (const sp of dataPrix) {
            surchargesMap.set(sp.ouvrage_id, {
              pu_ht: sp.pu_ht,
              pu_revient: sp.pu_revient,
            });
          }
        }
      }

      const liste = ((dataOuvrages as unknown as Ouvrage[]) || []).map((o) => {
        const surcharge = surchargesMap.get(o.id);
        const prixResolu = resoudrePrixOuvrage(
          { pu_ht: o.pu_ht, pu_revient: o.pu_revient },
          surcharge
        );
        return {
          ...o,
          prixResolu,
          aUneSurcharge: !!surcharge,
          surchargePuHt: surcharge?.pu_ht,
          surchargePuRevient: surcharge?.pu_revient,
        };
      });

      setOuvrages(liste);
    } catch (err) {
      console.error("Erreur inattendue fetchCatalogue :", err);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchCatalogue();

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

  const ouvrirModalPrix = (o: OuvrageAvecResolution) => {
    setModalPrixOuvrage(o);
    setPrixSaisieHt(
      o.surchargePuHt !== undefined && o.surchargePuHt !== null
        ? String(o.surchargePuHt)
        : o.prixResolu.pu_ht !== null
        ? String(o.prixResolu.pu_ht)
        : ""
    );
    setPrixSaisieRevient(
      o.surchargePuRevient !== undefined && o.surchargePuRevient !== null
        ? String(o.surchargePuRevient)
        : o.prixResolu.pu_revient !== null
        ? String(o.prixResolu.pu_revient)
        : ""
    );
  };

  const fermerModalPrix = () => {
    setModalPrixOuvrage(null);
    setPrixSaisieHt("");
    setPrixSaisieRevient("");
  };

  const handleSavePrix = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!modalPrixOuvrage) return;

    if (!estUuid(entrepriseId)) {
      alert(
        "Impossible de personnaliser le tarif : votre session ne contient pas d'entreprise identifiée. Veuillez vous reconnecter."
      );
      return;
    }

    const parsedHt = prixSaisieHt.trim() === "" ? null : validerMontant(prixSaisieHt);
    const parsedRevient =
      prixSaisieRevient.trim() === "" ? null : validerMontant(prixSaisieRevient);

    if (prixSaisieHt.trim() !== "" && parsedHt === null) {
      alert("Le prix de vente HT doit être un nombre positif ou nul.");
      return;
    }
    if (prixSaisieRevient.trim() !== "" && parsedRevient === null) {
      alert("Le coût de revient HT doit être un nombre positif ou nul.");
      return;
    }

    setIsSavingPrix(true);
    try {
      const { error } = await supabase
        .from("catalogue_ouvrages_prix")
        .upsert(
          {
            entreprise_id: entrepriseId,
            ouvrage_id: modalPrixOuvrage.id,
            pu_ht: parsedHt,
            pu_revient: parsedRevient,
            defaut_utilise: false,
            updated_at: new Date().toISOString(),
          },
          { onConflict: "entreprise_id,ouvrage_id" }
        );

      if (error) {
        console.error("Erreur enregistrement tarif personnalisé :", error);
        alert(`Erreur Supabase : ${error.message}\n\nCode : ${error.code}`);
      } else {
        fermerModalPrix();
        await fetchCatalogue();
      }
    } catch (err) {
      console.error("Erreur inattendue enregistrement tarif :", err);
      alert("Une erreur inattendue s'est produite lors de l'enregistrement.");
    } finally {
      setIsSavingPrix(false);
    }
  };

  const handleResetPrix = async (ouvrageId: string) => {
    if (
      !window.confirm(
        "Réinitialiser ce tarif au tarif indicatif commun ? Vos surcharges personnalisées pour cet ouvrage seront supprimées."
      )
    ) {
      return;
    }

    if (!estUuid(entrepriseId)) {
      alert("Impossible de réinitialiser le tarif : session non identifiée.");
      return;
    }

    try {
      const { error } = await supabase
        .from("catalogue_ouvrages_prix")
        .delete()
        .eq("entreprise_id", entrepriseId)
        .eq("ouvrage_id", ouvrageId);

      if (error) {
        console.error("Erreur réinitialisation tarif :", error);
        alert(`Erreur lors de la réinitialisation : ${error.message}`);
      } else {
        if (modalPrixOuvrage?.id === ouvrageId) {
          fermerModalPrix();
        }
        await fetchCatalogue();
      }
    } catch (err) {
      console.error("Erreur inattendue réinitialisation tarif :", err);
      alert("Une erreur inattendue s'est produite.");
    }
  };

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

          let dimSuffix = "";
          if (L && l) dimSuffix += `${L}x${l}`;
          if (ep) dimSuffix += dimSuffix ? ` ép.${ep}mm` : `ép.${ep}mm`;
          else if (dimSuffix) dimSuffix += " mm";

          if (dimSuffix && L && !finalDesignation.includes(String(L))) {
            finalDesignation = `${finalDesignation} — ${dimSuffix}`;
          }

          const pu_ht = Number(row.pu_ht?.replace(",", ".") || 0);
          const prix_ttc = row.prix_ttc
            ? Number(row.prix_ttc.replace(",", "."))
            : Math.round(pu_ht * 1.2 * 100) / 100;

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

          const cleanPayload = Object.fromEntries(
            Object.entries(payload).filter(([_, v]) => v != null)
          );

          const existing = ouvrages.find(
            (o) => o.designation.toLowerCase() === finalDesignation.toLowerCase()
          );

          if (existing) {
            const { error } = await supabase
              .from("catalogue_ouvrages")
              .update(cleanPayload as unknown as TablesUpdate<"catalogue_ouvrages">)
              .eq("id", existing.id);
            if (!error) countUpdated++;
          } else {
            const { error } = await supabase
              .from("catalogue_ouvrages")
              .insert(cleanPayload as unknown as TablesInsert<"catalogue_ouvrages">);
            if (!error) countNew++;
          }
        }

        alert(
          `Import terminé !\n${countNew} nouveaux matériaux créés.\n${countUpdated} matériaux mis à jour.`
        );
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
        fetchCatalogue();
      },
      error: (err) => {
        console.error("Erreur parsing CSV:", err);
        alert("Erreur lors de la lecture du fichier CSV.");
        setIsImporting(false);
        if (fileInputRef.current) fileInputRef.current.value = "";
      },
    });
  };

  const filteredOuvrages = ouvrages.filter((o) => {
    const mappedCat = mapToMainFamily(o.famille_label || o.categorie, o.type_cout);
    const matchesCat = activeCategory === "Toutes" || mappedCat === activeCategory;
    const matchesSubCat =
      activeCategory !== "Parements & Bardages" ||
      activeSubCategory === "Tous" ||
      getSousFamille(o) === activeSubCategory;
    const matchesFab = activeFabricant === "All" || o.fabricant === activeFabricant;
    if (!matchesSubCat) return false;
    const matchesType =
      typeFiltre === "tous" ||
      (o.type_cout === undefined || o.type_cout === null ? "matiere" : o.type_cout) === typeFiltre;
    const lowerSearch = searchQuery.toLowerCase();
    const matchesSearch =
      o.designation.toLowerCase().includes(lowerSearch) ||
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
              className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-gray-300 transition-colors mb-2"
            >
              <ArrowLeft className="h-4 w-4" />
              Retour au Bureau
            </Link>
            <h1 className="text-3xl font-bold text-white">Catalogue des Ouvrages</h1>
            <p className="text-sm text-gray-400 mt-1">
              Référentiel commun avec tarifs et coûts personnalisés pour votre entreprise.
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
              className="flex items-center gap-2 rounded-lg bg-[#1E1E1E] px-4 py-2 text-sm font-bold text-white hover:bg-white/10 transition-colors disabled:opacity-50"
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
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-500 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nouvel Ouvrage
            </button>
          </div>
        </header>

        {/* Bannière explicative Option A */}
        <div className="rounded-xl border border-sky-500/20 bg-sky-950/20 px-4 py-3 text-xs text-sky-200 flex items-start sm:items-center gap-3">
          <Info className="h-5 w-5 shrink-0 text-sky-400 mt-0.5 sm:mt-0" />
          <div className="leading-relaxed">
            <strong className="font-semibold text-sky-300">Mode Multi-Entreprise (Option A) :</strong> Le
            référentiel technique est partagé. Utilisez le bouton d&apos;édition sur un ouvrage pour
            personnaliser votre prix de vente et votre coût de revient. Vos surcharges sont strictement
            isolées et appliquées par défaut à vos devis.
          </div>
        </div>

        {/* Filtres */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[#1E1E1E]/50 p-4 rounded-xl border border-white/10">
          {/* Catégorie */}
          <div className="flex flex-wrap gap-2">
            {displayCategories.map((cat) => (
              <button
                key={cat}
                onClick={() => {
                  setActiveCategory(cat);
                  setActiveSubCategory("Tous");
                }}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors ${
                  activeCategory === cat
                    ? "bg-red-600/20 text-red-400 border border-red-500/30"
                    : "bg-[#1E1E1E] text-gray-400 border border-white/10 hover:border-slate-500"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {activeCategory === "Parements & Bardages" && (
            <div className="flex flex-wrap gap-2 pt-2 border-t border-white/5 mt-2 w-full">
              {["Tous", "Bois Massif", "Lame Composite", "HPL (Trespa/Polyrey)", "Fibrociment"].map(
                (sub) => (
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
                )
              )}
            </div>
          )}

          {/* Type de prestation */}
          <div className="flex items-center gap-2">
            <span className="text-xs text-gray-500 font-semibold uppercase tracking-wide">
              Type :
            </span>
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
            <label htmlFor="chp-fabricant" className="text-xs text-gray-400">
              Fabricant
            </label>
            <select
              id="chp-fabricant"
              value={activeFabricant}
              onChange={(e) => setActiveFabricant(e.target.value)}
              className="rounded border border-slate-600 bg-transparent p-1 text-xs text-gray-200"
            >
              <option value="All" className="bg-[#18181b]">
                Tous
              </option>
              {Array.from(new Set(ouvrages.map((o) => o.fabricant).filter(Boolean)))
                .sort()
                .map((fab) => (
                  <option key={fab} value={fab} className="bg-[#18181b]">
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
              className="w-full rounded-lg border border-slate-600 bg-transparent py-2 pl-9 pr-4 text-sm text-gray-200 outline-none focus:border-white/20"
            />
          </div>

          {/* Reset Filters Button */}
          <button
            type="button"
            onClick={() => {
              setSearchQuery("");
              setActiveFabricant("All");
              setActiveCategory("Toutes");
              setActiveSubCategory("Tous");
              setTypeFiltre("tous");
            }}
            className="ml-2 rounded bg-[#1E1E1E] px-3 py-1 text-xs text-gray-200 hover:bg-white/10"
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
            {filteredOuvrages.map((o) => {
              const resolu = o.prixResolu;
              const hasPuHt = resolu.pu_ht !== null;
              const hasPuRevient = resolu.pu_revient !== null;
              const margeUnitaire = hasPuHt && hasPuRevient ? resolu.pu_ht! - resolu.pu_revient! : null;
              const tauxMarge =
                margeUnitaire !== null && resolu.pu_ht! > 0
                  ? (margeUnitaire / resolu.pu_ht!) * 100
                  : null;

              return (
                <div
                  key={o.id}
                  className={`flex flex-col rounded-xl border p-5 transition-colors ${
                    o.type_cout === "main_oeuvre"
                      ? "border-violet-500/40 bg-violet-500/[0.06] hover:border-violet-500/60"
                      : "border-white/10 bg-[#1E1E1E]/50 hover:border-white/20"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-block px-2 py-0.5 text-2xs font-bold uppercase tracking-wider rounded ${
                          o.type_cout === "main_oeuvre"
                            ? "bg-violet-600/30 text-violet-300"
                            : "bg-emerald-600/20 text-emerald-300"
                        }`}
                      >
                        {o.type_cout === "main_oeuvre" ? "Main-d'œuvre" : "Matériau"}
                      </span>
                      <span className="inline-block px-2 py-0.5 bg-[#1E1E1E] text-gray-300 text-2xs font-bold uppercase tracking-wider rounded">
                        {mapToMainFamily(o.famille_label || o.categorie, o.type_cout)}
                      </span>

                      {/* Statut Tarif Vente */}
                      {resolu.statut_vente === "personnalise" ? (
                        <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-2 py-0.5 text-2xs font-semibold text-emerald-400 border border-emerald-500/30">
                          <CheckCircle2 className="h-3 w-3" />
                          Tarif personnalisé
                        </span>
                      ) : resolu.statut_vente === "indicatif_non_personnalise" ? (
                        <span
                          className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-2 py-0.5 text-2xs font-semibold text-amber-300 border border-amber-500/30"
                          title="Tarif indicatif non personnalisé. Cliquez sur Personnaliser pour adapter le prix de votre entreprise."
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Tarif indicatif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded bg-zinc-700/40 px-2 py-0.5 text-2xs font-semibold text-zinc-300 border border-zinc-600/50">
                          À chiffrer
                        </span>
                      )}

                      {/* Statut Coût Revient */}
                      {resolu.statut_cout === "a_completer" ? (
                        <span
                          className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-2 py-0.5 text-2xs font-semibold text-rose-300 border border-rose-500/30"
                          title="Coût de revient absent : la marge brute restera indicative tant que le coût n'est pas complété."
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Coût manquant
                        </span>
                      ) : o.surchargePuRevient !== undefined && o.surchargePuRevient !== null ? (
                        <span className="inline-block px-1.5 py-0.5 rounded text-3xs font-medium text-sky-400 bg-sky-500/10 border border-sky-500/20">
                          Coût perso
                        </span>
                      ) : (
                        <span className="inline-block px-1.5 py-0.5 rounded text-3xs font-medium text-zinc-400 bg-zinc-700/30">
                          Coût indicatif
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => ouvrirModalPrix(o)}
                        className="text-gray-400 hover:text-white p-1 rounded hover:bg-white/10 transition-colors"
                        title="Personnaliser les tarifs de cet ouvrage pour votre entreprise"
                        aria-label={`Personnaliser les tarifs de ${o.designation}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      {o.aUneSurcharge && (
                        <button
                          onClick={() => handleResetPrix(o.id)}
                          className="text-amber-400/80 hover:text-amber-300 p-1 rounded hover:bg-amber-500/10 transition-colors"
                          title="Réinitialiser au tarif indicatif commun"
                          aria-label={`Réinitialiser le tarif de ${o.designation}`}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <h3 className="font-bold text-gray-200 text-sm leading-tight mb-1">
                    {o.designation}
                  </h3>

                  {(() => {
                    let text = null;

                    if (o.dimensions_disponibles && o.dimensions_disponibles.length > 0) {
                      const eps = Array.from(
                        new Set(o.dimensions_disponibles.map((d) => d.epaisseur_mm).filter(Boolean))
                      );
                      const longs = Array.from(
                        new Set(o.dimensions_disponibles.map((d) => d.longueur_mm).filter(Boolean))
                      );
                      if (eps.length === 1 && longs.length > 1) {
                        text = `Ép : ${eps[0]} mm | Longueurs dispo : ${longs
                          .map((l) => l! / 1000 + "m")
                          .join(", ")}`;
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
                      <p className="text-3xs text-gray-400 font-mono mb-2 opacity-90">{text}</p>
                    ) : (
                      <div className="mb-2"></div>
                    );
                  })()}

                  <p className="text-xs text-gray-500 line-clamp-3 mb-4 flex-grow">
                    {o.description}
                  </p>

                  <div className="mt-auto flex items-end justify-between border-t border-white/10 pt-3">
                    <span className="text-xs font-medium text-gray-500">Unité : {o.unite}</span>
                    <div className="flex flex-col items-end gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-3xs uppercase tracking-wider text-gray-500">Revient :</span>
                        <span
                          className={`text-xs font-medium ${
                            resolu.statut_cout === "a_completer"
                              ? "text-rose-400 italic"
                              : "text-violet-300/80"
                          }`}
                        >
                          {hasPuRevient ? `${fmtEuro(resolu.pu_revient!)} HT` : "Non renseigné"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-3xs uppercase tracking-wider text-gray-500">Vente :</span>
                        <span className="text-lg font-black text-gray-200">
                          {hasPuHt ? `${fmtEuro(resolu.pu_ht!)} HT` : "— HT"}
                        </span>
                      </div>
                      {margeUnitaire !== null ? (
                        <span
                          className={`text-3xs font-medium ${
                            margeUnitaire >= 0 ? "text-emerald-400" : "text-rose-400"
                          }`}
                        >
                          Marge : {fmtEuro(margeUnitaire)} HT ({tauxMarge?.toFixed(1)} %)
                        </span>
                      ) : resolu.statut_cout === "a_completer" ? (
                        <span className="text-3xs text-amber-400/90 font-medium">
                          Marge indicative (coût absent)
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredOuvrages.length === 0 && (
              <div className="col-span-full py-12 text-center text-gray-500">
                Aucun ouvrage trouvé pour cette recherche.
              </div>
            )}
          </div>
        )}

        {/* Modal Personnalisation Tarif Ouvrage pour le Tenant */}
        {modalPrixOuvrage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4">
            <div className="w-full max-w-lg rounded-2xl border border-white/10 bg-[#18181b] p-6 shadow-2xl space-y-5">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="rounded bg-sky-500/10 px-2 py-0.5 text-2xs font-bold text-sky-400 border border-sky-500/20">
                      Tarif Entreprise
                    </span>
                    <span className="text-2xs text-gray-400 font-mono">
                      Unité : {modalPrixOuvrage.unite}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-white leading-snug">
                    {modalPrixOuvrage.designation}
                  </h2>
                </div>
                <button
                  onClick={fermerModalPrix}
                  className="rounded-lg p-1 text-gray-400 hover:bg-white/10 hover:text-white transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Fiche technique commune (Lecture seule) */}
              <div className="rounded-xl border border-white/5 bg-white/[0.02] p-3 text-xs space-y-1.5 text-gray-300">
                <div className="flex justify-between">
                  <span className="text-gray-500">Catégorie :</span>
                  <span className="font-medium text-gray-300">
                    {mapToMainFamily(
                      modalPrixOuvrage.famille_label || modalPrixOuvrage.categorie,
                      modalPrixOuvrage.type_cout
                    )}
                  </span>
                </div>
                {modalPrixOuvrage.fabricant && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Fabricant :</span>
                    <span className="font-medium text-gray-300">{modalPrixOuvrage.fabricant}</span>
                  </div>
                )}
                {modalPrixOuvrage.gamme && (
                  <div className="flex justify-between">
                    <span className="text-gray-500">Gamme :</span>
                    <span className="font-medium text-gray-300">{modalPrixOuvrage.gamme}</span>
                  </div>
                )}
                <div className="border-t border-white/5 pt-2 flex justify-between text-2xs text-gray-400">
                  <span>Tarif indicatif commun : {fmtEuro(modalPrixOuvrage.pu_ht)} HT</span>
                  <span>
                    Coût commun :{" "}
                    {modalPrixOuvrage.pu_revient != null
                      ? `${fmtEuro(modalPrixOuvrage.pu_revient)} HT`
                      : "Non renseigné"}
                  </span>
                </div>
              </div>

              {/* Formulaire de saisie du tarif personnalisé */}
              <form onSubmit={handleSavePrix} className="space-y-4">
                <div>
                  <label
                    htmlFor="saisie-pu-ht"
                    className="block text-xs font-semibold text-gray-300 mb-1"
                  >
                    Prix de vente HT (€ HT / {modalPrixOuvrage.unite})
                  </label>
                  <input
                    id="saisie-pu-ht"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={String(modalPrixOuvrage.pu_ht ?? 0)}
                    value={prixSaisieHt}
                    onChange={(e) => setPrixSaisieHt(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                  />
                  <p className="mt-1 text-3xs text-gray-500">
                    Ce tarif remplacera le prix indicatif commun par défaut dans vos nouveaux devis.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="saisie-pu-revient"
                    className="block text-xs font-semibold text-gray-300 mb-1"
                  >
                    Coût de revient HT (€ HT / {modalPrixOuvrage.unite})
                  </label>
                  <input
                    id="saisie-pu-revient"
                    type="number"
                    step="0.01"
                    min="0"
                    placeholder={
                      modalPrixOuvrage.pu_revient != null
                        ? String(modalPrixOuvrage.pu_revient)
                        : "Non renseigné"
                    }
                    value={prixSaisieRevient}
                    onChange={(e) => setPrixSaisieRevient(e.target.value)}
                    className="w-full rounded-lg border border-slate-600 bg-transparent px-3 py-2 text-sm text-white outline-none focus:border-emerald-500"
                  />
                  <p className="mt-1 text-3xs text-gray-500">
                    Coût d&apos;achat matière ou taux horaire pour calculer précisément vos marges.
                  </p>
                </div>

                {/* Simulation de marge en direct */}
                {(() => {
                  const ht = validerMontant(prixSaisieHt);
                  const revient = validerMontant(prixSaisieRevient);

                  if (ht !== null && revient !== null) {
                    const marge = ht - revient;
                    const taux = ht > 0 ? (marge / ht) * 100 : 0;
                    return (
                      <div className="rounded-lg border border-emerald-500/20 bg-emerald-950/20 p-2.5 text-xs text-emerald-300 flex items-center justify-between">
                        <span>Marge unitaire prévisionnelle :</span>
                        <strong className="font-bold">
                          {fmtEuro(marge)} HT ({taux.toFixed(1)} %)
                        </strong>
                      </div>
                    );
                  } else if (ht !== null && revient === null) {
                    return (
                      <div className="rounded-lg border border-amber-500/20 bg-amber-950/20 p-2.5 text-xs text-amber-300 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-400" />
                        <span>
                          Coût de revient non renseigné : la marge sera signalée comme indicative.
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="flex items-center justify-between pt-2 border-t border-white/10">
                  <div>
                    {modalPrixOuvrage.aUneSurcharge && (
                      <button
                        type="button"
                        onClick={() => handleResetPrix(modalPrixOuvrage.id)}
                        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-2 text-xs font-semibold text-amber-400 hover:bg-amber-500/10 transition-colors"
                      >
                        <RotateCcw className="h-3.5 w-3.5" />
                        Réinitialiser au tarif commun
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={fermerModalPrix}
                      className="rounded-lg border border-white/10 px-4 py-2 text-xs font-medium text-gray-400 hover:bg-white/5 hover:text-white transition-colors"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingPrix}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-500 transition-colors disabled:opacity-50"
                    >
                      {isSavingPrix ? (
                        <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-white border-t-transparent" />
                      ) : (
                        <Save className="h-3.5 w-3.5" />
                      )}
                      Enregistrer mon tarif
                    </button>
                  </div>
                </div>
              </form>
            </div>
          </div>
        )}

        {/* Modal Ajout/Édition générique conservé pour ProductFormModal */}
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

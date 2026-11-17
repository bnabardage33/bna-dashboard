"use client";

import { useEffect, useState, useRef } from "react";
import { supabase } from "@/lib/supabase";
import {
  Plus,
  Edit2,
  Euro,
  Search,
  ArrowLeft,
  Upload,
  RotateCcw,
  AlertTriangle,
  CheckCircle2,
  Save,
  Trash2,
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
import CadencesMainOeuvreSection from "@/components/catalogue/CadencesMainOeuvreSection";
import {
  estContexteOssature,
  GAMME_MATERIAU_CONFIG,
  GAMMES_MATERIAU_ORDRE,
  getGammeBadgeClasses,
  getGammeLibellesContextuels,
  getRalHexColor,
  normaliserGammeMateriau,
  type GammeMateriau,
} from "@/types/catalogue";
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
  gamme_qualite?: GammeMateriau;
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
  const [gammeFiltre, setGammeFiltre] = useState<"toutes" | GammeMateriau>("toutes");

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

  const handleDeleteOuvrage = async (ouvrage: Ouvrage) => {
    if (
      !window.confirm(
        `Supprimer définitivement « ${ouvrage.designation} » du catalogue ?`
      )
    ) {
      return;
    }

    const { error } = await supabase
      .from("catalogue_ouvrages")
      .delete()
      .eq("id", ouvrage.id);

    if (error) {
      console.error("Erreur suppression catalogue_ouvrages :", error);
      if (error.code === "23503") {
        alert(
          `Impossible de supprimer « ${ouvrage.designation} » : cet article est déjà utilisé dans un devis ou un chantier.`
        );
      } else {
        alert(`Impossible de supprimer cet article : ${error.message}`);
      }
      return;
    }

    setOuvrages((prev) => prev.filter((item) => item.id !== ouvrage.id));
    await fetchCatalogue();
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
    const gammeOuvrage = normaliserGammeMateriau(o.gamme_qualite);
    const matchesGamme = gammeFiltre === "toutes" || gammeOuvrage === gammeFiltre;
    const lowerSearch = searchQuery.toLowerCase();
    const matchesSearch =
      o.designation.toLowerCase().includes(lowerSearch) ||
      (o.description && o.description.toLowerCase().includes(lowerSearch)) ||
      (o.fabricant && o.fabricant.toLowerCase().includes(lowerSearch)) ||
      (o.couleur && o.couleur.toLowerCase().includes(lowerSearch)) ||
      (o.code_decor && o.code_decor.toLowerCase().includes(lowerSearch)) ||
      (o.code_ral && o.code_ral.toLowerCase().includes(lowerSearch)) ||
      (o.finition && o.finition.toLowerCase().includes(lowerSearch));
    return matchesCat && matchesFab && matchesType && matchesGamme && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-[#F3F3F1] pb-24 text-[#23272B]">
      <div className="mx-auto max-w-6xl space-y-6 px-4 py-6 sm:px-6">
        <header className="rounded-2xl border border-[#E5E5E5] bg-white p-5 sm:p-6 shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <Link
                href="/bureau"
                className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#777777] hover:text-[#23272B] transition-colors mb-2"
              >
                <ArrowLeft className="h-3.5 w-3.5" />
                Retour au Bureau
              </Link>
              <p className="text-[11px] font-bold uppercase tracking-wider text-[#B85B2B]">
                BNA Pilotage BTP · Catalogue des Ouvrages
              </p>
              <h1 className="text-xl font-bold text-[#23272B]">Catalogue des Ouvrages</h1>
              <p className="text-xs text-[#777777] mt-0.5">
                Référentiel commun Bardage &amp; ITE avec tarifs et coûts personnalisés pour votre entreprise.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
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
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3.5 py-2.5 text-xs font-bold text-[#23272B] hover:bg-white transition-colors disabled:opacity-50"
              >
                {isImporting ? (
                  <span className="h-3.5 w-3.5 animate-spin rounded-full border-2 border-[#B85B2B] border-t-transparent" />
                ) : (
                  <Upload className="h-3.5 w-3.5 text-[#B85B2B]" />
                )}
                {isImporting ? "Importation..." : "Importer CSV"}
              </button>
              <button
                onClick={() => handleOpenModal(undefined, "main_oeuvre")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#B85B2B]/30 bg-[#B85B2B]/10 px-3.5 py-2.5 text-xs font-bold text-[#B85B2B] hover:bg-[#B85B2B]/15 transition-colors"
                title="Créer une prestation de main-d'œuvre (pose, dépose, finition…)"
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvelle Main-d&apos;œuvre
              </button>
              <button
                onClick={() => handleOpenModal()}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#B85B2B] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#9E4B20] transition-colors"
              >
                <Plus className="h-4 w-4" />
                Nouvel Ouvrage
              </button>
            </div>
          </div>

          {/* Filtres */}
          <div className="mt-5 space-y-3 pt-4 border-t border-[#F0F0F0]">
            {/* Catégorie */}
            <div className="flex flex-wrap gap-1.5">
              {displayCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => {
                    setActiveCategory(cat);
                    setActiveSubCategory("Tous");
                  }}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all ${
                    activeCategory === cat
                      ? "bg-[#B85B2B] text-white"
                      : "bg-[#F8F9FA] text-[#666666] hover:text-[#23272B]"
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>

            {activeCategory === "Parements & Bardages" && (
              <div className="flex flex-wrap gap-1.5 pt-2 border-t border-[#F0F0F0]">
                {["Tous", "Bois Massif", "Lame Composite", "HPL (Trespa/Polyrey)", "Fibrociment"].map(
                  (sub) => (
                    <button
                      key={sub}
                      onClick={() => setActiveSubCategory(sub)}
                      className={`rounded-full px-3 py-1 text-[11px] font-semibold transition-colors border ${
                        activeSubCategory === sub
                          ? "border-[#B85B2B] bg-[#B85B2B]/10 text-[#B85B2B]"
                          : "border-[#E5E5E5] bg-[#F8F9FA] text-[#666666] hover:text-[#23272B]"
                      }`}
                    >
                      {sub}
                    </button>
                  )
                )}
              </div>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3">
              {/* Type de prestation */}
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-[11px] text-[#777777] font-bold uppercase tracking-wider mr-1">
                  Type :
                </span>
                {(["tous", "matiere", "main_oeuvre"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setTypeFiltre(t)}
                    className={`rounded-full px-3 py-1 text-xs font-semibold transition-colors border ${
                      typeFiltre === t
                        ? "border-[#23272B] bg-[#23272B] text-white"
                        : "border-[#E5E5E5] bg-[#F8F9FA] text-[#666666] hover:text-[#23272B]"
                    }`}
                  >
                    {t === "tous" ? "Tous" : t === "matiere" ? "Matériaux" : "Main-d'œuvre"}
                  </button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {/* Fabricant */}
                <select
                  id="chp-fabricant"
                  aria-label="Fabricant"
                  value={activeFabricant}
                  onChange={(e) => setActiveFabricant(e.target.value)}
                  className="rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3 py-2 text-xs text-[#23272B] focus:border-[#B85B2B] focus:bg-white focus:outline-none"
                >
                  <option value="All">Tous fabricants</option>
                  {Array.from(new Set(ouvrages.map((o) => o.fabricant).filter(Boolean)))
                    .sort()
                    .map((fab) => (
                      <option key={fab} value={fab}>
                        {fab}
                      </option>
                    ))}
                </select>

                {/* Filtre Gamme Qualité */}
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
                  className="rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3 py-2 text-xs text-[#23272B] outline-none focus:border-[#B85B2B] focus:bg-white"
                >
                  <option value="toutes">Toutes gammes</option>
                  {GAMMES_MATERIAU_ORDRE.map((g) => (
                    <option key={g} value={g}>
                      {GAMME_MATERIAU_CONFIG[g].labelClient}
                    </option>
                  ))}
                </select>

                {/* Recherche texte */}
                <div className="relative w-full sm:w-64">
                  <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#999999]" />
                  <input
                    type="text"
                    placeholder="Rechercher (couleur / code décor)..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] py-2 pl-9 pr-4 text-xs text-[#23272B] outline-none focus:border-[#B85B2B] focus:bg-white"
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
                    setGammeFiltre("toutes");
                  }}
                  className="rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3 py-2 text-xs font-semibold text-[#666666] hover:bg-white hover:text-[#23272B]"
                >
                  Réinitialiser
                </button>
              </div>
            </div>
          </div>
        </header>

        <CadencesMainOeuvreSection metier="bardage" />

        {/* Bannière explicative Option A */}
        <div className="rounded-2xl border border-sky-200 bg-sky-50/70 px-4 py-3 text-xs text-[#23272B] flex items-start sm:items-center gap-3">
          <Info className="h-5 w-5 shrink-0 text-sky-600 mt-0.5 sm:mt-0" />
          <div className="leading-relaxed">
            <strong className="font-bold text-sky-900">Mode Multi-Entreprise (Option A) :</strong> Le
            référentiel technique est partagé. Utilisez le bouton d&apos;édition sur un ouvrage pour
            personnaliser votre prix de vente et votre coût de revient. Vos surcharges sont strictement
            isolées et appliquées par défaut à vos devis.
          </div>
        </div>

        {/* Liste */}
        {isLoading ? (
          <div className="flex h-32 items-center justify-center rounded-2xl border border-[#E5E5E5] bg-white">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E5E5] border-t-[#B85B2B]"></div>
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
                  className={`flex flex-col rounded-2xl border p-5 shadow-xs transition-colors ${
                    o.type_cout === "main_oeuvre"
                      ? "border-[#B85B2B]/30 bg-white hover:border-[#B85B2B]/60"
                      : "border-[#E5E5E5] bg-white hover:border-[#B85B2B]/40"
                  }`}
                >
                  <div className="flex justify-between items-start mb-2 gap-2">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span
                        className={`inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${
                          o.type_cout === "main_oeuvre"
                            ? "border-[#B85B2B]/25 bg-[#B85B2B]/10 text-[#B85B2B]"
                            : "border-emerald-200 bg-emerald-50 text-emerald-700"
                        }`}
                      >
                        {o.type_cout === "main_oeuvre" ? "Main-d'œuvre" : "Matériau"}
                      </span>
                      <span className="inline-block px-2 py-0.5 border border-[#E5E5E5] bg-[#F8F9FA] text-[#555555] text-[10px] font-bold uppercase tracking-wider rounded-full">
                        {mapToMainFamily(o.famille_label || o.categorie, o.type_cout)}
                      </span>

                      {/* Statut Tarif Vente */}
                      {resolu.statut_vente === "personnalise" ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[10px] font-semibold text-emerald-700 border border-emerald-200">
                          <CheckCircle2 className="h-3 w-3" />
                          Tarif personnalisé
                        </span>
                      ) : resolu.statut_vente === "indicatif_non_personnalise" ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold text-amber-800 border border-amber-200"
                          title="Tarif indicatif non personnalisé. Cliquez sur Personnaliser pour adapter le prix de votre entreprise."
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Tarif indicatif
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-[#F8F9FA] px-2 py-0.5 text-[10px] font-semibold text-[#666666] border border-[#E5E5E5]">
                          À chiffrer
                        </span>
                      )}

                      {(() => {
                        const gammeNorm = normaliserGammeMateriau(o.gamme_qualite);
                        const ctxGamme = estContexteOssature({
                          categorie: o.categorie,
                          famille: o.famille_label,
                          designation: o.designation,
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

                      {/* Statut Coût Revient */}
                      {resolu.statut_cout === "a_completer" ? (
                        <span
                          className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-semibold text-red-700 border border-red-200"
                          title="Coût de revient absent : la marge brute restera indicative tant que le coût n'est pas complété."
                        >
                          <AlertTriangle className="h-3 w-3" />
                          Coût manquant
                        </span>
                      ) : o.surchargePuRevient !== undefined && o.surchargePuRevient !== null ? (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium text-sky-700 bg-sky-50 border border-sky-200">
                          Coût perso
                        </span>
                      ) : (
                        <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-medium text-[#777777] bg-[#F8F9FA] border border-[#E5E5E5]">
                          Coût indicatif
                        </span>
                      )}
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenModal(o);
                        }}
                        className="text-[#888888] hover:text-[#23272B] p-1 rounded-lg hover:bg-[#F3F3F1] transition-colors"
                        title="Modifier la fiche produit complète"
                        aria-label={`Modifier la fiche de ${o.designation}`}
                      >
                        <Edit2 className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          ouvrirModalPrix(o);
                        }}
                        className="text-[#888888] hover:text-[#B85B2B] p-1 rounded-lg hover:bg-[#B85B2B]/10 transition-colors"
                        title="Tarif entreprise (surcharge rapide)"
                        aria-label={`Personnaliser les tarifs de ${o.designation}`}
                      >
                        <Euro className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteOuvrage(o);
                        }}
                        className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                        title="Supprimer cet article"
                        aria-label="Supprimer"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                      {o.aUneSurcharge && (
                        <button
                          onClick={() => handleResetPrix(o.id)}
                          className="text-amber-600 hover:text-amber-700 p-1 rounded-lg hover:bg-amber-50 transition-colors"
                          title="Réinitialiser au tarif indicatif commun"
                          aria-label={`Réinitialiser le tarif de ${o.designation}`}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </button>
                      )}
                    </div>
                  </div>

                  <h3 className="font-bold text-[#23272B] text-sm leading-tight mb-1">
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
                      <p className="text-[11px] text-[#666666] font-mono mb-2">{text}</p>
                    ) : (
                      <div className="mb-2"></div>
                    );
                  })()}

                  {(o.couleur || o.code_decor || o.code_ral || o.finition) && (() => {
                    const ralHex = getRalHexColor(o.code_ral);
                    const decorLabel = o.couleur || o.code_decor;
                    const parts: React.ReactNode[] = [];
                    if (decorLabel) {
                      parts.push(<span key="decor">Décor : {decorLabel}</span>);
                    }
                    if (o.code_ral) {
                      parts.push(
                        <span key="ral" className="font-mono font-semibold text-[#23272B]">
                          {/^ral/i.test(o.code_ral.trim()) ? o.code_ral.trim() : `RAL ${o.code_ral.trim()}`}
                        </span>
                      );
                    }
                    if (o.finition) {
                      parts.push(<span key="fin">Finition : {o.finition}</span>);
                    }
                    return (
                      <div className="mb-2 flex flex-wrap items-center gap-1.5 text-[11px] font-medium text-[#444444]">
                        <span className="inline-flex flex-wrap items-center gap-1.5 rounded-md border border-[#E5E5E5] bg-[#F8F9FA] px-2 py-0.5">
                          {ralHex && (
                            <span
                              className="inline-block h-2.5 w-2.5 rounded-full border border-black/25 shrink-0"
                              style={{ backgroundColor: ralHex }}
                              aria-hidden="true"
                            />
                          )}
                          {parts.map((part, idx) => (
                            <span key={idx} className="inline-flex items-center gap-1.5">
                              {idx > 0 && <span className="text-[#AAAAAA]">•</span>}
                              {part}
                            </span>
                          ))}
                        </span>
                      </div>
                    );
                  })()}

                  <p className="text-xs text-[#666666] line-clamp-3 mb-4 flex-grow">
                    {o.description}
                  </p>

                  <div className="mt-auto flex items-end justify-between border-t border-[#F0F0F0] pt-3">
                    <span className="text-xs font-medium text-[#777777]">Unité : {o.unite}</span>
                    <div className="flex flex-col items-end gap-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-wider text-[#777777]">Revient :</span>
                        <span
                          className={`text-xs font-medium ${
                            resolu.statut_cout === "a_completer"
                              ? "text-red-600 italic"
                              : "text-[#555555]"
                          }`}
                        >
                          {hasPuRevient ? `${fmtEuro(resolu.pu_revient!)} HT` : "Non renseigné"}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] uppercase tracking-wider text-[#777777]">Vente :</span>
                        <span className="text-lg font-black text-[#23272B]">
                          {hasPuHt ? `${fmtEuro(resolu.pu_ht!)} HT` : "— HT"}
                        </span>
                      </div>
                      {margeUnitaire !== null ? (
                        <span
                          className={`text-[11px] font-semibold ${
                            margeUnitaire >= 0 ? "text-emerald-700" : "text-red-600"
                          }`}
                        >
                          Marge : {fmtEuro(margeUnitaire)} HT ({tauxMarge?.toFixed(1)} %)
                        </span>
                      ) : resolu.statut_cout === "a_completer" ? (
                        <span className="text-[11px] text-amber-700 font-medium">
                          Marge indicative (coût absent)
                        </span>
                      ) : null}
                    </div>
                  </div>
                </div>
              );
            })}
            {filteredOuvrages.length === 0 && (
              <div className="col-span-full rounded-2xl border border-dashed border-[#E5E5E5] bg-white py-12 text-center text-xs text-[#777777]">
                Aucun ouvrage trouvé pour cette recherche.
              </div>
            )}
          </div>
        )}

        {/* Modal Personnalisation Tarif Ouvrage pour le Tenant */}
        {modalPrixOuvrage && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
            <div className="w-full max-w-lg rounded-2xl border border-[#E5E5E5] bg-white p-6 shadow-xl space-y-5 text-[#23272B]">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="rounded-full bg-[#B85B2B]/10 px-2.5 py-0.5 text-[11px] font-bold text-[#B85B2B] border border-[#B85B2B]/25">
                      Tarif Entreprise
                    </span>
                    <span className="text-xs text-[#777777] font-mono">
                      Unité : {modalPrixOuvrage.unite}
                    </span>
                  </div>
                  <h2 className="text-lg font-bold text-[#23272B] leading-snug">
                    {modalPrixOuvrage.designation}
                  </h2>
                </div>
                <button
                  onClick={fermerModalPrix}
                  className="rounded-lg p-1 text-[#777777] hover:bg-[#F3F3F1] hover:text-[#23272B] transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Fiche technique commune (Lecture seule) */}
              <div className="rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] p-3 text-xs space-y-1.5 text-[#555555]">
                <div className="flex justify-between">
                  <span className="text-[#777777]">Catégorie :</span>
                  <span className="font-semibold text-[#23272B]">
                    {mapToMainFamily(
                      modalPrixOuvrage.famille_label || modalPrixOuvrage.categorie,
                      modalPrixOuvrage.type_cout
                    )}
                  </span>
                </div>
                {modalPrixOuvrage.fabricant && (
                  <div className="flex justify-between">
                    <span className="text-[#777777]">Fabricant :</span>
                    <span className="font-semibold text-[#23272B]">{modalPrixOuvrage.fabricant}</span>
                  </div>
                )}
                {modalPrixOuvrage.gamme && (
                  <div className="flex justify-between">
                    <span className="text-[#777777]">Gamme :</span>
                    <span className="font-semibold text-[#23272B]">{modalPrixOuvrage.gamme}</span>
                  </div>
                )}
                <div className="border-t border-[#E5E5E5] pt-2 flex justify-between text-[11px] text-[#666666]">
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
                    className="block text-xs font-semibold text-[#23272B] mb-1"
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
                    className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3 py-2 text-sm text-[#23272B] outline-none focus:border-[#B85B2B] focus:bg-white"
                  />
                  <p className="mt-1 text-[11px] text-[#777777]">
                    Ce tarif remplacera le prix indicatif commun par défaut dans vos nouveaux devis.
                  </p>
                </div>

                <div>
                  <label
                    htmlFor="saisie-pu-revient"
                    className="block text-xs font-semibold text-[#23272B] mb-1"
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
                    className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3 py-2 text-sm text-[#23272B] outline-none focus:border-[#B85B2B] focus:bg-white"
                  />
                  <p className="mt-1 text-[11px] text-[#777777]">
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
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-2.5 text-xs text-emerald-800 flex items-center justify-between">
                        <span>Marge unitaire prévisionnelle :</span>
                        <strong className="font-bold">
                          {fmtEuro(marge)} HT ({taux.toFixed(1)} %)
                        </strong>
                      </div>
                    );
                  } else if (ht !== null && revient === null) {
                    return (
                      <div className="rounded-xl border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800 flex items-center gap-2">
                        <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
                        <span>
                          Coût de revient non renseigné : la marge sera signalée comme indicative.
                        </span>
                      </div>
                    );
                  }
                  return null;
                })()}

                <div className="flex items-center justify-between pt-3 border-t border-[#E5E5E5]">
                  <div>
                    {modalPrixOuvrage.aUneSurcharge && (
                      <button
                        type="button"
                        onClick={() => handleResetPrix(modalPrixOuvrage.id)}
                        className="inline-flex items-center gap-1.5 rounded-xl px-3 py-2 text-xs font-semibold text-amber-700 hover:bg-amber-50 transition-colors"
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
                      className="rounded-xl border border-[#E5E5E5] bg-white px-4 py-2 text-xs font-semibold text-[#555555] hover:bg-[#F3F3F1] transition-colors"
                    >
                      Annuler
                    </button>
                    <button
                      type="submit"
                      disabled={isSavingPrix}
                      className="inline-flex items-center gap-1.5 rounded-xl bg-[#B85B2B] px-4 py-2 text-xs font-bold text-white hover:bg-[#9E4B20] transition-colors disabled:opacity-50"
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

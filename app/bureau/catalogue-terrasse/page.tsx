"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Edit2, Plus, Search, Trash2 } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
import { fmtEuro } from "@/lib/financeCalculs";
import {
  useCatalogueTerrasse,
  type CatalogueTerrasseAccessoire,
  type CatalogueTerrasseLame,
} from "@/hooks/useCatalogueTerrasse";
import ProductFormModal, {
  type ProductImportCandidates,
} from "@/components/catalogue/ProductFormModal";
import CadencesMainOeuvreSection from "@/components/catalogue/CadencesMainOeuvreSection";
import {
  GAMME_MATERIAU_CONFIG,
  GAMMES_MATERIAU_ORDRE,
  getGammeBadgeClasses,
  normaliserGammeMateriau,
  type GammeMateriau,
} from "@/types/catalogue";
import {
  fromRow,
  toInsertPayload,
  type TerrasseAccessoireInsertPayload,
  type TerrasseLameInsertPayload,
} from "@/components/catalogue/mappers";
import {
  LIBELLES_ACCESSOIRE,
  LIBELLES_TYPE_MATERIAL,
  emptyForType,
  type CatAccessoireTerrasse,
  type NatureCout,
  type ProductDraft,
  type TypeMaterialTerrasse,
} from "@/components/catalogue/types";
import { FOURNITURES_DEFAUT_TERRASSE_MOBILE } from "@/lib/terrasse/catalogueMobileDefaut";

/** Types Terrasse gérés par cette page (sous-ensemble de `CatalogueType`). */
type TypeTerrasse = "TERRASSE_LAME" | "TERRASSE_ACCESSOIRE";

/**
 * Onglets = « flux de travail chantier » : la lame d'abord, puis les
 * accessoires regroupés par fonction métier (structure, préparation, fixations),
 * et enfin les prestations de main-d'œuvre (`type_cout === "main_oeuvre"`).
 */
type FiltreOnglet =
  | "tout"
  | "lames"
  | "structure"
  | "preparation"
  | "fixations"
  | "terrasse_mobile"
  | "prestations";

/**
 * Groupe métier d'un accessoire MATÉRIEL. Les prestations sont exclues : elles
 * ne sont pas réparties par groupe mais affichées dans leur propre onglet.
 */
type GroupeAccessoire = Exclude<FiltreOnglet, "tout" | "lames" | "prestations">;

const ONGLETS: { id: FiltreOnglet; libelle: string }[] = [
  { id: "tout", libelle: "Tout" },
  { id: "lames", libelle: "Lames" },
  { id: "structure", libelle: "Structure" },
  { id: "preparation", libelle: "Préparation" },
  { id: "fixations", libelle: "Fixations" },
  { id: "terrasse_mobile", libelle: "Terrasse Mobile & Motorisation" },
  { id: "prestations", libelle: "Prestations" },
];

const LIBELLES_GROUPES: Record<GroupeAccessoire, string> = {
  structure: "Structure",
  preparation: "Préparation",
  fixations: "Fixations",
  terrasse_mobile: "Terrasse Mobile & Motorisation",
};

/**
 * Catégorie pré-remplie à la création depuis un onglet métier — valeurs de
 * l'ENUM DB existant uniquement (cf. `CatAccessoireTerrasse`). Chaque groupe
 * métier a désormais un défaut, pour un préremplissage cohérent d'un onglet
 * à l'autre.
 */
const CATEGORIE_DEFAUT_GROUPE: Record<GroupeAccessoire, CatAccessoireTerrasse> = {
  structure: "LAMBOURDE",
  preparation: "GEOTEXTILE",
  fixations: "CLIP",
  terrasse_mobile: "TERRASSE_MOBILE",
};

const GROUPE_PAR_DEFAUT: GroupeAccessoire = "fixations";

/**
 * Mappe une catégorie accessoire (enum DB ou texte libre) vers le groupe
 * métier du flux chantier. Tout ce qui n'est pas reconnu (dont `BANDEROLE`
 * et les valeurs vides) atterrit dans « fixations ».
 */
function getGroupeMetier(categorie: string | null): GroupeAccessoire {
  if (!categorie) return GROUPE_PAR_DEFAUT; // Défaut sûr
  const c = categorie.toUpperCase();

  // Terrasse Mobile & Motorisation
  if (["TERRASSE_MOBILE", "MOTORISATION"].includes(c)) return "terrasse_mobile";

  // Structure porteuse
  if (["LAMBOURDE", "SOLIVE", "PLOT"].includes(c)) return "structure";

  // Préparation du sol
  if (["GEOTEXTILE", "GRAVIER", "CONCASSE", "DALLE_BETON"].includes(c)) return "preparation";

  // Fixations & divers (repli)
  return "fixations";
}

/**
 * Une ligne est une prestation de main-d'œuvre si `type_cout` vaut
 * « main_oeuvre ». Toute autre valeur — dont `null` (base pré-migration) et
 * `undefined` — est traitée comme un accessoire matériel.
 */
const estPrestation = (a: CatalogueTerrasseAccessoire): boolean =>
  a.type_cout === "main_oeuvre";

const etiquetteLame = (l: CatalogueTerrasseLame): string =>
  l.designation || l.essence || "Lame sans désignation";

const dimensionsLame = (l: CatalogueTerrasseLame): string | null => {
  const dims = [l.longueur_mm, l.largeur_utile_mm, l.epaisseur_mm].filter(
    (v): v is number => v != null
  );
  return dims.length ? `${dims.join(" × ")} mm` : null;
};

const libelleTypeMaterial = (v: string | null): string =>
  v && v in LIBELLES_TYPE_MATERIAL
    ? LIBELLES_TYPE_MATERIAL[v as TypeMaterialTerrasse]
    : "Type non défini";

const libelleCategorieAccessoire = (v: string | null): string =>
  v && v in LIBELLES_ACCESSOIRE
    ? LIBELLES_ACCESSOIRE[v as CatAccessoireTerrasse]
    : "Catégorie non définie";

export default function CatalogueTerrassePage() {
  const { lames, accessoires, loading, error, refetch } = useCatalogueTerrasse();

  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<FiltreOnglet>("tout");
  const [filtreMateriau, setFiltreMateriau] = useState("All");
  const [filtreGamme, setFiltreGamme] = useState<"toutes" | GammeMateriau>("toutes");

  const [modalOuvert, setModalOuvert] = useState(false);
  const [modalType, setModalType] = useState<TypeTerrasse>("TERRASSE_LAME");
  const [draftInitial, setDraftInitial] = useState<ProductDraft | null>(null);
  const [urlImportInitiale, setUrlImportInitiale] = useState("");
  const [candidatsImport, setCandidatsImport] =
    useState<ProductImportCandidates | null>(null);
  const [importContextKey, setImportContextKey] = useState(0);
  const importTraiteRef = useRef(false);
  const [categorieInitiale, setCategorieInitiale] = useState<CatAccessoireTerrasse | null>(null);
  const [typeCoutInitial, setTypeCoutInitial] = useState<NatureCout | undefined>(undefined);
  const [idEnEdition, setIdEnEdition] = useState<string | null>(null);
  const [initialisantMobile, setInitialisantMobile] = useState(false);

  const initialiserFournituresMobile = async () => {
    try {
      setInitialisantMobile(true);
      const { entreprise_id } = await resoudreContexteEntreprise(null);
      if (!entreprise_id) {
        alert("Impossible d'identifier votre entreprise. Veuillez vous reconnecter.");
        return;
      }

      const rowsToInsert = FOURNITURES_DEFAUT_TERRASSE_MOBILE.map((f) => ({
        entreprise_id,
        designation: f.designation,
        description: f.description,
        categorie: "TERRASSE_MOBILE",
        conditionnement: f.conditionnement,
        prix_conditionnement: f.pu_ht,
        unite_mesure: f.unite_mesure,
        pu_ht: f.pu_ht,
        pu_revient: f.pu_revient,
        type_cout: "matiere",
        specifications_dt: { code_article: f.code },
      }));

      const { error } = await supabase
        .from("catalogue_terrasse_accessoires")
        .insert(rowsToInsert as any);

      if (error) {
        console.error("Erreur initialisation fournitures mobile:", error);
        alert(`Erreur: ${error.message}`);
        return;
      }

      refetch();
    } catch (e) {
      console.error(e);
      alert("Erreur lors de l'initialisation des fournitures.");
    } finally {
      setInitialisantMobile(false);
    }
  };

  useEffect(() => {
    if (importTraiteRef.current) return;

    const params = new URLSearchParams(window.location.search);
    const url = params.get("importUrl");
    const titre = params.get("importTitle");
    if (!url && !titre) return;

    importTraiteRef.current = true;
    setModalType("TERRASSE_LAME");
    setDraftInitial({
      ...emptyForType("TERRASSE_LAME"),
      designation: titre || "",
    });
    setCategorieInitiale(null);
    setTypeCoutInitial(undefined);
    setIdEnEdition(null);
    setUrlImportInitiale(url || "");
    setCandidatsImport({
      prix: params.get("importPrice") || undefined,
      fabricant: params.get("importFabricant") || undefined,
      reference: params.get("importReference") || undefined,
      unite: params.get("importUnite") || undefined,
      fournisseur: params.get("importFournisseur") || undefined,
    });
    setImportContextKey((key) => key + 1);
    setModalOuvert(true);

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
  }, []);

  const rechercheBasse = recherche.trim().toLowerCase();

  const lamesFiltrees = useMemo(() => {
    return lames.filter((l) => {
      if (filtreMateriau !== "All" && l.type_material !== filtreMateriau) return false;
      if (filtreGamme !== "toutes" && normaliserGammeMateriau(l.gamme_qualite) !== filtreGamme) {
        return false;
      }
      if (!rechercheBasse) return true;
      const champs = [
        l.designation,
        l.essence,
        l.reference_fournisseur,
        l.fournisseur,
        l.description,
      ]
        .filter((v): v is string => !!v)
        .join(" ")
        .toLowerCase();
      return champs.includes(rechercheBasse);
    });
  }, [lames, filtreMateriau, filtreGamme, rechercheBasse]);

  const accessoiresFiltres = useMemo(() => {
    return accessoires.filter((a) => {
      if (filtreGamme !== "toutes" && normaliserGammeMateriau(a.gamme_qualite) !== filtreGamme) {
        return false;
      }
      if (!rechercheBasse) return true;
      const champs = [
        a.designation,
        a.conditionnement,
        a.unite_mesure,
        a.fournisseur,
        a.description,
      ]
        .filter((v): v is string => !!v)
        .join(" ")
        .toLowerCase();
      return champs.includes(rechercheBasse);
    });
  }, [accessoires, filtreGamme, rechercheBasse]);

  /** Accessoires matériels (hors prestations), répartis par groupe métier. */
  const accessoiresGroupes = useMemo(() => {
    const groupes: Record<GroupeAccessoire, CatalogueTerrasseAccessoire[]> = {
      structure: [],
      preparation: [],
      fixations: [],
      terrasse_mobile: [],
    };
    for (const a of accessoiresFiltres) {
      // Les prestations ne sont pas réparties par groupe : elles ont leur
      // propre onglet (et une section dédiée en vue « Tout »).
      if (estPrestation(a)) continue;
      groupes[getGroupeMetier(a.categorie)].push(a);
    }
    return groupes;
  }, [accessoiresFiltres]);

  /** Prestations de main-d'œuvre (`type_cout === "main_oeuvre"`). */
  const accessoiresPrestations = useMemo(
    () => accessoiresFiltres.filter(estPrestation),
    [accessoiresFiltres]
  );

  const ouvrirCreation = (
    type: TypeTerrasse,
    categorie?: CatAccessoireTerrasse | null,
    typeCout?: NatureCout
  ) => {
    setUrlImportInitiale("");
    setCandidatsImport(null);
    setImportContextKey((key) => key + 1);
    setModalType(type);
    setDraftInitial(null);
    // Préremplissage intelligent : un accessoire créé depuis un onglet métier
    // part avec la catégorie représentative de ce groupe — et depuis l'onglet
    // « Prestations », avec `type_cout: "main_oeuvre"`.
    setCategorieInitiale(type === "TERRASSE_ACCESSOIRE" ? categorie ?? null : null);
    setTypeCoutInitial(type === "TERRASSE_ACCESSOIRE" ? typeCout : undefined);
    setIdEnEdition(null);
    setModalOuvert(true);
  };

  const ouvrirEdition = (type: TypeTerrasse, ligne: unknown) => {
    setUrlImportInitiale("");
    setCandidatsImport(null);
    setImportContextKey((key) => key + 1);
    setModalType(type);
    setDraftInitial(fromRow(type, ligne));
    setCategorieInitiale(null); // L'édition lit la ligne : pas de préremplissage
    setTypeCoutInitial(undefined); // `type_cout` vient lui aussi de la ligne éditée
    setIdEnEdition((ligne as { id: string }).id);
    setModalOuvert(true);
  };

  const fermerModal = () => {
    setModalOuvert(false);
    setDraftInitial(null);
    setCategorieInitiale(null);
    setTypeCoutInitial(undefined);
    setIdEnEdition(null);
    setUrlImportInitiale("");
    setCandidatsImport(null);
    setImportContextKey((key) => key + 1);
  };

  const enregistrer = async (values: ProductDraft) => {
    const { entreprise_id } = await resoudreContexteEntreprise(null);
    if (!entreprise_id) {
      alert("Impossible d'identifier votre entreprise. Veuillez vous reconnecter.");
      return;
    }

    let erreur: { message: string } | null = null;

    if (values.kind === "TERRASSE_LAME") {
      const payload = toInsertPayload(values) as TerrasseLameInsertPayload;
      if (idEnEdition) {
        const { error } = await supabase
          .from("catalogue_terrasse_lames")
          .update(payload)
          .eq("id", idEnEdition)
          .eq("entreprise_id", entreprise_id);
        erreur = error;
      } else {
        const { error } = await supabase
          .from("catalogue_terrasse_lames")
          .insert({ ...payload, entreprise_id });
        erreur = error;
      }
    } else if (values.kind === "TERRASSE_ACCESSOIRE") {
      const payload = toInsertPayload(values) as TerrasseAccessoireInsertPayload;
      if (idEnEdition) {
        const { error } = await supabase
          .from("catalogue_terrasse_accessoires")
          .update(payload)
          .eq("id", idEnEdition)
          .eq("entreprise_id", entreprise_id);
        erreur = error;
      } else {
        const { error } = await supabase
          .from("catalogue_terrasse_accessoires")
          .insert({ ...payload, entreprise_id });
        erreur = error;
      }
    } else {
      // Défensif : le modal est restreint aux deux types Terrasse.
      return;
    }

    if (erreur) {
      console.error("Erreur Supabase :", erreur);
      alert(`Erreur Supabase : ${erreur.message}`);
      return;
    }

    fermerModal();
    refetch();
  };

  const supprimer = async (type: TypeTerrasse, id: string, libelle: string) => {
    if (!window.confirm(`Supprimer « ${libelle} » du catalogue Terrasse ?`)) return;

    const { entreprise_id } = await resoudreContexteEntreprise(null);
    if (!entreprise_id) {
      alert("Impossible d'identifier votre entreprise. Veuillez vous reconnecter.");
      return;
    }

    let erreur: { message: string; code?: string } | null = null;

    if (type === "TERRASSE_LAME") {
      const { error } = await supabase
        .from("catalogue_terrasse_lames")
        .delete()
        .eq("id", id)
        .eq("entreprise_id", entreprise_id);
      erreur = error;
    } else {
      const { error } = await supabase
        .from("catalogue_terrasse_accessoires")
        .delete()
        .eq("id", id)
        .eq("entreprise_id", entreprise_id);
      erreur = error;
    }

    if (erreur) {
      console.error("Erreur Supabase :", erreur);
      if (erreur.code === "23503") {
        alert(
          `Impossible de supprimer « ${libelle} » : cet article est déjà référencé dans un chantier ou un devis.`
        );
      } else {
        alert(`Erreur Supabase : ${erreur.message}`);
      }
      return;
    }
    refetch();
  };

  const afficherLames = filtre === "tout" || filtre === "lames";
  const afficherPrestations = filtre === "tout" || filtre === "prestations";
  const groupesVisibles: GroupeAccessoire[] =
    filtre === "tout"
      ? ["structure", "preparation", "fixations", "terrasse_mobile"]
      : filtre === "lames" || filtre === "prestations"
        ? []
        : [filtre];

  /** Onglet « groupe métier » actif (structure/préparation/fixations/terrasse_mobile), sinon null. */
  const groupeOngletActif: GroupeAccessoire | null =
    filtre === "structure" ||
    filtre === "preparation" ||
    filtre === "fixations" ||
    filtre === "terrasse_mobile"
      ? filtre
      : null;

  /** Catégorie présélectionnée à la création selon l'onglet métier actif. */
  const categorieOngletActif = groupeOngletActif
    ? CATEGORIE_DEFAUT_GROUPE[groupeOngletActif]
    : null;

  /**
   * Carte d'un accessoire — matériel (badge catégorie, prix conditionnement) ou
   * prestation de main-d'œuvre (badge et liseré violets, coût de revient + prix).
   */
  const carteAccessoire = (a: CatalogueTerrasseAccessoire) => {
    const prestation = estPrestation(a);
    const etiquette =
      a.designation ||
      (prestation ? "Prestation sans désignation" : libelleCategorieAccessoire(a.categorie));
    return (
      <div
        key={a.id}
        className={`flex flex-col rounded-2xl border p-5 shadow-xs transition-colors ${
          prestation
            ? "border-[#B85B2B]/30 bg-white hover:border-[#B85B2B]/60"
            : "border-[#E5E5E5] bg-white hover:border-[#B85B2B]/40"
        }`}
      >
        <div className="flex justify-between items-start mb-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <span
              className={`inline-block px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border w-fit ${
                prestation
                  ? "border-[#B85B2B]/25 bg-[#B85B2B]/10 text-[#B85B2B]"
                  : "border-amber-200 bg-amber-50 text-amber-800"
              }`}
            >
              {prestation ? "Main-d'œuvre" : libelleCategorieAccessoire(a.categorie)}
            </span>
            <span
              className={`inline-block rounded-full px-2 py-0.5 text-[10px] ${getGammeBadgeClasses(
                normaliserGammeMateriau(a.gamme_qualite)
              )}`}
              title={GAMME_MATERIAU_CONFIG[normaliserGammeMateriau(a.gamme_qualite)].labelInterne}
            >
              {GAMME_MATERIAU_CONFIG[normaliserGammeMateriau(a.gamme_qualite)].labelClient}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={() => ouvrirEdition("TERRASSE_ACCESSOIRE", a)}
              className="rounded-lg p-1 text-[#888888] hover:bg-[#F3F3F1] hover:text-[#23272B]"
              aria-label={`Modifier ${etiquette}`}
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                supprimer("TERRASSE_ACCESSOIRE", a.id, etiquette);
              }}
              className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
              title="Supprimer cet article"
              aria-label="Supprimer"
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        <h3 className="font-bold text-[#23272B] text-sm leading-tight mb-1">
          {etiquette}
        </h3>
        {!prestation && a.conditionnement && (
          <p className="text-[11px] text-[#666666] font-mono mb-2">
            {a.conditionnement}
          </p>
        )}
        <p className="text-xs text-[#666666] line-clamp-3 mb-4 flex-grow">
          {a.description}
        </p>
        <div className="mt-auto flex items-end justify-between border-t border-[#F0F0F0] pt-3">
          {!prestation && (
            <span className="text-xs font-medium text-[#777777]">
              {a.fournisseur || "Fournisseur non défini"}
            </span>
          )}
          {prestation ? (
            <div className="ml-auto flex flex-col items-end gap-0.5">
              <span className="text-xs font-medium text-[#777777]">
                Revient : {fmtEuro(a.pu_revient ?? 0)} HT
              </span>
              <span className="text-lg font-black text-[#B85B2B]">
                {fmtEuro(a.pu_ht ?? 0)} HT
              </span>
            </div>
          ) : (
            a.prix_conditionnement != null && (
              <span className="text-lg font-black text-[#23272B]">
                {fmtEuro(Number(a.prix_conditionnement))}
              </span>
            )
          )}
        </div>
      </div>
    );
  };

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
                BNA Pilotage BTP · Catalogue Terrasse
              </p>
              <h1 className="text-xl font-bold text-[#23272B]">Catalogue Terrasse</h1>
              <p className="text-xs text-[#777777] mt-0.5">
                Lames, accessoires, prestations main-d&apos;œuvre et kit Terrasse Mobile &amp; Motorisation
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => ouvrirCreation("TERRASSE_ACCESSOIRE", null, "main_oeuvre")}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3.5 py-2.5 text-xs font-bold text-[#23272B] hover:bg-white transition-colors"
                title="Créer une prestation de main-d'œuvre (pose, préparation, finition…)"
              >
                <Plus className="h-3.5 w-3.5 text-[#B85B2B]" />
                Nouvelle Prestation
              </button>
              <button
                onClick={() => ouvrirCreation("TERRASSE_ACCESSOIRE", categorieOngletActif)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-[#B85B2B]/30 bg-[#B85B2B]/10 px-3.5 py-2.5 text-xs font-bold text-[#B85B2B] hover:bg-[#B85B2B]/15 transition-colors"
              >
                <Plus className="h-3.5 w-3.5" />
                Nouvel Accessoire
              </button>
              <button
                onClick={() => ouvrirCreation("TERRASSE_LAME")}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#B85B2B] px-4 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#9E4B20] transition-colors"
              >
                <Plus className="h-4 w-4" />
                Nouvelle Lame
              </button>
            </div>
          </div>

          {/* Filtres */}
          <div className="mt-5 flex flex-col gap-3 pt-4 border-t border-[#F0F0F0] lg:flex-row lg:items-center lg:justify-between">
            <div className="flex flex-wrap gap-1.5">
              {ONGLETS.map((o) => (
                <button
                  key={o.id}
                  onClick={() => setFiltre(o.id)}
                  className={`rounded-lg px-3 py-1.5 text-xs font-semibold capitalize transition-all ${
                    filtre === o.id
                      ? "bg-[#B85B2B] text-white"
                      : "bg-[#F8F9FA] text-[#666666] hover:text-[#23272B]"
                  }`}
                >
                  {o.libelle}
                </button>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {afficherLames && (
                <select
                  id="filtre-materiau"
                  aria-label="Matériau"
                  value={filtreMateriau}
                  onChange={(e) => setFiltreMateriau(e.target.value)}
                  className="rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3 py-2 text-xs text-[#23272B] focus:border-[#B85B2B] focus:bg-white focus:outline-none"
                >
                  <option value="All">Tous matériaux</option>
                  <option value="BOIS_NATUREL">Bois naturel</option>
                  <option value="COMPOSITE">Composite</option>
                  <option value="PVC">PVC</option>
                </select>
              )}

              <select
                id="filtre-gamme-terrasse"
                aria-label="Filtrer par gamme matériau"
                value={filtreGamme}
                onChange={(e) =>
                  setFiltreGamme(
                    e.target.value === "toutes"
                      ? "toutes"
                      : normaliserGammeMateriau(e.target.value)
                  )
                }
                className="rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3 py-2 text-xs text-[#23272B] focus:border-[#B85B2B] focus:bg-white focus:outline-none"
              >
                <option value="toutes">Toutes gammes</option>
                {GAMMES_MATERIAU_ORDRE.map((g) => (
                  <option key={g} value={g}>
                    {GAMME_MATERIAU_CONFIG[g].labelClient}
                  </option>
                ))}
              </select>

              <div className="relative w-full sm:w-64">
                <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-[#999999]" />
                <input
                  type="text"
                  placeholder="Rechercher (essence / référence)..."
                  value={recherche}
                  onChange={(e) => setRecherche(e.target.value)}
                  className="w-full rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] py-2 pl-9 pr-4 text-xs text-[#23272B] outline-none focus:border-[#B85B2B] focus:bg-white"
                />
              </div>

              <button
                type="button"
                onClick={() => {
                  setRecherche("");
                  setFiltre("tout");
                  setFiltreMateriau("All");
                  setFiltreGamme("toutes");
                }}
                className="rounded-xl border border-[#E5E5E5] bg-[#F8F9FA] px-3 py-2 text-xs font-semibold text-[#666666] hover:bg-white hover:text-[#23272B]"
              >
                Réinitialiser
              </button>
            </div>
          </div>
        </header>

        <CadencesMainOeuvreSection metier="terrasse" />

        {error && (
          <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
            Erreur de chargement du catalogue Terrasse : {error}
          </div>
        )}

        {loading ? (
          <div className="flex h-32 items-center justify-center rounded-2xl border border-[#E5E5E5] bg-white">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-[#E5E5E5] border-t-[#B85B2B]" />
          </div>
        ) : (
          <>
            {/* ── Section Lames ─────────────────────────────────────── */}
            {afficherLames && (
              <section className="space-y-3">
                <h2 className="text-base font-bold text-[#23272B] flex items-center gap-2">
                  Lames
                  <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#666666] border border-[#E5E5E5]">
                    {lamesFiltrees.length}
                  </span>
                </h2>
                {lamesFiltrees.length === 0 ? (
                  <div className="rounded-2xl border border-dashed border-[#E5E5E5] bg-white py-12 text-center text-xs text-[#777777]">
                    Aucune lame trouvée pour cette recherche.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {lamesFiltrees.map((l) => {
                      const dims = dimensionsLame(l);
                      return (
                        <div
                          key={l.id}
                          className="flex flex-col rounded-2xl border border-[#E5E5E5] bg-white p-5 shadow-xs transition-colors hover:border-[#B85B2B]/40"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex flex-wrap gap-1.5">
                              <span
                                className={`inline-block px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider rounded-full border w-fit ${
                                  l.type_material === "COMPOSITE"
                                    ? "border-cyan-200 bg-cyan-50 text-cyan-700"
                                    : "border-emerald-200 bg-emerald-50 text-emerald-700"
                                }`}
                              >
                                {libelleTypeMaterial(l.type_material)}
                              </span>
                              {l.essence && (
                                <span className="inline-block px-2.5 py-1 border border-[#E5E5E5] bg-[#F8F9FA] text-[#555555] text-[10px] font-bold uppercase tracking-wider rounded-full w-fit">
                                  {l.essence}
                                </span>
                              )}
                              <span
                                className={`inline-block rounded-full px-2.5 py-1 text-[10px] ${getGammeBadgeClasses(
                                  normaliserGammeMateriau(l.gamme_qualite)
                                )}`}
                                title={GAMME_MATERIAU_CONFIG[normaliserGammeMateriau(l.gamme_qualite)].labelInterne}
                              >
                                {GAMME_MATERIAU_CONFIG[normaliserGammeMateriau(l.gamme_qualite)].labelClient}
                              </span>
                            </div>
                            <div className="flex items-center gap-1">
                              <button
                                onClick={() => ouvrirEdition("TERRASSE_LAME", l)}
                                className="rounded-lg p-1 text-[#888888] hover:bg-[#F3F3F1] hover:text-[#23272B]"
                                aria-label={`Modifier ${etiquetteLame(l)}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  supprimer("TERRASSE_LAME", l.id, etiquetteLame(l));
                                }}
                                className="text-slate-400 hover:text-red-600 hover:bg-red-50 p-1.5 rounded-lg transition-colors"
                                title="Supprimer cet article"
                                aria-label="Supprimer"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <h3 className="font-bold text-[#23272B] text-sm leading-tight mb-1">
                            {etiquetteLame(l)}
                          </h3>
                          {dims && (
                            <p className="text-[11px] text-[#666666] font-mono mb-2">{dims}</p>
                          )}
                          {l.reference_fournisseur && (
                            <p className="text-[11px] text-[#888888] mb-1">
                              Réf. {l.reference_fournisseur}
                            </p>
                          )}
                          <p className="text-xs text-[#666666] line-clamp-3 mb-4 flex-grow">
                            {l.description}
                          </p>
                          <div className="mt-auto flex items-end justify-between border-t border-[#F0F0F0] pt-3">
                            <span className="text-xs font-medium text-[#777777]">
                              {l.fournisseur || "Fournisseur non défini"}
                            </span>
                            <div className="flex flex-col items-end gap-0.5">
                              {l.prix_unitaire_lame != null && (
                                <span className="text-lg font-black text-[#23272B]">
                                  {fmtEuro(Number(l.prix_unitaire_lame))} HT/u
                                </span>
                              )}
                              {l.prix_m2_ht != null && (
                                <span className="text-xs font-semibold text-[#B85B2B]">
                                  {fmtEuro(Number(l.prix_m2_ht))} HT/m²
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </section>
            )}

            {/* ── Sections Accessoires par groupe métier ─────────────── */}
            {groupesVisibles.map((groupe) => {
              const items = accessoiresGroupes[groupe];
              if (filtre === "tout" && items.length === 0) return null;
              return (
                <section key={groupe} className="space-y-3">
                  <h2 className="text-base font-bold text-[#23272B] flex items-center gap-2">
                    {LIBELLES_GROUPES[groupe]}
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#666666] border border-[#E5E5E5]">
                      {items.length}
                    </span>
                  </h2>
                  {items.length === 0 ? (
                    groupe === "terrasse_mobile" ? (
                      <div className="rounded-2xl border border-[#B85B2B]/25 bg-white p-6 text-center space-y-3 shadow-xs">
                        <div className="text-sm font-bold text-[#23272B]">
                          Les 9 références de base Terrasse Mobile &amp; Motorisation (profilés alu, rails inox, galets, moteur 24V, crémaillère, kits solaire/filaire, fins de course, télécommandes) sont prêtes.
                        </div>
                        <p className="text-xs text-[#666666] max-w-xl mx-auto">
                          Initialisez ces 9 références pré-remplies dans votre catalogue pour personnaliser vos prix de vente et vos coûts de revient.
                        </p>
                        <button
                          type="button"
                          disabled={initialisantMobile}
                          onClick={initialiserFournituresMobile}
                          className="inline-flex items-center gap-2 rounded-xl bg-[#B85B2B] px-4 py-2.5 text-xs font-bold text-white hover:bg-[#9E4B20] transition-colors shadow-xs disabled:opacity-50"
                        >
                          <Plus className="h-4 w-4" />
                          {initialisantMobile ? "Initialisation en cours..." : "Pré-remplir les 9 fournitures de référence"}
                        </button>
                      </div>
                    ) : (
                      <div className="rounded-2xl border border-dashed border-[#E5E5E5] bg-white py-12 text-center text-xs text-[#777777]">
                        Aucun accessoire dans « {LIBELLES_GROUPES[groupe]} » pour cette recherche.
                      </div>
                    )
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {items.map(carteAccessoire)}
                    </div>
                  )}
                </section>
              );
            })}

            {/* ── Section Prestations de main-d'œuvre ──────────────────── */}
            {afficherPrestations &&
              (filtre !== "tout" || accessoiresPrestations.length > 0) && (
                <section className="space-y-3">
                  <h2 className="text-base font-bold text-[#23272B] flex items-center gap-2">
                    Prestations
                    <span className="rounded-full bg-white px-2.5 py-0.5 text-[11px] font-semibold text-[#666666] border border-[#E5E5E5]">
                      {accessoiresPrestations.length}
                    </span>
                  </h2>
                  {accessoiresPrestations.length === 0 ? (
                    <div className="rounded-2xl border border-dashed border-[#E5E5E5] bg-white py-12 text-center text-xs text-[#777777]">
                      Aucune prestation pour cette recherche.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {accessoiresPrestations.map(carteAccessoire)}
                    </div>
                  )}
                </section>
              )}
          </>
        )}

        <ProductFormModal
          open={modalOuvert}
          type={modalType}
          initial={draftInitial}
          importInitialUrl={urlImportInitiale}
          importCandidates={candidatsImport}
          importContextKey={importContextKey}
          initialCategorie={categorieInitiale}
          initialTypeCout={typeCoutInitial}
          onClose={fermerModal}
          onSave={enregistrer}
        />
      </div>
    </div>
  );
}

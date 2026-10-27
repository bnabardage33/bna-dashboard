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
  { id: "prestations", libelle: "Prestations" },
];

const LIBELLES_GROUPES: Record<GroupeAccessoire, string> = {
  structure: "Structure",
  preparation: "Préparation",
  fixations: "Fixations",
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
  }, [lames, filtreMateriau, rechercheBasse]);

  const accessoiresFiltres = useMemo(() => {
    if (!rechercheBasse) return accessoires;
    return accessoires.filter((a) => {
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
  }, [accessoires, rechercheBasse]);

  /** Accessoires matériels (hors prestations), répartis par groupe métier. */
  const accessoiresGroupes = useMemo(() => {
    const groupes: Record<GroupeAccessoire, CatalogueTerrasseAccessoire[]> = {
      structure: [],
      preparation: [],
      fixations: [],
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

    let erreur: { message: string } | null = null;

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
      alert(`Erreur Supabase : ${erreur.message}`);
      return;
    }
    refetch();
  };

  const afficherLames = filtre === "tout" || filtre === "lames";
  const afficherPrestations = filtre === "tout" || filtre === "prestations";
  const groupesVisibles: GroupeAccessoire[] =
    filtre === "tout"
      ? ["structure", "preparation", "fixations"]
      : filtre === "lames" || filtre === "prestations"
        ? []
        : [filtre];

  /** Onglet « groupe métier » actif (structure/préparation/fixations), sinon null. */
  const groupeOngletActif: GroupeAccessoire | null =
    filtre === "structure" || filtre === "preparation" || filtre === "fixations"
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
        className={`flex flex-col rounded-xl border p-5 transition-colors ${
          prestation
            ? "border-violet-500/40 bg-violet-500/[0.06] hover:border-violet-500/60"
            : "border-white/10 bg-[#1E1E1E]/50 hover:border-white/10"
        }`}
      >
        <div className="flex justify-between items-start mb-2">
          <span
            className={`inline-block px-2 py-1 text-2xs font-bold uppercase tracking-wider rounded w-fit ${
              prestation ? "bg-violet-600/30 text-violet-300" : "bg-amber-600/20 text-amber-300"
            }`}
          >
            {prestation ? "Main-d'œuvre" : libelleCategorieAccessoire(a.categorie)}
          </span>
          <div className="flex gap-2">
            <button
              onClick={() => ouvrirEdition("TERRASSE_ACCESSOIRE", a)}
              className="text-gray-500 hover:text-gray-400"
              aria-label={`Modifier ${etiquette}`}
            >
              <Edit2 className="h-4 w-4" />
            </button>
            <button
              onClick={() => supprimer("TERRASSE_ACCESSOIRE", a.id, etiquette)}
              className="text-gray-500 hover:text-rose-400"
              aria-label={`Supprimer ${etiquette}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        </div>
        <h3 className="font-bold text-gray-200 text-sm leading-tight mb-1">
          {etiquette}
        </h3>
        {/* Une prestation n'a pas de conditionnement matériel : on masque la
            mention même si des valeurs historiques subsistent dans la ligne
            (vestiges d'une ligne basculée de "matiere" en "main_oeuvre"). */}
        {!prestation && a.conditionnement && (
          <p className="text-3xs text-gray-400 font-mono mb-2 opacity-90">
            {a.conditionnement}
          </p>
        )}
        <p className="text-xs text-gray-500 line-clamp-3 mb-4 flex-grow">
          {a.description}
        </p>
        <div className="mt-auto flex items-end justify-between border-t border-white/10 pt-3">
          {/* Une prestation de main-d'œuvre n'a pas de fournisseur : on masque
              la mention, tandis que matières et accessoires gardent l'affichage
              actuel (valeur saisie ou « Fournisseur non défini »). */}
          {!prestation && (
            <span className="text-xs font-medium text-gray-500">
              {a.fournisseur || "Fournisseur non défini"}
            </span>
          )}
          {prestation ? (
            <div className="flex flex-col items-end gap-0.5">
              <span className="text-xs font-medium text-violet-300/80">
                Revient : {fmtEuro(a.pu_revient ?? 0)} HT
              </span>
              <span className="text-lg font-black text-gray-200">
                {fmtEuro(a.pu_ht ?? 0)} HT
              </span>
            </div>
          ) : (
            a.prix_conditionnement != null && (
              <span className="text-lg font-black text-gray-200">
                {fmtEuro(Number(a.prix_conditionnement))}
              </span>
            )
          )}
        </div>
      </div>
    );
  };

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
            <h1 className="text-3xl font-bold text-white">Catalogue Terrasse</h1>
            <p className="text-sm text-gray-400 mt-1">
              Gérez vos lames et accessoires de terrasse, organisés par groupe
              métier selon le flux de chantier.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              onClick={() => ouvrirCreation("TERRASSE_ACCESSOIRE", null, "main_oeuvre")}
              className="flex items-center gap-2 rounded-lg bg-violet-600 px-4 py-2 text-sm font-bold text-white hover:bg-violet-500 transition-colors"
              title="Créer une prestation de main-d'œuvre (pose, préparation, finition…)"
            >
              <Plus className="h-4 w-4" />
              Nouvelle Prestation
            </button>
            <button
              onClick={() => ouvrirCreation("TERRASSE_ACCESSOIRE", categorieOngletActif)}
              className="flex items-center gap-2 rounded-lg bg-amber-600 px-4 py-2 text-sm font-bold text-white hover:bg-amber-500 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nouvel Accessoire
            </button>
            <button
              onClick={() => ouvrirCreation("TERRASSE_LAME")}
              className="flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-bold text-white hover:bg-red-600 transition-colors"
            >
              <Plus className="h-4 w-4" />
              Nouvelle Lame
            </button>
          </div>
        </header>

        {/* Filtres */}
        <div className="flex flex-col md:flex-row gap-4 items-center justify-between bg-[#1E1E1E]/50 p-4 rounded-xl border border-white/10">
          <div className="flex flex-wrap gap-2">
            {ONGLETS.map((o) => (
              <button
                key={o.id}
                onClick={() => setFiltre(o.id)}
                className={`px-3 py-1.5 rounded-full text-xs font-semibold capitalize transition-colors border ${
                  filtre === o.id
                    ? "bg-red-600/20 text-gray-300 border-white/10"
                    : "bg-[#1E1E1E] text-gray-400 border-white/10 hover:border-slate-500"
                }`}
              >
                {o.libelle}
              </button>
            ))}
          </div>

          {afficherLames && (
            <div className="flex items-center gap-2">
              <label htmlFor="filtre-materiau" className="text-xs text-gray-400">
                Matériau
              </label>
              <select
                id="filtre-materiau"
                value={filtreMateriau}
                onChange={(e) => setFiltreMateriau(e.target.value)}
                className="rounded border border-slate-600 bg-transparent p-1 text-xs text-gray-200"
              >
                <option value="All">Tous</option>
                <option value="BOIS_NATUREL">Bois naturel</option>
                <option value="COMPOSITE">Composite</option>
                <option value="PVC">PVC</option>
              </select>
            </div>
          )}

          <div className="relative w-full md:w-64">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              type="text"
              placeholder="Rechercher (essence / référence)..."
              value={recherche}
              onChange={(e) => setRecherche(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-transparent py-2 pl-9 pr-4 text-sm text-gray-200 outline-none focus:border-white/10"
            />
          </div>

          <button
            type="button"
            onClick={() => {
              setRecherche("");
              setFiltre("tout");
              setFiltreMateriau("All");
            }}
            className="ml-2 rounded bg-[#1E1E1E] px-3 py-1 text-xs text-gray-200 hover:bg-[#1E1E1E]"
          >
            Réinitialiser
          </button>
        </div>

        {error && (
          <div className="rounded-lg border border-rose-500/30 bg-rose-500/10 p-4 text-sm text-rose-300">
            Erreur de chargement du catalogue Terrasse : {error}
          </div>
        )}

        {loading ? (
          <div className="flex h-32 items-center justify-center">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-white/10 border-t-transparent" />
          </div>
        ) : (
          <>
            {/* ── Section Lames ─────────────────────────────────────── */}
            {afficherLames && (
              <section className="space-y-3">
                <h2 className="text-lg font-bold text-white flex items-center gap-2">
                  Lames
                  <span className="rounded-full bg-[#1E1E1E] px-2 py-0.5 text-2xs font-semibold text-gray-400 border border-white/10">
                    {lamesFiltrees.length}
                  </span>
                </h2>
                {lamesFiltrees.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 bg-[#1E1E1E]/30 py-12 text-center text-gray-500">
                    Aucune lame trouvée pour cette recherche.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {lamesFiltrees.map((l) => {
                      const dims = dimensionsLame(l);
                      return (
                        <div
                          key={l.id}
                          className="flex flex-col rounded-xl border border-white/10 bg-[#1E1E1E]/50 p-5 transition-colors hover:border-white/10"
                        >
                          <div className="flex justify-between items-start mb-2">
                            <div className="flex flex-col gap-1">
                              <span
                                className={`inline-block px-2 py-1 text-2xs font-bold uppercase tracking-wider rounded w-fit ${
                                  l.type_material === "COMPOSITE"
                                    ? "bg-cyan-600/20 text-cyan-300"
                                    : "bg-emerald-600/20 text-emerald-300"
                                }`}
                              >
                                {libelleTypeMaterial(l.type_material)}
                              </span>
                              {l.essence && (
                                <span className="inline-block px-2 py-1 bg-[#1E1E1E] text-gray-300 text-2xs font-bold uppercase tracking-wider rounded w-fit">
                                  {l.essence}
                                </span>
                              )}
                            </div>
                            <div className="flex gap-2">
                              <button
                                onClick={() => ouvrirEdition("TERRASSE_LAME", l)}
                                className="text-gray-500 hover:text-gray-400"
                                aria-label={`Modifier ${etiquetteLame(l)}`}
                              >
                                <Edit2 className="h-4 w-4" />
                              </button>
                              <button
                                onClick={() => supprimer("TERRASSE_LAME", l.id, etiquetteLame(l))}
                                className="text-gray-500 hover:text-rose-400"
                                aria-label={`Supprimer ${etiquetteLame(l)}`}
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          </div>
                          <h3 className="font-bold text-gray-200 text-sm leading-tight mb-1">
                            {etiquetteLame(l)}
                          </h3>
                          {dims && (
                            <p className="text-3xs text-gray-400 font-mono mb-2 opacity-90">{dims}</p>
                          )}
                          {l.reference_fournisseur && (
                            <p className="text-3xs text-gray-500 mb-1">
                              Réf. {l.reference_fournisseur}
                            </p>
                          )}
                          <p className="text-xs text-gray-500 line-clamp-3 mb-4 flex-grow">
                            {l.description}
                          </p>
                          <div className="mt-auto flex items-end justify-between border-t border-white/10 pt-3">
                            <span className="text-xs font-medium text-gray-500">
                              {l.fournisseur || "Fournisseur non défini"}
                            </span>
                            <div className="flex flex-col items-end gap-0.5">
                              {l.prix_unitaire_lame != null && (
                                <span className="text-lg font-black text-gray-200">
                                  {fmtEuro(Number(l.prix_unitaire_lame))} HT/u
                                </span>
                              )}
                              {l.prix_m2_ht != null && (
                                <span className="text-xs font-medium text-gray-400">
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
              // En vue « Tout », on ignore silencieusement les groupes vides ;
              // un onglet dédié affiche toujours son état vide explicite.
              if (filtre === "tout" && items.length === 0) return null;
              return (
                <section key={groupe} className="space-y-3">
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    {LIBELLES_GROUPES[groupe]}
                    <span className="rounded-full bg-[#1E1E1E] px-2 py-0.5 text-2xs font-semibold text-gray-400 border border-white/10">
                      {items.length}
                    </span>
                  </h2>
                  {items.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-[#1E1E1E]/30 py-12 text-center text-gray-500">
                      Aucun accessoire dans « {LIBELLES_GROUPES[groupe]} » pour cette recherche.
                    </div>
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
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    Prestations
                    <span className="rounded-full bg-[#1E1E1E] px-2 py-0.5 text-2xs font-semibold text-gray-400 border border-white/10">
                      {accessoiresPrestations.length}
                    </span>
                  </h2>
                  {accessoiresPrestations.length === 0 ? (
                    <div className="rounded-xl border border-dashed border-white/10 bg-[#1E1E1E]/30 py-12 text-center text-gray-500">
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

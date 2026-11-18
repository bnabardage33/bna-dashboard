"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import type { TablesInsert, TablesUpdate } from "@/types/supabase";
import { Entreprise } from "@/types/entreprise";
import BonCommandePDF from "@/components/BonCommandePDF";
import { fmtEuro } from "@/lib/financeCalculs";
import {
  AlertTriangle,
  Building2,
  CheckCircle2,
  Download,
  Mail,
  Package,
  Phone,
  Plus,
  Printer,
  Trash2,
  TrendingUp,
  Truck,
  X,
} from "lucide-react";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
import { FloatingActionButton } from "@/components/ui/FloatingActionButton";
import EnvoyerCommandeModal from "@/components/email/EnvoyerCommandeModal";
import {
  SPECIALITES_FOURNISSEUR,
  badgeMetierConfig,
  calculerAnalyseMarges,
  correspondMetierSpecialite,
  extraireFournituresDepuisCloture,
  extraireFournituresDepuisTerrasse,
  extraireFournituresDepuisZonesBardage,
  normaliserMetier,
  type ChantierAnalyseInput,
  type DevisAnalyseInput,
  type LigneImportQuantitatif,
  type MetierChantier,
  type ZoneBardageBrute,
} from "@/lib/fournisseursCommandes";

type StatutRelation = "principal" | "regulier" | "remplacant";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string | null): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

type Fournisseur = {
  id: string;
  nom: string;
  specialite: string | null;
  contact: string | null;
  telephone: string | null;
  email: string | null;
  conditions_paiement: string | null;
  notes: string | null;
  statut_relation: StatutRelation;
};

type Chantier = {
  id: string;
  nom: string | null;
  metier: string | null;
  clients: { nom: string } | null;
};

type Commande = {
  id: string;
  fournisseur_id: string | null;
  chantier_id: string | null;
  designation: string;
  quantite: number | null;
  unite: string | null;
  montant_ht: number | null;
  statut: string;
  notes: string | null;
  date_livraison_prevue: string | null;
  date_livraison_reelle: string | null;
  date_commande: string | null;
  created_at: string;
  fournisseurs: {
    nom: string;
    contact: string | null;
    telephone: string | null;
    email: string | null;
    conditions_paiement: string | null;
  } | null;
  chantiers: {
    nom: string | null;
    metier: string | null;
    adresse_chantier: string | null;
    clients: { nom: string } | null;
  } | null;
};

const CLE_PREFILL_COMMANDE = "bna_prefill_commande";

function joursRetard(dateLivraisonPrevue: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const prevue = new Date(dateLivraisonPrevue);
  prevue.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - prevue.getTime()) / (1000 * 60 * 60 * 24));
}

const STATUTS = [
  {
    value: "a_commander",
    label: "À commander",
    couleur: "border-white/10 bg-[#120F0D] text-[#B8A99E]",
  },
  {
    value: "commandee",
    label: "Commandée",
    couleur: "border-blue-200 bg-sky-500/15 text-sky-300",
  },
  {
    value: "partiellement_livree",
    label: "Partiellement livrée",
    couleur: "border-amber-200 bg-amber-500/15 text-amber-300",
  },
  {
    value: "livree",
    label: "Livrée",
    couleur: "border-emerald-200 bg-emerald-500/15 text-emerald-300",
  },
  {
    value: "annulee",
    label: "Annulée",
    couleur: "border-red-200 bg-red-500/15 text-red-300",
  },
];

const RELATIONS: { value: StatutRelation; label: string; couleurActif: string }[] = [
  {
    value: "principal",
    label: "Principal",
    couleurActif: "border-[#D96B27] bg-[#D96B27]/10 text-[#D96B27]",
  },
  {
    value: "regulier",
    label: "Régulier",
    couleurActif: "border-white/15 bg-[#221B17] text-[#B8A99E]",
  },
  {
    value: "remplacant",
    label: "Remplaçant",
    couleurActif: "border-stone-300 bg-stone-100 text-stone-700",
  },
];

function estMemeMois(dateStr: string | null, ref: Date) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

function FournisseursContenu() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<"fournisseurs" | "commandes" | "analyse">("fournisseurs");
  const [filtreMetier, setFiltreMetier] = useState<"tous" | MetierChantier>("tous");

  const [commandeMiseEnAvant, setCommandeMiseEnAvant] = useState<string | null>(null);
  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [devisList, setDevisList] = useState<DevisAnalyseInput[]>([]);
  const [loading, setLoading] = useState(true);
  const [filtreCommandes, setFiltreCommandes] = useState<"toutes" | "en_retard">("toutes");

  const [modalFournisseur, setModalFournisseur] = useState(false);
  const [modalCommande, setModalCommande] = useState(false);
  const [apercuCommande, setApercuCommande] = useState<Commande | null>(null);
  const [commandePourEmail, setCommandePourEmail] = useState<Commande | null>(null);
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null);

  // Workflow de réception
  const [commandeReception, setCommandeReception] = useState<Commande | null>(null);
  const [rStatut, setRStatut] = useState<"livree" | "partiellement_livree">("livree");
  const [rDateReelle, setRDateReelle] = useState("");
  const [rNoteBl, setRNoteBl] = useState("");
  const [savingReception, setSavingReception] = useState(false);

  // Formulaire fournisseur
  const [fNom, setFNom] = useState("");
  const [fSpecialite, setFSpecialite] = useState<string>(SPECIALITES_FOURNISSEUR[0]);
  const [fContact, setFContact] = useState("");
  const [fTel, setFTel] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fConditions, setFConditions] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fStatutRelation, setFStatutRelation] = useState<StatutRelation>("regulier");

  // Formulaire commande
  const [cFournisseurId, setCFournisseurId] = useState("");
  const [cChantierId, setCChantierId] = useState("");
  const [cDesignation, setCDesignation] = useState("");
  const [cQuantite, setCQuantite] = useState("");
  const [cUnite, setCUnite] = useState("m²");
  const [cMontant, setCMontant] = useState("");
  const [cDateLivraison, setCDateLivraison] = useState("");
  const [lignesMultiples, setLignesMultiples] = useState<LigneImportQuantitatif[] | null>(null);
  const [prefillInfo, setPrefillInfo] = useState<{
    chantierNom: string;
    zoneNom: string;
  } | null>(null);
  const [importLoading, setImportLoading] = useState(false);
  const [importMessage, setImportMessage] = useState<string | null>(null);

  // Synchronisation réactive avec les paramètres URL (?tab= & ?retard=)
  useEffect(() => {
    const tabUrl = searchParams.get("tab");
    if (tabUrl === "fournisseurs" || tabUrl === "commandes" || tabUrl === "analyse") {
      setTab(tabUrl);
    }

    const retardId = searchParams.get("retard");
    if (retardId) {
      setTab("commandes");
      setCommandeMiseEnAvant(retardId);
    } else {
      setCommandeMiseEnAvant(null);
    }
  }, [searchParams]);

  async function detecterRetards(commandesChargees: Commande[]) {
    const today = new Date().toISOString().slice(0, 10);
    const enRetard = commandesChargees.filter(
      (c) =>
        c.statut !== "livree" &&
        c.statut !== "annulee" &&
        c.date_livraison_prevue &&
        c.date_livraison_prevue < today
    );
    if (enRetard.length === 0) return;

    const { data: existantes } = await supabase
      .from("notifications")
      .select("lien")
      .ilike("lien", "/bureau/fournisseurs?retard=%");

    const dejaNotifies = new Set((existantes ?? []).map((n) => n.lien));
    const nouvelles: Array<{
      titre: string;
      message: string;
      type: string;
      lien: string;
      entreprise_id?: string;
    }> = [];

    for (const c of enRetard) {
      const lien = `/bureau/fournisseurs?retard=${c.id}`;
      if (dejaNotifies.has(lien)) continue;
      const jours = joursRetard(c.date_livraison_prevue!);
      const { entreprise_id } = await resoudreContexteEntreprise(c.chantier_id);
      if (!c.chantier_id && !estUuid(entreprise_id)) continue;
      nouvelles.push({
        titre: `Retard livraison : ${c.designation}`,
        message: `Fournisseur ${c.fournisseurs?.nom ?? "—"} — prévu le ${new Date(
          c.date_livraison_prevue!
        ).toLocaleDateString("fr-FR")} (${jours}j de retard)`,
        type: "retard_livraison",
        lien,
        ...(entreprise_id ? { entreprise_id } : {}),
      });
    }

    if (nouvelles.length > 0) {
      await supabase.from("notifications").insert(nouvelles as TablesInsert<"notifications">[]);
    }
  }

  async function fetchTout() {
    setLoading(true);
    const [
      { data: f },
      { data: c },
      { data: ch },
      { data: dv },
      { data: ent },
    ] = await Promise.all([
      supabase.from("fournisseurs").select("*").order("nom"),
      supabase
        .from("commandes")
        .select(
          "*, fournisseurs(nom, contact, telephone, email, conditions_paiement), chantiers(nom, metier, adresse_chantier, clients(nom))"
        )
        .order("created_at", { ascending: false }),
      supabase
        .from("chantiers")
        .select("id, nom, metier, clients(nom)")
        .order("nom"),
      supabase
        .from("devis")
        .select("id, chantier_id, statut, total_ht, cout_matiere_ht, cout_main_oeuvre_ht"),
      supabase.from("entreprise_settings").select("*").limit(1).maybeSingle(),
    ]);

    const commandesList = (c as unknown as Commande[]) ?? [];
    setFournisseurs((f as Fournisseur[]) ?? []);
    setCommandes(commandesList);
    setChantiers((ch as unknown as Chantier[]) ?? []);
    setDevisList((dv as unknown as DevisAnalyseInput[]) ?? []);
    if (ent) setEntreprise(ent as unknown as Entreprise);
    setLoading(false);
    detecterRetards(commandesList);
  }

  useEffect(() => {
    fetchTout();
  }, []);

  // Scroll doux vers la commande mise en avant
  useEffect(() => {
    if (!commandeMiseEnAvant || loading) return;
    const el = document.getElementById("commande-notification");
    if (el) el.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [commandeMiseEnAvant, loading, commandes]);

  // Pré-remplissage depuis un chiffrage (Bardage, Terrasse, Clôture)
  useEffect(() => {
    const brut = localStorage.getItem(CLE_PREFILL_COMMANDE);
    if (!brut) return;
    localStorage.removeItem(CLE_PREFILL_COMMANDE);
    try {
      const data = JSON.parse(brut) as {
        chantierId?: string;
        chantier_id?: string;
        chantierNom?: string;
        zoneNom?: string;
        lignes?: LigneImportQuantitatif[];
      };
      if (data.lignes && data.lignes.length > 0) {
        setTab("commandes");
        setLignesMultiples(data.lignes);
        setPrefillInfo({
          chantierNom: data.chantierNom || "Chantier BNA",
          zoneNom: data.zoneNom || "Quantitatif chantier",
        });
        const cid = data.chantierId || data.chantier_id || "";
        if (cid) setCChantierId(cid);
        setModalCommande(true);
      }
    } catch {
      // Ignore un localStorage corrompu
    }
  }, []);

  const kpis = useMemo(() => {
    const maintenant = new Date();
    const commandesEnCours = commandes.filter(
      (c) => c.statut !== "livree" && c.statut !== "annulee"
    ).length;
    const livraisonsAttendues = commandes.filter(
      (c) => c.statut === "commandee" || c.statut === "partiellement_livree"
    ).length;
    const achatsEngages = commandes
      .filter((c) => estMemeMois(c.created_at, maintenant) && c.statut !== "annulee")
      .reduce((sum, c) => sum + (c.montant_ht ?? 0), 0);
    const achatsRecus = commandes
      .filter((c) => estMemeMois(c.date_livraison_reelle, maintenant))
      .reduce((sum, c) => sum + (c.montant_ht ?? 0), 0);

    return {
      fournisseursActifs: fournisseurs.length,
      commandesEnCours,
      livraisonsAttendues,
      achatsEngages,
      achatsRecus,
    };
  }, [fournisseurs, commandes]);

  const fournisseursFiltres = useMemo(() => {
    return fournisseurs.filter((f) => correspondMetierSpecialite(f.specialite, filtreMetier));
  }, [fournisseurs, filtreMetier]);

  const commandesFiltrees = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    let base = commandes;

    if (filtreMetier !== "tous") {
      base = base.filter((c) => normaliserMetier(c.chantiers?.metier) === filtreMetier);
    }

    if (filtreCommandes === "en_retard") {
      base = base.filter(
        (c) =>
          c.statut !== "livree" &&
          c.statut !== "annulee" &&
          c.date_livraison_prevue &&
          c.date_livraison_prevue < today
      );
    }

    if (!commandeMiseEnAvant) return base;
    return [...base].sort((a, b) => {
      if (a.id === commandeMiseEnAvant) return -1;
      if (b.id === commandeMiseEnAvant) return 1;
      return 0;
    });
  }, [commandes, filtreCommandes, filtreMetier, commandeMiseEnAvant]);

  const nbRetards = useMemo(() => {
    const today = new Date().toISOString().slice(0, 10);
    return commandes.filter(
      (c) =>
        c.statut !== "livree" &&
        c.statut !== "annulee" &&
        c.date_livraison_prevue &&
        c.date_livraison_prevue < today
    ).length;
  }, [commandes]);

  const analyseMarges = useMemo(() => {
    const chantiersAnalyse: ChantierAnalyseInput[] = chantiers.map((ch) => ({
      id: ch.id,
      nom: ch.nom,
      metier: ch.metier,
      clients: ch.clients,
    }));
    return calculerAnalyseMarges(chantiersAnalyse, devisList, commandes);
  }, [chantiers, devisList, commandes]);

  const lignesAnalyseFiltrees = useMemo(() => {
    if (filtreMetier === "tous") return analyseMarges.lignes;
    return analyseMarges.lignes.filter((l) => l.metier === filtreMetier);
  }, [analyseMarges.lignes, filtreMetier]);

  async function creerFournisseur(e: React.FormEvent) {
    e.preventDefault();
    if (!fNom) return;

    const { entreprise_id } = await resoudreContexteEntreprise(null);
    if (!estUuid(entreprise_id)) {
      alert(
        "Impossible de créer le fournisseur : votre session ne contient pas d'entreprise identifiée. Reconnectez-vous et réessayez."
      );
      return;
    }

    const { error } = await supabase.from("fournisseurs").insert({
      nom: fNom,
      specialite: fSpecialite,
      contact: fContact || null,
      telephone: fTel || null,
      email: fEmail || null,
      conditions_paiement: fConditions || null,
      notes: fNotes || null,
      statut_relation: fStatutRelation,
      entreprise_id,
    });
    if (error) {
      alert("Erreur : " + error.message);
      return;
    }
    setModalFournisseur(false);
    setFNom("");
    setFContact("");
    setFTel("");
    setFEmail("");
    setFConditions("");
    setFNotes("");
    setFStatutRelation("regulier");
    fetchTout();
  }

  async function supprimerFournisseur(f: Fournisseur) {
    if (!confirm(`Supprimer ${f.nom} ?`)) return;
    const { error } = await supabase.from("fournisseurs").delete().eq("id", f.id);
    if (!error) fetchTout();
  }

  function fermerModalCommande() {
    setModalCommande(false);
    setLignesMultiples(null);
    setPrefillInfo(null);
    setImportMessage(null);
    setCFournisseurId("");
    setCChantierId("");
    setCDesignation("");
    setCQuantite("");
    setCMontant("");
    setCDateLivraison("");
  }

  function updateLigneMultiple(index: number, patch: Partial<LigneImportQuantitatif>) {
    setLignesMultiples((ls) =>
      ls ? ls.map((l, i) => (i === index ? { ...l, ...patch } : l)) : ls
    );
  }

  function supprimerLigneMultiple(index: number) {
    setLignesMultiples((ls) => (ls ? ls.filter((_, i) => i !== index) : ls));
  }

  async function importerQuantitatifsChantier() {
    if (!cChantierId) {
      setImportMessage("Sélectionnez d'abord un chantier ci-dessus.");
      return;
    }
    const ch = chantiers.find((item) => item.id === cChantierId);
    if (!ch) return;

    setImportLoading(true);
    setImportMessage(null);
    try {
      const metier = normaliserMetier(ch.metier);
      let lignesImportees: LigneImportQuantitatif[] = [];

      if (metier === "terrasse") {
        const { data } = await supabase
          .from("chantier_terrasses")
          .select("resultats_techniques")
          .eq("chantier_id", ch.id)
          .maybeSingle();
        lignesImportees = extraireFournituresDepuisTerrasse(data);
      } else if (metier === "cloture") {
        const { data } = await supabase
          .from("chantier_clotures")
          .select("resultats_techniques")
          .eq("chantier_id", ch.id)
          .maybeSingle();
        lignesImportees = extraireFournituresDepuisCloture(data);
      } else {
        const { data } = await supabase
          .from("chantier_zones")
          .select("id, nom, materiau, largeur, hauteur_mur, resultats_techniques")
          .eq("chantier_id", ch.id);
        lignesImportees = extraireFournituresDepuisZonesBardage(
          (data as unknown as ZoneBardageBrute[]) ?? []
        );
      }

      if (lignesImportees.length === 0) {
        setImportMessage(
          `Aucun quantitatif enregistré pour ce chantier (${badgeMetierConfig(metier).label}). Enregistrez d'abord le calepinage dans le Hub.`
        );
        return;
      }

      setLignesMultiples(lignesImportees);
      setPrefillInfo({
        chantierNom: ch.nom || ch.clients?.nom || "Chantier BNA",
        zoneNom: `Quantitatifs Q_appro (${badgeMetierConfig(metier).label})`,
      });
      setImportMessage(`${lignesImportees.length} ligne(s) de fournitures importée(s).`);
    } finally {
      setImportLoading(false);
    }
  }

  async function creerCommande(e: React.FormEvent) {
    e.preventDefault();

    const { chantier_id: chantierCtx, entreprise_id } = await resoudreContexteEntreprise(
      cChantierId || null
    );

    if (!chantierCtx && !estUuid(entreprise_id)) {
      alert(
        "Impossible de créer la commande : votre session ne contient pas d'entreprise identifiée. Reconnectez-vous et réessayez."
      );
      return;
    }

    if (lignesMultiples) {
      if (lignesMultiples.length === 0) return;
      const inserts = lignesMultiples.map((l) => ({
        fournisseur_id: cFournisseurId || null,
        chantier_id: chantierCtx,
        designation: l.designation,
        quantite: l.quantite || null,
        unite: l.unite,
        montant_ht:
          typeof l.pu_ht === "number" && l.quantite
            ? Math.round(l.pu_ht * l.quantite * 100) / 100
            : null,
        date_livraison_prevue: cDateLivraison || null,
        statut: "a_commander",
        ...(entreprise_id ? { entreprise_id } : {}),
      }));
      const { error } = await supabase
        .from("commandes")
        .insert(inserts as TablesInsert<"commandes">[]);
      if (error) {
        alert("Erreur : " + error.message);
        return;
      }
    } else {
      if (!cDesignation) return;
      const { error } = await supabase.from("commandes").insert({
        fournisseur_id: cFournisseurId || null,
        chantier_id: chantierCtx,
        designation: cDesignation,
        quantite: cQuantite ? parseFloat(cQuantite) : null,
        unite: cUnite,
        montant_ht: cMontant ? parseFloat(cMontant) : null,
        date_livraison_prevue: cDateLivraison || null,
        statut: "a_commander",
        ...(entreprise_id ? { entreprise_id } : {}),
      } as TablesInsert<"commandes">);
      if (error) {
        alert("Erreur : " + error.message);
        return;
      }
    }

    fermerModalCommande();
    fetchTout();
  }

  async function changerStatutCommande(c: Commande, statut: string) {
    const updates: TablesUpdate<"commandes"> = { statut };
    if (statut === "livree" && !c.date_livraison_reelle) {
      updates.date_livraison_reelle = new Date().toISOString().slice(0, 10);
    }
    const { error } = await supabase.from("commandes").update(updates).eq("id", c.id);
    if (!error) fetchTout();
  }

  function ouvrirModalReception(c: Commande) {
    setCommandeReception(c);
    setRStatut(c.statut === "partiellement_livree" ? "partiellement_livree" : "livree");
    setRDateReelle(c.date_livraison_reelle || new Date().toISOString().slice(0, 10));
    setRNoteBl(c.notes || "");
  }

  async function validerReception(e: React.FormEvent) {
    e.preventDefault();
    if (!commandeReception) return;
    setSavingReception(true);
    try {
      const { error } = await supabase
        .from("commandes")
        .update({
          statut: rStatut,
          date_livraison_reelle: rDateReelle || new Date().toISOString().slice(0, 10),
          notes: rNoteBl.trim() || null,
        })
        .eq("id", commandeReception.id);

      if (error) {
        alert("Erreur lors de la réception : " + error.message);
        return;
      }
      setCommandeReception(null);
      fetchTout();
    } finally {
      setSavingReception(false);
    }
  }

  async function definirDateCommande(c: Commande, dateCommande: string) {
    const { error } = await supabase
      .from("commandes")
      .update({ date_commande: dateCommande || null })
      .eq("id", c.id);
    if (!error) fetchTout();
  }

  async function supprimerCommande(c: Commande) {
    if (!confirm("Supprimer cette commande ?")) return;
    const { error } = await supabase.from("commandes").delete().eq("id", c.id);
    if (!error) fetchTout();
  }

  return (
    <div className="min-h-screen bg-[#120F0D] pb-24 text-[#F5EFEA]">
      <div className="mx-auto max-w-6xl space-y-5 px-4 pt-4 sm:px-6">
        {/* En-tête blanc BNA Pilotage BTP */}
        <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-5 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <div className="inline-flex items-center gap-1.5 rounded-full bg-[#D96B27]/10 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wider text-[#D96B27]">
                <Truck className="h-3.5 w-3.5" />
                BNA Pilotage BTP · Fournisseurs & Achats
              </div>
              <h1 className="mt-2 text-xl font-bold text-[#F5EFEA] sm:text-2xl">
                Fournisseurs, Commandes & Marges Matériaux
              </h1>
              <p className="mt-0.5 text-sm text-[#B8A99E]">
                Répertoire fournisseurs, approvisionnement Bardage / Terrasse / Clôture et suivi des marges.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setModalFournisseur(true)}
                className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#120F0D] px-4 py-2.5 text-xs font-bold text-[#F5EFEA] transition-colors hover:bg-[#221B17]"
              >
                <Plus className="h-4 w-4 text-[#D96B27]" />
                Nouveau fournisseur
              </button>
              <button
                type="button"
                onClick={() => setModalCommande(true)}
                className="inline-flex items-center gap-1.5 rounded-xl bg-[#D96B27] px-4 py-2.5 text-xs font-bold text-white shadow-xs transition-colors hover:bg-[#E07A38]"
              >
                <Plus className="h-4 w-4" />
                Nouvelle commande
              </button>
            </div>
          </div>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 shadow-xs">
            <p className="text-xs font-medium text-[#8E7F74]">Fournisseurs actifs</p>
            <p className="mt-1 text-2xl font-bold text-[#F5EFEA]">{kpis.fournisseursActifs}</p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 shadow-xs">
            <p className="text-xs font-medium text-[#8E7F74]">Commandes en cours</p>
            <p className="mt-1 text-2xl font-bold text-[#F5EFEA]">{kpis.commandesEnCours}</p>
            <p className="mt-0.5 text-[11px] text-[#8E7F74]">
              {kpis.livraisonsAttendues} livraison(s) attendue(s)
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 shadow-xs">
            <p className="text-xs font-medium text-[#8E7F74]">Achats engagés (mois)</p>
            <p className="mt-1 text-2xl font-bold text-[#D96B27]">
              {fmtEuro(kpis.achatsEngages)}
            </p>
          </div>
          <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 shadow-xs">
            <p className="text-xs font-medium text-[#8E7F74]">Achats reçus (mois)</p>
            <p className="mt-1 text-2xl font-bold text-emerald-300">
              {fmtEuro(kpis.achatsRecus)}
            </p>
          </div>
        </div>

        {/* Barre d'onglets + Filtre métier */}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-white/10 bg-[#1B1511] p-3 shadow-xs">
          <div className="flex flex-wrap gap-2">
            {(
              [
                { id: "fournisseurs", label: "Répertoire fournisseurs" },
                { id: "commandes", label: "Suivi des commandes" },
                { id: "analyse", label: "Analyse des marges" },
              ] as const
            ).map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                  tab === t.id
                    ? "bg-[#D96B27] text-white shadow-xs"
                    : "border border-white/10 bg-[#120F0D] text-[#B8A99E] hover:bg-[#221B17] hover:text-[#F5EFEA]"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            {(
              [
                { id: "tous", label: "Tous métiers" },
                { id: "bardage", label: "Bardage" },
                { id: "terrasse", label: "Terrasse" },
                { id: "cloture", label: "Clôture" },
              ] as const
            ).map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setFiltreMetier(m.id)}
                className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-all ${
                  filtreMetier === m.id
                    ? "bg-[#23272B] text-white"
                    : "border border-white/10 bg-[#1B1511] text-[#B8A99E] hover:bg-[#120F0D]"
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* ONGLET 1 : FOURNISSEURS */}
        {tab === "fournisseurs" && (
          <div className="space-y-4">
            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-8 text-center text-sm text-[#8E7F74]">
                Chargement des fournisseurs...
              </div>
            ) : fournisseursFiltres.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-8 text-center text-sm text-[#8E7F74]">
                Aucun fournisseur trouvé pour ce filtre.
              </div>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                {fournisseursFiltres.map((f) => {
                  const relation =
                    RELATIONS.find((r) => r.value === f.statut_relation) ?? RELATIONS[1];
                  return (
                    <div
                      key={f.id}
                      className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 shadow-xs transition-shadow hover:shadow-sm"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <div className="flex items-center gap-2">
                            <Building2 className="h-4 w-4 text-[#D96B27]" />
                            <p className="font-bold text-[#F5EFEA]">{f.nom}</p>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {f.specialite && (
                              <span className="inline-block rounded-full border border-white/10 bg-[#120F0D] px-2.5 py-0.5 text-xs font-medium text-[#B8A99E]">
                                {f.specialite}
                              </span>
                            )}
                            <span
                              className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-semibold ${relation.couleurActif}`}
                            >
                              {relation.label}
                            </span>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => supprimerFournisseur(f)}
                          className="rounded-lg p-1.5 text-[#8E7F74] transition-colors hover:bg-red-500/15 hover:text-red-600"
                          aria-label="Supprimer le fournisseur"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>

                      {f.contact && (
                        <p className="mt-2.5 text-sm font-medium text-[#B8A99E]">
                          Contact : {f.contact}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-3 text-sm">
                        {f.telephone && (
                          <a
                            href={`tel:${f.telephone}`}
                            className="inline-flex items-center gap-1 font-semibold text-[#D96B27] hover:underline"
                          >
                            <Phone className="h-3.5 w-3.5" />
                            {f.telephone}
                          </a>
                        )}
                        {f.email && (
                          <a
                            href={`mailto:${f.email}`}
                            className="inline-flex items-center gap-1 font-medium text-[#B8A99E] hover:text-[#F5EFEA] hover:underline"
                          >
                            <Mail className="h-3.5 w-3.5" />
                            {f.email}
                          </a>
                        )}
                      </div>
                      {f.conditions_paiement && (
                        <p className="mt-2 text-xs text-[#8E7F74]">
                          Paiement : {f.conditions_paiement}
                        </p>
                      )}
                      {f.notes && <p className="mt-1 text-xs text-[#8E7F74]">{f.notes}</p>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ONGLET 2 : COMMANDES */}
        {tab === "commandes" && (
          <div className="space-y-4">
            <div className="flex flex-wrap gap-2">
              {(["toutes", "en_retard"] as const).map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setFiltreCommandes(f)}
                  className={`rounded-full px-4 py-2 text-xs font-bold transition-all ${
                    filtreCommandes === f
                      ? "bg-[#D96B27] text-white shadow-xs"
                      : "border border-white/10 bg-[#1B1511] text-[#B8A99E] hover:bg-[#120F0D]"
                  }`}
                >
                  {f === "toutes" ? "Toutes les commandes" : `En retard (${nbRetards})`}
                </button>
              ))}
            </div>

            {loading ? (
              <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-8 text-center text-sm text-[#8E7F74]">
                Chargement des commandes...
              </div>
            ) : commandesFiltrees.length === 0 ? (
              <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-8 text-center text-sm text-[#8E7F74]">
                {filtreCommandes === "en_retard"
                  ? "Aucune commande en retard."
                  : "Aucune commande pour l'instant."}
              </div>
            ) : (
              <div className="space-y-2.5">
                {commandesFiltrees.map((c) => {
                  const statutInfo =
                    STATUTS.find((s) => s.value === c.statut) ?? STATUTS[0];
                  const today = new Date().toISOString().slice(0, 10);
                  const enRetard =
                    c.statut !== "livree" &&
                    c.statut !== "annulee" &&
                    c.date_livraison_prevue &&
                    c.date_livraison_prevue < today;
                  const retardJours = enRetard
                    ? joursRetard(c.date_livraison_prevue!)
                    : 0;
                  const miseEnAvant = c.id === commandeMiseEnAvant;
                  const metierBadge = c.chantiers
                    ? badgeMetierConfig(c.chantiers.metier)
                    : null;

                  return (
                    <div
                      key={c.id}
                      id={miseEnAvant ? "commande-notification" : undefined}
                      className={`flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-[#1B1511] p-4 shadow-xs ${
                        miseEnAvant
                          ? "border-[#D96B27] ring-2 ring-[#B85B2B]/25"
                          : enRetard
                            ? "border-red-300 bg-red-500/15/30"
                            : "border-white/10"
                      }`}
                    >
                      <div className="min-w-[240px] flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-[#F5EFEA]">{c.designation}</p>
                          {metierBadge && (
                            <span
                              className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${metierBadge.badgeClass}`}
                            >
                              {metierBadge.label}
                            </span>
                          )}
                          {miseEnAvant && (
                            <span className="rounded-full bg-[#D96B27]/15 px-2 py-0.5 text-[11px] font-bold text-[#D96B27]">
                              Ouvert depuis une notification
                            </span>
                          )}
                          {enRetard && (
                            <span className="inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-[11px] font-bold text-white">
                              <AlertTriangle className="h-3 w-3" />
                              EN RETARD J+{retardJours}
                            </span>
                          )}
                        </div>

                        <p className="mt-1 text-xs text-[#B8A99E]">
                          <span className="font-semibold text-[#F5EFEA]">
                            {c.fournisseurs?.nom ?? "Fournisseur non défini"}
                          </span>{" "}
                          · {c.chantiers?.nom ?? c.chantiers?.clients?.nom ?? "Sans chantier"}
                          {c.quantite ? ` · ${c.quantite} ${c.unite ?? ""}` : ""}
                          {c.montant_ht ? ` · ${fmtEuro(c.montant_ht)} HT` : ""}
                        </p>

                        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs text-[#B8A99E]">
                          <label className="flex items-center gap-1.5">
                            <span>Commandé le :</span>
                            <input
                              type="date"
                              value={c.date_commande ?? ""}
                              onChange={(e) => definirDateCommande(c, e.target.value)}
                              className="rounded-lg border border-white/10 bg-[#120F0D] px-2 py-0.5 text-xs text-[#F5EFEA]"
                              aria-label="Date de commande"
                            />
                          </label>
                          {c.date_livraison_prevue && (
                            <span>
                              Prévu :{" "}
                              {new Date(c.date_livraison_prevue).toLocaleDateString("fr-FR")}
                            </span>
                          )}
                          {c.date_livraison_reelle && (
                            <span className="font-semibold text-emerald-300">
                              Livré le :{" "}
                              {new Date(c.date_livraison_reelle).toLocaleDateString("fr-FR")}
                            </span>
                          )}
                        </div>
                        {c.notes && (
                          <p className="mt-1 text-xs italic text-[#8E7F74]">
                            Note / BL : {c.notes}
                          </p>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2">
                        {c.statut !== "livree" && c.statut !== "annulee" && (
                          <button
                            type="button"
                            onClick={() => ouvrirModalReception(c)}
                            className="inline-flex items-center gap-1 rounded-xl border border-emerald-200 bg-emerald-500/15 px-3 py-1.5 text-xs font-bold text-emerald-300 transition-colors hover:bg-emerald-100"
                          >
                            <CheckCircle2 className="h-3.5 w-3.5" />
                            Réceptionner
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setApercuCommande(c)}
                          className="inline-flex items-center gap-1 rounded-xl border border-white/10 bg-[#120F0D] px-3 py-1.5 text-xs font-semibold text-[#F5EFEA] hover:bg-[#221B17]"
                          title="Voir et imprimer le bon de commande officiel"
                        >
                          <Printer className="h-3.5 w-3.5 text-[#B8A99E]" />
                          Bon PDF
                        </button>
                        <button
                          type="button"
                          onClick={() => setCommandePourEmail(c)}
                          className="inline-flex items-center gap-1 rounded-xl border border-[#D96B27]/30 bg-[#D96B27]/10 px-3 py-1.5 text-xs font-bold text-[#D96B27] hover:bg-[#D96B27]/15"
                          title="Envoyer le bon de commande par email au fournisseur"
                        >
                          <Mail className="h-3.5 w-3.5" />
                          Envoyer
                        </button>
                        <select
                          value={c.statut}
                          onChange={(e) => changerStatutCommande(c, e.target.value)}
                          className={`rounded-xl border px-2.5 py-1.5 text-xs font-semibold ${statutInfo.couleur}`}
                          aria-label="Statut de la commande"
                        >
                          {STATUTS.map((s) => (
                            <option key={s.value} value={s.value}>
                              {s.label}
                            </option>
                          ))}
                        </select>
                        <button
                          type="button"
                          onClick={() => supprimerCommande(c)}
                          className="rounded-lg p-1.5 text-[#8E7F74] hover:bg-red-500/15 hover:text-red-600"
                          aria-label="Supprimer la commande"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* ONGLET 3 : ANALYSE DES MARGES */}
        {tab === "analyse" && (
          <div className="space-y-4">
            {/* KPIs globaux marges matériaux */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 shadow-xs">
                <p className="text-xs font-medium text-[#8E7F74]">
                  Ventes matériaux devisées HT
                </p>
                <p className="mt-1 text-xl font-bold text-[#F5EFEA]">
                  {fmtEuro(analyseMarges.totalVentesMateriauxHt)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 shadow-xs">
                <p className="text-xs font-medium text-[#8E7F74]">Achats engagés HT</p>
                <p className="mt-1 text-xl font-bold text-[#D96B27]">
                  {fmtEuro(analyseMarges.totalAchatsEngagesHt)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 shadow-xs">
                <p className="text-xs font-medium text-[#8E7F74]">Achats livrés HT</p>
                <p className="mt-1 text-xl font-bold text-emerald-300">
                  {fmtEuro(analyseMarges.totalAchatsLivresHt)}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 shadow-xs">
                <p className="text-xs font-medium text-[#8E7F74]">
                  Marge brute matériaux
                </p>
                <p
                  className={`mt-1 text-xl font-bold ${
                    analyseMarges.margeBruteHt >= 0 ? "text-emerald-300" : "text-red-600"
                  }`}
                >
                  {fmtEuro(analyseMarges.margeBruteHt)}
                </p>
                <p className="mt-0.5 text-[11px] font-semibold text-[#B8A99E]">
                  Taux : {analyseMarges.margeBrutePct.toFixed(1)} %
                </p>
              </div>
            </div>

            {/* Synthèse par corps d'état */}
            <div className="grid gap-3 sm:grid-cols-3">
              {(["bardage", "terrasse", "cloture"] as const).map((m) => {
                const badge = badgeMetierConfig(m);
                const stats = analyseMarges.parMetier[m];
                return (
                  <div
                    key={m}
                    className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 shadow-xs"
                  >
                    <div className="flex items-center justify-between">
                      <span
                        className={`inline-block rounded-full border px-2.5 py-0.5 text-xs font-bold ${badge.badgeClass}`}
                      >
                        {badge.label}
                      </span>
                      <span className="text-xs text-[#8E7F74]">
                        {stats.nbChantiers} chantier(s)
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
                      <div>
                        <p className="text-[#8E7F74]">Devisé matériaux</p>
                        <p className="font-bold text-[#F5EFEA]">
                          {fmtEuro(stats.ventesMateriauxHt)}
                        </p>
                      </div>
                      <div>
                        <p className="text-[#8E7F74]">Achats engagés</p>
                        <p className="font-bold text-[#D96B27]">
                          {fmtEuro(stats.achatsEngagesHt)}
                        </p>
                      </div>
                    </div>
                    <div className="mt-2 border-t border-white/10 pt-2 flex items-center justify-between text-xs">
                      <span className="font-semibold text-[#B8A99E]">Marge brute</span>
                      <span
                        className={`font-bold ${
                          stats.margeBruteHt >= 0 ? "text-emerald-300" : "text-red-600"
                        }`}
                      >
                        {fmtEuro(stats.margeBruteHt)} ({stats.margeBrutePct.toFixed(1)} %)
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Tableau comparatif détaillé par chantier */}
            <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#1B1511] shadow-xs">
              <div className="flex items-center justify-between border-b border-white/10 px-4 py-3">
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-[#D96B27]" />
                  <h2 className="text-sm font-bold text-[#F5EFEA]">
                    Comparatif Devis Matériaux vs Achats Fournisseurs par chantier
                  </h2>
                </div>
                <span className="text-xs text-[#8E7F74]">
                  {lignesAnalyseFiltrees.length} chantier(s)
                </span>
              </div>

              {lignesAnalyseFiltrees.length === 0 ? (
                <p className="p-6 text-center text-sm text-[#8E7F74]">
                  Aucune donnée devis ou commande disponible pour ce filtre.
                </p>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead className="bg-[#120F0D] text-[11px] font-bold uppercase tracking-wider text-[#B8A99E]">
                      <tr>
                        <th className="px-4 py-3">Chantier</th>
                        <th className="px-4 py-3">Métier</th>
                        <th className="px-4 py-3 text-right">Cmdes</th>
                        <th className="px-4 py-3 text-right">Ventes mat. HT</th>
                        <th className="px-4 py-3 text-right">Achats engagés HT</th>
                        <th className="px-4 py-3 text-right">Achats livrés HT</th>
                        <th className="px-4 py-3 text-right">Marge brute HT</th>
                        <th className="px-4 py-3 text-right">Marge %</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/10">
                      {lignesAnalyseFiltrees.map((l) => {
                        const badge = badgeMetierConfig(l.metier);
                        return (
                          <tr key={l.chantierId} className="hover:bg-[#120F0D]/70">
                            <td className="px-4 py-3">
                              <p className="font-bold text-[#F5EFEA]">{l.chantierNom}</p>
                              {l.clientNom && (
                                <p className="text-[11px] text-[#8E7F74]">{l.clientNom}</p>
                              )}
                            </td>
                            <td className="px-4 py-3">
                              <span
                                className={`inline-block rounded-full border px-2 py-0.5 text-[11px] font-bold ${badge.badgeClass}`}
                              >
                                {badge.label}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-[#B8A99E]">
                              {l.nbCommandes}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-[#F5EFEA]">
                              {fmtEuro(l.ventesMateriauxHt)}
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-[#D96B27]">
                              {fmtEuro(l.achatsEngagesHt)}
                            </td>
                            <td className="px-4 py-3 text-right text-emerald-300">
                              {fmtEuro(l.achatsLivresHt)}
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-bold ${
                                l.margeBruteHt >= 0 ? "text-emerald-300" : "text-red-600"
                              }`}
                            >
                              {fmtEuro(l.margeBruteHt)}
                            </td>
                            <td
                              className={`px-4 py-3 text-right font-bold ${
                                l.margeBrutePct >= 0 ? "text-emerald-300" : "text-red-600"
                              }`}
                            >
                              {l.margeBrutePct.toFixed(1)} %
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* MODAL NOUVEAU FOURNISSEUR */}
      {modalFournisseur && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setModalFournisseur(false)}
        >
          <form
            onSubmit={creerFournisseur}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-2xl border border-white/10 bg-[#1B1511] shadow-xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-4">
              <h2 className="text-base font-bold text-[#F5EFEA]">Nouveau fournisseur</h2>
              <button
                type="button"
                onClick={() => setModalFournisseur(false)}
                className="rounded-lg p-1.5 text-[#8E7F74] hover:bg-[#120F0D] hover:text-[#F5EFEA]"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-4">
              <input
                value={fNom}
                onChange={(e) => setFNom(e.target.value)}
                placeholder="Nom de l'entreprise"
                required
                className="w-full rounded-xl border border-white/10 bg-[#1B1511] px-3.5 py-2.5 text-xs text-[#F5EFEA] placeholder-[#999999] focus:border-[#D96B27] focus:outline-none"
              />
              <select
                value={fSpecialite}
                onChange={(e) => setFSpecialite(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#1B1511] px-3.5 py-2.5 text-xs text-[#F5EFEA] focus:border-[#D96B27] focus:outline-none"
                aria-label="Spécialité"
              >
                {SPECIALITES_FOURNISSEUR.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <div>
                <label
                  id="grp-statut-du-fournisseur"
                  className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#8E7F74]"
                >
                  Statut du fournisseur
                </label>
                <div
                  role="group"
                  aria-labelledby="grp-statut-du-fournisseur"
                  className="grid grid-cols-3 gap-2"
                >
                  {RELATIONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setFStatutRelation(r.value)}
                      className={`rounded-xl border px-2 py-2 text-xs font-bold transition-colors ${
                        fStatutRelation === r.value
                          ? r.couleurActif
                          : "border-white/10 bg-[#120F0D] text-[#B8A99E] hover:bg-[#221B17]"
                      }`}
                    >
                      {r.label}
                    </button>
                  ))}
                </div>
              </div>

              <input
                value={fContact}
                onChange={(e) => setFContact(e.target.value)}
                placeholder="Nom du contact"
                className="w-full rounded-xl border border-white/10 bg-[#1B1511] px-3.5 py-2.5 text-xs text-[#F5EFEA] placeholder-[#999999] focus:border-[#D96B27] focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={fTel}
                  onChange={(e) => setFTel(e.target.value)}
                  placeholder="Téléphone"
                  className="rounded-xl border border-white/10 bg-[#1B1511] px-3.5 py-2.5 text-xs text-[#F5EFEA] placeholder-[#999999] focus:border-[#D96B27] focus:outline-none"
                />
                <input
                  value={fEmail}
                  onChange={(e) => setFEmail(e.target.value)}
                  placeholder="Email"
                  className="rounded-xl border border-white/10 bg-[#1B1511] px-3.5 py-2.5 text-xs text-[#F5EFEA] placeholder-[#999999] focus:border-[#D96B27] focus:outline-none"
                />
              </div>
              <input
                value={fConditions}
                onChange={(e) => setFConditions(e.target.value)}
                placeholder="Conditions de paiement (ex. 30j fin de mois)"
                className="w-full rounded-xl border border-white/10 bg-[#1B1511] px-3.5 py-2.5 text-xs text-[#F5EFEA] placeholder-[#999999] focus:border-[#D96B27] focus:outline-none"
              />
              <textarea
                value={fNotes}
                onChange={(e) => setFNotes(e.target.value)}
                placeholder="Notes et commentaires"
                rows={2}
                className="w-full rounded-xl border border-white/10 bg-[#1B1511] px-3.5 py-2.5 text-xs text-[#F5EFEA] placeholder-[#999999] focus:border-[#D96B27] focus:outline-none"
              />
            </div>

            <div className="mt-auto flex shrink-0 justify-end gap-3 rounded-b-2xl border-t border-white/10 bg-[#120F0D] p-4">
              <button
                type="button"
                onClick={() => setModalFournisseur(false)}
                className="rounded-xl border border-white/10 bg-[#1B1511] px-4 py-2.5 text-xs font-semibold text-[#B8A99E] hover:bg-[#120F0D]"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#D96B27] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#E07A38]"
              >
                Enregistrer le fournisseur
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL NOUVELLE COMMANDE */}
      {modalCommande && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={fermerModalCommande}
        >
          <form
            onSubmit={creerCommande}
            onClick={(e) => e.stopPropagation()}
            className="flex max-h-[88vh] w-full max-w-xl flex-col rounded-2xl border border-white/10 bg-[#1B1511] shadow-xl"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-white/10 p-4">
              <h2 className="text-base font-bold text-[#F5EFEA]">
                {lignesMultiples ? "Commande depuis quantitatifs" : "Nouvelle commande"}
              </h2>
              <button
                type="button"
                onClick={fermerModalCommande}
                className="rounded-lg p-1.5 text-[#8E7F74] hover:bg-[#120F0D] hover:text-[#F5EFEA]"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="flex flex-1 flex-col gap-3.5 overflow-y-auto p-4">
              {/* Sélection chantier + Import quantitatifs Q_appro */}
              <div className="rounded-xl border border-white/10 bg-[#120F0D] p-3 space-y-2">
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#B8A99E]">
                  Chantier & Import quantitatifs (Bardage / Terrasse / Clôture)
                </label>
                <div className="flex flex-wrap gap-2">
                  <select
                    value={cChantierId}
                    onChange={(e) => setCChantierId(e.target.value)}
                    className="flex-1 min-w-[200px] rounded-xl border border-white/10 bg-[#1B1511] px-3 py-2 text-xs text-[#F5EFEA] focus:border-[#D96B27] focus:outline-none"
                    aria-label="Chantier"
                  >
                    <option value="">-- Chantier (optionnel) --</option>
                    {chantiers.map((c) => (
                      <option key={c.id} value={c.id}>
                        [{badgeMetierConfig(c.metier).label}] {c.nom || c.clients?.nom}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={importerQuantitatifsChantier}
                    disabled={importLoading || !cChantierId}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-[#D96B27]/30 bg-[#D96B27]/10 px-3 py-2 text-xs font-bold text-[#D96B27] hover:bg-[#D96B27]/15 disabled:opacity-50"
                  >
                    <Download className="h-3.5 w-3.5" />
                    {importLoading ? "Import..." : "Importer quantitatifs d'un chantier"}
                  </button>
                </div>
                {importMessage && (
                  <p className="text-xs font-medium text-[#D96B27]">{importMessage}</p>
                )}
              </div>

              {prefillInfo && (
                <div className="rounded-xl border border-[#D96B27]/25 bg-[#D96B27]/10 px-3.5 py-2 text-xs font-semibold text-[#D96B27]">
                  {prefillInfo.chantierNom} — {prefillInfo.zoneNom}
                </div>
              )}

              {lignesMultiples ? (
                <div className="space-y-2">
                  {lignesMultiples.map((l, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={l.designation}
                        onChange={(e) =>
                          updateLigneMultiple(i, { designation: e.target.value })
                        }
                        className="flex-1 rounded-xl border border-white/10 bg-[#1B1511] px-2.5 py-1.5 text-xs text-[#F5EFEA]"
                        aria-label="Désignation"
                      />
                      <input
                        type="number"
                        value={l.quantite}
                        onChange={(e) =>
                          updateLigneMultiple(i, {
                            quantite: parseFloat(e.target.value) || 0,
                          })
                        }
                        className="w-20 rounded-xl border border-white/10 bg-[#1B1511] px-2.5 py-1.5 text-xs text-[#F5EFEA]"
                        aria-label="Quantité"
                      />
                      <input
                        value={l.unite}
                        onChange={(e) => updateLigneMultiple(i, { unite: e.target.value })}
                        className="w-16 rounded-xl border border-white/10 bg-[#1B1511] px-2.5 py-1.5 text-xs text-[#F5EFEA]"
                        aria-label="Unité"
                      />
                      <button
                        type="button"
                        onClick={() => supprimerLigneMultiple(i)}
                        className="rounded-lg p-1 text-[#8E7F74] hover:text-red-600"
                        aria-label="Supprimer la ligne"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  ))}
                  <p className="text-[11px] text-[#8E7F74]">
                    Sélectionnez le fournisseur ci-dessous. Les lignes sans PU seront créées à chiffrer.
                  </p>
                </div>
              ) : (
                <input
                  value={cDesignation}
                  onChange={(e) => setCDesignation(e.target.value)}
                  placeholder="Désignation (ex. Bardage Douglas claire-voie)"
                  required
                  className="w-full rounded-xl border border-white/10 bg-[#1B1511] px-3.5 py-2.5 text-xs text-[#F5EFEA] placeholder-[#999999] focus:border-[#D96B27] focus:outline-none"
                />
              )}

              <select
                value={cFournisseurId}
                onChange={(e) => setCFournisseurId(e.target.value)}
                className="w-full rounded-xl border border-white/10 bg-[#1B1511] px-3.5 py-2.5 text-xs text-[#F5EFEA] focus:border-[#D96B27] focus:outline-none"
                aria-label="Fournisseur"
              >
                <option value="">-- Fournisseur (optionnel) --</option>
                {fournisseurs.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nom} {f.specialite ? `(${f.specialite})` : ""}
                  </option>
                ))}
              </select>

              {!lignesMultiples && (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <input
                    type="number"
                    value={cQuantite}
                    onChange={(e) => setCQuantite(e.target.value)}
                    placeholder="Quantité"
                    className="rounded-xl border border-white/10 bg-[#1B1511] px-3 py-2 text-xs text-[#F5EFEA] focus:border-[#D96B27] focus:outline-none"
                  />
                  <input
                    value={cUnite}
                    onChange={(e) => setCUnite(e.target.value)}
                    placeholder="Unité"
                    className="rounded-xl border border-white/10 bg-[#1B1511] px-3 py-2 text-xs text-[#F5EFEA] focus:border-[#D96B27] focus:outline-none"
                  />
                  <input
                    type="number"
                    value={cMontant}
                    onChange={(e) => setCMontant(e.target.value)}
                    placeholder="Montant HT (€)"
                    className="rounded-xl border border-white/10 bg-[#1B1511] px-3 py-2 text-xs text-[#F5EFEA] focus:border-[#D96B27] focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label
                  htmlFor="chp-date-livraison-prevue"
                  className="text-[11px] font-bold uppercase tracking-wider text-[#8E7F74]"
                >
                  Date de livraison prévue
                </label>
                <input
                  id="chp-date-livraison-prevue"
                  type="date"
                  value={cDateLivraison}
                  onChange={(e) => setCDateLivraison(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[#1B1511] px-3 py-2 text-xs text-[#F5EFEA] focus:border-[#D96B27] focus:outline-none"
                />
              </div>
            </div>

            <div className="mt-auto flex shrink-0 justify-end gap-3 rounded-b-2xl border-t border-white/10 bg-[#120F0D] p-4">
              <button
                type="button"
                onClick={fermerModalCommande}
                className="rounded-xl border border-white/10 bg-[#1B1511] px-4 py-2.5 text-xs font-semibold text-[#B8A99E] hover:bg-[#120F0D]"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-xl bg-[#D96B27] px-5 py-2.5 text-xs font-bold text-white shadow-xs hover:bg-[#E07A38]"
              >
                Enregistrer la commande
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL RÉCEPTION DE LIVRAISON */}
      {commandeReception && (
        <div
          className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-4 backdrop-blur-xs"
          onClick={() => setCommandeReception(null)}
        >
          <form
            onSubmit={validerReception}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-md rounded-2xl border border-white/10 bg-[#1B1511] shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-4">
              <div className="flex items-center gap-2">
                <Package className="h-4 w-4 text-[#D96B27]" />
                <h2 className="text-base font-bold text-[#F5EFEA]">
                  Réceptionner la livraison
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setCommandeReception(null)}
                className="rounded-lg p-1.5 text-[#8E7F74] hover:bg-[#120F0D]"
                aria-label="Fermer"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="space-y-3.5 p-4">
              <div className="rounded-xl border border-white/10 bg-[#120F0D] p-3 text-xs">
                <p className="font-bold text-[#F5EFEA]">{commandeReception.designation}</p>
                <p className="mt-0.5 text-[#B8A99E]">
                  {commandeReception.fournisseurs?.nom ?? "Fournisseur"} ·{" "}
                  {commandeReception.quantite ?? "—"} {commandeReception.unite ?? ""}
                </p>
              </div>

              <div>
                <label className="mb-1.5 block text-[11px] font-bold uppercase tracking-wider text-[#8E7F74]">
                  Type de réception
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setRStatut("livree")}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                      rStatut === "livree"
                        ? "border-emerald-300 bg-emerald-500/15 text-emerald-300"
                        : "border-white/10 bg-[#1B1511] text-[#B8A99E]"
                    }`}
                  >
                    Livraison totale
                  </button>
                  <button
                    type="button"
                    onClick={() => setRStatut("partiellement_livree")}
                    className={`rounded-xl border px-3 py-2 text-xs font-bold ${
                      rStatut === "partiellement_livree"
                        ? "border-amber-300 bg-amber-500/15 text-amber-300"
                        : "border-white/10 bg-[#1B1511] text-[#B8A99E]"
                    }`}
                  >
                    Partielle
                  </button>
                </div>
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#8E7F74]">
                  Date de livraison réelle
                </label>
                <input
                  type="date"
                  value={rDateReelle}
                  onChange={(e) => setRDateReelle(e.target.value)}
                  required
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[#1B1511] px-3 py-2 text-xs text-[#F5EFEA] focus:border-[#D96B27] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold uppercase tracking-wider text-[#8E7F74]">
                  N° Bon de livraison (BL) / Réserves éventuelles
                </label>
                <textarea
                  value={rNoteBl}
                  onChange={(e) => setRNoteBl(e.target.value)}
                  rows={2}
                  placeholder="Ex. BL-2026-441 — Conforme, complet"
                  className="mt-1 w-full rounded-xl border border-white/10 bg-[#1B1511] px-3 py-2 text-xs text-[#F5EFEA] placeholder-[#999999] focus:border-[#D96B27] focus:outline-none"
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 rounded-b-2xl border-t border-white/10 bg-[#120F0D] p-4">
              <button
                type="button"
                onClick={() => setCommandeReception(null)}
                className="rounded-xl border border-white/10 bg-[#1B1511] px-4 py-2 text-xs font-semibold text-[#B8A99E]"
              >
                Annuler
              </button>
              <button
                type="submit"
                disabled={savingReception}
                className="rounded-xl bg-[#D96B27] px-5 py-2 text-xs font-bold text-white hover:bg-[#E07A38] disabled:opacity-60"
              >
                {savingReception ? "Validation..." : "Valider la réception"}
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL APERÇU ET IMPRESSION BON DE COMMANDE PDF */}
      {apercuCommande && (
        <div
          className="fixed inset-0 z-[210] overflow-y-auto bg-black/60 p-4 pt-12"
          onClick={() => setApercuCommande(null)}
        >
          <div className="mx-auto max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex justify-end gap-2 print:hidden">
              <button
                type="button"
                onClick={() => setCommandePourEmail(apercuCommande)}
                className="flex items-center gap-1.5 rounded-xl border border-[#D96B27]/40 bg-[#1B1511] px-4 py-2 text-xs font-bold text-[#D96B27] hover:bg-[#120F0D]"
              >
                <Mail className="h-3.5 w-3.5" />
                Envoyer par email
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-xl bg-[#D96B27] px-5 py-2 text-xs font-bold text-white shadow-sm hover:bg-[#E07A38]"
              >
                <Printer className="h-3.5 w-3.5" />
                Imprimer / Exporter PDF
              </button>
              <button
                type="button"
                onClick={() => setApercuCommande(null)}
                className="rounded-xl border border-white/10 bg-[#1B1511] px-4 py-2 text-xs font-semibold text-[#B8A99E] hover:bg-[#120F0D]"
              >
                Fermer
              </button>
            </div>
            <BonCommandePDF
              commande={{
                id: apercuCommande.id,
                created_at: apercuCommande.created_at,
                designation: apercuCommande.designation,
                quantite: apercuCommande.quantite,
                unite: apercuCommande.unite,
                montant_ht: apercuCommande.montant_ht,
                date_livraison_prevue: apercuCommande.date_livraison_prevue,
              }}
              fournisseur={{
                nom: apercuCommande.fournisseurs?.nom ?? "Fournisseur",
                contact: apercuCommande.fournisseurs?.contact ?? null,
                telephone: apercuCommande.fournisseurs?.telephone ?? null,
                email: apercuCommande.fournisseurs?.email ?? null,
                conditions_paiement:
                  apercuCommande.fournisseurs?.conditions_paiement ?? null,
              }}
              chantier={{
                nom: apercuCommande.chantiers?.nom ?? "Chantier BNA",
                adresse: apercuCommande.chantiers?.adresse_chantier ?? null,
                clientNom: apercuCommande.chantiers?.clients?.nom ?? null,
              }}
              entreprise={
                entreprise || {
                  raison_sociale: "BNA Bardage",
                  siret: null,
                  telephone: null,
                  email: null,
                  adresse: null,
                  code_postal: null,
                  ville: null,
                  assurance: null,
                  iban: null,
                  bic: null,
                  mentions_legales: null,
                  logo_url: "/logo-bna.png",
                }
              }
            />
          </div>
        </div>
      )}

      {/* MODAL ENVOI BON DE COMMANDE PAR EMAIL */}
      {commandePourEmail && (
        <EnvoyerCommandeModal
          commande={commandePourEmail}
          isOpen={Boolean(commandePourEmail)}
          onClose={() => setCommandePourEmail(null)}
          onSuccess={() => {
            fetchTout();
          }}
        />
      )}

      {/* FAB (+) */}
      <FloatingActionButton
        onClick={() =>
          tab === "fournisseurs" ? setModalFournisseur(true) : setModalCommande(true)
        }
        aria-label="Ajouter fournisseur ou commande"
      >
        <span className="text-2xl font-bold leading-none">+</span>
      </FloatingActionButton>
    </div>
  );
}

export default function FournisseursPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#120F0D] p-6 text-sm text-[#8E7F74]">
          Chargement du module Fournisseurs & Achats...
        </div>
      }
    >
      <FournisseursContenu />
    </Suspense>
  );
}

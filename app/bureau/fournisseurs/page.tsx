"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { TablesInsert, TablesUpdate } from "@/types/supabase";
import { Entreprise } from "@/types/entreprise";
import BonCommandePDF from "@/components/BonCommandePDF";
import { fmtEuro } from "@/lib/financeCalculs";
import SignaturePad from "@/components/SignaturePad";
import { PenTool, AlertTriangle } from "lucide-react";
import { analyserPerformancesFournisseurs, type AnalytiqueFournisseur } from "@/lib/fournisseursAnalytique";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
import { Surface } from '@/components/ui/Surface';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';

type StatutRelation = "principal" | "regulier" | "remplacant";

// O3-B6/N9 : le claim `app_metadata.entreprise_id` doit être un UUID avant d'être
// recopié dans une colonne `uuid`. Sans cette garde, un claim corrompu produirait
// une erreur PostgreSQL opaque ; avec elle, l'échec est explicite et sans écriture.
//
// Le retour est un PRÉDICAT DE TYPE (`value is string`) : c'est ce qui permet à
// TypeScript de rétrécir `string | null` en `string` après l'appel, et donc
// d'exiger `entreprise_id: string` dans l'objet inséré SANS assertion `as`.
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

type Chantier = { id: string; nom: string | null; clients: { nom: string } | null };

type Commande = {
  id: string;
  fournisseur_id: string | null;
  chantier_id: string | null;
  designation: string;
  quantite: number | null;
  unite: string | null;
  montant_ht: number | null;
  statut: string;
  date_livraison_prevue: string | null;
  date_livraison_reelle: string | null;
  date_commande: string | null;
  created_at: string;
  fournisseurs: { nom: string; contact: string | null; telephone: string | null; email: string | null; conditions_paiement: string | null } | null;
  chantiers: { nom: string | null; adresse_chantier: string | null; clients: { nom: string } | null } | null;
};

type LigneMultiple = { designation: string; quantite: number; unite: string };

const CLE_PREFILL_COMMANDE = "bna_prefill_commande";

function joursRetard(dateLivraisonPrevue: string): number {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  const prevue = new Date(dateLivraisonPrevue);
  prevue.setHours(0, 0, 0, 0);
  return Math.floor((now.getTime() - prevue.getTime()) / (1000 * 60 * 60 * 24));
}

const SPECIALITES = ["Bois", "Métal / Bac acier", "Composite", "Quincaillerie / Visserie", "Isolation", "Autre"];

const STATUTS = [
  { value: "a_commander", label: "À commander", emoji: "⚪", couleur: "border-slate-600 text-gray-300" },
  { value: "commandee", label: "Commandée", emoji: "🔴", couleur: "border-red-500/40 text-red-400" },
  { value: "partiellement_livree", label: "Partiellement livrée", emoji: "🟠", couleur: "border-white/10 text-gray-400" },
  { value: "livree", label: "Livrée", emoji: "🟢", couleur: "border-white/10 text-gray-400" },
  { value: "annulee", label: "Annulée", emoji: "🔴", couleur: "border-red-500/40 text-red-400" },
];

const RELATIONS: { value: StatutRelation; label: string; couleurActif: string }[] = [
  { value: "principal", label: "⭐ Principal", couleurActif: "border-red-500 bg-red-900/200/10 text-red-400" },
  { value: "regulier", label: "Régulier", couleurActif: "border-gray-500 bg-gray-500/10 text-gray-300" },
  { value: "remplacant", label: "Remplaçant", couleurActif: "border-slate-500 bg-transparent0/10 text-gray-300" },
];

function estMemeMois(dateStr: string | null, ref: Date) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

export default function FournisseursPage() {
  const [tab, setTab] = useState<"fournisseurs" | "commandes" | "analyse">("fournisseurs");
  const [devis, setDevis] = useState<any[]>([]);
  const [catalogue, setCatalogue] = useState<any[]>([]);

  const [fournisseurs, setFournisseurs] = useState<Fournisseur[]>([]);
  const [chantiers, setChantiers] = useState<Chantier[]>([]);
  const [commandes, setCommandes] = useState<Commande[]>([]);
  const [loading, setLoading] = useState(true);

  const [modalFournisseur, setModalFournisseur] = useState(false);
  const [fNom, setFNom] = useState("");
  const [fSpecialite, setFSpecialite] = useState(SPECIALITES[0]);
  const [fContact, setFContact] = useState("");
  const [fTel, setFTel] = useState("");
  const [fEmail, setFEmail] = useState("");
  const [fConditions, setFConditions] = useState("");
  const [fNotes, setFNotes] = useState("");
  const [fStatutRelation, setFStatutRelation] = useState<StatutRelation>("regulier");

  const [modalCommande, setModalCommande] = useState(false);
  const [cFournisseurId, setCFournisseurId] = useState("");
  const [cChantierId, setCChantierId] = useState("");
  const [cDesignation, setCDesignation] = useState("");
  const [cQuantite, setCQuantite] = useState("");
  const [cUnite, setCUnite] = useState("m²");
  const [cMontant, setCMontant] = useState("");
  const [cDateLivraison, setCDateLivraison] = useState("");

  const [apercuCommande, setApercuCommande] = useState<Commande | null>(null);
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null);

  // Mode "plusieurs lignes" — utilisé quand la commande arrive pré-remplie depuis un métré
  const [lignesMultiples, setLignesMultiples] = useState<LigneMultiple[] | null>(null);
  const [prefillInfo, setPrefillInfo] = useState<{ chantierNom: string; zoneNom: string } | null>(null);
  const [maintenant, setMaintenant] = useState<Date | null>(null);
  const [filtreCommandes, setFiltreCommandes] = useState<"toutes" | "en_retard">("toutes");

  async function fetchTout() {
    setLoading(true);
    const [fRes, chRes, coRes, settingsRes] = await Promise.all([
      supabase.from("fournisseurs").select("*").order("nom"),
      supabase.from("chantiers").select("id, nom, clients(nom)").order("created_at", { ascending: false }),
      supabase
        .from("commandes")
        .select("*, fournisseurs(nom, contact, telephone, email, conditions_paiement), chantiers(nom, adresse_chantier, clients(nom))")
        .order("created_at", { ascending: false }),
      supabase.from("entreprise_settings").select("*").eq("id", 1).single(),
    ]);
    if (fRes.data) setFournisseurs(fRes.data as Fournisseur[]);
    if (chRes.data) setChantiers(chRes.data as unknown as Chantier[]);
    if (coRes.data) setCommandes(coRes.data as unknown as Commande[]);
    if (settingsRes.data) setEntreprise(settingsRes.data);
    setLoading(false);
  }

  async function detecterRetards() {
    const today = new Date().toISOString().slice(0, 10);
    const lundi = new Date();
    lundi.setDate(lundi.getDate() - ((lundi.getDay() + 6) % 7));
    lundi.setHours(0, 0, 0, 0);
    const debutSemaine = lundi.toISOString().slice(0, 10);

    const retardataires = commandes.filter(
      (c) =>
        c.statut !== "livree" &&
        c.statut !== "annulee" &&
        c.date_livraison_prevue &&
        c.date_livraison_prevue < today
    );

    if (retardataires.length === 0) return;

    // O3-B6/N9 — REGRESSION CORRIGÉE.
    //
    // `notifications.entreprise_id` est NOT NULL depuis la migration d'isolation
    // du 2026-09-22 (part1 §4). Ce producteur, écrit le 2026-09-10, n'a jamais été
    // mis à jour : l'insert échouait (23502, ou à défaut le `with check` de la
    // policy `notifications_ent_insert`) et l'alerte « Livraison en retard » ne
    // partait plus — en silence, car l'erreur n'était ni déstructurée ni loguée.
    //
    // On réutilise le résolveur EXISTANT `lib/contexteEntreprise.ts` (déjà utilisé
    // par `app/bureau/factures` et `app/bureau/devis-factures`), qui lit le claim
    // `app_metadata.entreprise_id` de la session : c'est la MÊME source que
    // `entreprise_courante()` côté PostgREST, donc la valeur posée ici est
    // exactement celle que la RLS attend. Aucune constante de tenant en dur.
    // Pas de `chantier_id` ici (une notification de retard fournisseur n'est pas
    // rattachée à un chantier) : on prend donc la seconde branche du résolveur.
    const { entreprise_id } = await resoudreContexteEntreprise(null);

    // Fail-closed : sans contexte entreprise, AUCUNE écriture. Une notification
    // sans tenant serait refusée par la RLS de toute façon ; autant ne rien
    // tenter et le signaler explicitement.
    if (!estUuid(entreprise_id)) {
      console.error(
        "Fournisseurs : alerte de retard NON émise — contexte entreprise introuvable dans la session."
      );
      return;
    }

    const { data: existantes, error: erreurLecture } = await supabase
      .from("notifications")
      .select("lien")
      .eq("type", "commande_retard")
      // Double filtrage (RLS + `.eq()` explicite) : même modèle que /api/search.
      .eq("entreprise_id", entreprise_id)
      .gte("created_at", `${debutSemaine}T00:00:00`);

    if (erreurLecture) {
      console.error("Fournisseurs : lecture des notifications de retard impossible.", erreurLecture);
      return;
    }

    const dejaNotifiees = new Set((existantes ?? []).map((n) => n.lien));

    const aInserer = retardataires.filter((c) => !dejaNotifiees.has(`/bureau/fournisseurs?retard=${c.id}`));

    if (aInserer.length === 0) return;

    const rows: TablesInsert<"notifications">[] = aInserer.map((c) => {
      const jours = joursRetard(c.date_livraison_prevue!);
      const fournisseurNom = c.fournisseurs?.nom ?? "—";
      return {
        type: "commande_retard",
        titre: "Livraison en retard",
        message: `Commande « ${c.designation} » fournisseur ${fournisseurNom} en retard de J+${jours}`,
        lien: `/bureau/fournisseurs?retard=${c.id}`,
        lu: false,
        entreprise_id,
        // `destinataire_id` laissé à null : modèle COLLECTIF (O3-B6/N1), la
        // notification appartient au tenant, pas à un profil.
      };
    });

    // Pas d'assertion `as` : le type `Insert` exige `entreprise_id`, donc une
    // future régression de scopage devient une ERREUR DE COMPILATION.
    const { error: erreurInsert } = await supabase.from("notifications").insert(rows);

    if (erreurInsert) {
      console.error("Fournisseurs : alerte de retard NON émise.", erreurInsert);
    }
  }

  useEffect(() => {
    fetchTout();
    setMaintenant(new Date());
  }, []);

  useEffect(() => {
    if (commandes.length === 0) return;
    detecterRetards();
  }, [commandes]);

  // Récupère une éventuelle commande pré-remplie transmise depuis un métré (Chantier → Zone)
  useEffect(() => {
    const raw = localStorage.getItem(CLE_PREFILL_COMMANDE);
    if (!raw) return;
    try {
      const payload = JSON.parse(raw) as {
        chantierId: string;
        chantierNom: string;
        zoneNom: string;
        lignes: LigneMultiple[];
      };
      setCChantierId(payload.chantierId || "");
      setLignesMultiples(payload.lignes || []);
      setPrefillInfo({ chantierNom: payload.chantierNom, zoneNom: payload.zoneNom });
      setTab("commandes");
      setModalCommande(true);
    } catch {
      // payload invalide, on ignore
    }
    localStorage.removeItem(CLE_PREFILL_COMMANDE);
  }, []);

  const kpis = useMemo(() => {
    if (!maintenant) {
      return {
        commandesEnCours: 0,
        livraisonsAttendues: 0,
        achatsEngages: 0,
        achatsRecus: 0,
      };
    }

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

  const commandesFiltrees = useMemo(() => {
    if (filtreCommandes === "toutes") return commandes;
    const today = new Date().toISOString().slice(0, 10);
    return commandes.filter(
      (c) =>
        c.statut !== "livree" &&
        c.statut !== "annulee" &&
        c.date_livraison_prevue &&
        c.date_livraison_prevue < today
    );
  }, [commandes, filtreCommandes]);

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

  async function creerFournisseur(e: React.FormEvent) {
    e.preventDefault();
    if (!fNom) return;

    // O3-B9 : `fournisseurs` est une table RACINE (`entreprise_id` NOT NULL sans
    // défaut depuis le 2026-09-22, aucun trigger possible car pas de
    // `chantier_id`). Même source de vérité que le chemin N9 plus haut dans ce
    // fichier (claim `app_metadata.entreprise_id` = `entreprise_courante()`).
    const { entreprise_id } = await resoudreContexteEntreprise(null);

    // Fail-closed : sans contexte entreprise, AUCUNE écriture.
    if (!estUuid(entreprise_id)) {
      alert(
        "Impossible de créer le fournisseur : votre session ne contient pas d'entreprise identifiée. Reconnectez-vous et réessayez."
      );
      return;
    }

    // Pas d'assertion `as` : `entreprise_id` est rétréci en `string`, donc le type
    // `Insert` est réellement satisfait et une régression de scopage
    // redeviendrait une ERREUR DE COMPILATION.
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
    setCFournisseurId("");
    setCChantierId("");
    setCDesignation("");
    setCQuantite("");
    setCMontant("");
    setCDateLivraison("");
  }

  function updateLigneMultiple(index: number, patch: Partial<LigneMultiple>) {
    setLignesMultiples((ls) => (ls ? ls.map((l, i) => (i === index ? { ...l, ...patch } : l)) : ls));
  }

  function supprimerLigneMultiple(index: number) {
    setLignesMultiples((ls) => (ls ? ls.filter((_, i) => i !== index) : ls));
  }

  async function creerCommande(e: React.FormEvent) {
    e.preventDefault();

    // O3-B9 — `commandes` est une table ENFANT : le trigger
    // `tg_set_entreprise_par_chantier()` en dérive `entreprise_id`… MAIS il est
    // un NO-OP silencieux quand `chantier_id IS NULL`. Or ce formulaire propose
    // explicitement « -- Chantier (optionnel) -- » : le mode sans chantier est une
    // règle métier existante, on ne la rend PAS obligatoire.
    //
    // Le résolveur EXISTANT couvre exactement ce cas :
    //   chantier présent → `{entreprise_id: null}`, le trigger pose la valeur ;
    //   chantier absent   → `{entreprise_id: <claim>}`, on la pose nous-mêmes.
    const { chantier_id: chantierCtx, entreprise_id } =
      await resoudreContexteEntreprise(cChantierId || null);

    // Fail-closed sur la SEULE combinaison réellement bloquante : pas de parent
    // ET pas de claim. Si le chantier est présent, le trigger garantit le
    // remplissage ; sinon le claim doit être valide.
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
        montant_ht: null,
        date_livraison_prevue: cDateLivraison || null,
        statut: "a_commander",
        ...(entreprise_id ? { entreprise_id } : {}),
      }));
      // Assertion justifiée, et PROUVÉE SÛRE par la garde ci-dessus : le type
      // généré déclare `entreprise_id` requis, or on ne l'omet QUE dans la
      // branche où `chantierCtx` est non-null — donc où le trigger le pose.
      const { error } = await supabase.from("commandes").insert(inserts as TablesInsert<"commandes">[]);
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
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-white">Fournisseurs & Achats</h1>
        <p className="text-sm text-gray-400">Répertoire fournisseurs et suivi des commandes</p>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Surface className="p-3">
          <p className="text-xs text-gray-400">🏢 Fournisseurs actifs</p>
          <p className="mt-1 text-xl font-semibold text-white">{kpis.fournisseursActifs}</p>
        </Surface>
        <Surface className="p-3">
          <p className="text-xs text-gray-400">📦 Commandes en cours</p>
          <p className="mt-1 text-xl font-semibold text-white">{kpis.commandesEnCours}</p>
        </Surface>
        <Surface className="p-3">
          <p className="text-xs text-gray-400">🚚 Livraisons attendues</p>
          <p className="mt-1 text-xl font-semibold text-white">{kpis.livraisonsAttendues}</p>
        </Surface>
        <Surface className="p-3">
          <p className="text-xs text-gray-400">💰 Achats du mois</p>
          <p className="mt-1 text-sm text-white">
            Engagé : <span className="font-semibold">{kpis.achatsEngages.toFixed(0)} €</span>
          </p>
          <p className="text-sm text-gray-400">
            Reçu : <span className="font-semibold text-gray-400">{kpis.achatsRecus.toFixed(0)} €</span>
          </p>
        </Surface>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <button
          onClick={() => setModalFournisseur(true)}
          className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-red-600/10 transition-all hover:bg-red-700"
        >
          <span>+</span> Nouveau Fournisseur
        </button>
        <button
          onClick={() => setModalCommande(true)}
          className="flex items-center gap-1.5 rounded-xl border border-white/10 bg-[#1A1D24] px-4 py-2 text-xs font-semibold text-gray-200 hover:bg-[#1A1D24]"
        >
          <span>📦</span> Nouvelle Commande
        </button>
      </div>

      <div className="flex gap-2 mb-4">
        {(["fournisseurs", "commandes", "analyse"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`text-sm whitespace-nowrap transition-all ${
              tab === t
                ? "bg-red-600 text-white font-medium rounded-full px-4 py-2 shadow-md"
                : "bg-[#1A1D24]/80 text-gray-400 hover:text-white rounded-full px-4 py-2 border border-white/5 transition-all"
            }`}
          >
            {t === "fournisseurs" ? "🏢 Fournisseurs" : t === "commandes" ? "📦 Commandes Matériaux" : "📊 Analyse des Marges"}
          </button>
        ))}
      </div>

      {tab === "fournisseurs" && (
        <div className="space-y-4">
          {loading ? (
            <p className="text-sm text-gray-400">Chargement…</p>
          ) : fournisseurs.length === 0 ? (
            <p className="text-sm text-gray-500">Aucun fournisseur pour l&apos;instant.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {fournisseurs.map((f) => {
                const relation = RELATIONS.find((r) => r.value === f.statut_relation) ?? RELATIONS[1];
                return (
                  <Surface key={f.id} className="p-4">
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-white">{f.nom}</p>
                        <div className="mt-1 flex flex-wrap gap-1.5">
                          {f.specialite && (
                            <span className="inline-block rounded-full border border-slate-600 px-2 py-0.5 text-xs text-gray-400">
                              {f.specialite}
                            </span>
                          )}
                          <span
                            className={`inline-block rounded-full border px-2 py-0.5 text-xs font-medium ${relation.couleurActif}`}
                          >
                            {relation.label}
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={() => supprimerFournisseur(f)}
                        className="text-xs text-gray-500 hover:text-red-400"
                        aria-label="Supprimer le fournisseur"
                      >
                        🗑️
                      </button>
                    </div>
                    {f.contact && <p className="mt-2 text-sm text-gray-400">{f.contact}</p>}
                    <div className="mt-2 flex flex-wrap gap-3 text-sm">
                      {f.telephone && (
                        <a href={`tel:${f.telephone}`} className="font-medium text-red-400 hover:text-red-300">
                          📞 {f.telephone}
                        </a>
                      )}
                      {f.email && (
                        <a href={`mailto:${f.email}`} className="font-medium text-gray-300 hover:text-gray-400">
                          ✉️ {f.email}
                        </a>
                      )}
                    </div>
                    {f.conditions_paiement && (
                      <p className="mt-2 text-xs text-gray-500">Paiement : {f.conditions_paiement}</p>
                    )}
                    {f.notes && <p className="mt-1 text-xs text-gray-500">{f.notes}</p>}
                  </Surface>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "commandes" && (
        <div className="space-y-4">
          <div className="flex gap-2">
            {(["toutes", "en_retard"] as const).map((f) => (
              <button
                key={f}
                onClick={() => setFiltreCommandes(f)}
                className={`text-xs whitespace-nowrap transition-all ${
                  filtreCommandes === f
                    ? f === "en_retard"
                      ? "bg-red-600 text-white font-medium rounded-full px-4 py-2 shadow-md"
                      : "bg-red-600 text-white font-medium rounded-full px-4 py-2 shadow-md"
                    : "bg-[#1A1D24]/80 text-gray-400 hover:text-white rounded-full px-4 py-2 border border-white/5 transition-all"
                }`}
              >
                {f === "toutes" ? "Toutes" : `⚠️ En retard (${nbRetards})`}
              </button>
            ))}
          </div>
          {loading ? (
            <p className="text-sm text-gray-400">Chargement…</p>
          ) : commandesFiltrees.length === 0 ? (
            <p className="text-sm text-gray-500">
              {filtreCommandes === "en_retard" ? "Aucune commande en retard." : "Aucune commande pour l&apos;instant."}
            </p>
          ) : (
            <div className="space-y-2">
              {commandesFiltrees.map((c) => {
                const statutInfo = STATUTS.find((s) => s.value === c.statut) ?? STATUTS[0];
                const today = new Date().toISOString().slice(0, 10);
                const enRetard =
                  c.statut !== "livree" &&
                  c.statut !== "annulee" &&
                  c.date_livraison_prevue &&
                  c.date_livraison_prevue < today;
                const retardJours = enRetard ? joursRetard(c.date_livraison_prevue!) : 0;
                return (
                  <div
                    key={c.id}
                    className={`flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-[#1A1D24] p-4 ${
                      enRetard ? "border-red-500/40" : "border-white/10"
                    }`}
                  >
                    <div>
                      <p className="font-medium text-white">
                        {c.designation}
                        {enRetard && (
                          <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-red-600 px-2 py-0.5 text-2xs font-bold text-white">
                            <AlertTriangle className="h-3 w-3" />
                            EN RETARD J+{retardJours}
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-gray-500">
                        {c.fournisseurs?.nom ?? "—"} ·{" "}
                        {c.chantiers?.nom ?? c.chantiers?.clients?.nom ?? "Sans chantier"}
                        {c.quantite ? ` · ${c.quantite} ${c.unite}` : ""}
                        {c.montant_ht ? ` · ${fmtEuro(c.montant_ht)} HT` : ""}
                      </p>
                      <p className="text-xs text-gray-500 flex items-center gap-1.5 mt-1">
                        Commande passée le :
                        <input
                          type="date"
                          value={c.date_commande ?? ""}
                          onChange={(e) => definirDateCommande(c, e.target.value)}
                          className="rounded border border-slate-600 bg-transparent px-1.5 py-0.5 text-xs text-gray-300"
                          aria-label="Date de commande"
                        />
                      </p>
                      {c.date_livraison_prevue && (
                        <p className="text-xs text-gray-500">
                          Livraison prévue : {new Date(c.date_livraison_prevue).toLocaleDateString("fr-FR")}
                        </p>
                      )}
                      {c.date_livraison_reelle && (
                        <p className="text-xs text-gray-400">
                          Livré le : {new Date(c.date_livraison_reelle).toLocaleDateString("fr-FR")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setApercuCommande(c)}
                        className="rounded-lg border border-slate-600 bg-transparent px-2.5 py-1 text-xs text-gray-300 hover:bg-[#1A1D24] hover:text-gray-400"
                        title="Voir et imprimer le bon de commande officiel"
                      >
                        📄 Bon de commande
                      </button>
                      <select
                        value={c.statut}
                        onChange={(e) => changerStatutCommande(c, e.target.value)}
                        className={`rounded-lg border bg-transparent px-2 py-1 text-xs ${statutInfo.couleur}`}
                        aria-label="Statut de la commande"
                      >
                        {STATUTS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.emoji} {s.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => supprimerCommande(c)}
                        className="text-xs text-gray-500 hover:text-red-400"
                        aria-label="Supprimer la commande"
                      >
                        🗑️
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {modalFournisseur && (
        <div
          className="fixed inset-0 z-[210] pt-48 flex items-center justify-center p-4 pb-28 bg-black/80 backdrop-blur-sm"
          onClick={() => setModalFournisseur(false)}
        >
          <form
            onSubmit={creerFournisseur}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1A1D24] w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl border border-white/10 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-4 shrink-0">
              <h2 className="text-base font-bold text-white">Nouveau Fournisseur</h2>
              <button type="button" onClick={() => setModalFournisseur(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1A1D24] hover:text-white" aria-label="Fermer">
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
              <input
                value={fNom}
                onChange={(e) => setFNom(e.target.value)}
                placeholder="Nom de l'entreprise"
                required
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-red-600 focus:outline-none"
              />
              <select
                value={fSpecialite}
                onChange={(e) => setFSpecialite(e.target.value)}
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white focus:border-red-600 focus:outline-none"
                aria-label="Spécialité"
              >
                {SPECIALITES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <div>
                <label className="mb-1 block text-3xs font-semibold uppercase text-gray-400">Statut du fournisseur</label>
                <div className="grid grid-cols-3 gap-2">
                  {RELATIONS.map((r) => (
                    <button
                      key={r.value}
                      type="button"
                      onClick={() => setFStatutRelation(r.value)}
                      className={`rounded-xl border px-2 py-2 text-xs font-bold transition-colors ${
                        fStatutRelation === r.value
                          ? r.couleurActif
                          : "border-white/10 bg-transparent text-gray-400 hover:bg-[#1A1D24]"
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
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-red-600 focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={fTel}
                  onChange={(e) => setFTel(e.target.value)}
                  placeholder="Téléphone"
                  className="rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-red-600 focus:outline-none"
                />
                <input
                  value={fEmail}
                  onChange={(e) => setFEmail(e.target.value)}
                  placeholder="Email"
                  className="rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-red-600 focus:outline-none"
                />
              </div>
              <input
                value={fConditions}
                onChange={(e) => setFConditions(e.target.value)}
                placeholder="Conditions de paiement (ex. 30j fin de mois)"
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-red-600 focus:outline-none"
              />
              <textarea
                value={fNotes}
                onChange={(e) => setFNotes(e.target.value)}
                placeholder="Notes et commentaires"
                rows={2}
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-red-600 focus:outline-none"
              />
            </div>

            <div className="p-4 border-t border-white/10 flex justify-end gap-3 mt-auto shrink-0 bg-[#1A1D24] rounded-b-xl">
              <button
                type="button"
                onClick={() => setModalFournisseur(false)}
                className="rounded-xl border border-slate-600 bg-[#1A1D24] px-4 py-2.5 text-xs font-semibold text-gray-300 hover:bg-[#1A1D24]"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-red-700 shadow-md"
              >
                Enregistrer le Fournisseur
              </button>
            </div>
          </form>
        </div>
      )}

      {modalCommande && (
        <div
          className="fixed inset-0 z-[210] pt-48 flex items-center justify-center p-4 pb-24 bg-black/80 backdrop-blur-sm"
          onClick={fermerModalCommande}
        >
          <form
            onSubmit={creerCommande}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1A1D24] w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl border border-white/10 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-4 shrink-0">
              <h2 className="text-base font-bold text-white">
                {lignesMultiples ? "Commande depuis un métré" : "Nouvelle commande"}
              </h2>
              <button type="button" onClick={fermerModalCommande} className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1A1D24] hover:text-white" aria-label="Fermer">
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
              {prefillInfo && (
                <p className="rounded-xl border border-red-600/30 bg-sky-950/40 px-3.5 py-2 text-xs font-semibold text-gray-400">
                  {prefillInfo.chantierNom} — {prefillInfo.zoneNom}
                </p>
              )}

              {lignesMultiples ? (
                <div className="space-y-2">
                  {lignesMultiples.map((l, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        value={l.designation}
                        onChange={(e) => updateLigneMultiple(i, { designation: e.target.value })}
                        className="flex-1 rounded-xl border border-slate-600 bg-transparent px-2.5 py-1.5 text-xs text-white"
                        aria-label="Désignation"
                      />
                      <input
                        type="number"
                        value={l.quantite}
                        onChange={(e) => updateLigneMultiple(i, { quantite: parseFloat(e.target.value) || 0 })}
                        className="w-20 rounded-xl border border-slate-600 bg-transparent px-2.5 py-1.5 text-xs text-white"
                        aria-label="Quantité"
                      />
                      <input
                        value={l.unite}
                        onChange={(e) => updateLigneMultiple(i, { unite: e.target.value })}
                        className="w-16 rounded-xl border border-slate-600 bg-transparent px-2.5 py-1.5 text-xs text-white"
                        aria-label="Unité"
                      />
                      <button
                        type="button"
                        onClick={() => supprimerLigneMultiple(i)}
                        className="text-xs text-gray-500 hover:text-red-400 font-bold"
                        aria-label="Supprimer la ligne"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <p className="text-3xs text-gray-400">
                    Complète le fournisseur ci-dessous. Les prix sont à ajouter ensuite sur chaque commande.
                  </p>
                </div>
              ) : (
                <input
                  value={cDesignation}
                  onChange={(e) => setCDesignation(e.target.value)}
                  placeholder="Désignation (ex. Bardage Douglas claire-voie)"
                  required
                  className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-red-600 focus:outline-none"
                />
              )}

              <select
                value={cFournisseurId}
                onChange={(e) => setCFournisseurId(e.target.value)}
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white focus:border-red-600 focus:outline-none"
                aria-label="Fournisseur"
              >
                <option value="">-- Fournisseur (optionnel) --</option>
                {fournisseurs.map((f) => (
                  <option key={f.id} value={f.id}>
                    {f.nom}
                  </option>
                ))}
              </select>
              
              <select
                value={cChantierId}
                onChange={(e) => setCChantierId(e.target.value)}
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white focus:border-red-600 focus:outline-none"
                aria-label="Chantier"
              >
                <option value="">-- Chantier (optionnel) --</option>
                {chantiers.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.nom || c.clients?.nom}
                  </option>
                ))}
              </select>

              {!lignesMultiples && (
                <div className="grid grid-cols-3 gap-3">
                  <input
                    type="number"
                    value={cQuantite}
                    onChange={(e) => setCQuantite(e.target.value)}
                    placeholder="Quantité"
                    className="rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                  />
                  <input
                    value={cUnite}
                    onChange={(e) => setCUnite(e.target.value)}
                    placeholder="Unité"
                    className="rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                  />
                  <input
                    type="number"
                    value={cMontant}
                    onChange={(e) => setCMontant(e.target.value)}
                    placeholder="Montant HT"
                    className="rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label htmlFor="chp-date-livraison-prevue" className="text-3xs font-semibold uppercase text-gray-400">Date livraison prévue</label>
                <input id="chp-date-livraison-prevue"
                  type="date"
                  value={cDateLivraison}
                  onChange={(e) => setCDateLivraison(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                />
              </div>
            </div>

            <div className="p-4 border-t border-white/10 flex justify-end gap-3 mt-auto shrink-0 bg-[#1A1D24] rounded-b-xl">
              <button
                type="button"
                onClick={fermerModalCommande}
                className="rounded-xl border border-slate-600 bg-[#1A1D24] px-4 py-2.5 text-xs font-semibold text-gray-300 hover:bg-[#1A1D24]"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-red-700 shadow-md"
              >
                Enregistrer la Commande
              </button>
            </div>
          </form>
        </div>
      )}

      {/* MODAL APERÇU ET IMPRESSION BON DE COMMANDE PDF */}
      {apercuCommande && (
        <div
          className="fixed inset-0 z-[210] pt-48 overflow-y-auto bg-black/70 p-4"
          onClick={() => setApercuCommande(null)}
        >
          <div className="mx-auto max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex justify-end gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-red-600/10 hover:bg-red-700 transition-all"
              >
                <span>🖨️</span> Imprimer / Exporter PDF
              </button>
              <button
                type="button"
                onClick={() => setApercuCommande(null)}
                className="rounded-xl border border-slate-600 bg-[#1A1D24] px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-[#1A1D24]"
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
                conditions_paiement: apercuCommande.fournisseurs?.conditions_paiement ?? null,
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

      {/* FAB (+) */}
      <FloatingActionButton
        onClick={() => (tab === "fournisseurs" ? setModalFournisseur(true) : setModalCommande(true))}
        aria-label="Ajouter fournisseur ou commande"
      >
        <span className="text-2xl font-bold leading-none">+</span>
      </FloatingActionButton>
    </div>
  );
}

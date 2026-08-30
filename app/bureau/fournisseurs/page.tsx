"use client";

import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/lib/supabase";
import BonCommandePDF from "@/components/BonCommandePDF";
import SignaturePad from "@/components/SignaturePad";
import { PenTool } from "lucide-react";

type StatutRelation = "principal" | "regulier" | "remplacant";

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
  created_at: string;
  fournisseurs: { nom: string } | null;
  chantiers: { nom: string | null; clients: { nom: string } | null } | null;
};

type LigneMultiple = { designation: string; quantite: number; unite: string };

const CLE_PREFILL_COMMANDE = "bna_prefill_commande";

const SPECIALITES = ["Bois", "Métal / Bac acier", "Composite", "Quincaillerie / Visserie", "Isolation", "Autre"];

const STATUTS = [
  { value: "a_commander", label: "À commander", emoji: "⚪", couleur: "border-slate-600 text-gray-300" },
  { value: "commandee", label: "Commandée", emoji: "🔵", couleur: "border-sky-500/40 text-sky-400" },
  { value: "partiellement_livree", label: "Partiellement livrée", emoji: "🟠", couleur: "border-white/10 text-gray-400" },
  { value: "livree", label: "Livrée", emoji: "🟢", couleur: "border-white/10 text-gray-400" },
  { value: "annulee", label: "Annulée", emoji: "🔴", couleur: "border-red-500/40 text-red-400" },
];

const RELATIONS: { value: StatutRelation; label: string; couleurActif: string }[] = [
  { value: "principal", label: "⭐ Principal", couleurActif: "border-red-500 bg-red-900/200/10 text-red-400" },
  { value: "regulier", label: "Régulier", couleurActif: "border-sky-500 bg-sky-500/10 text-sky-400" },
  { value: "remplacant", label: "Remplaçant", couleurActif: "border-slate-500 bg-transparent0/10 text-gray-300" },
];

function estMemeMois(dateStr: string | null, ref: Date) {
  if (!dateStr) return false;
  const d = new Date(dateStr);
  return d.getFullYear() === ref.getFullYear() && d.getMonth() === ref.getMonth();
}

export default function FournisseursPage() {
  const [tab, setTab] = useState<"fournisseurs" | "commandes">("fournisseurs");

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
  const [entreprise, setEntreprise] = useState<any>(null);

  // Mode "plusieurs lignes" — utilisé quand la commande arrive pré-remplie depuis un métré
  const [lignesMultiples, setLignesMultiples] = useState<LigneMultiple[] | null>(null);
  const [prefillInfo, setPrefillInfo] = useState<{ chantierNom: string; zoneNom: string } | null>(null);
  const [maintenant, setMaintenant] = useState<Date | null>(null);

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

  useEffect(() => {
    fetchTout();
    setMaintenant(new Date());
  }, []);

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

  async function creerFournisseur(e: React.FormEvent) {
    e.preventDefault();
    if (!fNom) return;
    const { error } = await supabase.from("fournisseurs").insert({
      nom: fNom,
      specialite: fSpecialite,
      contact: fContact || null,
      telephone: fTel || null,
      email: fEmail || null,
      conditions_paiement: fConditions || null,
      notes: fNotes || null,
      statut_relation: fStatutRelation,
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

    if (lignesMultiples) {
      if (lignesMultiples.length === 0) return;
      const inserts = lignesMultiples.map((l) => ({
        fournisseur_id: cFournisseurId || null,
        chantier_id: cChantierId || null,
        designation: l.designation,
        quantite: l.quantite || null,
        unite: l.unite,
        montant_ht: null,
        date_livraison_prevue: cDateLivraison || null,
        statut: "a_commander",
      }));
      const { error } = await supabase.from("commandes").insert(inserts);
      if (error) {
        alert("Erreur : " + error.message);
        return;
      }
    } else {
      if (!cDesignation) return;
      const { error } = await supabase.from("commandes").insert({
        fournisseur_id: cFournisseurId || null,
        chantier_id: cChantierId || null,
        designation: cDesignation,
        quantite: cQuantite ? parseFloat(cQuantite) : null,
        unite: cUnite,
        montant_ht: cMontant ? parseFloat(cMontant) : null,
        date_livraison_prevue: cDateLivraison || null,
        statut: "a_commander",
      });
      if (error) {
        alert("Erreur : " + error.message);
        return;
      }
    }

    fermerModalCommande();
    fetchTout();
  }

  async function changerStatutCommande(c: Commande, statut: string) {
    const updates: Record<string, unknown> = { statut };
    if (statut === "livree" && !c.date_livraison_reelle) {
      updates.date_livraison_reelle = new Date().toISOString().slice(0, 10);
    }
    const { error } = await supabase.from("commandes").update(updates).eq("id", c.id);
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
        <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-3">
          <p className="text-xs text-gray-400">🏢 Fournisseurs actifs</p>
          <p className="mt-1 text-xl font-semibold text-white">{kpis.fournisseursActifs}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-3">
          <p className="text-xs text-gray-400">📦 Commandes en cours</p>
          <p className="mt-1 text-xl font-semibold text-white">{kpis.commandesEnCours}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-3">
          <p className="text-xs text-gray-400">🚚 Livraisons attendues</p>
          <p className="mt-1 text-xl font-semibold text-white">{kpis.livraisonsAttendues}</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-3">
          <p className="text-xs text-gray-400">💰 Achats du mois</p>
          <p className="mt-1 text-sm text-white">
            Engagé : <span className="font-semibold">{kpis.achatsEngages.toFixed(0)} €</span>
          </p>
          <p className="text-sm text-gray-400">
            Reçu : <span className="font-semibold text-gray-400">{kpis.achatsRecus.toFixed(0)} €</span>
          </p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2.5">
        <button
          onClick={() => setModalFournisseur(true)}
          className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-red-600/10 transition-all hover:bg-red-700"
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

      <div className="flex gap-2 border-b border-white/10/80">
        {(["fournisseurs", "commandes"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-bold transition-all ${
              tab === t
                ? "border-b-2 border-sky-400 text-sky-400"
                : "text-gray-400 hover:text-gray-200"
            }`}
          >
            {t === "fournisseurs" ? "🏢 Fournisseurs" : "📦 Commandes Matériaux"}
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
                  <div key={f.id} className="rounded-xl border border-white/10 bg-[#1A1D24] p-4">
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
                        <a href={`mailto:${f.email}`} className="font-medium text-sky-400 hover:text-sky-300">
                          ✉️ {f.email}
                        </a>
                      )}
                    </div>
                    {f.conditions_paiement && (
                      <p className="mt-2 text-xs text-gray-500">Paiement : {f.conditions_paiement}</p>
                    )}
                    {f.notes && <p className="mt-1 text-xs text-gray-500">{f.notes}</p>}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === "commandes" && (
        <div className="space-y-4">
          {loading ? (
            <p className="text-sm text-gray-400">Chargement…</p>
          ) : commandes.length === 0 ? (
            <p className="text-sm text-gray-500">Aucune commande pour l&apos;instant.</p>
          ) : (
            <div className="space-y-2">
              {commandes.map((c) => {
                const statutInfo = STATUTS.find((s) => s.value === c.statut) ?? STATUTS[0];
                return (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/10 bg-[#1A1D24] p-4"
                  >
                    <div>
                      <p className="font-medium text-white">{c.designation}</p>
                      <p className="text-xs text-gray-500">
                        {c.fournisseurs?.nom ?? "—"} ·{" "}
                        {c.chantiers?.nom ?? c.chantiers?.clients?.nom ?? "Sans chantier"}
                        {c.quantite ? ` · ${c.quantite} ${c.unite}` : ""}
                        {c.montant_ht ? ` · ${c.montant_ht.toFixed(2)} € HT` : ""}
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
                        className="rounded-lg border border-slate-600 bg-transparent px-2.5 py-1 text-xs text-sky-400 hover:bg-[#1A1D24] hover:text-sky-300"
                        title="Voir et imprimer le bon de commande officiel"
                      >
                        📄 Bon de commande
                      </button>
                      <select
                        value={c.statut}
                        onChange={(e) => changerStatutCommande(c, e.target.value)}
                        className={`rounded-lg border bg-transparent px-2 py-1 text-xs ${statutInfo.couleur}`}
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
          className="fixed inset-0 z-[210] pt-36 flex items-center justify-center p-4 pb-28 bg-black/80 backdrop-blur-sm"
          onClick={() => setModalFournisseur(false)}
        >
          <form
            onSubmit={creerFournisseur}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1A1D24] w-full max-w-lg max-h-[85vh] flex flex-col rounded-xl border border-white/10 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-4 shrink-0">
              <h2 className="text-base font-bold text-white">Nouveau Fournisseur</h2>
              <button type="button" onClick={() => setModalFournisseur(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1A1D24] hover:text-white">
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
              <input
                value={fNom}
                onChange={(e) => setFNom(e.target.value)}
                placeholder="Nom de l'entreprise"
                required
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
              />
              <select
                value={fSpecialite}
                onChange={(e) => setFSpecialite(e.target.value)}
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white focus:border-sky-500 focus:outline-none"
              >
                {SPECIALITES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>

              <div>
                <label className="mb-1 block text-[11px] font-semibold uppercase text-gray-400">Statut du fournisseur</label>
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
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={fTel}
                  onChange={(e) => setFTel(e.target.value)}
                  placeholder="Téléphone"
                  className="rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
                <input
                  value={fEmail}
                  onChange={(e) => setFEmail(e.target.value)}
                  placeholder="Email"
                  className="rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              </div>
              <input
                value={fConditions}
                onChange={(e) => setFConditions(e.target.value)}
                placeholder="Conditions de paiement (ex. 30j fin de mois)"
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
              />
              <textarea
                value={fNotes}
                onChange={(e) => setFNotes(e.target.value)}
                placeholder="Notes et commentaires"
                rows={2}
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
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
                className="rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-red-700 shadow-md"
              >
                Enregistrer le Fournisseur
              </button>
            </div>
          </form>
        </div>
      )}

      {modalCommande && (
        <div
          className="fixed inset-0 z-[210] pt-36 flex items-center justify-center p-4 pb-24 bg-black/80 backdrop-blur-sm"
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
              <button type="button" onClick={fermerModalCommande} className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1A1D24] hover:text-white">
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
              {prefillInfo && (
                <p className="rounded-xl border border-sky-500/30 bg-sky-950/40 px-3.5 py-2 text-xs font-semibold text-sky-300">
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
                      />
                      <input
                        type="number"
                        value={l.quantite}
                        onChange={(e) => updateLigneMultiple(i, { quantite: parseFloat(e.target.value) || 0 })}
                        className="w-20 rounded-xl border border-slate-600 bg-transparent px-2.5 py-1.5 text-xs text-white"
                      />
                      <input
                        value={l.unite}
                        onChange={(e) => updateLigneMultiple(i, { unite: e.target.value })}
                        className="w-16 rounded-xl border border-slate-600 bg-transparent px-2.5 py-1.5 text-xs text-white"
                      />
                      <button
                        type="button"
                        onClick={() => supprimerLigneMultiple(i)}
                        className="text-xs text-gray-500 hover:text-red-400 font-bold"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <p className="text-[11px] text-gray-400">
                    Complète le fournisseur ci-dessous. Les prix sont à ajouter ensuite sur chaque commande.
                  </p>
                </div>
              ) : (
                <input
                  value={cDesignation}
                  onChange={(e) => setCDesignation(e.target.value)}
                  placeholder="Désignation (ex. Bardage Douglas claire-voie)"
                  required
                  className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none"
                />
              )}

              <select
                value={cFournisseurId}
                onChange={(e) => setCFournisseurId(e.target.value)}
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white focus:border-sky-500 focus:outline-none"
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
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white focus:border-sky-500 focus:outline-none"
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
                    className="rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                  />
                  <input
                    value={cUnite}
                    onChange={(e) => setCUnite(e.target.value)}
                    placeholder="Unité"
                    className="rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                  />
                  <input
                    type="number"
                    value={cMontant}
                    onChange={(e) => setCMontant(e.target.value)}
                    placeholder="Montant HT"
                    className="rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
                  />
                </div>
              )}

              <div>
                <label className="text-[11px] font-semibold uppercase text-gray-400">Date livraison prévue</label>
                <input
                  type="date"
                  value={cDateLivraison}
                  onChange={(e) => setCDateLivraison(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-sky-500 focus:outline-none"
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
                className="rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-red-700 shadow-md"
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
          className="fixed inset-0 z-[210] pt-36 overflow-y-auto bg-black/70 p-4"
          onClick={() => setApercuCommande(null)}
        >
          <div className="mx-auto max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex justify-end gap-2 print:hidden">
              <button
                type="button"
                onClick={() => window.print()}
                className="flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-red-600/10 hover:bg-red-700 transition-all"
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
                nom: (apercuCommande.fournisseurs as any)?.nom || "Fournisseur",
                contact: (apercuCommande.fournisseurs as any)?.contact || null,
                telephone: (apercuCommande.fournisseurs as any)?.telephone || null,
                email: (apercuCommande.fournisseurs as any)?.email || null,
                conditions_paiement: (apercuCommande.fournisseurs as any)?.conditions_paiement || null,
              }}
              chantier={{
                nom: (apercuCommande.chantiers as any)?.nom || "Chantier BNA",
                adresse: (apercuCommande.chantiers as any)?.adresse_chantier || null,
                clientNom: (apercuCommande.chantiers as any)?.clients?.nom || null,
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
                  logo_url: "/logo-bna.png",
                }
              }
            />
          </div>
        </div>
      )}

      {/* FAB (+) */}
      <button
        onClick={() => (tab === "fournisseurs" ? setModalFournisseur(true) : setModalCommande(true))}
        aria-label="Ajouter fournisseur ou commande"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-slate-950 shadow-2xl shadow-red-600/10 transition-transform active:scale-95 hover:scale-105 hover:bg-red-700"
      >
        <span className="text-2xl font-bold leading-none">+</span>
      </button>
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";

type Fournisseur = {
  id: string;
  nom: string;
  specialite: string | null;
  contact: string | null;
  telephone: string | null;
  email: string | null;
  conditions_paiement: string | null;
  notes: string | null;
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
  fournisseurs: { nom: string } | null;
  chantiers: { nom: string | null; clients: { nom: string } | null } | null;
};

const SPECIALITES = ["Bois", "Métal / Bac acier", "Composite", "Quincaillerie / Visserie", "Isolation", "Autre"];

const STATUTS = [
  { value: "a_commander", label: "À commander", couleur: "border-slate-600 text-slate-300" },
  { value: "commande", label: "Commandé", couleur: "border-amber-500/40 text-amber-400" },
  { value: "livre", label: "Livré", couleur: "border-emerald-500/40 text-emerald-400" },
];

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

  const [modalCommande, setModalCommande] = useState(false);
  const [cFournisseurId, setCFournisseurId] = useState("");
  const [cChantierId, setCChantierId] = useState("");
  const [cDesignation, setCDesignation] = useState("");
  const [cQuantite, setCQuantite] = useState("");
  const [cUnite, setCUnite] = useState("m²");
  const [cMontant, setCMontant] = useState("");
  const [cDateLivraison, setCDateLivraison] = useState("");

  async function fetchTout() {
    setLoading(true);
    const [fRes, chRes, coRes] = await Promise.all([
      supabase.from("fournisseurs").select("*").order("nom"),
      supabase.from("chantiers").select("id, nom, clients(nom)").order("created_at", { ascending: false }),
      supabase
        .from("commandes")
        .select("*, fournisseurs(nom), chantiers(nom, clients(nom))")
        .order("created_at", { ascending: false }),
    ]);
    if (fRes.data) setFournisseurs(fRes.data as Fournisseur[]);
    if (chRes.data) setChantiers(chRes.data as unknown as Chantier[]);
    if (coRes.data) setCommandes(coRes.data as unknown as Commande[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchTout();
  }, []);

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
    fetchTout();
  }

  async function supprimerFournisseur(f: Fournisseur) {
    if (!confirm(`Supprimer ${f.nom} ?`)) return;
    const { error } = await supabase.from("fournisseurs").delete().eq("id", f.id);
    if (!error) fetchTout();
  }

  async function creerCommande(e: React.FormEvent) {
    e.preventDefault();
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
    setModalCommande(false);
    setCFournisseurId("");
    setCChantierId("");
    setCDesignation("");
    setCQuantite("");
    setCMontant("");
    setCDateLivraison("");
    fetchTout();
  }

  async function changerStatutCommande(c: Commande, statut: string) {
    const { error } = await supabase.from("commandes").update({ statut }).eq("id", c.id);
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
        <p className="text-sm text-slate-400">Répertoire fournisseurs et suivi des commandes</p>
      </div>

      <div className="flex gap-1 border-b border-slate-700">
        {(["fournisseurs", "commandes"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-3 py-2 text-sm font-medium ${
              tab === t ? "border-b-2 border-red-500 text-white" : "text-slate-400"
            }`}
          >
            {t === "fournisseurs" ? "Fournisseurs" : "Commandes"}
          </button>
        ))}
      </div>

      {tab === "fournisseurs" && (
        <div className="space-y-4">
          <button
            onClick={() => setModalFournisseur(true)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
          >
            + Nouveau fournisseur
          </button>

          {loading ? (
            <p className="text-sm text-slate-400">Chargement…</p>
          ) : fournisseurs.length === 0 ? (
            <p className="text-sm text-slate-500">Aucun fournisseur pour l&apos;instant.</p>
          ) : (
            <div className="grid gap-3 sm:grid-cols-2">
              {fournisseurs.map((f) => (
                <div key={f.id} className="rounded-xl border border-slate-700 bg-slate-800 p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <p className="font-semibold text-white">{f.nom}</p>
                      {f.specialite && (
                        <span className="mt-1 inline-block rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-400">
                          {f.specialite}
                        </span>
                      )}
                    </div>
                    <button
                      onClick={() => supprimerFournisseur(f)}
                      className="text-xs text-slate-500 hover:text-red-400"
                    >
                      🗑️
                    </button>
                  </div>
                  {f.contact && <p className="mt-2 text-sm text-slate-400">{f.contact}</p>}
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
                    <p className="mt-2 text-xs text-slate-500">Paiement : {f.conditions_paiement}</p>
                  )}
                  {f.notes && <p className="mt-1 text-xs text-slate-500">{f.notes}</p>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {tab === "commandes" && (
        <div className="space-y-4">
          <button
            onClick={() => setModalCommande(true)}
            className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
          >
            + Nouvelle commande
          </button>

          {loading ? (
            <p className="text-sm text-slate-400">Chargement…</p>
          ) : commandes.length === 0 ? (
            <p className="text-sm text-slate-500">Aucune commande pour l&apos;instant.</p>
          ) : (
            <div className="space-y-2">
              {commandes.map((c) => {
                const statutInfo = STATUTS.find((s) => s.value === c.statut) ?? STATUTS[0];
                return (
                  <div
                    key={c.id}
                    className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-slate-700 bg-slate-800 p-4"
                  >
                    <div>
                      <p className="font-medium text-white">{c.designation}</p>
                      <p className="text-xs text-slate-500">
                        {c.fournisseurs?.nom ?? "—"} ·{" "}
                        {c.chantiers?.nom ?? c.chantiers?.clients?.nom ?? "Sans chantier"}
                        {c.quantite ? ` · ${c.quantite} ${c.unite}` : ""}
                        {c.montant_ht ? ` · ${c.montant_ht.toFixed(2)} € HT` : ""}
                      </p>
                      {c.date_livraison_prevue && (
                        <p className="text-xs text-slate-500">
                          Livraison prévue : {new Date(c.date_livraison_prevue).toLocaleDateString("fr-FR")}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <select
                        value={c.statut}
                        onChange={(e) => changerStatutCommande(c, e.target.value)}
                        className={`rounded-lg border bg-slate-900 px-2 py-1 text-xs ${statutInfo.couleur}`}
                      >
                        {STATUTS.map((s) => (
                          <option key={s.value} value={s.value}>
                            {s.label}
                          </option>
                        ))}
                      </select>
                      <button
                        onClick={() => supprimerCommande(c)}
                        className="text-xs text-slate-500 hover:text-red-400"
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
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setModalFournisseur(false)}
        >
          <form
            onSubmit={creerFournisseur}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-3 rounded-xl border border-slate-700 bg-slate-800 p-6"
          >
            <h2 className="text-lg font-semibold text-white">Nouveau fournisseur</h2>
            <input
              value={fNom}
              onChange={(e) => setFNom(e.target.value)}
              placeholder="Nom"
              required
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
            <select
              value={fSpecialite}
              onChange={(e) => setFSpecialite(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              {SPECIALITES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
            <input
              value={fContact}
              onChange={(e) => setFContact(e.target.value)}
              placeholder="Nom du contact"
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={fTel}
                onChange={(e) => setFTel(e.target.value)}
                placeholder="Téléphone"
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
              <input
                value={fEmail}
                onChange={(e) => setFEmail(e.target.value)}
                placeholder="Email"
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
            </div>
            <input
              value={fConditions}
              onChange={(e) => setFConditions(e.target.value)}
              placeholder="Conditions de paiement (ex. 30j fin de mois)"
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
            <textarea
              value={fNotes}
              onChange={(e) => setFNotes(e.target.value)}
              placeholder="Notes"
              rows={2}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalFournisseur(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}

      {modalCommande && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setModalCommande(false)}
        >
          <form
            onSubmit={creerCommande}
            onClick={(e) => e.stopPropagation()}
            className="w-full max-w-lg space-y-3 rounded-xl border border-slate-700 bg-slate-800 p-6"
          >
            <h2 className="text-lg font-semibold text-white">Nouvelle commande</h2>
            <input
              value={cDesignation}
              onChange={(e) => setCDesignation(e.target.value)}
              placeholder="Désignation (ex. Bardage Douglas claire-voie)"
              required
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
            <select
              value={cFournisseurId}
              onChange={(e) => setCFournisseurId(e.target.value)}
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
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
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">-- Chantier (optionnel) --</option>
              {chantiers.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.nom || c.clients?.nom}
                </option>
              ))}
            </select>
            <div className="grid grid-cols-3 gap-3">
              <input
                type="number"
                value={cQuantite}
                onChange={(e) => setCQuantite(e.target.value)}
                placeholder="Quantité"
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
              <input
                value={cUnite}
                onChange={(e) => setCUnite(e.target.value)}
                placeholder="Unité"
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
              <input
                type="number"
                value={cMontant}
                onChange={(e) => setCMontant(e.target.value)}
                placeholder="Montant HT"
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
            </div>
            <div>
              <label className="text-xs uppercase text-slate-500">Date livraison prévue</label>
              <input
                type="date"
                value={cDateLivraison}
                onChange={(e) => setCDateLivraison(e.target.value)}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setModalCommande(false)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-300"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                Enregistrer
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}

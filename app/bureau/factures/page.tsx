"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DocumentPDF from "@/components/DocumentPDF";
import { prochainNumero } from "@/lib/documents";

type Client = {
  id: string;
  nom: string;
  societe: string | null;
  adresse_facturation: string | null;
  code_postal: string | null;
  ville: string | null;
  tel: string | null;
  email: string | null;
};

type Ligne = { designation: string; description?: string; qte: number; unite: string; pu_ht: number };

type Devis = {
  id: string;
  numero: string;
  client_id: string;
  objet: string | null;
  adresse_chantier: string | null;
  type_travaux: string | null;
  lignes: Ligne[];
  tva_pct: number;
  statut: string;
};

type Facture = {
  id: string;
  numero: string;
  client_id: string;
  devis_id: string | null;
  objet: string | null;
  adresse_chantier: string | null;
  type_travaux: string | null;
  date_emission: string;
  echeance: string | null;
  statut: string;
  type_facture: "acompte" | "solde" | "totale";
  lignes: Ligne[];
  tva_pct: number;
  clients: Client | null;
};

type Entreprise = {
  raison_sociale: string;
  siret: string | null;
  telephone: string | null;
  email: string | null;
  adresse: string | null;
  code_postal: string | null;
  ville: string | null;
  assurance: string | null;
  iban: string | null;
  bic: string | null;
  mentions_legales: string | null;
  logo_url: string | null;
};

const LIGNE_VIDE: Ligne = { designation: "", description: "", qte: 1, unite: "forfait", pu_ht: 0 };

export default function FacturesPage() {
  const [factures, setFactures] = useState<Facture[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [devisAcceptes, setDevisAcceptes] = useState<Devis[]>([]);
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOuvert, setModalOuvert] = useState(false);
  const [apercu, setApercu] = useState<Facture | null>(null);

  const [depuisDevis, setDepuisDevis] = useState("");
  const [clientId, setClientId] = useState("");
  const [objet, setObjet] = useState("");
  const [adresseChantier, setAdresseChantier] = useState("");
  const [typeTravaux, setTypeTravaux] = useState("");
  const [echeance, setEcheance] = useState("");
  const [typeFacture, setTypeFacture] = useState<"acompte" | "solde" | "totale">("totale");
  const [tva, setTva] = useState(10);
  const [lignes, setLignes] = useState<Ligne[]>([{ ...LIGNE_VIDE }]);

  async function fetchTout() {
    setLoading(true);
    const [facturesRes, clientsRes, devisRes, settingsRes] = await Promise.all([
      supabase
        .from("factures")
        .select("*, clients(*)")
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("*").order("nom"),
      supabase.from("devis").select("*").eq("statut", "accepte"),
      supabase.from("entreprise_settings").select("*").eq("id", 1).single(),
    ]);
    if (facturesRes.error) console.error(facturesRes.error);
    else setFactures(facturesRes.data as Facture[]);
    if (clientsRes.data) setClients(clientsRes.data as Client[]);
    if (devisRes.data) setDevisAcceptes(devisRes.data as Devis[]);
    if (settingsRes.data) setEntreprise(settingsRes.data as Entreprise);
    setLoading(false);
  }

  useEffect(() => {
    fetchTout();
  }, []);

  function chargerDepuisDevis(devisId: string) {
    setDepuisDevis(devisId);
    if (!devisId) return;
    const d = devisAcceptes.find((x) => x.id === devisId);
    if (!d) return;
    setClientId(d.client_id);
    setObjet(d.objet ?? "");
    setAdresseChantier(d.adresse_chantier ?? "");
    setTypeTravaux(d.type_travaux ?? "");
    setTva(d.tva_pct);
    setLignes(d.lignes.length ? d.lignes : [{ ...LIGNE_VIDE }]);
  }

  function ajouterLigne() {
    setLignes((l) => [...l, { ...LIGNE_VIDE }]);
  }

  function updateLigne(i: number, patch: Partial<Ligne>) {
    setLignes((l) => l.map((ligne, idx) => (idx === i ? { ...ligne, ...patch } : ligne)));
  }

  function supprimerLigne(i: number) {
    setLignes((l) => l.filter((_, idx) => idx !== i));
  }

  const totalHT = lignes.reduce((s, l) => s + l.qte * l.pu_ht, 0);

  async function creerFacture(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return;

    const numero = await prochainNumero("factures", "FAC");

    const { error } = await supabase.from("factures").insert({
      numero,
      devis_id: depuisDevis || null,
      client_id: clientId,
      objet: objet || null,
      adresse_chantier: adresseChantier || null,
      type_travaux: typeTravaux || null,
      echeance: echeance || null,
      tva_pct: tva,
      type_facture: typeFacture,
      statut: "brouillon",
      lignes,
    });

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }

    setModalOuvert(false);
    setDepuisDevis("");
    setClientId("");
    setObjet("");
    setAdresseChantier("");
    setTypeTravaux("");
    setEcheance("");
    setTypeFacture("totale");
    setLignes([{ ...LIGNE_VIDE }]);
    fetchTout();
  }

  async function changerStatut(f: Facture, statut: string) {
    const { error } = await supabase.from("factures").update({ statut }).eq("id", f.id);
    if (!error) fetchTout();
  }

  async function supprimerFacture(f: Facture) {
    if (!confirm(`Supprimer la facture ${f.numero} ?`)) return;
    const { error } = await supabase.from("factures").delete().eq("id", f.id);
    if (!error) fetchTout();
  }

  function imprimer() {
    window.print();
  }

  const caEncaisse = factures
    .filter((f) => f.statut === "payee")
    .reduce((s, f) => s + f.lignes.reduce((t, l) => t + l.qte * l.pu_ht, 0) * (1 + f.tva_pct / 100), 0);
  const enAttente = factures
    .filter((f) => f.statut === "envoyee")
    .reduce((s, f) => s + f.lignes.reduce((t, l) => t + l.qte * l.pu_ht, 0) * (1 + f.tva_pct / 100), 0);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold text-white">Factures</h1>
          <p className="text-sm text-slate-400">Encaissements et suivi du régime simplifié</p>
        </div>
        <button
          onClick={() => setModalOuvert(true)}
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
        >
          + Nouvelle facture
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">CA encaissé</p>
          <p className="text-xl font-semibold text-white">{caEncaisse.toFixed(2)} €</p>
        </div>
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <p className="text-xs uppercase tracking-wide text-slate-500">En attente de paiement</p>
          <p className="text-xl font-semibold text-white">{enAttente.toFixed(2)} €</p>
        </div>
      </div>

      {loading ? (
        <p className="text-sm text-slate-400">Chargement…</p>
      ) : factures.length === 0 ? (
        <p className="text-sm text-slate-500">Aucune facture pour l&apos;instant.</p>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-700">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-800 text-left text-xs uppercase text-slate-500">
                <th className="p-3">Numéro</th>
                <th className="p-3">Client</th>
                <th className="p-3">Objet</th>
                <th className="p-3">Date</th>
                <th className="p-3 text-right">Total TTC</th>
                <th className="p-3">Statut</th>
                <th className="p-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {factures.map((f) => {
                const ht = f.lignes.reduce((s, l) => s + l.qte * l.pu_ht, 0);
                const ttc = ht * (1 + f.tva_pct / 100);
                return (
                  <tr key={f.id} className="border-b border-slate-800">
                    <td className="p-3 font-medium text-white">
                      {f.numero}
                      {f.type_facture !== "totale" && (
                        <span className="ml-2 rounded-full bg-red-600/20 px-2 py-0.5 text-[10px] uppercase text-red-400">
                          {f.type_facture}
                        </span>
                      )}
                    </td>
                    <td className="p-3 text-slate-300">
                      {f.clients?.societe || f.clients?.nom}
                    </td>
                    <td className="p-3 text-slate-400">{f.objet || "—"}</td>
                    <td className="p-3 text-slate-400">
                      {new Date(f.date_emission).toLocaleDateString("fr-FR")}
                    </td>
                    <td className="p-3 text-right text-slate-300">{ttc.toFixed(2)} €</td>
                    <td className="p-3">
                      <select
                        value={f.statut}
                        onChange={(e) => changerStatut(f, e.target.value)}
                        className="rounded-lg border border-slate-600 bg-slate-900 px-2 py-1 text-xs text-slate-100"
                      >
                        <option value="brouillon">Brouillon</option>
                        <option value="envoyee">Envoyée</option>
                        <option value="payee">Payée</option>
                      </select>
                    </td>
                    <td className="p-3">
                      <div className="flex gap-2 text-xs">
                        <button
                          onClick={() => setApercu(f)}
                          className="text-sky-400 hover:text-sky-300"
                        >
                          👁️
                        </button>
                        <button
                          onClick={() => supprimerFacture(f)}
                          className="text-red-400 hover:text-red-300"
                        >
                          🗑️
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {modalOuvert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setModalOuvert(false)}
        >
          <form
            onSubmit={creerFacture}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Nouvelle facture</h2>
              <button type="button" onClick={() => setModalOuvert(false)} className="text-slate-400">
                ✕
              </button>
            </div>

            {devisAcceptes.length > 0 && (
              <select
                value={depuisDevis}
                onChange={(e) => chargerDepuisDevis(e.target.value)}
                className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              >
                <option value="">-- Créer depuis un devis accepté (optionnel) --</option>
                {devisAcceptes.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.numero} — {d.objet}
                  </option>
                ))}
              </select>
            )}

            <select
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
              required
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            >
              <option value="">-- Choisir un client --</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.societe ? `${c.societe} (${c.nom})` : c.nom}
                </option>
              ))}
            </select>

            <input
              value={objet}
              onChange={(e) => setObjet(e.target.value)}
              placeholder="Objet"
              className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            />
            <div className="grid grid-cols-2 gap-3">
              <input
                value={adresseChantier}
                onChange={(e) => setAdresseChantier(e.target.value)}
                placeholder="Adresse du chantier"
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
              <input
                value={typeTravaux}
                onChange={(e) => setTypeTravaux(e.target.value)}
                placeholder="Type de travaux"
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-xs uppercase text-slate-500">Échéance</label>
                <input
                  type="date"
                  value={echeance}
                  onChange={(e) => setEcheance(e.target.value)}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs uppercase text-slate-500">TVA (%)</label>
                <input
                  type="number"
                  step="0.1"
                  value={tva}
                  onChange={(e) => setTva(parseFloat(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
              </div>
            </div>

            <div>
              <label className="text-xs uppercase text-slate-500">Type de facture</label>
              <select
                value={typeFacture}
                onChange={(e) => setTypeFacture(e.target.value as typeof typeFacture)}
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
              >
                <option value="totale">Totale</option>
                <option value="acompte">Acompte</option>
                <option value="solde">Solde</option>
              </select>
            </div>

            <div className="space-y-2">
              <p className="text-xs uppercase tracking-wide text-slate-500">Lignes de prestation</p>
              {lignes.map((l, i) => (
                <div key={i} className="grid grid-cols-12 gap-2">
                  <input
                    value={l.designation}
                    onChange={(e) => updateLigne(i, { designation: e.target.value })}
                    placeholder="Désignation"
                    className="col-span-4 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                  />
                  <input
                    type="number"
                    value={l.qte}
                    onChange={(e) => updateLigne(i, { qte: parseFloat(e.target.value) || 0 })}
                    placeholder="Qté"
                    className="col-span-2 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                  />
                  <input
                    value={l.unite}
                    onChange={(e) => updateLigne(i, { unite: e.target.value })}
                    placeholder="Unité"
                    className="col-span-2 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                  />
                  <input
                    type="number"
                    value={l.pu_ht}
                    onChange={(e) => updateLigne(i, { pu_ht: parseFloat(e.target.value) || 0 })}
                    placeholder="PU HT"
                    className="col-span-3 rounded-lg border border-slate-600 bg-slate-900 px-2 py-1.5 text-sm text-slate-100"
                  />
                  <button
                    type="button"
                    onClick={() => supprimerLigne(i)}
                    className="col-span-1 text-red-400 hover:text-red-300"
                  >
                    ✕
                  </button>
                </div>
              ))}
              <button
                type="button"
                onClick={ajouterLigne}
                className="text-sm font-medium text-red-400 hover:text-red-300"
              >
                + Ajouter une ligne
              </button>
            </div>

            <p className="text-right text-sm font-semibold text-white">
              Total HT : {totalHT.toFixed(2)} €
            </p>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setModalOuvert(false)}
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

      {apercu && entreprise && (
        <div
          className="fixed inset-0 z-50 overflow-y-auto bg-black/70 p-4"
          onClick={() => setApercu(null)}
        >
          <div className="mx-auto max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex justify-end gap-2 print:hidden">
              <button
                onClick={imprimer}
                className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
              >
                🖨️ Imprimer / PDF
              </button>
              <button
                onClick={() => setApercu(null)}
                className="rounded-lg border border-slate-600 px-4 py-2 text-sm text-slate-200"
              >
                Fermer
              </button>
            </div>
            <DocumentPDF
              doc={{
                kind: "facture",
                numero: apercu.numero,
                statut: apercu.statut,
                date_emission: apercu.date_emission,
                echeance: apercu.echeance,
                objet: apercu.objet,
                adresse_chantier: apercu.adresse_chantier,
                type_travaux: apercu.type_travaux,
                lignes: apercu.lignes,
                tva_pct: apercu.tva_pct,
                type_facture: apercu.type_facture,
              }}
              entreprise={entreprise}
              client={
                apercu.clients ?? {
                  nom: "Client inconnu",
                  societe: null,
                  adresse_facturation: null,
                  code_postal: null,
                  ville: null,
                  tel: null,
                  email: null,
                }
              }
            />
          </div>
        </div>
      )}
    </div>
  );
}

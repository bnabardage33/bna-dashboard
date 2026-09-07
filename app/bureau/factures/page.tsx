"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type { FactureFinance } from "@/types/finance";
import DocumentPDF from "@/components/DocumentPDF";
import SignaturePad from "@/components/SignaturePad";
import LettreRelancePDF, { RelanceData } from "@/components/LettreRelancePDF";
import { AlertCircle, PenTool } from "lucide-react";
import { prochainNumero } from "@/lib/documents";

type CatalogueOuvrage = {
  id: string;
  famille_label: string;
  designation: string;
  description: string;
  unite: string;
  pu_ht: number;
};

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
  const [catalogue, setCatalogue] = useState<CatalogueOuvrage[]>([]);
  const [devisAcceptes, setDevisAcceptes] = useState<Devis[]>([]);
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOuvert, setModalOuvert] = useState(false);
  const [apercu, setApercu] = useState<Facture | null>(null);
  const [modeSignature, setModeSignature] = useState(false);
  const [signatureData, setSignatureData] = useState<{ image: string; nom: string } | null>(null);
  const [apercuRelance, setApercuRelance] = useState<{ facture: Facture, penalites: boolean } | null>(null);

  const [depuisDevis, setDepuisDevis] = useState("");
  const [clientId, setClientId] = useState("");
  const [objet, setObjet] = useState("");
  const [adresseChantier, setAdresseChantier] = useState("");
  const [typeTravaux, setTypeTravaux] = useState("");
  const [echeance, setEcheance] = useState("");
  const [typeFacture, setTypeFacture] = useState<"acompte" | "solde" | "totale">("totale");
  const [tva, setTva] = useState(10);
  const [lignes, setLignes] = useState<Ligne[]>([{ ...LIGNE_VIDE }]);
  const [totalDevisHT, setTotalDevisHT] = useState<number | null>(null);
  const [dejaFactureHT, setDejaFactureHT] = useState<number | null>(null);

  async function fetchTout() {
    setLoading(true);
    const [facturesRes, clientsRes, devisRes, settingsRes, catRes] = await Promise.all([
      supabase
        .from("factures")
        .select("*, clients(*)")
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("*").order("nom"),
      supabase.from("devis").select("*").eq("statut", "accepte"),
      supabase.from("entreprise_settings").select("*").eq("id", 1).single(),
      supabase.from("catalogue_ouvrages").select("*").order("designation"),
    ]);
    if (facturesRes.error) console.error(facturesRes.error);
    else setFactures(facturesRes.data as Facture[]);
    if (clientsRes.data) setClients(clientsRes.data as Client[]);
    if (catRes && catRes.data) setCatalogue(catRes.data as CatalogueOuvrage[]);
    if (devisRes.data) setDevisAcceptes(devisRes.data as Devis[]);
    if (settingsRes.data) setEntreprise(settingsRes.data as Entreprise);
    setLoading(false);
  }

  useEffect(() => {
    fetchTout();
  }, []);

  useEffect(() => {
    if (typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const typeParam = params.get("type");
      const clientParam = params.get("clientId");
      const objetParam = params.get("objet");
      if (typeParam === "solde" || clientParam || objetParam) {
        if (typeParam === "solde") setTypeFacture("solde");
        if (clientParam) setClientId(clientParam);
        if (objetParam) setObjet(objetParam);
        setModalOuvert(true);
      }
    }
  }, []);

  async function chargerDepuisDevis(devisId: string) {
    setDepuisDevis(devisId);
    setTotalDevisHT(null);
    setDejaFactureHT(null);
    if (!devisId) return;
    const d = devisAcceptes.find((x) => x.id === devisId);
    if (!d) return;
    setClientId(d.client_id);
    setObjet(d.objet ?? "");
    setAdresseChantier(d.adresse_chantier ?? "");
    setTypeTravaux(d.type_travaux ?? "");
    setTva(d.tva_pct);
    setLignes(d.lignes.length ? d.lignes : [{ ...LIGNE_VIDE }]);

    const totalHT = d.lignes.reduce((s, l) => s + l.qte * l.pu_ht, 0);
    setTotalDevisHT(totalHT);

    const { data: facturesExistantes } = await supabase
      .from("factures")
      .select("lignes")
      .eq("devis_id", devisId);

    const deja = (facturesExistantes ?? []).reduce(
      (s: number, f: FactureFinance) => s + f.lignes.reduce((t: number, l: { qte: number; pu_ht: number }) => t + l.qte * l.pu_ht, 0),
      0
    );
    setDejaFactureHT(deja);
  }

  function remplirAcompte(pourcentage = 30) {
    if (totalDevisHT === null || totalDevisHT <= 0) return;
    const montantAcompte = Math.round(totalDevisHT * (pourcentage / 100) * 100) / 100;
    setLignes([
      {
        designation: `Acompte de ${pourcentage}% à la commande`,
        description: objet ? `Acompte de ${pourcentage}% sur : ${objet}` : undefined,
        qte: 1,
        unite: "forfait",
        pu_ht: montantAcompte,
      },
    ]);
    setTypeFacture("acompte");
  }

  function remplirSolde() {
    if (totalDevisHT === null || dejaFactureHT === null) return;
    const reste = Math.max(0, totalDevisHT - dejaFactureHT);
    setLignes([
      {
        designation: "Solde de facturation",
        description: objet || undefined,
        qte: 1,
        unite: "forfait",
        pu_ht: Math.round(reste * 100) / 100,
      },
    ]);
    setTypeFacture("solde");
  }

  function insererDepuisCatalogue(ouvrageId: string) {
    if (!ouvrageId) return;
    const ouv = catalogue.find((o) => o.id === ouvrageId);
    if (!ouv) return;
    setLignes((prev) => {
      const nettes = prev.filter((l) => l.designation.trim() || l.pu_ht > 0);
      return [
        ...nettes,
        {
          designation: ouv.designation,
          description: ouv.description,
          qte: 1,
          unite: ouv.unite,
          pu_ht: ouv.pu_ht,
        },
      ];
    });
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
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Factures &amp; Encaissements</h1>
          <p className="text-xs text-gray-400">Émission des factures d&apos;acompte, solde et suivi de la trésorerie</p>
        </div>
        <button
          onClick={() => setModalOuvert(true)}
          className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-red-600/10 transition-all hover:bg-red-700"
        >
          <span>+</span> Nouvelle Facture
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-2xl border border-white/10 bg-[#1A1D24] p-4 shadow-sm">
          <p className="text-[10px] uppercase font-bold tracking-wider text-gray-400">CA Encaissé (Payé)</p>
          <p className="text-2xl font-black text-white font-mono mt-0.5">{caEncaisse.toFixed(2)} €</p>
        </div>
        <div className="rounded-2xl border border-white/10 bg-[#1A1D24] p-4 shadow-sm">
          <p className="text-[10px] uppercase font-bold tracking-wider text-gray-400">En attente de règlement</p>
          <p className="text-2xl font-black text-white font-mono mt-0.5">{enAttente.toFixed(2)} €</p>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10/60 bg-[#1A1D24]/40 p-12 text-center text-xs text-gray-400">
          Chargement des factures…
        </div>
      ) : factures.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#1A1D24]/30 p-12 text-center space-y-3">
          <p className="text-sm font-medium text-gray-400">Aucune facture pour l&apos;instant.</p>
          <button
            onClick={() => setModalOuvert(true)}
            className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-red-700"
          >
            + Créer une première facture
          </button>
        </div>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2">
          {factures.map((f) => {
            const ht = f.lignes.reduce((s, l) => s + l.qte * l.pu_ht, 0);
            const ttc = ht * (1 + f.tva_pct / 100);
            const nomClient = f.clients?.societe || f.clients?.nom || "Client direct";

            return (
              <div
                key={f.id}
                className={`flex flex-col justify-between rounded-2xl border bg-[#1A1D24] p-4.5 shadow-md transition-all ${f.statut === "envoyee" && f.echeance && new Date(f.echeance) < new Date() ? "border-rose-500/60 hover:border-rose-400 bg-rose-950/10" : "border-white/10 hover:border-red-600/60 hover:bg-[#1A1D24]"}`}
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-gray-300">{f.numero}</span>
                        {f.type_facture !== "totale" && (
                          <span className="rounded-full bg-red-600/15 border border-red-600/40 px-2 py-0.5 text-[10px] font-bold uppercase text-gray-400">
                            {f.type_facture}
                          </span>
                        )}
                        <span className="text-xs text-gray-500">· {new Date(f.date_emission).toLocaleDateString("fr-FR")}</span>
                      </div>
                      <h2 className="text-base font-bold text-white mt-0.5">{nomClient}</h2>
                      {f.objet && <p className="text-xs text-gray-400 line-clamp-1">{f.objet}</p>}
                    </div>

                    <select
                      value={f.statut}
                      onChange={(e) => changerStatut(f, e.target.value)}
                      className={`rounded-xl border px-2.5 py-1 text-xs font-bold uppercase tracking-wider focus:outline-none ${
                        f.statut === "payee"
                          ? "border-white/10 bg-white/5 text-gray-400"
                          : f.statut === "envoyee"
                          ? "border-white/10 bg-white/5 text-gray-400"
                          : "border-slate-600 bg-transparent text-gray-300"
                      }`}
                    >
                      <option value="brouillon" className="bg-transparent text-white">Brouillon</option>
                      <option value="envoyee" className="bg-transparent text-white">Envoyée</option>
                      <option value="payee" className="bg-transparent text-white">Payée</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-transparent/60 p-2.5 border border-white/10/60">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">Montant HT</p>
                      <p className="text-xs font-semibold text-gray-300">{ht.toFixed(2)} €</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">Total TTC ({f.tva_pct}%)</p>
                      <p className="text-sm font-bold text-gray-300 font-mono">{ttc.toFixed(2)} €</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 flex items-center justify-between border-t border-white/10/60 pt-3">
                  <button
                    onClick={() => setApercu(f)}
                    className="rounded-xl border border-slate-600 bg-transparent px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-[#1A1D24] flex items-center gap-1"
                  >
                    👁️ Aperçu Facture
                  </button>

                  <button
                    onClick={() => supprimerFacture(f)}
                    className="text-xs text-gray-500 hover:text-red-400 p-1.5 transition-colors"
                    title="Supprimer la facture"
                  >
                    🗑️
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FAB (+) */}
      <button
        onClick={() => setModalOuvert(true)}
        aria-label="Créer une facture"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-slate-950 shadow-2xl shadow-red-600/10 transition-transform active:scale-95 hover:scale-105 hover:bg-red-700"
      >
        <span className="text-2xl font-bold leading-none">+</span>
      </button>

      {modalOuvert && (
        <div
          className="fixed inset-0 z-[210] pt-48 flex items-center justify-center p-4 pb-28 bg-black/80 backdrop-blur-sm"
          onClick={() => setModalOuvert(false)}
        >
          <form
            onSubmit={creerFacture}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1A1D24] w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-white/10 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-4 shrink-0">
              <h2 className="text-base font-bold text-white">Nouvelle Facture</h2>
              <button type="button" onClick={() => setModalOuvert(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1A1D24] hover:text-white">
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
              {devisAcceptes.length > 0 && (
                <select
                  value={depuisDevis}
                  onChange={(e) => chargerDepuisDevis(e.target.value)}
                  className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white focus:border-red-600 focus:outline-none"
                >
                  <option value="">-- Créer depuis un devis accepté (optionnel) --</option>
                  {devisAcceptes.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.numero} — {d.objet}
                    </option>
                  ))}
                </select>
              )}

              {totalDevisHT !== null && dejaFactureHT !== null && (
                <div className="flex items-center justify-between rounded-xl border border-red-700/30 bg-red-700/10 p-3 text-xs">
                  <div>
                    <p className="text-gray-300">
                      Total devis HT : <span className="font-semibold text-white">{totalDevisHT.toFixed(2)} €</span>
                    </p>
                    <p className="text-gray-300">
                      Déjà facturé HT : <span className="font-semibold text-white">{dejaFactureHT.toFixed(2)} €</span>
                    </p>
                    <p className="text-gray-300">
                      Reste à facturer :{" "}
                      <span className="font-semibold text-gray-400">
                        {Math.max(0, totalDevisHT - dejaFactureHT).toFixed(2)} €
                      </span>
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => remplirAcompte(30)}
                      className="rounded-xl bg-red-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600"
                    >
                      ⚡ Acompte 30%
                    </button>
                    <button
                      type="button"
                      onClick={remplirSolde}
                      className="rounded-xl bg-red-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-red-600"
                    >
                      ⚡ Remplir solde
                    </button>
                  </div>
                </div>
              )}

              <select
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
                required
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white focus:border-red-600 focus:outline-none"
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
                className="w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-red-600 focus:outline-none"
              />
              <div className="grid grid-cols-2 gap-3">
                <input
                  value={adresseChantier}
                  onChange={(e) => setAdresseChantier(e.target.value)}
                  placeholder="Adresse du chantier"
                  className="rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-red-600 focus:outline-none"
                />
                <input
                  value={typeTravaux}
                  onChange={(e) => setTypeTravaux(e.target.value)}
                  placeholder="Type de travaux"
                  className="rounded-xl border border-slate-600 bg-transparent px-3.5 py-2.5 text-xs text-white placeholder-slate-500 focus:border-red-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase text-gray-400">Échéance</label>
                  <input
                    type="date"
                    value={echeance}
                    onChange={(e) => setEcheance(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-gray-400">TVA (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={tva}
                    onChange={(e) => setTva(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                  />
                </div>
              </div>

              <div>
                <label className="text-[11px] font-semibold uppercase text-gray-400">Type de facture</label>
                <select
                  value={typeFacture}
                  onChange={(e) => setTypeFacture(e.target.value as typeof typeFacture)}
                  className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                >
                  <option value="totale">Totale</option>
                  <option value="acompte">Acompte</option>
                  <option value="solde">Solde</option>
                </select>
              </div>

              <div className="space-y-2">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-gray-400">Lignes de prestation</p>
                {lignes.map((l, i) => (
                  <div key={i} className="grid grid-cols-12 gap-2">
                    <input
                      value={l.designation}
                      onChange={(e) => updateLigne(i, { designation: e.target.value })}
                      placeholder="Désignation"
                      className="col-span-4 rounded-xl border border-slate-600 bg-transparent px-2.5 py-2 text-xs text-white"
                    />
                    <input
                      type="number"
                      value={l.qte}
                      onChange={(e) => updateLigne(i, { qte: parseFloat(e.target.value) || 0 })}
                      placeholder="Qté"
                      className="col-span-2 rounded-xl border border-slate-600 bg-transparent px-2.5 py-2 text-xs text-white"
                    />
                    <input
                      value={l.unite}
                      onChange={(e) => updateLigne(i, { unite: e.target.value })}
                      placeholder="Unité"
                      className="col-span-2 rounded-xl border border-slate-600 bg-transparent px-2.5 py-2 text-xs text-white"
                    />
                    <input
                      type="number"
                      value={l.pu_ht}
                      onChange={(e) => updateLigne(i, { pu_ht: parseFloat(e.target.value) || 0 })}
                      placeholder="PU HT"
                      className="col-span-3 rounded-xl border border-slate-600 bg-transparent px-2.5 py-2 text-xs text-white"
                    />
                    <button
                      type="button"
                      onClick={() => supprimerLigne(i)}
                      className="col-span-1 text-gray-500 hover:text-red-400 font-bold"
                    >
                      ✕
                    </button>
                  </div>
                ))}
                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={ajouterLigne}
                    className="rounded-xl border border-slate-600 bg-transparent px-3 py-1.5 text-xs font-semibold text-gray-200 hover:bg-[#1A1D24]"
                  >
                    + Ajouter une ligne vierge
                  </button>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      insererDepuisCatalogue(e.target.value);
                      e.target.value = "";
                    }}
                    className="flex-1 rounded-xl border border-red-600/50 bg-transparent px-3 py-1.5 text-xs text-gray-400 font-medium hover:border-gray-300"
                  >
                    <option value="" disabled>
                      📦 + Insérer un ouvrage depuis le catalogue standard...
                    </option>
                    {catalogue.map((ouv) => (
                      <option key={ouv.id} value={ouv.id}>
                        [{ouv.famille_label}] {ouv.designation} ({ouv.pu_ht} €/{ouv.unite})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <p className="text-right text-sm font-bold text-white pt-2">
                Total HT : <span className="font-mono text-gray-400">{totalHT.toFixed(2)} €</span>
              </p>
            </div>

            <div className="p-4 border-t border-white/10 flex justify-end gap-3 mt-auto shrink-0 bg-[#1A1D24] rounded-b-xl z-10">
              <button
                type="button"
                onClick={() => setModalOuvert(false)}
                className="rounded-xl border border-slate-600 bg-[#1A1D24] px-4 py-2.5 text-xs font-semibold text-gray-300 hover:bg-[#1A1D24]"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-red-700 shadow-md"
              >
                Générer la Facture
              </button>
            </div>
          </form>
        </div>
      )}

      {apercu && entreprise && (
        <div
          className="fixed inset-0 z-[210] pt-48 overflow-y-auto bg-black/70 p-4"
          onClick={() => { setApercu(null); setModeSignature(false); setSignatureData(null); }}
        >
          <div className="mx-auto max-w-3xl" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex justify-end gap-2 print:hidden">
              <button
                onClick={() => setModeSignature(true)}
                className="flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-red-600/10 hover:bg-red-600 transition-all"
              >
                <PenTool className="h-4 w-4" /> Faire signer
              </button>
              <button
                onClick={imprimer}
                className="flex items-center gap-1.5 rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-red-600/10 hover:bg-red-700 transition-all"
              >
                <span>🖨️</span> Imprimer / Exporter PDF
              </button>
              <button
                onClick={() => { setApercu(null); setModeSignature(false); setSignatureData(null); }}
                className="rounded-xl border border-slate-600 bg-[#1A1D24] px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-[#1A1D24]"
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

            {modeSignature && (
              <div className="mt-4 bg-[#1A1D24] border border-slate-600 rounded-2xl p-6 space-y-4 print:hidden">
                <h3 className="text-sm font-bold text-gray-200">✍️ Signature de la facture (Acquittée)</h3>
                <SignaturePad
                  label="Signature"
                  signerName={apercu.clients?.nom || ""}
                  onChange={(img) =>
                    setSignatureData(img ? { image: img, nom: apercu.clients?.nom || "" } : null)
                  }
                />
                <div className="flex gap-3 pt-2">
                  <button
                    disabled={!signatureData}
                    onClick={async () => {
                      await supabase
                        .from("factures")
                        .update({ statut: "payee" })
                        .eq("id", apercu.id);
                      setApercu(null);
                      setModeSignature(false);
                      setSignatureData(null);
                      fetchTout();
                    }}
                    className="rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-red-600/10 hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Marquer comme Payée
                  </button>
                  <button
                    onClick={() => setModeSignature(false)}
                    className="rounded-xl border border-slate-600 bg-[#1A1D24] px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-[#1A1D24] transition-all"
                  >
                    Annuler
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

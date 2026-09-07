"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DocumentPDF, { DocumentData } from "@/components/DocumentPDF";
import { prochainNumero } from "@/lib/documents";
import SignaturePad from "@/components/SignaturePad";
import { PenTool, Sparkles, Loader2 } from "lucide-react";

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
  date_emission: string;
  validite_jours: number | null;
  statut: string;
  lignes: Ligne[];
  tva_pct: number;
  delai_jours: number | null;
  acompte_pct: number | null;
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

export default function DevisPage() {
  const [devis, setDevis] = useState<Devis[]>([]);
  const [clients, setClients] = useState<Client[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueOuvrage[]>([]);
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOuvert, setModalOuvert] = useState(false);
  const [devisToBill, setDevisToBill] = useState<Devis | null>(null);
  const [billType, setBillType] = useState<"acompte" | "situation" | "totale">("acompte");
  const [billPct, setBillPct] = useState<number>(30);
  const [apercu, setApercu] = useState<Devis | null>(null);
  const [modeSignature, setModeSignature] = useState(false);
  const [signatureData, setSignatureData] = useState<{ image: string; nom: string } | null>(null);
  const [iaPromptOuvert, setIaPromptOuvert] = useState(false);
  const [iaPrompt, setIaPrompt] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);

  const [clientId, setClientId] = useState("");
  const [chantierId, setChantierId] = useState("");
  const [chantiersClient, setChantiersClient] = useState<{id: string; nom: string; code_acces: string; adresse_chantier: string}[]>([]);
  const [objet, setObjet] = useState("");
  const [adresseChantier, setAdresseChantier] = useState("");
  const [typeTravaux, setTypeTravaux] = useState("");
  const [validite, setValidite] = useState(90);
  const [delai, setDelai] = useState(15);
  const [acompte, setAcompte] = useState(30);
  const [tva, setTva] = useState(10);
  const [lignes, setLignes] = useState<Ligne[]>([{ ...LIGNE_VIDE }]);
  const [promptIA, setPromptIA] = useState("");
  const [genererIAEnCours, setGenererIAEnCours] = useState(false);
  const [ecouteEnCours, setEcouteEnCours] = useState(false);

  async function fetchTout() {
    setLoading(true);
    const [devisRes, clientsRes, settingsRes, catRes] = await Promise.all([

      supabase
        .from("devis")
        .select("*, clients(*)")
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("*").order("nom"),
      supabase.from("entreprise_settings").select("*").eq("id", 1).single(),
      supabase.from("catalogue_ouvrages").select("*").order("designation"),
    ]);
    if (devisRes.error) console.error(devisRes.error);
    else setDevis(devisRes.data as Devis[]);
    if (clientsRes.data) setClients(clientsRes.data as Client[]);
    if (catRes && catRes.data) setCatalogue(catRes.data as CatalogueOuvrage[]);
    if (settingsRes.data) setEntreprise(settingsRes.data as Entreprise);
    setLoading(false);
  }

  useEffect(() => {
    fetchTout();
  }, []);



  function ajouterLigne() {
    setLignes((l) => [...l, { ...LIGNE_VIDE }]);
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

  async function genererLigneIA() {
    if (!promptIA.trim()) return;
    setGenererIAEnCours(true);
    try {
      const res = await fetch("/api/ia-devis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ 
          prompt: promptIA,
          catalogueContext: catalogue 
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Erreur IA");
      }
      setLignes((prev) => {
        const nettes = prev.filter((l) => l.designation.trim() || l.pu_ht > 0);
        
        let newLignes = [];
        if (Array.isArray(data)) {
          newLignes = data;
        } else if (data && Array.isArray(data.lignes)) {
          newLignes = data.lignes;
        } else if (data && typeof data === 'object') {
          // If it's a single object (e.g. from the old prompt behavior)
          newLignes = [data];
        }

        if (newLignes.length === 0) {
          alert("L'IA n'a pas renvoyé de données valides. Réessayez.");
          return prev;
        }

        return [
          ...nettes,
          ...newLignes.map((l: any) => ({
            designation: l.designation || "",
            description: l.description || "",
            qte: l.qte || 1,
            unite: l.unite || "forfait",
            pu_ht: l.pu_ht || 0,
          }))
        ];
      });
      setPromptIA("");
    } catch (err) {
      alert("Erreur génération IA : " + (err as Error).message);
    } finally {
      setGenererIAEnCours(false);
    }
  }

  function updateLigne(i: number, patch: Partial<Ligne>) {
    setLignes((l) => l.map((ligne, idx) => (idx === i ? { ...ligne, ...patch } : ligne)));
  }

  function supprimerLigne(i: number) {
    setLignes((l) => l.filter((_, idx) => idx !== i));
  }

  const totalHT = lignes.reduce((s, l) => s + l.qte * l.pu_ht, 0);

  async function creerDevis(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return;

    const numero = await prochainNumero("devis", "DEV");

    const { error } = await supabase.from("devis").insert({
      numero,
      client_id: clientId,
      chantier_id: chantierId || null,
      objet: objet || null,
      adresse_chantier: adresseChantier || null,
      type_travaux: typeTravaux || null,
      validite_jours: validite,
      delai_jours: delai,
      acompte_pct: acompte,
      tva_pct: tva,
      statut: "brouillon",
      lignes,
    });

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }

    setModalOuvert(false);
    setClientId("");
    setChantierId("");
    setChantiersClient([]);
    setObjet("");
    setAdresseChantier("");
    setTypeTravaux("");
    setLignes([{ ...LIGNE_VIDE }]);
    fetchTout();
  }

  async function changerStatut(d: Devis, statut: string) {
    const { error } = await supabase.from("devis").update({ statut }).eq("id", d.id);
    if (error) return;

    if (statut === "accepte" && d.statut !== "accepte") {
      setDevisToBill(d);
    } else {
      fetchTout();
    }
  }


  async function handleGenererFacture(e: React.FormEvent) {
    e.preventDefault();
    if (!devisToBill) return;
    const d = devisToBill;
    
    const numero = await prochainNumero("factures", "FAC");
    let lignesFacture: Ligne[] = [];
    
    if (billType === "totale") {
      // On copie exactement les lignes
      lignesFacture = d.lignes;
    } else if (billType === "acompte") {
      // Ligne unique d'acompte
      const totalHT = d.lignes.reduce((s, l) => s + l.qte * l.pu_ht, 0);
      const montantHT = totalHT * (billPct / 100);
      lignesFacture = [
        {
          designation: `Acompte ${billPct}% à la commande`,
          description: d.objet ?? undefined,
          qte: 1,
          unite: "forfait",
          pu_ht: Math.round(montantHT * 100) / 100,
        },
      ];
    } else if (billType === "situation") {
      // Situation: On copie les lignes mais on indique le pourcentage d'avancement dans la désignation
      lignesFacture = d.lignes.map(l => ({
        ...l,
        designation: `[Avancement ${billPct}%] ${l.designation}`,
        pu_ht: Math.round(l.pu_ht * (billPct / 100) * 100) / 100
      }));
    }

    const { error } = await supabase.from("factures").insert({
      numero,
      devis_id: d.id,
      client_id: d.client_id,
      objet: `${billType === "totale" ? "Facture" : billType === "acompte" ? "Acompte" : "Situation d'avancement"} — ${d.objet ?? d.numero}`,
      adresse_chantier: d.adresse_chantier,
      type_travaux: d.type_travaux,
      tva_pct: d.tva_pct,
      type_facture: billType === "totale" ? "solde" : billType,
      statut: "brouillon",
      lignes: lignesFacture,
    });

    if (error) {
      alert("Erreur lors de la génération de la facture : " + error.message);
    } else {
      alert(`Facture ${numero} générée dans l'onglet Factures.`);
    }
    
    setDevisToBill(null);
    fetchTout();
  }

  async function genererFactureAcompte(d: Devis) {
    const { data: existantes } = await supabase
      .from("factures")
      .select("id")
      .eq("devis_id", d.id)
      .eq("type_facture", "acompte");

    if (existantes && existantes.length > 0) return;

    const totalHT = d.lignes.reduce((s, l) => s + l.qte * l.pu_ht, 0);
    const pct = d.acompte_pct ?? 30;
    const montantHT = totalHT * (pct / 100);

    const numero = await prochainNumero("factures", "FAC");

    const { error } = await supabase.from("factures").insert({
      numero,
      devis_id: d.id,
      client_id: d.client_id,
      objet: `Acompte ${pct}% — ${d.objet ?? d.numero}`,
      adresse_chantier: d.adresse_chantier,
      type_travaux: d.type_travaux,
      tva_pct: d.tva_pct,
      type_facture: "acompte",
      statut: "brouillon",
      lignes: [
        {
          designation: `Acompte ${pct}% à la commande`,
          description: d.objet ?? undefined,
          qte: 1,
          unite: "forfait",
          pu_ht: Math.round(montantHT * 100) / 100,
        },
      ],
    });

    if (error) {
      alert("Devis accepté, mais erreur lors de la génération de la facture d'acompte : " + error.message);
    } else {
      alert(`Facture d'acompte ${numero} générée automatiquement (${pct}% — ${montantHT.toFixed(2)} € HT).`);
    }
  }

  async function transformerEnChantier(d: Devis) {
    if (!confirm(`Transformer le devis ${d.numero} en chantier actif ?`)) return;

    const { error: chantierError } = await supabase.from("chantiers").insert({
      nom: d.objet || d.type_travaux || d.numero,
      client_id: d.client_id,
      adresse_chantier: d.adresse_chantier,
      statut: "prevu",
      code_acces: "BNA-" + Math.random().toString(36).substring(2, 8).toUpperCase(),
      checklist: { tasseaux: false, pare_pluie: false, pose: false, finition: false },
    });

    if (chantierError) {
      alert("Erreur création chantier : " + chantierError.message);
      return;
    }

    await supabase.from("devis").update({ statut: "accepte" }).eq("id", d.id);
    fetchTout();
    alert("Chantier créé à partir du devis.");
  }

  async function supprimerDevis(d: Devis) {
    if (!confirm(`Supprimer le devis ${d.numero} ?`)) return;
    const { error } = await supabase.from("devis").delete().eq("id", d.id);
    if (!error) fetchTout();
  }

  function imprimer() {
    window.print();
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Devis Commerciaux</h1>
          <p className="text-xs text-gray-400">Édition des devis, acomptes automatiques et transformation en chantiers</p>
        </div>
        <button
          onClick={() => setModalOuvert(true)}
          className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-red-600/10 transition-all hover:bg-red-700"
        >
          <span>+</span> Nouveau Devis
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-white/10/60 bg-[#1A1D24]/40 p-12 text-center text-xs text-gray-400">
          Chargement des devis…
        </div>
      ) : devis.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#1A1D24]/30 p-12 text-center space-y-3">
          <p className="text-sm font-medium text-gray-400">Aucun devis pour l&apos;instant.</p>
          <button
            onClick={() => setModalOuvert(true)}
            className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-red-700"
          >
            + Créer un premier devis
          </button>
        </div>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2">
          {devis.map((d) => {
            const totalHT = d.lignes.reduce((s, l) => s + l.qte * l.pu_ht, 0);
            const totalTTC = totalHT * (1 + (d.tva_pct || 10) / 100);
            const nomClient = d.clients?.societe || d.clients?.nom || "Client direct";

            return (
              <div
                key={d.id}
                className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#1A1D24] p-4.5 shadow-md transition-all hover:border-red-600/60 hover:bg-[#1A1D24]"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-gray-300">{d.numero}</span>
                        <span className="text-xs text-gray-500">· {new Date(d.date_emission).toLocaleDateString("fr-FR")}</span>
                      </div>
                      <h2 className="text-base font-bold text-white mt-0.5">{nomClient}</h2>
                      {d.objet && <p className="text-xs text-gray-400 line-clamp-1">{d.objet}</p>}
                    </div>

                    <select
                      value={d.statut}
                      onChange={(e) => changerStatut(d, e.target.value)}
                      className={`rounded-xl border px-2.5 py-1 text-xs font-bold uppercase tracking-wider focus:outline-none ${
                        d.statut === "accepte"
                          ? "border-white/10 bg-white/5 text-gray-400"
                          : d.statut === "refuse"
                          ? "border-red-500/40 bg-red-950/40 text-red-300"
                          : d.statut === "envoye"
                          ? "border-red-600/40 bg-sky-950/40 text-gray-400"
                          : "border-slate-600 bg-transparent text-gray-300"
                      }`}
                    >
                      <option value="brouillon" className="bg-transparent text-white">Brouillon</option>
                      <option value="envoye" className="bg-transparent text-white">Envoyé</option>
                      <option value="accepte" className="bg-transparent text-white">Accepté</option>
                      <option value="refuse" className="bg-transparent text-white">Refusé</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-transparent/60 p-2.5 border border-white/10/60">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">Montant HT</p>
                      <p className="text-xs font-semibold text-gray-300">{totalHT.toFixed(2)} €</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">Total TTC ({d.tva_pct}%)</p>
                      <p className="text-sm font-bold text-gray-300 font-mono">{totalTTC.toFixed(2)} €</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 flex items-center justify-between border-t border-white/10/60 pt-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setApercu(d)}
                      className="rounded-xl border border-slate-600 bg-transparent px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-[#1A1D24] flex items-center gap-1"
                    >
                      👁️ Aperçu PDF
                    </button>
                    {d.statut !== "accepte" && (
                      <button
                        onClick={() => transformerEnChantier(d)}
                        className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-400 hover:bg-[#1A1D24]/40"
                        title="Valider et transformer en chantier"
                      >
                        ⚡ En chantier
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => supprimerDevis(d)}
                    className="text-xs text-gray-500 hover:text-red-400 p-1.5 transition-colors"
                    title="Supprimer le devis"
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
        aria-label="Créer un devis"
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
            onSubmit={creerDevis}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1A1D24] w-full max-w-2xl max-h-[85vh] flex flex-col rounded-xl border border-white/10 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-4 shrink-0">
              <h2 className="text-base font-bold text-white">Nouveau Devis</h2>
              <button type="button" onClick={() => setModalOuvert(false)} className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1A1D24] hover:text-white">
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
              <select
                value={clientId}
                onChange={async (e) => {
                  const id = e.target.value;
                  setClientId(id);
                  setChantierId("");
                  setChantiersClient([]);
                  if (id) {
                    const { data } = await supabase
                      .from("chantiers")
                      .select("id, nom, code_acces, adresse_chantier")
                      .eq("client_id", id)
                      .order("created_at", { ascending: false });
                    if (data) setChantiersClient(data);
                  }
                }}
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

              {chantiersClient.length > 0 && (
                <select
                  value={chantierId}
                  onChange={(e) => {
                    const id = e.target.value;
                    setChantierId(id);
                    // Auto-remplir l'adresse si elle est vide
                    const ch = chantiersClient.find(c => c.id === id);
                    if (ch && !adresseChantier) setAdresseChantier(ch.adresse_chantier || "");
                  }}
                  className="w-full rounded-xl border border-red-700 bg-transparent px-3.5 py-2.5 text-xs text-white focus:border-red-600 focus:outline-none"
                >
                  <option value="">-- Lier à un chantier (optionnel) --</option>
                  {chantiersClient.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom} {c.code_acces ? `· Code: ${c.code_acces}` : ""}
                    </option>
                  ))}
                </select>
              )}

              <input
                value={objet}
                onChange={(e) => setObjet(e.target.value)}
                placeholder="Objet (ex. Bardage bois claire-voie)"
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

              <div className="grid grid-cols-4 gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase text-gray-400">Validité (j)</label>
                  <input
                    type="number"
                    value={validite}
                    onChange={(e) => setValidite(parseInt(e.target.value) || 0)}
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-gray-400">Délai (j)</label>
                  <input
                    type="number"
                    value={delai}
                    onChange={(e) => setDelai(parseInt(e.target.value) || 0)}
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-gray-400">Acompte (%)</label>
                  <input
                    type="number"
                    value={acompte}
                    onChange={(e) => setAcompte(parseInt(e.target.value) || 0)}
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
                <div className="flex flex-col sm:flex-row items-stretch gap-2 rounded-xl border border-violet-500/40 bg-violet-500/5 p-2">
                  <div className="flex flex-1 items-center bg-transparent relative">
                    <input
                      value={promptIA}
                      onChange={(e) => setPromptIA(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          genererLigneIA();
                        }
                      }}
                      placeholder="✨ Décris la prestation ou dicte-la au micro..."
                      disabled={genererIAEnCours}
                      className="w-full rounded-lg border border-violet-500/40 bg-transparent pl-3 pr-10 py-1.5 text-xs text-white placeholder:text-gray-500 disabled:opacity-50"
                    />
                    <button
                      type="button"
                      disabled={ecouteEnCours}
                      onClick={() => {
                        if (ecouteEnCours) return;
                        if (!('webkitSpeechRecognition' in window) && !('SpeechRecognition' in window)) {
                          alert("Votre navigateur ne supporte pas la dictée vocale.");
                          return;
                        }
                        const SpeechRec = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
                        const recognition = new SpeechRec();
                        recognition.lang = 'fr-FR';
                        setEcouteEnCours(true);
                        setPromptIA("Écoute en cours...");
                        recognition.onresult = (event: { results: Array<{ [key: number]: { transcript: string } }> }) => {
                          setPromptIA(event.results[0][0].transcript);
                        };
                        recognition.onerror = (event: { error: string }) => {
                          setPromptIA("");
                          if (event.error === 'aborted') return;
                          let msg = "Erreur micro (" + event.error + "). ";
                          if (event.error === 'not-allowed') {
                            msg += "Veuillez autoriser l'accès au micro dans les paramètres de votre navigateur.";
                          }
                          alert(msg);
                        };
                        recognition.onend = () => {
                          setEcouteEnCours(false);
                        };
                        try {
                          recognition.start();
                        } catch (err) {
                          setEcouteEnCours(false);
                          setPromptIA("");
                        }
                      }}
                      className="absolute right-2 text-violet-400 hover:text-violet-300 transition-colors p-1 disabled:opacity-40"
                      title={ecouteEnCours ? "Ecoute en cours..." : "Dicter avec le micro"}
                    >
                      🎙️
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={genererLigneIA}
                    disabled={genererIAEnCours || !promptIA.trim() || promptIA === "Écoute en cours..."}
                    className="rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-1.5 text-xs font-bold text-white disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {genererIAEnCours ? "Génération..." : "✨ Générer avec l'IA"}
                  </button>
                </div>

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
                Enregistrer le Devis
              </button>
            </div>
          </form>
        </div>
      )}

      {apercu && entreprise && (
        <div
          className="fixed inset-0 z-[210] pt-48 overflow-y-auto bg-black/70 p-4"
          onClick={() => { setApercu(null); setSignatureData(null); setModeSignature(false); }}
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
                onClick={() => { setApercu(null); setSignatureData(null); setModeSignature(false); }}
                className="rounded-xl border border-slate-600 bg-[#1A1D24] px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-[#1A1D24]"
              >
                Fermer
              </button>
            </div>
            <DocumentPDF
              doc={{
                kind: "devis",
                numero: apercu.numero,
                statut: apercu.statut,
                date_emission: apercu.date_emission,
                validite_jours: apercu.validite_jours,
                objet: apercu.objet,
                adresse_chantier: apercu.adresse_chantier,
                type_travaux: apercu.type_travaux,
                lignes: apercu.lignes,
                tva_pct: apercu.tva_pct,
                acompte_pct: apercu.acompte_pct,
                delai_jours: apercu.delai_jours,
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
                <h3 className="text-sm font-bold text-gray-200">✍️ Signature du client</h3>
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
                        .from("devis")
                        .update({ statut: "accepte" })
                        .eq("id", apercu.id);
                      setApercu(null);
                      setModeSignature(false);
                      setSignatureData(null);
                      fetchTout();
                    }}
                    className="rounded-xl bg-red-600 px-5 py-2 text-xs font-bold text-white shadow-lg shadow-red-600/10 hover:bg-red-600 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                  >
                    Valider la signature
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

"use client";

import { useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import DocumentPDF, { DocumentData } from "@/components/DocumentPDF";
import { prochainNumero } from "@/lib/documents";
import { CATALOGUE_OUVRAGES } from "@/lib/catalogueOuvrages";

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
  const [entreprise, setEntreprise] = useState<Entreprise | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOuvert, setModalOuvert] = useState(false);
  const [apercu, setApercu] = useState<Devis | null>(null);

  const [clientId, setClientId] = useState("");
  const [objet, setObjet] = useState("");
  const [adresseChantier, setAdresseChantier] = useState("");
  const [typeTravaux, setTypeTravaux] = useState("");
  const [validite, setValidite] = useState(90);
  const [delai, setDelai] = useState(15);
  const [acompte, setAcompte] = useState(30);
  const [tva, setTva] = useState(10);
  const [lignes, setLignes] = useState<Ligne[]>([{ ...LIGNE_VIDE }]);

  async function fetchTout() {
    setLoading(true);
    const [devisRes, clientsRes, settingsRes] = await Promise.all([
      supabase
        .from("devis")
        .select("*, clients(*)")
        .order("created_at", { ascending: false }),
      supabase.from("clients").select("*").order("nom"),
      supabase.from("entreprise_settings").select("*").eq("id", 1).single(),
    ]);
    if (devisRes.error) console.error(devisRes.error);
    else setDevis(devisRes.data as Devis[]);
    if (clientsRes.data) setClients(clientsRes.data as Client[]);
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
    const ouv = CATALOGUE_OUVRAGES.find((o) => o.id === ouvrageId);
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
      await genererFactureAcompte(d);
    }

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
          <h1 className="text-xl font-bold text-slate-100">Devis Commerciaux</h1>
          <p className="text-xs text-slate-400">Édition des devis, acomptes automatiques et transformation en chantiers</p>
        </div>
        <button
          onClick={() => setModalOuvert(true)}
          className="flex items-center gap-2 rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-amber-500/20 transition-all hover:bg-amber-400"
        >
          <span>+</span> Nouveau Devis
        </button>
      </div>

      {loading ? (
        <div className="rounded-2xl border border-slate-700/60 bg-slate-800/40 p-12 text-center text-xs text-slate-400">
          Chargement des devis…
        </div>
      ) : devis.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/30 p-12 text-center space-y-3">
          <p className="text-sm font-medium text-slate-400">Aucun devis pour l&apos;instant.</p>
          <button
            onClick={() => setModalOuvert(true)}
            className="rounded-xl bg-amber-500 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-amber-400"
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
                className="flex flex-col justify-between rounded-2xl border border-slate-700 bg-slate-800 p-4.5 shadow-md transition-all hover:border-sky-500/60 hover:bg-slate-750"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-sky-400">{d.numero}</span>
                        <span className="text-xs text-slate-500">· {new Date(d.date_emission).toLocaleDateString("fr-FR")}</span>
                      </div>
                      <h2 className="text-base font-bold text-slate-100 mt-0.5">{nomClient}</h2>
                      {d.objet && <p className="text-xs text-slate-400 line-clamp-1">{d.objet}</p>}
                    </div>

                    <select
                      value={d.statut}
                      onChange={(e) => changerStatut(d, e.target.value)}
                      className={`rounded-xl border px-2.5 py-1 text-xs font-bold uppercase tracking-wider focus:outline-none ${
                        d.statut === "accepte"
                          ? "border-emerald-500/40 bg-emerald-950/40 text-emerald-300"
                          : d.statut === "refuse"
                          ? "border-red-500/40 bg-red-950/40 text-red-300"
                          : d.statut === "envoye"
                          ? "border-sky-500/40 bg-sky-950/40 text-sky-300"
                          : "border-slate-600 bg-slate-900 text-slate-300"
                      }`}
                    >
                      <option value="brouillon" className="bg-slate-900 text-slate-100">Brouillon</option>
                      <option value="envoye" className="bg-slate-900 text-slate-100">Envoyé</option>
                      <option value="accepte" className="bg-slate-900 text-slate-100">Accepté</option>
                      <option value="refuse" className="bg-slate-900 text-slate-100">Refusé</option>
                    </select>
                  </div>

                  <div className="flex items-center justify-between rounded-xl bg-slate-900/60 p-2.5 border border-slate-700/60">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Montant HT</p>
                      <p className="text-xs font-semibold text-slate-300">{totalHT.toFixed(2)} €</p>
                    </div>
                    <div className="text-right">
                      <p className="text-[10px] uppercase tracking-wide text-slate-500">Total TTC ({d.tva_pct}%)</p>
                      <p className="text-sm font-bold text-sky-400 font-mono">{totalTTC.toFixed(2)} €</p>
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 flex items-center justify-between border-t border-slate-700/60 pt-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setApercu(d)}
                      className="rounded-xl border border-slate-600 bg-slate-900 px-3 py-1.5 text-xs font-semibold text-sky-400 hover:bg-slate-700 flex items-center gap-1"
                    >
                      👁️ Aperçu PDF
                    </button>
                    {d.statut !== "accepte" && (
                      <button
                        onClick={() => transformerEnChantier(d)}
                        className="rounded-xl border border-emerald-500/40 bg-emerald-950/30 px-3 py-1.5 text-xs font-semibold text-emerald-300 hover:bg-emerald-900/40"
                        title="Valider et transformer en chantier"
                      >
                        ⚡ En chantier
                      </button>
                    )}
                  </div>

                  <button
                    onClick={() => supprimerDevis(d)}
                    className="text-xs text-slate-500 hover:text-red-400 p-1.5 transition-colors"
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
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-amber-500 text-slate-950 shadow-2xl shadow-amber-500/40 transition-transform active:scale-95 hover:scale-105 hover:bg-amber-400"
      >
        <span className="text-2xl font-bold leading-none">+</span>
      </button>

      {modalOuvert && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setModalOuvert(false)}
        >
          <form
            onSubmit={creerDevis}
            onClick={(e) => e.stopPropagation()}
            className="max-h-[90vh] w-full max-w-2xl space-y-3 overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 p-6"
          >
            <div className="flex items-center justify-between">
              <h2 className="text-lg font-semibold text-white">Nouveau devis</h2>
              <button type="button" onClick={() => setModalOuvert(false)} className="text-slate-400">
                ✕
              </button>
            </div>

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
              placeholder="Objet (ex. Bardage bois claire-voie)"
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

            <div className="grid grid-cols-4 gap-3">
              <div>
                <label className="text-xs uppercase text-slate-500">Validité (j)</label>
                <input
                  type="number"
                  value={validite}
                  onChange={(e) => setValidite(parseInt(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs uppercase text-slate-500">Délai (j)</label>
                <input
                  type="number"
                  value={delai}
                  onChange={(e) => setDelai(parseInt(e.target.value) || 0)}
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                />
              </div>
              <div>
                <label className="text-xs uppercase text-slate-500">Acompte (%)</label>
                <input
                  type="number"
                  value={acompte}
                  onChange={(e) => setAcompte(parseInt(e.target.value) || 0)}
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
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                <button
                  type="button"
                  onClick={ajouterLigne}
                  className="rounded-lg border border-slate-600 px-3 py-1.5 text-xs font-medium text-slate-200 hover:bg-slate-700"
                >
                  + Ajouter une ligne vierge
                </button>
                <select
                  defaultValue=""
                  onChange={(e) => {
                    insererDepuisCatalogue(e.target.value);
                    e.target.value = "";
                  }}
                  className="flex-1 rounded-lg border border-red-600/50 bg-slate-900 px-3 py-1.5 text-xs text-red-300 font-medium hover:border-red-500"
                >
                  <option value="" disabled>
                    📦 + Insérer un ouvrage depuis le catalogue standard...
                  </option>
                  {CATALOGUE_OUVRAGES.map((ouv) => (
                    <option key={ouv.id} value={ouv.id}>
                      [{ouv.familleLabel}] {ouv.designation} ({ouv.pu_ht} €/{ouv.unite})
                    </option>
                  ))}
                </select>
              </div>
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
          </div>
        </div>
      )}
    </div>
  );
}

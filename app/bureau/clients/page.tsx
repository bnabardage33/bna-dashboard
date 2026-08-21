"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";

type Client = {
  id: string;
  type: "particulier" | "professionnel";
  nom: string;
  societe: string | null;
  siret: string | null;
  adresse_facturation: string | null;
  code_postal: string | null;
  ville: string | null;
  tel: string | null;
  email: string | null;
  created_at: string;
};

type ResultatEntrepriseGouv = {
  nom_complet: string;
  siren: string;
  siege: {
    siret: string;
    adresse: string;
    code_postal: string;
    commune: string;
  };
};

type ChantierClient = {
  id: string;
  nom: string | null;
  statut: string;
  adresse_chantier: string | null;
};

type DevisClient = {
  id: string;
  numero: string;
  objet: string | null;
  statut: string;
  lignes: { qte: number; pu_ht: number }[];
};

type FactureClient = {
  id: string;
  numero: string;
  statut: string;
  lignes: { qte: number; pu_ht: number }[];
  tva_pct: number;
};

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([]);
  const [loading, setLoading] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [deleting, setDeleting] = useState<string | null>(null);

  const [type, setType] = useState<"particulier" | "professionnel">("particulier");
  const [nom, setNom] = useState("");
  const [societe, setSociete] = useState("");
  const [siret, setSiret] = useState("");
  const [adresse, setAdresse] = useState("");
  const [codePostal, setCodePostal] = useState("");
  const [ville, setVille] = useState("");
  const [tel, setTel] = useState("");
  const [email, setEmail] = useState("");

  // Recherche API SIRET Gouvernement
  const [rechercheGouv, setRechercheGouv] = useState("");
  const [resultatsGouv, setResultatsGouv] = useState<ResultatEntrepriseGouv[]>([]);
  const [rechercheGouvLoading, setRechercheGouvLoading] = useState(false);

  // Fiche Client 360°
  const [clientSelectionne, setClientSelectionne] = useState<Client | null>(null);
  const [chantiers360, setChantiers360] = useState<ChantierClient[]>([]);
  const [devis360, setDevis360] = useState<DevisClient[]>([]);
  const [factures360, setFactures360] = useState<FactureClient[]>([]);
  const [loading360, setLoading360] = useState(false);

  async function fetchClients() {
    setLoading(true);
    const { data, error } = await supabase
      .from("clients")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) console.error(error);
    else setClients(data as Client[]);
    setLoading(false);
  }

  useEffect(() => {
    fetchClients();
  }, []);

  // Recherche SIRET API État (recherche-entreprises.api.gouv.fr)
  useEffect(() => {
    if (!rechercheGouv.trim() || rechercheGouv.length < 3) {
      setResultatsGouv([]);
      return;
    }

    const timer = setTimeout(async () => {
      setRechercheGouvLoading(true);
      try {
        const res = await fetch(
          `https://recherche-entreprises.api.gouv.fr/search?q=${encodeURIComponent(
            rechercheGouv
          )}&per_page=5`
        );
        if (res.ok) {
          const json = await res.json();
          setResultatsGouv(json.results || []);
        }
      } catch (err) {
        console.error("Erreur API SIRET :", err);
      } finally {
        setRechercheGouvLoading(false);
      }
    }, 350);

    return () => clearTimeout(timer);
  }, [rechercheGouv]);

  function appliquerEntrepriseGouv(item: ResultatEntrepriseGouv) {
    setType("professionnel");
    setSociete(item.nom_complet);
    setSiret(item.siege?.siret || item.siren);
    setAdresse(item.siege?.adresse || "");
    setCodePostal(item.siege?.code_postal || "");
    setVille(item.siege?.commune || "");
    if (!nom) setNom("Direction");
    setResultatsGouv([]);
    setRechercheGouv("");
  }

  async function ouvrirFiche360(client: Client) {
    setClientSelectionne(client);
    setLoading360(true);
    const [chRes, devisRes, facturesRes] = await Promise.all([
      supabase.from("chantiers").select("id, nom, statut, adresse_chantier").eq("client_id", client.id),
      supabase.from("devis").select("id, numero, objet, statut, lignes").eq("client_id", client.id),
      supabase.from("factures").select("id, numero, statut, lignes, tva_pct").eq("client_id", client.id),
    ]);

    if (chRes.data) setChantiers360(chRes.data as ChantierClient[]);
    if (devisRes.data) setDevis360(devisRes.data as DevisClient[]);
    if (facturesRes.data) setFactures360(facturesRes.data as FactureClient[]);
    setLoading360(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!nom) return;

    const { error } = await supabase.from("clients").insert({
      type,
      nom,
      societe: type === "professionnel" ? societe || null : null,
      siret: type === "professionnel" ? siret || null : null,
      adresse_facturation: adresse || null,
      code_postal: codePostal || null,
      ville: ville || null,
      tel: tel || null,
      email: email || null,
    });

    if (error) {
      alert("Erreur : " + error.message);
      return;
    }

    setType("particulier");
    setNom("");
    setSociete("");
    setSiret("");
    setAdresse("");
    setCodePostal("");
    setVille("");
    setTel("");
    setEmail("");
    fetchClients();
  }

  async function supprimerClient(client: Client) {
    if (
      !confirm(
        `Supprimer ${client.nom} ? Cette action supprimera aussi ses chantiers liés.`
      )
    )
      return;
    setDeleting(client.id);
    const { error } = await supabase.from("clients").delete().eq("id", client.id);
    setDeleting(null);
    if (error) {
      alert("Erreur : " + error.message);
      return;
    }
    fetchClients();
  }

  const filtres = clients.filter((c) => {
    if (!recherche) return true;
    const q = recherche.toLowerCase();
    return (
      c.nom.toLowerCase().includes(q) ||
      (c.societe ?? "").toLowerCase().includes(q) ||
      (c.tel ?? "").toLowerCase().includes(q) ||
      (c.email ?? "").toLowerCase().includes(q) ||
      (c.ville ?? "").toLowerCase().includes(q)
    );
  });

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-white">Clients</h1>
        <p className="text-sm text-slate-400">Répertoire des particuliers et professionnels</p>
      </div>

      {/* Formulaire Nouveau Client avec recherche SIRET */}
      <form
        onSubmit={handleSubmit}
        className="space-y-3 rounded-xl border border-slate-700 bg-slate-800 p-4"
      >
        <div className="flex items-center justify-between">
          <h2 className="font-medium text-white">Nouveau client</h2>
          <div className="flex gap-2">
            {(["particulier", "professionnel"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setType(t)}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                  type === t
                    ? "bg-red-600 text-white"
                    : "border border-slate-600 text-slate-300 hover:bg-slate-700"
                }`}
              >
                {t === "particulier" ? "👤 Particulier" : "🏢 Professionnel"}
              </button>
            ))}
          </div>
        </div>

        {type === "professionnel" && (
          <div className="space-y-2 rounded-lg border border-slate-700 bg-slate-900/60 p-3">
            <div className="relative">
              <label className="text-xs uppercase tracking-wide text-slate-400">
                🔍 Recherche Entreprise / SIRET (API Officielle État)
              </label>
              <input
                className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                placeholder="Tapez un nom de société ou numéro SIRET..."
                value={rechercheGouv}
                onChange={(e) => setRechercheGouv(e.target.value)}
              />
              {rechercheGouvLoading && (
                <span className="absolute right-3 top-8 text-xs text-slate-400">Recherche...</span>
              )}

              {resultatsGouv.length > 0 && (
                <div className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-lg border border-slate-600 bg-slate-900 shadow-xl">
                  {resultatsGouv.map((item, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => appliquerEntrepriseGouv(item)}
                      className="w-full border-b border-slate-800 p-2.5 text-left text-xs hover:bg-slate-800"
                    >
                      <p className="font-semibold text-white">{item.nom_complet}</p>
                      <p className="text-slate-400">
                        SIRET : {item.siege?.siret || item.siren} · {item.siege?.commune} (
                        {item.siege?.code_postal})
                      </p>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1">
              <input
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                placeholder="Raison sociale"
                value={societe}
                onChange={(e) => setSociete(e.target.value)}
              />
              <input
                className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
                placeholder="Numéro SIRET"
                value={siret}
                onChange={(e) => setSiret(e.target.value)}
              />
            </div>
          </div>
        )}

        <input
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          placeholder={type === "professionnel" ? "Nom du contact principal" : "Nom et prénom"}
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          required
        />
        <input
          className="w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
          placeholder="Adresse de facturation"
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
        />
        <div className="grid grid-cols-2 gap-3">
          <input
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            placeholder="Code postal"
            value={codePostal}
            onChange={(e) => setCodePostal(e.target.value)}
          />
          <input
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            placeholder="Ville"
            value={ville}
            onChange={(e) => setVille(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            placeholder="Téléphone"
            value={tel}
            onChange={(e) => setTel(e.target.value)}
          />
          <input
            className="rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-sm text-slate-100"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </div>

        <button
          type="submit"
          className="rounded-lg bg-red-600 px-4 py-2 text-sm font-medium text-white hover:bg-red-500"
        >
          + Enregistrer le client
        </button>
      </form>

      {/* Barre de recherche */}
      <input
        value={recherche}
        onChange={(e) => setRecherche(e.target.value)}
        placeholder="Rechercher par nom, société, ville, téléphone..."
        className="w-full rounded-lg border border-slate-600 bg-slate-800 px-3 py-2 text-sm text-slate-100"
      />

      {loading ? (
        <p className="text-sm text-slate-400">Chargement des clients…</p>
      ) : filtres.length === 0 ? (
        <p className="text-sm text-slate-500">Aucun client trouvé.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtres.map((c) => (
            <div
              key={c.id}
              className="rounded-xl border border-slate-700 bg-slate-800 p-4 transition-colors hover:border-slate-600"
            >
              <div className="flex items-start justify-between">
                <div>
                  {c.type === "professionnel" && c.societe && (
                    <p className="font-bold text-white">{c.societe}</p>
                  )}
                  <p className={c.societe ? "text-sm text-slate-300" : "font-bold text-white"}>
                    {c.nom}
                  </p>
                  {c.siret && <p className="text-xs text-slate-500">SIRET {c.siret}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-slate-600 px-2 py-0.5 text-xs text-slate-400">
                    {c.type === "professionnel" ? "Pro" : "Particulier"}
                  </span>
                  <button
                    onClick={() => ouvrirFiche360(c)}
                    className="rounded-lg bg-slate-700 px-2 py-1 text-xs text-slate-200 hover:bg-slate-600"
                    title="Voir l'historique 360°"
                  >
                    👁️ Fiche
                  </button>
                  <button
                    onClick={() => supprimerClient(c)}
                    disabled={deleting === c.id}
                    className="text-xs font-medium text-slate-500 hover:text-red-400"
                    title="Supprimer"
                  >
                    {deleting === c.id ? "…" : "🗑️"}
                  </button>
                </div>
              </div>

              {c.adresse_facturation && (
                <p className="mt-2 text-sm text-slate-400">{c.adresse_facturation}</p>
              )}
              {(c.code_postal || c.ville) && (
                <p className="text-sm text-slate-400">
                  {c.code_postal} {c.ville}
                </p>
              )}

              <div className="mt-3 flex flex-wrap gap-3 text-sm">
                {c.tel && (
                  <a
                    href={`tel:${c.tel}`}
                    className="font-medium text-red-400 hover:text-red-300"
                  >
                    📞 {c.tel}
                  </a>
                )}
                {c.email && (
                  <a
                    href={`mailto:${c.email}`}
                    className="font-medium text-sky-400 hover:text-sky-300"
                  >
                    ✉️ {c.email}
                  </a>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal Fiche Client 360° */}
      {clientSelectionne && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setClientSelectionne(null)}
        >
          <div
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto rounded-xl border border-slate-700 bg-slate-800 p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-slate-700 pb-3">
              <div>
                <span className="rounded bg-red-600/20 px-2 py-0.5 text-xs font-semibold uppercase text-red-400">
                  {clientSelectionne.type}
                </span>
                <h2 className="mt-1 text-xl font-bold text-white">
                  {clientSelectionne.societe || clientSelectionne.nom}
                </h2>
                {clientSelectionne.societe && (
                  <p className="text-xs text-slate-400">Contact : {clientSelectionne.nom}</p>
                )}
                {clientSelectionne.siret && (
                  <p className="text-xs text-slate-500">SIRET {clientSelectionne.siret}</p>
                )}
              </div>
              <button
                onClick={() => setClientSelectionne(null)}
                className="rounded-lg border border-slate-600 px-3 py-1 text-xs text-slate-300 hover:bg-slate-700"
              >
                Fermer
              </button>
            </div>

            {loading360 ? (
              <p className="py-6 text-center text-sm text-slate-400">Chargement de l&apos;historique 360°…</p>
            ) : (
              <div className="mt-4 space-y-5 text-sm">
                {/* Coordonnées */}
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-slate-700 bg-slate-900/50 p-3 text-xs">
                  <div>
                    <p className="text-slate-500">Adresse</p>
                    <p className="font-medium text-slate-200">
                      {clientSelectionne.adresse_facturation || "—"}
                    </p>
                    <p className="text-slate-200">
                      {clientSelectionne.code_postal} {clientSelectionne.ville}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Contact direct</p>
                    <p className="text-red-400">{clientSelectionne.tel || "—"}</p>
                    <p className="text-sky-400">{clientSelectionne.email || "—"}</p>
                  </div>
                </div>

                {/* Chantiers rattachés */}
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                    🏗️ Chantiers ({chantiers360.length})
                  </h3>
                  {chantiers360.length === 0 ? (
                    <p className="text-xs text-slate-500">Aucun chantier enregistré pour ce client.</p>
                  ) : (
                    <div className="space-y-2">
                      {chantiers360.map((ch) => (
                        <Link
                          key={ch.id}
                          href={`/terrain/chantier/${ch.id}`}
                          className="flex items-center justify-between rounded-lg border border-slate-700 bg-slate-900 p-2.5 hover:border-red-500"
                        >
                          <div>
                            <p className="font-semibold text-white">{ch.nom || "Chantier"}</p>
                            <p className="text-xs text-slate-400">{ch.adresse_chantier || "—"}</p>
                          </div>
                          <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs text-slate-300">
                            {ch.statut} →
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Devis */}
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                    📝 Devis ({devis360.length})
                  </h3>
                  {devis360.length === 0 ? (
                    <p className="text-xs text-slate-500">Aucun devis émis.</p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-slate-700">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900 text-slate-400">
                          <tr>
                            <th className="p-2">Numéro</th>
                            <th className="p-2">Objet</th>
                            <th className="p-2 text-right">Total HT</th>
                            <th className="p-2">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-slate-300">
                          {devis360.map((d) => {
                            const ht = (d.lignes || []).reduce((s, l) => s + l.qte * l.pu_ht, 0);
                            return (
                              <tr key={d.id}>
                                <td className="p-2 font-medium text-white">{d.numero}</td>
                                <td className="p-2">{d.objet || "—"}</td>
                                <td className="p-2 text-right">{ht.toFixed(2)} €</td>
                                <td className="p-2">
                                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase">
                                    {d.statut}
                                  </span>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                {/* Factures */}
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-400">
                    🧾 Factures ({factures360.length})
                  </h3>
                  {factures360.length === 0 ? (
                    <p className="text-xs text-slate-500">Aucune facture enregistrée.</p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-slate-700">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-slate-900 text-slate-400">
                          <tr>
                            <th className="p-2">Numéro</th>
                            <th className="p-2 text-right">Total TTC</th>
                            <th className="p-2">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-slate-300">
                          {factures360.map((f) => {
                            const ht = (f.lignes || []).reduce((s, l) => s + l.qte * l.pu_ht, 0);
                            const ttc = ht * (1 + (f.tva_pct || 10) / 100);
                            return (
                              <tr key={f.id}>
                                <td className="p-2 font-medium text-white">{f.numero}</td>
                                <td className="p-2 text-right font-semibold text-emerald-400">
                                  {ttc.toFixed(2)} €
                                </td>
                                <td className="p-2">
                                  <span className="rounded bg-slate-800 px-1.5 py-0.5 text-[10px] uppercase">
                                    {f.statut}
                                  </span>
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
        </div>
      )}
    </div>
  );
}

"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { resoudreContexteEntreprise } from "@/lib/contexteEntreprise";
import { fmtEuro } from "@/lib/financeCalculs";
import { Surface } from '@/components/ui/Surface';
import { FloatingActionButton } from '@/components/ui/FloatingActionButton';

// O3-B9 : le claim `app_metadata.entreprise_id` doit être un UUID avant d'être
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
    libelle_commune: string;
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
  const [modalOuvert, setModalOuvert] = useState(false);

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
    if (error) return;
    setClients(data as Client[]);
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
    setVille(item.siege?.libelle_commune || "");
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

    // O3-B9 : `clients` est une table RACINE (aucun `chantier_id`, donc aucun
    // trigger `tg_auto_entreprise` possible) dont `entreprise_id` est NOT NULL
    // sans défaut depuis le 2026-09-22 (part1 §4). On résout donc le tenant
    // explicitement, via le claim `app_metadata.entreprise_id` — la MÊME source
    // que `entreprise_courante()` côté PostgREST, donc exactement la valeur que
    // la policy `clients_ent_insert` attend. Aucune constante de tenant en dur.
    const { entreprise_id } = await resoudreContexteEntreprise(null);

    // Fail-closed : sans contexte entreprise, AUCUNE écriture. La RLS
    // (`with check (entreprise_id = entreprise_courante())`) refuserait de toute
    // façon ; autant ne rien tenter et le signaler explicitement.
    if (!estUuid(entreprise_id)) {
      alert(
        "Impossible de créer le client : votre session ne contient pas d'entreprise identifiée. Reconnectez-vous et réessayez."
      );
      return;
    }

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
      entreprise_id,
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
    setModalOuvert(false);
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
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Répertoire Clients</h1>
          <p className="text-xs text-gray-400">Gestion des particuliers, professionnels et fiches 360°</p>
        </div>

        <button
          onClick={() => setModalOuvert(true)}
          className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-red-600/10 transition-all hover:bg-red-700"
        >
          <span>+</span> Nouveau Client
        </button>
      </div>

      {/* Barre de recherche */}
      <div className="w-full">
        <input
          value={recherche}
          onChange={(e) => setRecherche(e.target.value)}
          placeholder="Rechercher par nom, société, ville, téléphone..."
          className="w-full rounded-xl border border-white/10 bg-[#1A1D24] px-4 py-2.5 text-xs text-white placeholder-slate-500 focus:border-red-600 focus:outline-none shadow-sm"
        />
      </div>

      {/* Bouton Flottant FAB (+) */}
      <FloatingActionButton
        onClick={() => setModalOuvert(true)}
        aria-label="Ajouter un client"
      >
        <span className="text-2xl font-bold leading-none">+</span>
      </FloatingActionButton>

      {/* Modal / Bottom Sheet Nouveau Client */}
      {modalOuvert && (
        <div
          className="fixed inset-0 z-[210] pt-48 flex items-center justify-center p-4 pb-32 bg-black/80 backdrop-blur-sm"
          onClick={() => setModalOuvert(false)}
        >
          <form
            onSubmit={handleSubmit}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1A1D24] w-full max-w-lg max-h-[80vh] flex flex-col rounded-xl border border-white/10 shadow-2xl animate-in fade-in"
          >
            <div className="flex items-center justify-between border-b border-white/10 p-4 shrink-0">
              <div>
                <h2 className="text-base font-bold text-white">Nouveau Client</h2>
                <p className="text-xs text-gray-400">Renseignez les coordonnées ou recherchez le SIRET</p>
              </div>
              <button
                type="button"
                onClick={() => setModalOuvert(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1A1D24] hover:text-white"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">
              <div className="flex gap-2">
                {(["particulier", "professionnel"] as const).map((t) => (
                  <button
                    key={t}
                    type="button"
                    onClick={() => setType(t)}
                    className={`flex-1 transition-colors ${
                      type === t
                        ? "bg-red-600 text-white font-medium rounded-full px-4 py-2 shadow-md"
                        : "bg-[#1A1D24]/80 text-gray-400 hover:text-white rounded-full px-4 py-2 border border-white/5 transition-all"
                    }`}
                  >
                    {t === "particulier" ? "👤 Particulier" : "🏢 Professionnel"}
                  </button>
                ))}
              </div>

              {type === "professionnel" && (
                <div className="space-y-2 rounded-xl border border-white/10 bg-transparent p-3">
                  <div className="relative">
                    <label htmlFor="chp-recherche-siret-api-officielle" className="text-3xs font-semibold uppercase tracking-wide text-gray-400">
                      🔍 Recherche SIRET (API Officielle)
                    </label>
                    <input id="chp-recherche-siret-api-officielle"
                      className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-red-600 focus:outline-none"
                      placeholder="Tapez un nom de société ou numéro SIRET..."
                      value={rechercheGouv}
                      onChange={(e) => setRechercheGouv(e.target.value)}
                    />
                    {rechercheGouvLoading && (
                      <span className="absolute right-3 top-7 text-xs text-gray-400">Recherche...</span>
                    )}

                    {resultatsGouv.length > 0 && (
                      <div className="absolute left-0 right-0 z-20 mt-1 max-h-48 overflow-y-auto rounded-xl border border-slate-600 bg-[#0B0F19] shadow-2xl">
                        {resultatsGouv.map((item, idx) => (
                          <button
                            key={idx}
                            type="button"
                            onClick={() => appliquerEntrepriseGouv(item)}
                            className="w-full border-b border-slate-800 p-2.5 text-left text-xs hover:bg-[#1A1D24]"
                          >
                            <p className="font-bold text-white">{item.nom_complet}</p>
                            <p className="text-gray-400 text-3xs">
                              SIRET : {item.siege?.siret || item.siren} · {item.siege?.libelle_commune} (
                              {item.siege?.code_postal})
                            </p>
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 pt-1">
                    <input
                      className="rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white"
                      placeholder="Raison sociale"
                      value={societe}
                      onChange={(e) => setSociete(e.target.value)}
                    />
                    <input
                      className="rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white"
                      placeholder="Numéro SIRET"
                      value={siret}
                      onChange={(e) => setSiret(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="text-xs font-semibold text-gray-300">
                  {type === "professionnel" ? "Nom du contact principal *" : "Nom et prénom *"}
                </label>
                <input
                  className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                  placeholder={type === "professionnel" ? "Ex: Jean Dupont" : "Ex: M. et Mme Martin"}
                  value={nom}
                  onChange={(e) => setNom(e.target.value)}
                  required
                />
              </div>

              <div>
                <label htmlFor="chp-adresse-de-facturation" className="text-xs font-semibold text-gray-300">Adresse de facturation</label>
                <input id="chp-adresse-de-facturation"
                  className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent px-3.5 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                  placeholder="Ex: 12 Rue des Chênes"
                  value={adresse}
                  onChange={(e) => setAdresse(e.target.value)}
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="chp-code-postal" className="text-xs font-semibold text-gray-300">Code postal</label>
                  <input id="chp-code-postal"
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                    placeholder="33000"
                    value={codePostal}
                    onChange={(e) => setCodePostal(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="chp-ville" className="text-xs font-semibold text-gray-300">Ville</label>
                  <input id="chp-ville"
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                    placeholder="Bordeaux"
                    value={ville}
                    onChange={(e) => setVille(e.target.value)}
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="chp-telephone" className="text-xs font-semibold text-gray-300">Téléphone</label>
                  <input id="chp-telephone"
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                    placeholder="06 00 00 00 00"
                    value={tel}
                    onChange={(e) => setTel(e.target.value)}
                  />
                </div>
                <div>
                  <label htmlFor="chp-email" className="text-xs font-semibold text-gray-300">Email</label>
                  <input id="chp-email"
                    className="mt-1 w-full rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-xs text-white focus:border-red-600 focus:outline-none"
                    placeholder="contact@exemple.fr"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                  />
                </div>
              </div>
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
                className="rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-white hover:bg-red-700 shadow-md"
              >
                Enregistrer le client
              </button>
            </div>
          </form>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-gray-400">Chargement des clients…</p>
      ) : filtres.length === 0 ? (
        <p className="text-sm text-gray-500">Aucun client trouvé.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2">
          {filtres.map((c) => (
            <Surface
              key={c.id}
              className="p-4 transition-colors hover:border-slate-600"
            >
              <div className="flex items-start justify-between">
                <div>
                  {c.type === "professionnel" && c.societe && (
                    <p className="font-bold text-white">{c.societe}</p>
                  )}
                  <p className={c.societe ? "text-sm text-gray-300" : "font-bold text-white"}>
                    {c.nom}
                  </p>
                  {c.siret && <p className="text-xs text-gray-500">SIRET {c.siret}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className="rounded-full border border-slate-600 px-2 py-0.5 text-xs text-gray-400">
                    {c.type === "professionnel" ? "Pro" : "Particulier"}
                  </span>
                  <button
                    onClick={() => ouvrirFiche360(c)}
                    className="rounded-lg bg-[#1A1D24] px-2 py-1 text-xs text-gray-200 hover:bg-[#1A1D24]"
                    title="Voir l'historique 360°"
                  >
                    👁️ Fiche
                  </button>
                  <button
                    onClick={() => supprimerClient(c)}
                    disabled={deleting === c.id}
                    className="text-xs font-medium text-gray-500 hover:text-red-400"
                    aria-label="Supprimer le client"
                    title="Supprimer"
                  >
                    {deleting === c.id ? "…" : "🗑️"}
                  </button>
                </div>
              </div>

              {c.adresse_facturation && (
                <p className="mt-2 text-sm text-gray-400">{c.adresse_facturation}</p>
              )}
              {(c.code_postal || c.ville) && (
                <p className="text-sm text-gray-400">
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
                    className="font-medium text-gray-300 hover:text-gray-400"
                  >
                    ✉️ {c.email}
                  </a>
                )}
              </div>
            </Surface>
          ))}
        </div>
      )}

      {/* Modal Fiche Client 360° */}
      {clientSelectionne && (
        <div
          className="fixed inset-0 z-[210] pt-48 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setClientSelectionne(null)}
        >
          <Surface
            className="max-h-[85vh] w-full max-w-2xl overflow-y-auto p-6 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between border-b border-white/10 pb-3">
              <div>
                <span className="rounded bg-red-600/20 px-2 py-0.5 text-xs font-semibold uppercase text-red-400">
                  {clientSelectionne.type}
                </span>
                <h2 className="mt-1 text-xl font-bold text-white">
                  {clientSelectionne.societe || clientSelectionne.nom}
                </h2>
                {clientSelectionne.societe && (
                  <p className="text-xs text-gray-400">Contact : {clientSelectionne.nom}</p>
                )}
                {clientSelectionne.siret && (
                  <p className="text-xs text-gray-500">SIRET {clientSelectionne.siret}</p>
                )}
              </div>
              <button
                onClick={() => setClientSelectionne(null)}
                className="rounded-lg border border-slate-600 px-3 py-1 text-xs text-gray-300 hover:bg-[#1A1D24]"
              >
                Fermer
              </button>
            </div>

            {loading360 ? (
              <p className="py-6 text-center text-sm text-gray-400">Chargement de l&apos;historique 360°…</p>
            ) : (
              <div className="mt-4 space-y-5 text-sm">
                {/* Coordonnées */}
                <div className="grid grid-cols-2 gap-3 rounded-lg border border-white/10 bg-transparent p-3 text-xs">
                  <div>
                    <p className="text-gray-500">Adresse</p>
                    <p className="font-medium text-gray-200">
                      {clientSelectionne.adresse_facturation || "—"}
                    </p>
                    <p className="text-gray-200">
                      {clientSelectionne.code_postal} {clientSelectionne.ville}
                    </p>
                  </div>
                  <div>
                    <p className="text-gray-500">Contact direct</p>
                    <p className="text-red-400">{clientSelectionne.tel || "—"}</p>
                    <p className="text-gray-300">{clientSelectionne.email || "—"}</p>
                  </div>
                </div>

                {/* Chantiers rattachés */}
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                    🏗️ Chantiers ({chantiers360.length})
                  </h3>
                  {chantiers360.length === 0 ? (
                    <p className="text-xs text-gray-500">Aucun chantier enregistré pour ce client.</p>
                  ) : (
                    <div className="space-y-2">
                      {chantiers360.map((ch) => (
                        <Link
                          key={ch.id}
                          href={`/terrain/chantier/${ch.id}`}
                          className="flex items-center justify-between rounded-lg border border-white/10 bg-transparent p-2.5 hover:border-red-500"
                        >
                          <div>
                            <p className="font-semibold text-white">{ch.nom || "Chantier"}</p>
                            <p className="text-xs text-gray-400">{ch.adresse_chantier || "—"}</p>
                          </div>
                          <span className="rounded-full bg-[#1A1D24] px-2 py-0.5 text-xs text-gray-300">
                            {ch.statut} →
                          </span>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>

                {/* Devis */}
                <div>
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                    📝 Devis ({devis360.length})
                  </h3>
                  {devis360.length === 0 ? (
                    <p className="text-xs text-gray-500">Aucun devis émis.</p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-white/10">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-transparent text-gray-400">
                          <tr>
                            <th className="p-2">Numéro</th>
                            <th className="p-2">Objet</th>
                            <th className="p-2 text-right">Total HT</th>
                            <th className="p-2">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-gray-300">
                          {devis360.map((d) => {
                            const ht = (d.lignes || []).reduce((s, l) => s + l.qte * l.pu_ht, 0);
                            return (
                              <tr key={d.id}>
                                <td className="p-2 font-medium text-white">{d.numero}</td>
                                <td className="p-2">{d.objet || "—"}</td>
                                <td className="p-2 text-right">{fmtEuro(ht)}</td>
                                <td className="p-2">
                                  <span className="rounded bg-[#1A1D24] px-1.5 py-0.5 text-2xs uppercase">
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
                  <h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-gray-400">
                    🧾 Factures ({factures360.length})
                  </h3>
                  {factures360.length === 0 ? (
                    <p className="text-xs text-gray-500">Aucune facture enregistrée.</p>
                  ) : (
                    <div className="overflow-hidden rounded-lg border border-white/10">
                      <table className="w-full text-left text-xs">
                        <thead className="bg-transparent text-gray-400">
                          <tr>
                            <th className="p-2">Numéro</th>
                            <th className="p-2 text-right">Total TTC</th>
                            <th className="p-2">Statut</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-800 text-gray-300">
                          {factures360.map((f) => {
                            const ht = (f.lignes || []).reduce((s, l) => s + l.qte * l.pu_ht, 0);
                            const ttc = ht * (1 + (f.tva_pct || 10) / 100);
                            return (
                              <tr key={f.id}>
                                <td className="p-2 font-medium text-white">{f.numero}</td>
                                <td className="p-2 text-right font-semibold text-gray-400">
                                  {fmtEuro(ttc)}
                                </td>
                                <td className="p-2">
                                  <span className="rounded bg-[#1A1D24] px-1.5 py-0.5 text-2xs uppercase">
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
          </Surface>
        </div>
      )}
    </div>
  );
}

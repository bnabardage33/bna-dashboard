// app/bureau/fin-chantier/page.tsx
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { supabase } from "@/lib/supabase";
import { prochainNumero } from "@/lib/documents";
import SignaturePad from "@/components/SignaturePad";
import PVReceptionPDF, {
  PVReceptionData,
  Reserve,
  ChecklistRepli,
  StatutPV,
  EntrepriseInfo,
} from "@/components/PVReceptionPDF";

type PVRow = {
  id: string;
  numero: string;
  chantier_id: string | null;
  client_id: string | null;
  devis_id: string | null;
  date_reception: string;
  statut: StatutPV;
  type_travaux: string | null;
  adresse_chantier: string | null;
  materiaux_utilises: string | null;
  reserves: Reserve[];
  observations: string | null;
  signature_client: string | null;
  signataire_client_nom: string | null;
  signature_entreprise: string | null;
  signataire_entreprise_nom: string | null;
  checklist_repli: ChecklistRepli;
  created_at: string;
  // Données enrichies
  chantiers?: { nom: string | null; adresse_chantier: string | null } | null;
  clients?: { nom: string | null; email: string | null; telephone: string | null } | null;
  devis?: { numero: string | null } | null;
};

type ChantierOption = {
  id: string;
  nom: string | null;
  adresse_chantier: string | null;
  materiau_structurel: string | null;
  client_id: string;
  clients: { nom: string; adresse?: string | null; email?: string | null; telephone?: string | null } | null;
};

const DEFAULT_REPLI: ChecklistRepli = {
  nettoyage: true,
  dechets_evacues: true,
  echafaudage_demonte: true,
  fiches_techniques_remises: true,
};

const DEFAULT_ENTREPRISE: EntrepriseInfo = {
  raison_sociale: "BNA BARDAGE",
  siret: "921 456 789 00012",
  telephone: "05 56 00 00 00",
  email: "contact@bna-bardage.fr",
  adresse: "12 Rue de l'Artisanat",
  code_postal: "33000",
  ville: "Bordeaux",
  logo_url: null,
  assurance_decennale_nom: "AXA Courtage Construction",
  assurance_decennale_police: "DEC-2026-BNA-94820",
};

export default function FinChantierPage() {
  const router = useRouter();

  const [pvs, setPvs] = useState<PVRow[]>([]);
  const [chantiers, setChantiers] = useState<ChantierOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [recherche, setRecherche] = useState("");
  const [filtre, setFiltre] = useState<"tous" | "sans_reserve" | "avec_reserves" | "reserves_levees">("tous");

  // Modals
  const [modalFormOuvert, setModalFormOuvert] = useState(false);
  const [modalPdfOuvert, setModalPdfOuvert] = useState(false);
  const [modalReservesOuvert, setModalReservesOuvert] = useState(false);
  const [pvSelectionne, setPvSelectionne] = useState<PVRow | null>(null);

  // Formulaire d'édition / création
  const [formId, setFormId] = useState<string | null>(null);
  const [formChantierId, setFormChantierId] = useState("");
  const [formClientId, setFormClientId] = useState("");
  const [formDateReception, setFormDateReception] = useState(new Date().toISOString().slice(0, 10));
  const [formStatut, setFormStatut] = useState<StatutPV>("sans_reserve");
  const [formTypeTravaux, setFormTypeTravaux] = useState("Travaux de bardage et isolation extérieure (ITE)");
  const [formAdresseChantier, setFormAdresseChantier] = useState("");
  const [formMateriauxUtilises, setFormMateriauxUtilises] = useState("Panneaux HPL / Équerres Isolco 3000 P2 / Isolant Laine minérale");
  const [formObservations, setFormObservations] = useState("");
  const [formReserves, setFormReserves] = useState<Reserve[]>([]);
  const [formChecklistRepli, setFormChecklistRepli] = useState<ChecklistRepli>(DEFAULT_REPLI);
  const [formSignClient, setFormSignClient] = useState<string | null>(null);
  const [formSignClientNom, setFormSignClientNom] = useState("");
  const [formSignEntreprise, setFormSignEntreprise] = useState<string | null>(null);
  const [formSignEntrepriseNom, setFormSignEntrepriseNom] = useState("BNA BARDAGE");
  const [sauvegardeEnCours, setSauvegardeEnCours] = useState(false);

  // Chargement des données
  const chargerDonnees = useCallback(async () => {
    setLoading(true);
    const [pvsRes, chantiersRes, clientsRes, devisRes] = await Promise.all([
      supabase.from("pv_receptions").select("*").order("created_at", { ascending: false }),
      supabase.from("chantiers").select("id, nom, adresse_chantier, materiau_structurel, client_id, clients(nom, adresse, email, telephone)"),
      supabase.from("clients").select("id, nom, email, telephone"),
      supabase.from("devis").select("id, numero"),
    ]);

    const chantiersMap = new Map((chantiersRes.data || []).map((c: any) => [c.id, c]));
    const clientsMap = new Map((clientsRes.data || []).map((cl: any) => [cl.id, cl]));
    const devisMap = new Map((devisRes.data || []).map((d: any) => [d.id, d]));

    if (chantiersRes.data) {
      setChantiers(chantiersRes.data as unknown as ChantierOption[]);
    }

    if (pvsRes.data) {
      const enrichis: PVRow[] = (pvsRes.data as any[]).map((r) => {
        const ch = chantiersMap.get(r.chantier_id);
        const cl = clientsMap.get(r.client_id) || ch?.clients;
        const d = devisMap.get(r.devis_id);
        return {
          ...r,
          reserves: Array.isArray(r.reserves) ? r.reserves : [],
          checklist_repli: r.checklist_repli || DEFAULT_REPLI,
          chantiers: ch ? { nom: ch.nom, adresse_chantier: ch.adresse_chantier } : null,
          clients: cl ? { nom: cl.nom, email: cl.email, telephone: cl.telephone } : null,
          devis: d ? { numero: d.numero } : null,
        };
      });
      setPvs(enrichis);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    chargerDonnees();
  }, [chargerDonnees]);

  useEffect(() => {
    if (typeof window !== "undefined" && chantiers.length > 0) {
      const params = new URLSearchParams(window.location.search);
      const chId = params.get("chantierId");
      if (chId && !modalFormOuvert && !formId) {
        ouvrirNouveauPV(chId);
      }
    }
  }, [chantiers]);

  // Ouverture du formulaire pour un nouveau PV
  function ouvrirNouveauPV(preselectedChantierId?: string) {
    setFormId(null);
    const targetChantierId = preselectedChantierId || chantiers[0]?.id || "";
    const ch = chantiers.find((c) => c.id === targetChantierId);

    setFormChantierId(targetChantierId);
    setFormClientId(ch?.client_id || "");
    setFormDateReception(new Date().toISOString().slice(0, 10));
    setFormStatut("sans_reserve");
    setFormTypeTravaux("Travaux de bardage et isolation extérieure (ITE)");
    setFormAdresseChantier(ch?.adresse_chantier || "");
    setFormMateriauxUtilises(
      ch?.materiau_structurel
        ? `Bardage ${ch.materiau_structurel} / Équerres Isolco / Isolant ITE`
        : "Panneaux HPL / Équerres Isolco 3000 P2 / Isolant Laine minérale"
    );
    setFormObservations("");
    setFormReserves([]);
    setFormChecklistRepli(DEFAULT_REPLI);
    setFormSignClient(null);
    setFormSignClientNom(ch?.clients?.nom || "");
    setFormSignEntreprise(null);
    setFormSignEntrepriseNom("BNA BARDAGE");

    setModalFormOuvert(true);
  }

  // Ouverture du formulaire d'édition
  function ouvrirEditionPV(pv: PVRow) {
    setFormId(pv.id);
    setFormChantierId(pv.chantier_id || "");
    setFormClientId(pv.client_id || "");
    setFormDateReception(pv.date_reception ? pv.date_reception.slice(0, 10) : new Date().toISOString().slice(0, 10));
    setFormStatut(pv.statut);
    setFormTypeTravaux(pv.type_travaux || "Travaux de bardage et isolation extérieure (ITE)");
    setFormAdresseChantier(pv.adresse_chantier || "");
    setFormMateriauxUtilises(pv.materiaux_utilises || "");
    setFormObservations(pv.observations || "");
    setFormReserves(pv.reserves || []);
    setFormChecklistRepli(pv.checklist_repli || DEFAULT_REPLI);
    setFormSignClient(pv.signature_client);
    setFormSignClientNom(pv.signataire_client_nom || pv.clients?.nom || "");
    setFormSignEntreprise(pv.signature_entreprise);
    setFormSignEntrepriseNom(pv.signataire_entreprise_nom || "BNA BARDAGE");

    setModalFormOuvert(true);
  }

  // Changement de chantier dans le formulaire -> auto-complète les données
  function handleChantierChange(chId: string) {
    setFormChantierId(chId);
    const ch = chantiers.find((c) => c.id === chId);
    if (ch) {
      setFormClientId(ch.client_id || "");
      if (!formAdresseChantier) setFormAdresseChantier(ch.adresse_chantier || "");
      if (!formSignClientNom && ch.clients?.nom) setFormSignClientNom(ch.clients.nom);
    }
  }

  // Gestion dynamique des réserves
  function ajouterReserve() {
    const nouvelle: Reserve = {
      id: crypto.randomUUID(),
      designation: "",
      localisation: "Façade principale",
      date_limite: new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10), // +15 jours
      levee: false,
    };
    setFormReserves([...formReserves, nouvelle]);
    if (formStatut === "sans_reserve") {
      setFormStatut("avec_reserves");
    }
  }

  function updateReserve(id: string, updates: Partial<Reserve>) {
    setFormReserves(formReserves.map((r) => (r.id === id ? { ...r, ...updates } : r)));
  }

  function supprimerReserve(id: string) {
    const filtre = formReserves.filter((r) => r.id !== id);
    setFormReserves(filtre);
    if (filtre.length === 0 && formStatut === "avec_reserves") {
      setFormStatut("sans_reserve");
    }
  }

  // Sauvegarde d'un PV
  async function handleSauvegarderPV(e: React.FormEvent) {
    e.preventDefault();
    setSauvegardeEnCours(true);

    try {
      if (formId) {
        // Mise à jour
        const { error } = await supabase
          .from("pv_receptions")
          .update({
            chantier_id: formChantierId || null,
            client_id: formClientId || null,
            date_reception: formDateReception,
            statut: formStatut,
            type_travaux: formTypeTravaux,
            adresse_chantier: formAdresseChantier,
            materiaux_utilises: formMateriauxUtilises,
            reserves: formReserves,
            observations: formObservations,
            checklist_repli: formChecklistRepli,
            signature_client: formSignClient,
            signataire_client_nom: formSignClientNom,
            signature_entreprise: formSignEntreprise,
            signataire_entreprise_nom: formSignEntrepriseNom,
          })
          .eq("id", formId);

        if (error) throw error;
      } else {
        // Création
        const numero = await prochainNumero("pv_receptions", "PVR");
        const { error } = await supabase.from("pv_receptions").insert({
          numero,
          chantier_id: formChantierId || null,
          client_id: formClientId || null,
          date_reception: formDateReception,
          statut: formStatut,
          type_travaux: formTypeTravaux,
          adresse_chantier: formAdresseChantier,
          materiaux_utilises: formMateriauxUtilises,
          reserves: formReserves,
          observations: formObservations,
          checklist_repli: formChecklistRepli,
          signature_client: formSignClient,
          signataire_client_nom: formSignClientNom,
          signature_entreprise: formSignEntreprise,
          signataire_entreprise_nom: formSignEntrepriseNom,
        });

        if (error) throw error;
      }

      setModalFormOuvert(false);
      await chargerDonnees();
    } catch (err: any) {
      alert(`Erreur lors de l'enregistrement : ${err.message || err}`);
    } finally {
      setSauvegardeEnCours(false);
    }
  }

  // Suppression d'un PV
  async function handleSupprimerPV(id: string, numero: string) {
    if (!confirm(`Confirmer la suppression du Procès-Verbal ${numero} ?`)) return;
    const { error } = await supabase.from("pv_receptions").delete().eq("id", id);
    if (!error) {
      setPvs(pvs.filter((p) => p.id !== id));
    }
  }

  // Gestion de la levée des réserves
  async function toggleLeverReserve(pv: PVRow, reserveId: string) {
    const ajourdhui = new Date().toISOString().slice(0, 10);
    const updatedReserves = pv.reserves.map((r) => {
      if (r.id === reserveId) {
        const nouvelleValeur = !r.levee;
        return {
          ...r,
          levee: nouvelleValeur,
          date_levee: nouvelleValeur ? ajourdhui : undefined,
        };
      }
      return r;
    });

    const toutesLevees = updatedReserves.every((r) => r.levee);
    const nouveauStatut: StatutPV = toutesLevees ? "reserves_levees" : "avec_reserves";

    const { error } = await supabase
      .from("pv_receptions")
      .update({
        reserves: updatedReserves,
        statut: nouveauStatut,
      })
      .eq("id", pv.id);

    if (!error) {
      const updatedPV = { ...pv, reserves: updatedReserves, statut: nouveauStatut };
      setPvs(pvs.map((p) => (p.id === pv.id ? updatedPV : p)));
      if (pvSelectionne?.id === pv.id) setPvSelectionne(updatedPV);
    }
  }

  // Redirection vers Facture de Solde
  function handleCreerFactureSolde(pv: PVRow) {
    const chNom = pv.chantiers?.nom || "Chantier";
    const clNom = pv.clients?.nom || "";
    // On transmet les infos par query params
    router.push(
      `/bureau/factures?type=solde&clientId=${pv.client_id || ""}&chantierId=${pv.chantier_id || ""}&pvNumero=${encodeURIComponent(
        pv.numero
      )}&objet=${encodeURIComponent(`Facture de solde (100% réceptionné - ${pv.numero}) - ${chNom}`)}`
    );
  }

  // Filtrage des PV
  const pvsFiltres = pvs.filter((pv) => {
    if (filtre === "sans_reserve" && pv.statut !== "sans_reserve") return false;
    if (filtre === "avec_reserves" && pv.statut !== "avec_reserves") return false;
    if (filtre === "reserves_levees" && pv.statut !== "reserves_levees") return false;

    if (recherche.trim()) {
      const q = recherche.toLowerCase();
      const matchNum = pv.numero.toLowerCase().includes(q);
      const matchCh = pv.chantiers?.nom?.toLowerCase().includes(q);
      const matchCl = pv.clients?.nom?.toLowerCase().includes(q);
      return matchNum || matchCh || matchCl;
    }
    return true;
  });

  // KPIs
  const totalPV = pvs.length;
  const nbSansReserve = pvs.filter((p) => p.statut === "sans_reserve").length;
  const nbAvecReserves = pvs.filter((p) => p.statut === "avec_reserves").length;
  const nbReservesLevees = pvs.filter((p) => p.statut === "reserves_levees").length;

  return (
    <div className="space-y-6">
      {/* En-tête de la page */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold text-white">Fin de chantier &amp; Réceptions</h1>
          <p className="text-xs text-slate-400">
            Procès-verbaux de réception (Art. 1792-6), levée des réserves et déclenchement des garanties décennales.
          </p>
        </div>

        <button
          onClick={() => ouvrirNouveauPV()}
          className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2.5 text-sm font-semibold text-white shadow-lg shadow-red-600/30 transition-all hover:bg-red-500"
        >
          <span>+</span> Nouveau PV de Réception
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-xl border border-slate-700 bg-slate-800 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-400">Total PV Émis</p>
          <p className="mt-1 text-2xl font-black text-white">{totalPV}</p>
          <p className="text-[11px] text-slate-500">Chantiers clôturés</p>
        </div>

        <div className="rounded-xl border border-emerald-500/30 bg-emerald-950/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-emerald-400">Sans Réserve</p>
          <p className="mt-1 text-2xl font-black text-emerald-300">{nbSansReserve}</p>
          <p className="text-[11px] text-emerald-500/80">GPA &amp; Décennale actives</p>
        </div>

        <div className="rounded-xl border border-amber-500/30 bg-amber-950/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-amber-400">Avec Réserves</p>
          <p className="mt-1 text-2xl font-black text-amber-300">{nbAvecReserves}</p>
          <p className="text-[11px] text-amber-500/80">En cours de levée</p>
        </div>

        <div className="rounded-xl border border-sky-500/30 bg-sky-950/20 p-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-sky-400">Réserves Levées</p>
          <p className="mt-1 text-2xl font-black text-sky-300">{nbReservesLevees}</p>
          <p className="text-[11px] text-sky-500/80">Solde déblocable</p>
        </div>
      </div>

      {/* Barre de Filtres & Recherche */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          <button
            onClick={() => setFiltre("tous")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filtre === "tous" ? "bg-red-600 text-white" : "border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Tous ({pvs.length})
          </button>
          <button
            onClick={() => setFiltre("sans_reserve")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filtre === "sans_reserve"
                ? "bg-emerald-600 text-white"
                : "border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Sans réserve ({nbSansReserve})
          </button>
          <button
            onClick={() => setFiltre("avec_reserves")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filtre === "avec_reserves"
                ? "bg-amber-600 text-white"
                : "border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Avec réserves ({nbAvecReserves})
          </button>
          <button
            onClick={() => setFiltre("reserves_levees")}
            className={`rounded-full px-3 py-1.5 text-xs font-medium transition-colors ${
              filtre === "reserves_levees"
                ? "bg-sky-600 text-white"
                : "border border-slate-700 bg-slate-800 text-slate-300 hover:bg-slate-700"
            }`}
          >
            Réserves levées ({nbReservesLevees})
          </button>
        </div>

        <div className="w-full sm:w-72">
          <input
            type="text"
            value={recherche}
            onChange={(e) => setRecherche(e.target.value)}
            placeholder="Rechercher par n°, chantier, client…"
            className="w-full rounded-xl border border-slate-700 bg-slate-800 px-3.5 py-1.5 text-xs text-slate-100 placeholder-slate-500 focus:border-red-500 focus:outline-none"
          />
        </div>
      </div>

      {/* Liste des PV */}
      {loading ? (
        <div className="p-12 text-center text-sm text-slate-400">Chargement des procès-verbaux…</div>
      ) : pvsFiltres.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-slate-700 bg-slate-800/40 p-12 text-center">
          <p className="text-sm text-slate-400">Aucun procès-verbal de réception pour ce filtre.</p>
          <button
            onClick={() => ouvrirNouveauPV()}
            className="mt-3 text-xs font-semibold text-red-400 hover:text-red-300"
          >
            + Rédiger un premier PV de réception →
          </button>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl border border-slate-700 bg-slate-800 shadow-xl">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-slate-700 bg-slate-900/40 text-slate-400 font-semibold uppercase tracking-wider text-[11px]">
                <th className="p-3.5">Numéro</th>
                <th className="p-3.5">Chantier / Client</th>
                <th className="p-3.5">Date Réception</th>
                <th className="p-3.5">Statut Réception</th>
                <th className="p-3.5 text-center">Réserves</th>
                <th className="p-3.5 text-center">Signatures</th>
                <th className="p-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/60 text-slate-200">
              {pvsFiltres.map((pv) => {
                const nbRes = pv.reserves.length;
                const nbLevees = pv.reserves.filter((r) => r.levee).length;
                const clientSigne = !!pv.signature_client;
                const bnaSigne = !!pv.signature_entreprise;

                return (
                  <tr key={pv.id} className="hover:bg-slate-750 transition-colors">
                    <td className="p-3.5 font-bold text-white whitespace-nowrap">
                      <span className="rounded bg-slate-900 px-2 py-0.5 text-sky-400 font-mono">
                        {pv.numero}
                      </span>
                    </td>

                    <td className="p-3.5">
                      <p className="font-semibold text-white">{pv.chantiers?.nom || "Chantier"}</p>
                      <p className="text-[11px] text-slate-400">{pv.clients?.nom || "Client direct"}</p>
                    </td>

                    <td className="p-3.5 text-slate-300 whitespace-nowrap">
                      {new Date(pv.date_reception).toLocaleDateString("fr-FR")}
                    </td>

                    <td className="p-3.5 whitespace-nowrap">
                      <span
                        className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide ${
                          pv.statut === "sans_reserve"
                            ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                            : pv.statut === "reserves_levees"
                            ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                            : pv.statut === "refuse"
                            ? "bg-red-500/20 text-red-400 border border-red-500/30"
                            : "bg-amber-500/20 text-amber-400 border border-amber-500/30"
                        }`}
                      >
                        {pv.statut === "sans_reserve"
                          ? "✓ Sans Réserve"
                          : pv.statut === "reserves_levees"
                          ? "✓ Réserves Levées"
                          : pv.statut === "refuse"
                          ? "✕ Refusé"
                          : `⚠️ ${nbRes - nbLevees} Réserve(s)`}
                      </span>
                    </td>

                    <td className="p-3.5 text-center whitespace-nowrap">
                      {nbRes === 0 ? (
                        <span className="text-slate-500">—</span>
                      ) : (
                        <button
                          onClick={() => {
                            setPvSelectionne(pv);
                            setModalReservesOuvert(true);
                          }}
                          className={`rounded px-2 py-0.5 text-[11px] font-semibold transition-colors ${
                            nbLevees === nbRes
                              ? "bg-emerald-950 text-emerald-300 hover:bg-emerald-900"
                              : "bg-amber-950 text-amber-300 hover:bg-amber-900"
                          }`}
                        >
                          {nbLevees}/{nbRes} levée(s) 🔧
                        </button>
                      )}
                    </td>

                    <td className="p-3.5 text-center whitespace-nowrap">
                      <div className="flex items-center justify-center gap-1.5 text-[11px]">
                        <span title={clientSigne ? "Client a signé" : "Signature client en attente"}>
                          {clientSigne ? "👤 Client ✅" : "👤 Client ⏳"}
                        </span>
                        <span>·</span>
                        <span title={bnaSigne ? "BNA a signé" : "Signature BNA en attente"}>
                          {bnaSigne ? "🏢 BNA ✅" : "🏢 BNA ⏳"}
                        </span>
                      </div>
                    </td>

                    <td className="p-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          onClick={() => {
                            setPvSelectionne(pv);
                            setModalPdfOuvert(true);
                          }}
                          title="Aperçu & Impression PDF"
                          className="rounded-lg bg-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-100 hover:bg-sky-600 hover:text-white transition-colors"
                        >
                          📄 PDF
                        </button>

                        <button
                          onClick={() => handleCreerFactureSolde(pv)}
                          title="Créer la facture de solde finale"
                          className="rounded-lg bg-emerald-700/80 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-600 transition-colors"
                        >
                          🧾 Facture Solde
                        </button>

                        <button
                          onClick={() => ouvrirEditionPV(pv)}
                          title="Modifier le PV"
                          className="rounded-lg bg-slate-700 px-2.5 py-1.5 text-xs font-semibold text-slate-300 hover:bg-slate-600 hover:text-white"
                        >
                          ✏️
                        </button>

                        <button
                          onClick={() => handleSupprimerPV(pv.id, pv.numero)}
                          title="Supprimer le PV"
                          className="rounded-lg p-1.5 text-xs text-slate-500 hover:bg-red-950 hover:text-red-400"
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

      {/* ============================================================ */}
      {/* MODAL : CRÉATION & ÉDITION D'UN PV DE RÉCEPTION */}
      {/* ============================================================ */}
      {modalFormOuvert && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
          <div className="relative w-full max-w-3xl rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl space-y-5 my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div>
                <h2 className="text-base font-bold text-white">
                  {formId ? "Modifier le Procès-Verbal de Réception" : "Nouveau Procès-Verbal de Réception de Chantier"}
                </h2>
                <p className="text-xs text-slate-400">
                  Article 1792-6 du Code Civil · Transfert de garde &amp; Déclenchement GPA / Décennale
                </p>
              </div>
              <button
                onClick={() => setModalFormOuvert(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSauvegarderPV} className="space-y-4">
              {/* Chantier & Client */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Chantier concerné *</label>
                  <select
                    value={formChantierId}
                    onChange={(e) => handleChantierChange(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white"
                  >
                    <option value="">— Sélectionner un chantier —</option>
                    {chantiers.map((ch) => (
                      <option key={ch.id} value={ch.id}>
                        {ch.nom || "Chantier sans nom"} ({ch.clients?.nom || "Client inconnu"})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Date de réception *</label>
                  <input
                    type="date"
                    value={formDateReception}
                    onChange={(e) => setFormDateReception(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              {/* Adresse & Matériaux */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-slate-300">Adresse d&apos;exécution du chantier</label>
                  <input
                    type="text"
                    value={formAdresseChantier}
                    onChange={(e) => setFormAdresseChantier(e.target.value)}
                    placeholder="Ex. 12 rue des Pins, 33000 Bordeaux"
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-slate-300">Matériaux &amp; Systèmes posés</label>
                  <input
                    type="text"
                    value={formMateriauxUtilises}
                    onChange={(e) => setFormMateriauxUtilises(e.target.value)}
                    placeholder="Ex. Panneaux Trespa HPL 8mm / Équerres Isolco 140mm / Laine de roche 120mm"
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              {/* Prononciation de la réception */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3.5 space-y-2">
                <label className="text-xs font-bold uppercase tracking-wide text-slate-300">
                  Type de Réception prononcée
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setFormStatut("sans_reserve")}
                    className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
                      formStatut === "sans_reserve"
                        ? "border-emerald-500 bg-emerald-950/40 text-emerald-300"
                        : "border-slate-700 bg-slate-900 text-slate-400"
                    }`}
                  >
                    <p className="font-bold">✓ Sans Réserve</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Ouvrage 100% conforme</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormStatut("avec_reserves")}
                    className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
                      formStatut === "avec_reserves"
                        ? "border-amber-500 bg-amber-950/40 text-amber-300"
                        : "border-slate-700 bg-slate-900 text-slate-400"
                    }`}
                  >
                    <p className="font-bold">⚠️ Avec Réserves</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Retouches mineures</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormStatut("reserves_levees")}
                    className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
                      formStatut === "reserves_levees"
                        ? "border-sky-500 bg-sky-950/40 text-sky-300"
                        : "border-slate-700 bg-slate-900 text-slate-400"
                    }`}
                  >
                    <p className="font-bold">✓ Réserves Levées</p>
                    <p className="text-[10px] text-slate-400 mt-0.5">Travaux repris et validés</p>
                  </button>
                </div>
              </div>

              {/* Saisie des réserves si nécessaire */}
              {(formStatut === "avec_reserves" || formReserves.length > 0) && (
                <div className="space-y-3 rounded-xl border border-amber-500/30 bg-amber-950/10 p-3.5">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-amber-400 uppercase tracking-wide">
                      📝 Liste des réserves formulées ({formReserves.length})
                    </p>
                    <button
                      type="button"
                      onClick={ajouterReserve}
                      className="rounded bg-amber-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-amber-500"
                    >
                      + Ajouter une réserve
                    </button>
                  </div>

                  {formReserves.length === 0 ? (
                    <p className="text-xs text-slate-400 italic">
                      Aucune réserve ajoutée. Cliquez sur « + Ajouter une réserve » pour consigner une retouche.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {formReserves.map((r, index) => (
                        <div
                          key={r.id}
                          className="grid grid-cols-1 gap-2 rounded-lg border border-slate-700 bg-slate-900 p-2.5 sm:grid-cols-12 items-center"
                        >
                          <div className="sm:col-span-5">
                            <input
                              type="text"
                              value={r.designation}
                              onChange={(e) => updateReserve(r.id, { designation: e.target.value })}
                              placeholder={`Réserve #${index + 1} (ex: Retouche joint d'angle)`}
                              required
                              className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <input
                              type="text"
                              value={r.localisation}
                              onChange={(e) => updateReserve(r.id, { localisation: e.target.value })}
                              placeholder="Localisation (Façade Sud)"
                              className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <input
                              type="date"
                              value={r.date_limite}
                              onChange={(e) => updateReserve(r.id, { date_limite: e.target.value })}
                              className="w-full rounded border border-slate-700 bg-slate-800 px-2 py-1 text-xs text-white"
                            />
                          </div>
                          <div className="sm:col-span-1 text-right">
                            <button
                              type="button"
                              onClick={() => supprimerReserve(r.id)}
                              className="text-red-400 hover:text-red-300 text-xs"
                            >
                              ✕
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Checklist Repli de Chantier */}
              <div className="rounded-xl border border-slate-700 bg-slate-900/60 p-3.5 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-slate-300">
                  🧹 Checklist Propreté &amp; Repli du Chantier
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
                  <label className="flex items-center gap-2 text-slate-300">
                    <input
                      type="checkbox"
                      checked={formChecklistRepli.nettoyage}
                      onChange={(e) =>
                        setFormChecklistRepli({ ...formChecklistRepli, nettoyage: e.target.checked })
                      }
                    />
                    Nettoyage du site
                  </label>
                  <label className="flex items-center gap-2 text-slate-300">
                    <input
                      type="checkbox"
                      checked={formChecklistRepli.dechets_evacues}
                      onChange={(e) =>
                        setFormChecklistRepli({ ...formChecklistRepli, dechets_evacues: e.target.checked })
                      }
                    />
                    Déchets évacués
                  </label>
                  <label className="flex items-center gap-2 text-slate-300">
                    <input
                      type="checkbox"
                      checked={formChecklistRepli.echafaudage_demonte}
                      onChange={(e) =>
                        setFormChecklistRepli({ ...formChecklistRepli, echafaudage_demonte: e.target.checked })
                      }
                    />
                    Échafaudage démonté
                  </label>
                  <label className="flex items-center gap-2 text-slate-300">
                    <input
                      type="checkbox"
                      checked={formChecklistRepli.fiches_techniques_remises}
                      onChange={(e) =>
                        setFormChecklistRepli({ ...formChecklistRepli, fiches_techniques_remises: e.target.checked })
                      }
                    />
                    Fiches techniques
                  </label>
                </div>
              </div>

              {/* Observations */}
              <div>
                <label className="text-xs font-semibold text-slate-300">Observations Particulières</label>
                <textarea
                  value={formObservations}
                  onChange={(e) => setFormObservations(e.target.value)}
                  rows={2}
                  placeholder="Observations éventuelles sur le déroulement ou les accès..."
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-slate-900 p-2.5 text-xs text-white"
                />
              </div>

              {/* Signatures Tactiles */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2 border-t border-slate-700">
                <div className="space-y-2">
                  <SignaturePad
                    label="Signature Client / Maître d'Ouvrage"
                    signerName={formSignClientNom}
                    value={formSignClient}
                    onChange={setFormSignClient}
                  />
                  <input
                    type="text"
                    value={formSignClientNom}
                    onChange={(e) => setFormSignClientNom(e.target.value)}
                    placeholder="Nom du signataire client"
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                  />
                </div>

                <div className="space-y-2">
                  <SignaturePad
                    label="Signature BNA / Entreprise"
                    signerName={formSignEntrepriseNom}
                    value={formSignEntreprise}
                    onChange={setFormSignEntreprise}
                  />
                  <input
                    type="text"
                    value={formSignEntrepriseNom}
                    onChange={(e) => setFormSignEntrepriseNom(e.target.value)}
                    placeholder="Nom du chef de chantier"
                    className="w-full rounded border border-slate-700 bg-slate-900 px-2 py-1.5 text-xs text-white"
                  />
                </div>
              </div>

              {/* Boutons d'action */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700">
                <button
                  type="button"
                  onClick={() => setModalFormOuvert(false)}
                  className="rounded-lg border border-slate-600 bg-slate-800 px-4 py-2 text-xs font-semibold text-slate-300 hover:bg-slate-700"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={sauvegardeEnCours}
                  className="rounded-lg bg-red-600 px-5 py-2 text-xs font-semibold text-white hover:bg-red-500 disabled:opacity-50"
                >
                  {sauvegardeEnCours ? "Enregistrement..." : formId ? "Mettre à jour le PV" : "Créer le PV de Réception"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL : GESTION DE LA LEVÉE DES RÉSERVES */}
      {/* ============================================================ */}
      {modalReservesOuvert && pvSelectionne && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="relative w-full max-w-xl rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Gestion des Réserves · {pvSelectionne.numero}
                </h3>
                <p className="text-xs text-slate-400">
                  {pvSelectionne.chantiers?.nom} ({pvSelectionne.clients?.nom})
                </p>
              </div>
              <button
                onClick={() => setModalReservesOuvert(false)}
                className="rounded-lg p-1 text-slate-400 hover:bg-slate-700 hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300">
              Cochez les réserves effectuées pour constater leur levée. Dès que toutes les réserves sont levées, le statut passe automatiquement à <strong className="text-sky-400">« Réserves Levées »</strong>.
            </p>

            <div className="space-y-2.5 max-h-72 overflow-y-auto">
              {pvSelectionne.reserves.map((r, idx) => (
                <div
                  key={r.id || idx}
                  onClick={() => toggleLeverReserve(pvSelectionne, r.id)}
                  className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer transition-colors ${
                    r.levee
                      ? "border-emerald-500/40 bg-emerald-950/20 text-emerald-300"
                      : "border-slate-700 bg-slate-900/60 text-slate-200 hover:border-amber-500/40"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={r.levee}
                      onChange={() => {}}
                      className="h-4 w-4 rounded border-slate-600 bg-slate-800 text-emerald-600"
                    />
                    <div>
                      <p className={`text-xs font-semibold ${r.levee ? "line-through text-slate-400" : "text-white"}`}>
                        {r.designation}
                      </p>
                      <p className="text-[11px] text-slate-500">
                        {r.localisation} · Échéance : {r.date_limite ? new Date(r.date_limite).toLocaleDateString("fr-FR") : "—"}
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] font-semibold">
                    {r.levee ? (
                      <span className="text-emerald-400">
                        ✓ Levée {r.date_levee ? `(${new Date(r.date_levee).toLocaleDateString("fr-FR")})` : ""}
                      </span>
                    ) : (
                      <span className="text-amber-400">À lever</span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="flex items-center justify-between pt-3 border-t border-slate-700">
              <button
                onClick={() => handleCreerFactureSolde(pvSelectionne)}
                className="text-xs font-semibold text-emerald-400 hover:text-emerald-300"
              >
                🧾 Passer à la Facture de Solde →
              </button>

              <button
                onClick={() => setModalReservesOuvert(false)}
                className="rounded-lg bg-slate-700 px-4 py-1.5 text-xs font-semibold text-white hover:bg-slate-600"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL : APERÇU ET IMPRESSION DU PV EN PDF */}
      {/* ============================================================ */}
      {modalPdfOuvert && pvSelectionne && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
          <div className="relative w-full max-w-4xl rounded-2xl border border-slate-700 bg-slate-800 p-6 shadow-2xl space-y-4 my-8 max-h-[95vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-700 pb-3 print:hidden">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold text-white">
                  Procès-Verbal {pvSelectionne.numero}
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    pvSelectionne.statut === "sans_reserve"
                      ? "bg-emerald-500/20 text-emerald-400"
                      : pvSelectionne.statut === "reserves_levees"
                      ? "bg-sky-500/20 text-sky-400"
                      : "bg-amber-500/20 text-amber-400"
                  }`}
                >
                  {pvSelectionne.statut}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3.5 py-1.5 text-xs font-semibold text-white hover:bg-sky-500 shadow-md"
                >
                  🖨️ Imprimer / Exporter PDF
                </button>
                <button
                  onClick={() => setModalPdfOuvert(false)}
                  className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-700 hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Document PDF rendu */}
            <div className="rounded-xl border border-slate-700 bg-white p-2 shadow-2xl print:border-none print:p-0">
              <PVReceptionPDF
                pv={pvSelectionne}
                entreprise={DEFAULT_ENTREPRISE}
                client={{
                  nom: pvSelectionne.clients?.nom || "Client",
                  email: pvSelectionne.clients?.email,
                  telephone: pvSelectionne.clients?.telephone,
                  adresse: pvSelectionne.adresse_chantier,
                }}
                chantier={{
                  nom: pvSelectionne.chantiers?.nom ?? null,
                  adresse_chantier: pvSelectionne.adresse_chantier,
                  devis_numero: pvSelectionne.devis?.numero,
                }}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

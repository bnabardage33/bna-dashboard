// app/bureau/fin-chantier/page.tsx
"use client";

import { useEffect, useState, useCallback, useRef } from "react";
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
  ZoneMetre,
  PhotoFinChantier,
  NoticeEntretien,
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
  zones_metres?: ZoneMetre[];
  photos?: PhotoFinChantier[];
  reserves: Reserve[];
  observations: string | null;
  notice_entretien?: NoticeEntretien;
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

const DEFAULT_NOTICE: NoticeEntretien = {
  remise_fiches_techniques: true,
  remise_guide_entretien: true,
  remise_attestation_decennale: true,
  frequence_nettoyage_recommandee: "Lavage annuel à l'eau douce tiède et savon doux neutre (sans solvants ni haute pression)",
  controle_joints_recommande: "Inspection visuelle annuelle des bavettes, grilles anti-rongeurs et joints de dilatation",
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
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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
  const [formDateReception, setFormDateReception] = useState("");
  const [formStatut, setFormStatut] = useState<StatutPV>("sans_reserve");
  const [formTypeTravaux, setFormTypeTravaux] = useState("Travaux de bardage et isolation extérieure (ITE)");
  const [formAdresseChantier, setFormAdresseChantier] = useState("");
  const [formMateriauxUtilises, setFormMateriauxUtilises] = useState("Panneaux HPL / Équerres Isolco 3000 P2 / Isolant Laine minérale");
  const [formObservations, setFormObservations] = useState("");
  const [formZonesMetres, setFormZonesMetres] = useState<ZoneMetre[]>([]);
  const [formPhotos, setFormPhotos] = useState<PhotoFinChantier[]>([]);
  const [formNoticeEntretien, setFormNoticeEntretien] = useState<NoticeEntretien>(DEFAULT_NOTICE);
  const [formReserves, setFormReserves] = useState<Reserve[]>([]);
  const [formChecklistRepli, setFormChecklistRepli] = useState<ChecklistRepli>(DEFAULT_REPLI);
  const [formSignClient, setFormSignClient] = useState<string | null>(null);
  const [formSignClientNom, setFormSignClientNom] = useState("");
  const [formSignEntreprise, setFormSignEntreprise] = useState<string | null>(null);
  const [formSignEntrepriseNom, setFormSignEntrepriseNom] = useState("BNA BARDAGE");
  const [sauvegardeEnCours, setSauvegardeEnCours] = useState(false);

  // Calcul des zones d'un chantier
  const chargerZonesPourChantier = useCallback(async (chId: string): Promise<ZoneMetre[]> => {
    if (!chId) return [];
    try {
      const { data } = await supabase
        .from("chantier_zones")
        .select("*")
        .eq("chantier_id", chId)
        .order("created_at", { ascending: true });

      if (!data || data.length === 0) return [];

      return data.map((z: any) => {
        const l = Number(z.largeur) || 0;
        const h = Number(z.hauteur_mur) || 0;
        const hf = Number(z.hauteur_faite) || 0;
        const isPignon = z.type === "pignon";
        const surfaceBrute = isPignon && hf > h ? l * h + (l * (hf - h)) / 2 : l * h;
        const surfaceOuvertures = (z.ouvertures || []).reduce(
          (s: number, o: any) =>
            s + (Number(o.largeur) || 0) * (Number(o.hauteur) || 0) * (Number(o.quantite) || 1),
          0
        );
        const surfaceNette = Math.max(0, surfaceBrute - surfaceOuvertures);

        return {
          id: z.id,
          nom: z.nom || "Zone",
          type: (z.type === "pignon" ? "pignon" : "facade") as "facade" | "pignon",
          largeur: l,
          hauteur_mur: h,
          hauteur_faite: z.hauteur_faite ? hf : null,
          surfaceBrute: Math.round(surfaceBrute * 100) / 100,
          surfaceOuvertures: Math.round(surfaceOuvertures * 100) / 100,
          surfaceNette: Math.round(surfaceNette * 100) / 100,
          materiau: z.materiau || "Bardage rapporté",
        };
      });
    } catch {
      return [];
    }
  }, []);

  // Chargement des données
  const chargerDonnees = useCallback(async () => {
    setLoading(true);
    const [pvsRes, chantiersRes, clientsRes, devisRes] = await Promise.all([
      supabase.from("pv_receptions").select("*").order("created_at", { ascending: false }),
      supabase.from("chantiers").select("id, nom, adresse_chantier, materiau_structurel, client_id"),
      supabase.from("clients").select("id, nom, email, tel, adresse_facturation"),
      supabase.from("devis").select("id, numero"),
    ]);

    if (chantiersRes.error) {
      console.error("Erreur chargement chantiers:", chantiersRes.error);
    }

    const clientsMap = new Map((clientsRes.data || []).map((cl: any) => [cl.id, cl]));
    const devisMap = new Map((devisRes.data || []).map((d: any) => [d.id, d]));

    const chantiersFormatted: ChantierOption[] = (chantiersRes.data || []).map((c: any) => {
      const client = clientsMap.get(c.client_id);
      return {
        id: c.id,
        nom: c.nom || "Chantier sans nom",
        adresse_chantier: c.adresse_chantier,
        materiau_structurel: c.materiau_structurel,
        client_id: c.client_id,
        clients: client
          ? {
              nom: client.nom,
              adresse: client.adresse_facturation,
              email: client.email,
              telephone: client.tel,
            }
          : null,
      };
    });

    setChantiers(chantiersFormatted);

    const chantiersMap = new Map(chantiersFormatted.map((c) => [c.id, c]));

    if (pvsRes.data) {
      const enrichis: PVRow[] = (pvsRes.data as any[]).map((r) => {
        const ch = chantiersMap.get(r.chantier_id);
        const cl = clientsMap.get(r.client_id) || ch?.clients;
        const d = devisMap.get(r.devis_id);
        return {
          ...r,
          zones_metres: Array.isArray(r.zones_metres) ? r.zones_metres : [],
          photos: Array.isArray(r.photos) ? r.photos : [],
          notice_entretien: r.notice_entretien || DEFAULT_NOTICE,
          reserves: Array.isArray(r.reserves) ? r.reserves : [],
          checklist_repli: r.checklist_repli || DEFAULT_REPLI,
          chantiers: ch ? { nom: ch.nom, adresse_chantier: ch.adresse_chantier } : null,
          clients: cl ? { nom: cl.nom, email: cl.email, telephone: cl.tel || cl.telephone } : null,
          devis: d ? { numero: d.numero } : null,
        };
      });
      setPvs(enrichis);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    chargerDonnees();
    setFormDateReception(new Date().toISOString().slice(0, 10));
  }, [chargerDonnees]);

  // Ouverture automatique si ?chantierId= est dans l'URL
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
  async function ouvrirNouveauPV(preselectedChantierId?: string) {
    setFormId(null);
    const targetChantierId = preselectedChantierId || chantiers[0]?.id || "";
    const ch = chantiers.find((c) => c.id === targetChantierId);

    const zonesRecup = targetChantierId ? await chargerZonesPourChantier(targetChantierId) : [];

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
    setFormZonesMetres(zonesRecup);
    setFormPhotos([]);
    setFormNoticeEntretien(DEFAULT_NOTICE);
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
    setFormDateReception(
      pv.date_reception ? pv.date_reception.slice(0, 10) : new Date().toISOString().slice(0, 10)
    );
    setFormStatut(pv.statut);
    setFormTypeTravaux(pv.type_travaux || "Travaux de bardage et isolation extérieure (ITE)");
    setFormAdresseChantier(pv.adresse_chantier || "");
    setFormMateriauxUtilises(pv.materiaux_utilises || "");
    setFormObservations(pv.observations || "");
    setFormZonesMetres(pv.zones_metres || []);
    setFormPhotos(pv.photos || []);
    setFormNoticeEntretien(pv.notice_entretien || DEFAULT_NOTICE);
    setFormReserves(pv.reserves || []);
    setFormChecklistRepli(pv.checklist_repli || DEFAULT_REPLI);
    setFormSignClient(pv.signature_client);
    setFormSignClientNom(pv.signataire_client_nom || pv.clients?.nom || "");
    setFormSignEntreprise(pv.signature_entreprise);
    setFormSignEntrepriseNom(pv.signataire_entreprise_nom || "BNA BARDAGE");

    setModalFormOuvert(true);
  }

  // Changement de chantier dans le formulaire -> auto-complète les données et charge les zones
  async function handleChantierChange(chId: string) {
    setFormChantierId(chId);
    const ch = chantiers.find((c) => c.id === chId);
    if (ch) {
      setFormClientId(ch.client_id || "");
      if (!formAdresseChantier) setFormAdresseChantier(ch.adresse_chantier || "");
      if (!formSignClientNom && ch.clients?.nom) setFormSignClientNom(ch.clients.nom);
    }
    const zones = await chargerZonesPourChantier(chId);
    setFormZonesMetres(zones);
  }

  // Gestion des photos annexes (jusqu'à 4)
  function handlePhotoUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files || files.length === 0) return;
    const file = files[0];
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      if (formPhotos.length < 4) {
        setFormPhotos([
          ...formPhotos,
          {
            id: crypto.randomUUID(),
            url: dataUrl,
            titre: `Cliché fin de chantier #${formPhotos.length + 1}`,
          },
        ]);
      }
    };
    reader.readAsDataURL(file);
  }

  function supprimerPhoto(id: string) {
    setFormPhotos(formPhotos.filter((p) => p.id !== id));
  }

  function modifierTitrePhoto(id: string, titre: string) {
    setFormPhotos(formPhotos.map((p) => (p.id === id ? { ...p, titre } : p)));
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
            zones_metres: formZonesMetres,
            photos: formPhotos,
            notice_entretien: formNoticeEntretien,
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

        setModalFormOuvert(false);
        await chargerDonnees();

        // Ouvre automatiquement l'aperçu PDF du PV qu'on vient de modifier
        setPvs((pvsActuels) => {
          const pvMisAJour = pvsActuels.find((p) => p.id === formId);
          if (pvMisAJour) {
            setPvSelectionne(pvMisAJour);
            setModalPdfOuvert(true);
          }
          return pvsActuels;
        });

        setSauvegardeEnCours(false);
        return;
      } else {
        // Création
        const numero = await prochainNumero("pv_receptions", "PVR");
        const { data: nouveauPv, error } = await supabase.from("pv_receptions").insert({
          numero,
          chantier_id: formChantierId || null,
          client_id: formClientId || null,
          date_reception: formDateReception,
          statut: formStatut,
          type_travaux: formTypeTravaux,
          adresse_chantier: formAdresseChantier,
          materiaux_utilises: formMateriauxUtilises,
          zones_metres: formZonesMetres,
          photos: formPhotos,
          notice_entretien: formNoticeEntretien,
          reserves: formReserves,
          observations: formObservations,
          checklist_repli: formChecklistRepli,
          signature_client: formSignClient,
          signataire_client_nom: formSignClientNom,
          signature_entreprise: formSignEntreprise,
          signataire_entreprise_nom: formSignEntrepriseNom,
        }).select().single();

        if (error) throw error;

        setModalFormOuvert(false);
        await chargerDonnees();

        // Ouvre automatiquement l'aperçu PDF du PV qu'on vient de créer
        if (nouveauPv) {
          setPvs((pvsActuels) => {
            const pvCree = pvsActuels.find((p) => p.id === nouveauPv.id);
            if (pvCree) {
              setPvSelectionne(pvCree);
              setModalPdfOuvert(true);
            }
            return pvsActuels;
          });
        }
      }
    } catch (err: any) {
      if (
        err?.code === "42P01" ||
        err?.message?.includes("pv_receptions") ||
        err?.message?.includes("relation")
      ) {
        alert(
          "⚠️ La table 'pv_receptions' n'existe pas encore dans votre base Supabase.\n\nVeuillez exécuter le script SQL dans votre console Supabase (SQL Editor) pour activer l'enregistrement des PV."
        );
      } else {
        alert(`Erreur lors de l'enregistrement : ${err.message || err}`);
      }
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
    router.push(
      `/bureau/factures?type=solde&clientId=${pv.client_id || ""}&chantierId=${
        pv.chantier_id || ""
      }&pvNumero=${encodeURIComponent(pv.numero)}&objet=${encodeURIComponent(
        `Facture de solde (100% réceptionné - ${pv.numero}) - ${chNom}`
      )}`
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
          <p className="text-xs text-gray-400">
            Procès-verbaux de réception (Art. 1792-6), métrés détaillés, annexes photos, notices d&apos;entretien et garanties décennales.
          </p>
        </div>

        <button
          onClick={() => ouvrirNouveauPV()}
          className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-red-600/10 transition-all hover:bg-red-700"
        >
          <span>+</span> Nouveau PV de Réception
        </button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div className="rounded-2xl border border-white/10 bg-[#1A1D24] p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Total PV Émis</p>
          <p className="mt-0.5 text-2xl font-black text-white font-mono">{totalPV}</p>
          <p className="text-[11px] text-gray-500">Chantiers clôturés</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Sans Réserve</p>
          <p className="mt-0.5 text-2xl font-black text-gray-400 font-mono">{nbSansReserve}</p>
          <p className="text-[11px] text-gray-400/80">GPA &amp; Décennale actives</p>
        </div>

        <div className="rounded-2xl border border-white/10 bg-white/5 p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Avec Réserves</p>
          <p className="mt-0.5 text-2xl font-black text-gray-400 font-mono">{nbAvecReserves}</p>
          <p className="text-[11px] text-gray-400/80">En cours de levée</p>
        </div>

        <div className="rounded-2xl border border-sky-500/30 bg-sky-950/20 p-4 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-wider text-sky-400">Réserves Levées</p>
          <p className="mt-0.5 text-2xl font-black text-sky-300 font-mono">{nbReservesLevees}</p>
          <p className="text-[11px] text-sky-500/80">Solde déblocable</p>
        </div>
      </div>

      {/* Barre de Filtres & Recherche */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1.5">
          <button
            onClick={() => setFiltre("tous")}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              filtre === "tous"
                ? "bg-sky-500 text-slate-950 font-bold"
                : "border border-white/10 bg-[#1A1D24] text-gray-300 hover:bg-[#1A1D24]"
            }`}
          >
            Tous ({pvs.length})
          </button>
          <button
            onClick={() => setFiltre("sans_reserve")}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              filtre === "sans_reserve"
                ? "bg-red-600 text-slate-950 font-bold"
                : "border border-white/10 bg-[#1A1D24] text-gray-300 hover:bg-[#1A1D24]"
            }`}
          >
            Sans réserve ({nbSansReserve})
          </button>
          <button
            onClick={() => setFiltre("avec_reserves")}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              filtre === "avec_reserves"
                ? "bg-red-600 text-slate-950 font-bold"
                : "border border-white/10 bg-[#1A1D24] text-gray-300 hover:bg-[#1A1D24]"
            }`}
          >
            Avec réserves ({nbAvecReserves})
          </button>
          <button
            onClick={() => setFiltre("reserves_levees")}
            className={`rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors ${
              filtre === "reserves_levees"
                ? "bg-sky-400 text-slate-950 font-bold"
                : "border border-white/10 bg-[#1A1D24] text-gray-300 hover:bg-[#1A1D24]"
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
            className="w-full rounded-xl border border-white/10 bg-[#1A1D24] px-3.5 py-2 text-xs text-white placeholder-slate-500 focus:border-sky-500 focus:outline-none shadow-sm"
          />
        </div>
      </div>

      {/* Liste des PV en Cartes Mobiles */}
      {loading ? (
        <div className="rounded-2xl border border-white/10/60 bg-[#1A1D24]/40 p-12 text-center text-xs text-gray-400">
          Chargement des procès-verbaux…
        </div>
      ) : pvsFiltres.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#1A1D24]/30 p-12 text-center space-y-3">
          <p className="text-sm font-medium text-gray-400">Aucun procès-verbal de réception pour ce filtre.</p>
          <button
            onClick={() => ouvrirNouveauPV()}
            className="rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-slate-950 hover:bg-red-700"
          >
            + Rédiger un premier PV de réception
          </button>
        </div>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2">
          {pvsFiltres.map((pv) => {
            const nbRes = pv.reserves.length;
            const nbLevees = pv.reserves.filter((r) => r.levee).length;
            const surfaceTotale = (pv.zones_metres || []).reduce(
              (s, z) => s + (z.surfaceNette || 0),
              0
            );
            const nbPhotos = (pv.photos || []).length;

            return (
              <div
                key={pv.id}
                className="flex flex-col justify-between rounded-2xl border border-white/10 bg-[#1A1D24] p-4.5 shadow-md transition-all hover:border-sky-500/60 hover:bg-[#1A1D24]"
              >
                <div className="space-y-3">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-xs font-bold text-sky-400">{pv.numero}</span>
                        <span className="text-xs text-gray-500">· {new Date(pv.date_reception).toLocaleDateString("fr-FR")}</span>
                      </div>
                      <h2 className="text-base font-bold text-white mt-0.5">{pv.chantiers?.nom || "Chantier"}</h2>
                      <p className="text-xs text-gray-400">{pv.clients?.nom || "Client direct"}</p>
                    </div>

                    <span
                      className={`rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wider ${
                        pv.statut === "sans_reserve"
                          ? "bg-red-600/20 text-gray-400 border border-white/10"
                          : pv.statut === "reserves_levees"
                          ? "bg-sky-500/20 text-sky-400 border border-sky-500/30"
                          : pv.statut === "refuse"
                          ? "bg-red-900/200/20 text-red-400 border border-red-500/30"
                          : "bg-red-600/20 text-gray-400 border border-white/10"
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
                  </div>

                  <div className="grid grid-cols-3 gap-2 rounded-xl bg-transparent/60 p-2.5 border border-white/10/60 text-center">
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">Surface</p>
                      <p className="text-xs font-bold text-gray-200 mt-0.5">
                        {surfaceTotale > 0 ? `${surfaceTotale.toFixed(1)} m²` : "—"}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">Réserves</p>
                      <p className="text-xs font-bold text-gray-200 mt-0.5">
                        {nbRes === 0 ? "0" : `${nbLevees}/${nbRes}`}
                      </p>
                    </div>
                    <div>
                      <p className="text-[10px] uppercase tracking-wide text-gray-500">Photos</p>
                      <p className="text-xs font-bold text-gray-200 mt-0.5">
                        {nbPhotos > 0 ? `📷 ${nbPhotos}` : "0"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mt-3.5 flex flex-wrap items-center justify-between gap-2 border-t border-white/10/60 pt-3">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      onClick={() => {
                        setPvSelectionne(pv);
                        setModalPdfOuvert(true);
                      }}
                      className="rounded-xl border border-slate-600 bg-transparent px-3 py-1.5 text-xs font-semibold text-sky-400 hover:bg-[#1A1D24] flex items-center gap-1"
                    >
                      📄 PDF
                    </button>

                    <button
                      onClick={() => handleCreerFactureSolde(pv)}
                      className="rounded-xl border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-gray-400 hover:bg-[#1A1D24]/40 flex items-center gap-1"
                    >
                      🧾 Solde
                    </button>

                    {nbRes > 0 && (
                      <button
                        onClick={() => {
                          setPvSelectionne(pv);
                          setModalReservesOuvert(true);
                        }}
                        className="rounded-xl border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs font-semibold text-gray-400 hover:bg-[#1A1D24]/40"
                      >
                        🔧 Réserves
                      </button>
                    )}
                  </div>

                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => ouvrirEditionPV(pv)}
                      className="rounded-xl border border-white/10 bg-transparent p-1.5 text-xs text-gray-300 hover:bg-[#1A1D24]"
                      title="Modifier le PV"
                    >
                      ✏️
                    </button>

                    <button
                      onClick={() => handleSupprimerPV(pv.id, pv.numero)}
                      className="text-xs text-gray-500 hover:text-red-400 p-1.5 transition-colors"
                      title="Supprimer le PV"
                    >
                      🗑️
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* FAB (+) */}
      <button
        onClick={() => ouvrirNouveauPV()}
        aria-label="Créer un PV de réception"
        className="fixed bottom-20 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-slate-950 shadow-2xl shadow-red-600/10 transition-transform active:scale-95 hover:scale-105 hover:bg-red-700"
      >
        <span className="text-2xl font-bold leading-none">+</span>
      </button>

      {/* ============================================================ */}
      {/* MODAL : CRÉATION & ÉDITION D'UN PV DE RÉCEPTION ENRICHI */}
      {/* ============================================================ */}
      {modalFormOuvert && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-4xl rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[#1A1D24] p-6 shadow-2xl space-y-5 max-h-[85vh] sm:max-h-[90dvh] overflow-y-auto animate-in fade-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h2 className="text-base font-bold text-white">
                  {formId ? "Modifier le Procès-Verbal de Réception" : "Nouveau Procès-Verbal de Réception de Chantier"}
                </h2>
                <p className="text-xs text-gray-400">
                  Article 1792-6 du Code Civil · Surfaces, Réserves, Notice d&apos;Entretien &amp; Annexes Photos
                </p>
              </div>
              <button
                onClick={() => setModalFormOuvert(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1A1D24] hover:text-white"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSauvegarderPV} className="space-y-5 pb-20 sm:pb-6">
              {/* SECTION 1 : CHANTIER & CLIENT */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-gray-300">Chantier concerné *</label>
                  <select
                    value={formChantierId}
                    onChange={(e) => handleChantierChange(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-transparent px-3 py-2 text-xs text-white"
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
                  <label className="text-xs font-semibold text-gray-300">Date de réception *</label>
                  <input
                    type="date"
                    value={formDateReception}
                    onChange={(e) => setFormDateReception(e.target.value)}
                    required
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-transparent px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              {/* SECTION 2 : ADRESSE & MATÉRIAUX */}
              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                <div>
                  <label className="text-xs font-semibold text-gray-300">Adresse d&apos;exécution du chantier</label>
                  <input
                    type="text"
                    value={formAdresseChantier}
                    onChange={(e) => setFormAdresseChantier(e.target.value)}
                    placeholder="Ex. 12 rue des Pins, 33000 Bordeaux"
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-transparent px-3 py-2 text-xs text-white"
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-gray-300">Matériaux &amp; Systèmes posés</label>
                  <input
                    type="text"
                    value={formMateriauxUtilises}
                    onChange={(e) => setFormMateriauxUtilises(e.target.value)}
                    placeholder="Ex. Panneaux Trespa HPL 8mm / Équerres Isolco 140mm / Laine de roche 120mm"
                    className="mt-1 w-full rounded-lg border border-slate-600 bg-transparent px-3 py-2 text-xs text-white"
                  />
                </div>
              </div>

              {/* SECTION 3 : PRONONCIATION DE LA RÉCEPTION */}
              <div className="rounded-xl border border-white/10 bg-transparent/60 p-3.5 space-y-2">
                <label className="text-xs font-bold uppercase tracking-wide text-gray-300">
                  Type de Réception prononcée
                </label>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                  <button
                    type="button"
                    onClick={() => setFormStatut("sans_reserve")}
                    className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
                      formStatut === "sans_reserve"
                        ? "border-white/10 bg-white/5 text-gray-400"
                        : "border-white/10 bg-transparent text-gray-400"
                    }`}
                  >
                    <p className="font-bold">✓ Sans Réserve</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Ouvrage 100% conforme</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormStatut("avec_reserves")}
                    className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
                      formStatut === "avec_reserves"
                        ? "border-white/10 bg-white/5 text-gray-400"
                        : "border-white/10 bg-transparent text-gray-400"
                    }`}
                  >
                    <p className="font-bold">⚠️ Avec Réserves</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Retouches consignées</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setFormStatut("reserves_levees")}
                    className={`rounded-lg border p-2.5 text-left text-xs transition-colors ${
                      formStatut === "reserves_levees"
                        ? "border-sky-500 bg-sky-950/40 text-sky-300"
                        : "border-white/10 bg-transparent text-gray-400"
                    }`}
                  >
                    <p className="font-bold">✓ Réserves Levées</p>
                    <p className="text-[10px] text-gray-400 mt-0.5">Travaux repris et validés</p>
                  </button>
                </div>
              </div>

              {/* SECTION 4 : TABLEAU DES SURFACES & MÉTRÉS EXÉCUTÉS */}
              <div className="rounded-xl border border-white/10 bg-transparent/60 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-300 flex items-center gap-1.5">
                      <span>📐</span> Métrés &amp; Surfaces Posées ({formZonesMetres.length} zone(s))
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Surfaces nettes exécutées et réceptionnées sur ce chantier
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      const nouvelleZone: ZoneMetre = {
                        id: crypto.randomUUID(),
                        nom: `Zone #${formZonesMetres.length + 1}`,
                        type: "facade",
                        largeur: 10,
                        hauteur_mur: 3,
                        surfaceBrute: 30,
                        surfaceOuvertures: 0,
                        surfaceNette: 30,
                        materiau: formMateriauxUtilises || "Bardage rapporté",
                      };
                      setFormZonesMetres([...formZonesMetres, nouvelleZone]);
                    }}
                    className="rounded bg-[#1A1D24] px-2.5 py-1 text-xs text-gray-200 hover:bg-[#1A1D24]"
                  >
                    + Ajouter une zone
                  </button>
                </div>

                {formZonesMetres.length === 0 ? (
                  <p className="text-xs text-gray-500 italic">
                    Aucune zone trouvée pour ce chantier. Cliquez sur « + Ajouter une zone » pour saisir les métrés.
                  </p>
                ) : (
                  <div className="overflow-x-auto rounded-lg border border-white/10 bg-transparent">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="border-b border-white/10 text-gray-400 font-semibold uppercase text-[10px]">
                          <th className="p-2">Zone</th>
                          <th className="p-2">Type</th>
                          <th className="p-2">Largeur (m)</th>
                          <th className="p-2">Hauteur (m)</th>
                          <th className="p-2 text-right">Net Posé</th>
                          <th className="p-2 text-right">Action</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-800 text-gray-200">
                        {formZonesMetres.map((z, idx) => (
                          <tr key={z.id || idx}>
                            <td className="p-2">
                              <input
                                type="text"
                                value={z.nom}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setFormZonesMetres(
                                    formZonesMetres.map((item, i) =>
                                      i === idx ? { ...item, nom: val } : item
                                    )
                                  );
                                }}
                                className="w-full rounded border border-white/10 bg-[#1A1D24] px-2 py-1 text-xs text-white"
                              />
                            </td>
                            <td className="p-2 capitalize text-gray-400">{z.type}</td>
                            <td className="p-2">
                              <input
                                type="number"
                                step="0.1"
                                value={z.largeur}
                                onChange={(e) => {
                                  const l = Number(e.target.value) || 0;
                                  const net = Math.max(0, l * z.hauteur_mur - (z.surfaceOuvertures || 0));
                                  setFormZonesMetres(
                                    formZonesMetres.map((item, i) =>
                                      i === idx
                                        ? { ...item, largeur: l, surfaceBrute: l * z.hauteur_mur, surfaceNette: net }
                                        : item
                                    )
                                  );
                                }}
                                className="w-16 rounded border border-white/10 bg-[#1A1D24] px-2 py-1 text-xs text-white"
                              />
                            </td>
                            <td className="p-2">
                              <input
                                type="number"
                                step="0.1"
                                value={z.hauteur_mur}
                                onChange={(e) => {
                                  const h = Number(e.target.value) || 0;
                                  const net = Math.max(0, z.largeur * h - (z.surfaceOuvertures || 0));
                                  setFormZonesMetres(
                                    formZonesMetres.map((item, i) =>
                                      i === idx
                                        ? { ...item, hauteur_mur: h, surfaceBrute: z.largeur * h, surfaceNette: net }
                                        : item
                                    )
                                  );
                                }}
                                className="w-16 rounded border border-white/10 bg-[#1A1D24] px-2 py-1 text-xs text-white"
                              />
                            </td>
                            <td className="p-2 text-right font-bold text-gray-400">
                              {z.surfaceNette.toFixed(2)} m²
                            </td>
                            <td className="p-2 text-right">
                              <button
                                type="button"
                                onClick={() =>
                                  setFormZonesMetres(formZonesMetres.filter((_, i) => i !== idx))
                                }
                                className="text-red-400 hover:text-red-300"
                              >
                                ✕
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* SECTION 5 : TABLEAU COMPLET DES RÉSERVES */}
              {(formStatut === "avec_reserves" || formReserves.length > 0) && (
                <div className="space-y-3 rounded-xl border border-white/10 bg-white/5 p-3.5">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs font-bold text-gray-400 uppercase tracking-wide flex items-center gap-1.5">
                        <span>📝</span> Tableau des Réserves Constatées ({formReserves.length})
                      </p>
                      <p className="text-[11px] text-gray-400">
                        Désignation, emplacement précis et date limite convenue de levée
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={ajouterReserve}
                      className="rounded bg-red-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-red-600"
                    >
                      + Ajouter une réserve
                    </button>
                  </div>

                  {formReserves.length === 0 ? (
                    <p className="text-xs text-gray-400 italic">
                      Aucune réserve ajoutée. Cliquez sur « + Ajouter une réserve » pour consigner une retouche.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {formReserves.map((r, index) => (
                        <div
                          key={r.id}
                          className="grid grid-cols-1 gap-2 rounded-lg border border-white/10 bg-transparent p-2.5 sm:grid-cols-12 items-center"
                        >
                          <div className="sm:col-span-5">
                            <input
                              type="text"
                              value={r.designation}
                              onChange={(e) => updateReserve(r.id, { designation: e.target.value })}
                              placeholder={`Réserve #${index + 1} (ex: Retouche joint d'angle)`}
                              required
                              className="w-full rounded border border-white/10 bg-[#1A1D24] px-2 py-1 text-xs text-white"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <input
                              type="text"
                              value={r.localisation}
                              onChange={(e) => updateReserve(r.id, { localisation: e.target.value })}
                              placeholder="Emplacement (ex: Façade Sud - Angle haut)"
                              className="w-full rounded border border-white/10 bg-[#1A1D24] px-2 py-1 text-xs text-white"
                            />
                          </div>
                          <div className="sm:col-span-3">
                            <input
                              type="date"
                              value={r.date_limite}
                              onChange={(e) => updateReserve(r.id, { date_limite: e.target.value })}
                              className="w-full rounded border border-white/10 bg-[#1A1D24] px-2 py-1 text-xs text-white"
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

              {/* SECTION 6 : NOTICE, FICHES TECHNIQUES & ENTRETIEN */}
              <div className="rounded-xl border border-white/10 bg-transparent/60 p-3.5 space-y-3">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-300 flex items-center gap-1.5">
                  <span>📚</span> Notice, Fiches Techniques &amp; Entretien
                </p>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                  <label className="flex items-center gap-2 text-gray-300 bg-[#1A1D24]/80 p-2.5 rounded-lg border border-white/10 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formNoticeEntretien.remise_fiches_techniques}
                      onChange={(e) =>
                        setFormNoticeEntretien({
                          ...formNoticeEntretien,
                          remise_fiches_techniques: e.target.checked,
                        })
                      }
                    />
                    <span>Fiches techniques fabricants remises</span>
                  </label>

                  <label className="flex items-center gap-2 text-gray-300 bg-[#1A1D24]/80 p-2.5 rounded-lg border border-white/10 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formNoticeEntretien.remise_guide_entretien}
                      onChange={(e) =>
                        setFormNoticeEntretien({
                          ...formNoticeEntretien,
                          remise_guide_entretien: e.target.checked,
                        })
                      }
                    />
                    <span>Guide d&apos;entretien remis</span>
                  </label>

                  <label className="flex items-center gap-2 text-gray-300 bg-[#1A1D24]/80 p-2.5 rounded-lg border border-white/10 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={formNoticeEntretien.remise_attestation_decennale}
                      onChange={(e) =>
                        setFormNoticeEntretien({
                          ...formNoticeEntretien,
                          remise_attestation_decennale: e.target.checked,
                        })
                      }
                    />
                    <span>Attestation décennale remise</span>
                  </label>
                </div>
              </div>

              {/* SECTION 7 : ANNEXES PHOTOS (2 À 4 CLICHÉS) */}
              <div className="rounded-xl border border-white/10 bg-transparent/60 p-3.5 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs font-bold uppercase tracking-wide text-gray-300 flex items-center gap-1.5">
                      <span>📷</span> Annexes Photographiques ({formPhotos.length}/4 clichés)
                    </p>
                    <p className="text-[11px] text-gray-400">
                      Photos contradictoires de l&apos;ouvrage achevé pour l&apos;annexe au PV
                    </p>
                  </div>

                  {formPhotos.length < 4 && (
                    <div>
                      <input
                        type="file"
                        accept="image/*"
                        ref={fileInputRef}
                        onChange={handlePhotoUpload}
                        className="hidden"
                      />
                      <button
                        type="button"
                        onClick={() => fileInputRef.current?.click()}
                        className="flex items-center gap-1.5 rounded-lg bg-sky-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-500"
                      >
                        <span>📷</span> + Ajouter une photo
                      </button>
                    </div>
                  )}
                </div>

                {formPhotos.length === 0 ? (
                  <div className="rounded-lg border border-dashed border-white/10 p-4 text-center text-xs text-gray-500">
                    Aucune photo ajoutée. Vous pouvez joindre 2 à 4 photos de l&apos;ouvrage fini (façades, angles, finitions).
                  </div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {formPhotos.map((p, idx) => (
                      <div
                        key={p.id || idx}
                        className="relative rounded-lg border border-white/10 bg-[#1A1D24] p-2 space-y-1.5"
                      >
                        <div className="aspect-[4/3] w-full overflow-hidden rounded bg-transparent">
                          <img src={p.url} alt="Aperçu" className="h-full w-full object-cover" />
                        </div>
                        <input
                          type="text"
                          value={p.titre || ""}
                          onChange={(e) => modifierTitrePhoto(p.id, e.target.value)}
                          placeholder="Légende photo"
                          className="w-full rounded border border-white/10 bg-transparent px-1.5 py-1 text-[11px] text-white"
                        />
                        <button
                          type="button"
                          onClick={() => supprimerPhoto(p.id)}
                          className="absolute -top-1.5 -right-1.5 rounded-full bg-red-600 p-1 text-white shadow hover:bg-red-900/200 text-[10px]"
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* SECTION 8 : CHECKLIST REPLI DE CHANTIER */}
              <div className="rounded-xl border border-white/10 bg-transparent/60 p-3.5 space-y-2">
                <p className="text-xs font-bold uppercase tracking-wide text-gray-300">
                  🧹 Checklist Propreté &amp; Repli du Chantier
                </p>
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 text-xs">
                  <label className="flex items-center gap-2 text-gray-300">
                    <input
                      type="checkbox"
                      checked={formChecklistRepli.nettoyage}
                      onChange={(e) =>
                        setFormChecklistRepli({ ...formChecklistRepli, nettoyage: e.target.checked })
                      }
                    />
                    Nettoyage du site
                  </label>
                  <label className="flex items-center gap-2 text-gray-300">
                    <input
                      type="checkbox"
                      checked={formChecklistRepli.dechets_evacues}
                      onChange={(e) =>
                        setFormChecklistRepli({ ...formChecklistRepli, dechets_evacues: e.target.checked })
                      }
                    />
                    Déchets évacués
                  </label>
                  <label className="flex items-center gap-2 text-gray-300">
                    <input
                      type="checkbox"
                      checked={formChecklistRepli.echafaudage_demonte}
                      onChange={(e) =>
                        setFormChecklistRepli({ ...formChecklistRepli, echafaudage_demonte: e.target.checked })
                      }
                    />
                    Échafaudage démonté
                  </label>
                  <label className="flex items-center gap-2 text-gray-300">
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

              {/* SECTION 9 : OBSERVATIONS */}
              <div>
                <label className="text-xs font-semibold text-gray-300">Observations Particulières</label>
                <textarea
                  value={formObservations}
                  onChange={(e) => setFormObservations(e.target.value)}
                  rows={2}
                  placeholder="Observations éventuelles sur le déroulement ou les accès..."
                  className="mt-1 w-full rounded-lg border border-slate-600 bg-transparent p-2.5 text-xs text-white"
                />
              </div>

              {/* SECTION 10 : SIGNATURES TACTILES */}
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 pt-2 border-t border-white/10">
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
                    className="w-full rounded border border-white/10 bg-transparent px-2 py-1.5 text-xs text-white"
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
                    className="w-full rounded border border-white/10 bg-transparent px-2 py-1.5 text-xs text-white"
                  />
                </div>
              </div>

              {/* BOUTONS D'ACTION */}
              <div className="sticky bottom-0 z-10 -mx-6 -mb-6 bg-[#1A1D24] px-6 py-3 border-t border-white/10 flex items-center justify-end gap-3 shadow-lg">
                <button
                  type="button"
                  onClick={() => setModalFormOuvert(false)}
                  className="rounded-xl border border-slate-600 bg-[#1A1D24] px-4 py-2.5 text-xs font-semibold text-gray-300 hover:bg-[#1A1D24]"
                >
                  Annuler
                </button>

                <button
                  type="submit"
                  disabled={sauvegardeEnCours}
                  className="rounded-xl bg-red-600 px-5 py-2.5 text-xs font-bold text-slate-950 hover:bg-red-700 disabled:opacity-50 shadow-md"
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
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-0 sm:p-4 backdrop-blur-sm">
          <div className="relative w-full max-w-xl rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[#1A1D24] p-6 pb-20 sm:pb-6 shadow-2xl space-y-4 max-h-[85vh] sm:max-h-[90dvh] overflow-y-auto animate-in fade-in">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div>
                <h3 className="text-base font-bold text-white">
                  Gestion des Réserves · {pvSelectionne.numero}
                </h3>
                <p className="text-xs text-gray-400">
                  {pvSelectionne.chantiers?.nom} ({pvSelectionne.clients?.nom})
                </p>
              </div>
              <button
                onClick={() => setModalReservesOuvert(false)}
                className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1A1D24] hover:text-white"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-gray-300">
              Cochez les réserves effectuées pour constater leur levée. Dès que toutes les réserves sont levées, le statut passe automatiquement à <strong className="text-sky-400">« Réserves Levées »</strong>.
            </p>

            <div className="space-y-2.5 max-h-72 overflow-y-auto">
              {pvSelectionne.reserves.map((r, idx) => (
                <div
                  key={r.id || idx}
                  onClick={() => toggleLeverReserve(pvSelectionne, r.id)}
                  className={`flex items-center justify-between rounded-xl border p-3 cursor-pointer transition-colors ${
                    r.levee
                      ? "border-white/10 bg-white/5 text-gray-400"
                      : "border-white/10 bg-transparent/60 text-gray-200 hover:border-white/10"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <input
                      type="checkbox"
                      checked={r.levee}
                      onChange={() => {}}
                      className="h-4 w-4 rounded border-slate-600 bg-[#1A1D24] text-red-400"
                    />
                    <div>
                      <p className={`text-xs font-semibold ${r.levee ? "line-through text-gray-400" : "text-white"}`}>
                        {r.designation}
                      </p>
                      <p className="text-[11px] text-gray-500">
                        {r.localisation} · Échéance : {r.date_limite ? new Date(r.date_limite).toLocaleDateString("fr-FR") : "—"}
                      </p>
                    </div>
                  </div>

                  <span className="text-[11px] font-semibold">
                    {r.levee ? (
                      <span className="text-gray-400">
                        ✓ Levée {r.date_levee ? `(${new Date(r.date_levee).toLocaleDateString("fr-FR")})` : ""}
                      </span>
                    ) : (
                      <span className="text-gray-400">À lever</span>
                    )}
                  </span>
                </div>
              ))}
            </div>

            <div className="sticky bottom-0 z-10 -mx-6 -mb-6 bg-[#1A1D24] px-6 py-3 border-t border-white/10 flex items-center justify-between shadow-lg">
              <button
                onClick={() => handleCreerFactureSolde(pvSelectionne)}
                className="text-xs font-semibold text-gray-400 hover:text-gray-400"
              >
                🧾 Facture de Solde →
              </button>

              <button
                onClick={() => setModalReservesOuvert(false)}
                className="rounded-xl border border-slate-600 bg-[#1A1D24] px-4 py-2 text-xs font-semibold text-gray-300 hover:bg-[#1A1D24]"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ============================================================ */}
      {/* MODAL : APERÇU ET IMPRESSION DU PV ENRICHI EN PDF */}
      {/* ============================================================ */}
      {modalPdfOuvert && pvSelectionne && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-0 sm:p-4 overflow-y-auto">
          <div className="relative w-full max-w-4xl rounded-2xl border border-white/10 bg-[#1A1D24] p-6 shadow-2xl space-y-4 my-auto max-h-[85vh] sm:max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3 print:hidden">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold text-white">
                  Procès-Verbal Officiel {pvSelectionne.numero}
                </h3>
                <span
                  className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${
                    pvSelectionne.statut === "sans_reserve"
                      ? "bg-red-600/20 text-gray-400"
                      : pvSelectionne.statut === "reserves_levees"
                      ? "bg-sky-500/20 text-sky-400"
                      : "bg-red-600/20 text-gray-400"
                  }`}
                >
                  {pvSelectionne.statut}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() => window.print()}
                  className="flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-slate-950 shadow-lg shadow-red-600/10 hover:bg-red-700 transition-all"
                >
                  <span>🖨️</span> Imprimer / Exporter PDF
                </button>
                <button
                  onClick={() => setModalPdfOuvert(false)}
                  className="rounded-lg p-1.5 text-gray-400 hover:bg-[#1A1D24] hover:text-white"
                >
                  ✕
                </button>
              </div>
            </div>

            {/* Document PDF rendu */}
            <div className="rounded-xl border border-white/10 bg-[#1A1D24] p-2 shadow-2xl print:border-none print:p-0">
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

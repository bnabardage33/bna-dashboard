"use client";

interface SpeechRecognitionLike {
  lang: string;
  start: () => void;
  onresult: ((event: { results: Array<{ [key: number]: { transcript: string } }> }) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

import { Suspense, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { calculerAidesITE, ProfilRevenu } from "@/lib/primesCalcul";
import { useSearchParams } from "next/navigation";
import { supabase } from "@/lib/supabase";
import {
  chantierIdDepuisRecherche,
  planPreselectionDevis,
} from "@/lib/devisPreselection";
import { calculerDevis, CoutType } from "@/lib/devisCalcul";
import {
  MATERIAU_STRUCTUREL_DEFAUT,
  MOYEN_ACCES_DEFAUT,
  ZONE_VENT_DEFAUT,
} from "@/lib/chantierDefaults";
import DocumentPDF, { DocumentData } from "@/components/DocumentPDF";
import { prochainNumero } from "@/lib/documents";
import { calculerBesoinsBardage } from "@/lib/poseCalcul";
import SignaturePad from "@/components/SignaturePad";
import { PenTool, Sparkles, Loader2 } from "lucide-react";

type CatalogueOuvrage = {
  id: string;
  famille_label: string;
  designation: string;
  description: string;
  designation_devis?: string;
  code_ral?: string;
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

type Ligne = {
  designation: string;
  description?: string;
  qte: number | null;
  unite: string;
  pu_ht: number | null;
  catalogue_id: string | null;
  pu_revient?: number | null;
  type_cout?: CoutType | null;
  a_chiffrer: boolean;
  justification?: string;
  confiance?: number;
  zone_id?: string | null;
};

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
  chantier_id: string | null;
  surface_m2?: number | null;
  total_ht?: number | null;
  cout_matiere_ht?: number | null;
  cout_main_oeuvre_ht?: number | null;
  marge_ht?: number | null;
  marge_pct?: number | null;
  profil_revenu?: ProfilRevenu | null;
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

const LIGNE_VIDE: Ligne = {
  designation: "",
  description: "",
  qte: null,
  unite: "forfait",
  pu_ht: null,
  catalogue_id: null,
  pu_revient: null,
  type_cout: null,
  a_chiffrer: false,
};

function DevisContenu() {
  const searchParams = useSearchParams();
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

  const [toast, setToast] = useState<string | null>(null);
  const toastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function afficherToast(message: string) {
    setToast(message);
    if (toastTimerRef.current) clearTimeout(toastTimerRef.current);
    toastTimerRef.current = setTimeout(() => setToast(null), 4000);
  }

  const [clientId, setClientId] = useState("");
  const [chantierId, setChantierId] = useState("");
  const [chantiersClient, setChantiersClient] = useState<{id: string; nom: string | null; code_acces: string | null; adresse_chantier: string | null; surface_m2?: number | null}[]>([]);
  const [objet, setObjet] = useState("");
  const [adresseChantier, setAdresseChantier] = useState("");
  const [typeTravaux, setTypeTravaux] = useState("");
  const [validite, setValidite] = useState(90);
  const [delai, setDelai] = useState(15);
  const [acompte, setAcompte] = useState(30);
  const [tva, setTva] = useState(10);
  const [lignes, setLignes] = useState<Ligne[]>([{ ...LIGNE_VIDE }]);
  const [profilRevenu, setProfilRevenu] = useState<ProfilRevenu>("aucun");
  const [promptIA, setPromptIA] = useState("");
  const [surfacePonctuelle, setSurfacePonctuelle] = useState("");
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
    else setDevis(devisRes.data as unknown as Devis[]);
    if (clientsRes.data) setClients(clientsRes.data as Client[]);
    if (catRes && catRes.data) setCatalogue(catRes.data as CatalogueOuvrage[]);
    if (settingsRes.data) setEntreprise(settingsRes.data as Entreprise);
    setLoading(false);
  }

  useEffect(() => {
    fetchTout();
  }, []);

  useEffect(() => {
    if (modalOuvert) {
      const prev = document.body.style.overflow;
      document.body.style.overflow = "hidden";
      return () => {
        document.body.style.overflow = prev;
      };
    }
  }, [modalOuvert]);

  // ── Présélection « Générer un devis » (arrivée avec ?chantier_id=…) ──
  // Exécuté UNE fois au montage. Ne déclenche aucun calcul de quantités :
  // récupère uniquement le client du chantier, charge ses chantiers et ouvre
  // la modale. Sans chantier_id → aucun effet (comportement actuel) ;
  // ID inexistant/sans client → aucune sélection forcée.
  const preselectionEffectuee = useRef(false);
  const clientIdCourant = useRef("");
  const chantierIdCourant = useRef("");
  useEffect(() => {
    clientIdCourant.current = clientId;
  }, [clientId]);
  useEffect(() => {
    chantierIdCourant.current = chantierId;
  }, [chantierId]);

  useEffect(() => {
    if (preselectionEffectuee.current) return;
    const chantierIdDemande = chantierIdDepuisRecherche(searchParams);
    if (!chantierIdDemande) return;

    let annule = false;
    (async () => {
      const { data: chantier, error } = await supabase
        .from("chantiers")
        .select("id, client_id, nom, code_acces, adresse_chantier, surface_m2")
        .eq("id", chantierIdDemande)
        .maybeSingle();

      if (annule || error || !chantier) return;

      const plan = planPreselectionDevis(
        chantierIdDemande,
        !!(clientIdCourant.current || chantierIdCourant.current),
        chantier,
      );
      if (!plan) return;

      preselectionEffectuee.current = true;
      setClientId(plan.clientId);

      const { data: chantiersDuClient } = await supabase
        .from("chantiers")
        .select("id, nom, code_acces, adresse_chantier, surface_m2")
        .eq("client_id", plan.clientId)
        .order("created_at", { ascending: false });

      if (annule) return;
      if (chantiersDuClient) {
        setChantiersClient(chantiersDuClient as { id: string; nom: string | null; code_acces: string | null; adresse_chantier: string | null; surface_m2?: number | null }[]);
      }
      setChantierId(plan.chantierId);
      if (plan.ouvrirModale) setModalOuvert(true);
    })();

    return () => {
      annule = true;
    };
  }, []);



  function ajouterLigne() {
    setLignes((l) => [...l, { ...LIGNE_VIDE }]);
  }

  function insererDepuisCatalogue(ouvrageId: string) {
    if (!ouvrageId) return;
    const ouv = catalogue.find((o) => o.id === ouvrageId);
    if (!ouv) return;
    setLignes((prev) => {
      return [
        ...prev.filter(
          (l) =>
            l.a_chiffrer ||
            l.designation.trim() ||
            (typeof l.qte === "number" && l.qte > 0) ||
            (typeof l.pu_ht === "number" && l.pu_ht > 0)
        ),
        {
          catalogue_id: ouv.id,
          designation: ouv.designation,
          description: [ouv.designation_devis || ouv.description, ouv.code_ral ? `- Finition : ${ouv.code_ral}` : null].filter(Boolean).join(" \n"),
          qte: (() => {
            let surf = parseFloat(surfacePonctuelle.replace(",", "."));
            if (isNaN(surf) || surf <= 0) {
              const terrain = chantiersClient.find(c => c.id === chantierId);
              if (terrain && typeof terrain.surface_m2 === "number" && terrain.surface_m2 > 0) {
                surf = terrain.surface_m2;
              }
            }
            if (surf && surf > 0) {
              const besoins = calculerBesoinsBardage(surf);
              const lowerDesig = (ouv.designation || "").toLowerCase();
              if (lowerDesig.includes("chevron") || ouv.famille_label === "Ossature") {
                if (ouv.unite === "ml") return besoins.mlChevrons;
                if (ouv.unite === "m²") return surf;
              }
              if (lowerDesig.includes("équerre") || lowerDesig.includes("equerre")) return besoins.nbEquerres;
              if (lowerDesig.includes("cheville")) return besoins.nbChevilles;
              if (lowerDesig.includes("vis") && (lowerDesig.includes("auto-foreuse") || lowerDesig.includes("autoforeuse") || lowerDesig.includes("ossature"))) return besoins.nbVisAutoForeuses;
              if (ouv.unite === "m²" || ouv.unite === "m2") return surf;
            }
            return 1;
          })(),
          unite: ouv.unite,
          pu_ht: ouv.pu_ht,
          a_chiffrer: false,
        },
      ];
    });
  }

  async function creerDevisViergeIA(): Promise<string | null> {
    const numero = await prochainNumero("devis", "DEV");
    const ponctuelle = parseFloat(surfacePonctuelle.replace(",", "."));
    const lignesNettoyees = lignes.filter(
      (l) =>
        l.a_chiffrer ||
        l.designation.trim() ||
        (typeof l.qte === "number" && l.qte > 0) ||
        (typeof l.pu_ht === "number" && l.pu_ht > 0)
    );
    const res = await fetch("/api/devis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
      profil_revenu: profilRevenu,
        surface_m2: Number.isFinite(ponctuelle) && ponctuelle > 0 ? ponctuelle : null,
        lignes: lignesNettoyees,
      }),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || data?.error) {
      alert("Erreur lors de la création du devis (IA) : " + (data?.error || "réponse inattendue."));
      return null;
    }
    const id = data && typeof data.id === "string" ? data.id : null;
    if (!id) {
      alert("Le devis a été créé mais son identifiant est illisible. Réessayez.");
      return null;
    }
    return id;
  }

  async function genererLigneIA() {
    if (!promptIA.trim()) return;
    setGenererIAEnCours(true);
    try {
      const ponctuelle = parseFloat(surfacePonctuelle.replace(",", "."));
      const res = await fetch(`/api/ia-devis`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          prompt: promptIA,
          chantier_id: chantierId && chantiersClient.length > 0 ? chantierId : undefined,
          surface_m2: Number.isFinite(ponctuelle) && ponctuelle > 0 ? ponctuelle : undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok || data.error) {
        throw new Error(data.error || "Erreur IA");
      }
      setLignes((prev) => {
        const nettes = prev.filter(
          (l) =>
            l.a_chiffrer ||
            l.designation.trim() ||
            (typeof l.qte === "number" && l.qte > 0) ||
            (typeof l.pu_ht === "number" && l.pu_ht > 0)
        );

        let newLignes: Record<string, unknown>[] = [];
        if (Array.isArray(data)) {
          newLignes = data;
        } else if (data && Array.isArray(data.lignes)) {
          newLignes = data.lignes;
        }

        if (newLignes.length === 0) {
          alert("L'IA n'a pas renvoyé de données valides. Réessayez.");
          return prev;
        }

        return [
          ...nettes,
          ...newLignes.map((l: Record<string, unknown>): Ligne => ({
            catalogue_id: typeof l.catalogue_id === "string" && l.catalogue_id ? l.catalogue_id : null,
            designation: (l.designation as string) || "À CHIFFRER",
            description: (l.description as string) || "",
            qte: typeof l.qte === "number" && (l.qte as number) > 0 ? (l.qte as number) : null,
            unite: (l.unite as string) || "forfait",
            pu_ht: typeof l.pu_ht === "number" && (l.pu_ht as number) > 0 ? (l.pu_ht as number) : null,
            a_chiffrer: !!l.a_chiffrer,
            justification: typeof l.justification === "string" && l.justification ? (l.justification as string) : undefined,
            confiance: typeof l.confiance === "number" ? (l.confiance as number) : undefined,
            zone_id: typeof l.zone_id === "string" && l.zone_id ? (l.zone_id as string) : null,
          })),
        ];
      });
      setPromptIA("");
      if (typeof data.nb_a_chiffrer === "number" && data.nb_a_chiffrer > 0) {
        afficherToast(`⚠️ ${data.nb_a_chiffrer} ligne(s) « À CHIFFRER » — hors catalogue ou quantité manquante.`);
      } else {
        afficherToast("✓ Lignes générées depuis le catalogue.");
      }
    } catch (err) {
      alert("Erreur génération IA : " + (err as Error).message);
    } finally {
      setGenererIAEnCours(false);
    }
  }

  function updateLigne(i: number, patch: Partial<Ligne>) {
    setLignes((l) =>
      l.map((ligne, idx) => {
        if (idx !== i) return ligne;
        // Le patron complète une ligne « À CHIFFRER » : elle est alors prise en charge
        // (catalogue ou saisie manuelle selon ce qu'il saisit).
        if (ligne.a_chiffrer) {
          return { ...ligne, ...patch, a_chiffrer: false };
        }
        const touchesPrixOuDesign =
          "designation" in patch || "pu_ht" in patch || "unite" in patch;
        if (touchesPrixOuDesign && ligne.catalogue_id) {
          // Ligne issue du catalogue dont le patron modifie prix / désignation / unité :
          // elle devient manuelle (le prix du catalogue reste la vérité côté IA & route).
          return { ...ligne, ...patch, catalogue_id: null, pu_revient: null, type_cout: null };
        }
        return { ...ligne, ...patch };
      })
    );
  }

  function supprimerLigne(i: number) {
    setLignes((l) => l.filter((_, idx) => idx !== i));
  }

  const apercuCalculs = calculerDevis(lignes);
  const totalHT = apercuCalculs.total_ht;

  async function creerDevis(e: React.FormEvent) {
    e.preventDefault();
    if (!clientId) return;

    const numero = await prochainNumero("devis", "DEV");

    // Ligne vierge jamais alimentée → écartée. Les lignes « À CHIFFRER » sont conservées
    // (le patron doit les compléter ensuite) mais n'entrent jamais dans les totaux.
    const lignesNettoyees = lignes.filter(
      (l) =>
        l.a_chiffrer ||
        l.designation.trim() ||
        (typeof l.qte === "number" && l.qte > 0) ||
        (typeof l.pu_ht === "number" && l.pu_ht > 0)
    );

    const ponctuelle = parseFloat(surfacePonctuelle.replace(",", "."));
    const res = await fetch("/api/devis", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
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
        surface_m2: Number.isFinite(ponctuelle) && ponctuelle > 0 ? ponctuelle : null,
        lignes: lignesNettoyees,
      }),
    });
    const data = await res.json().catch(() => null);

    if (!res.ok || data?.error) {
      alert("Erreur : " + (data?.error || "Erreur serveur lors de la création du devis."));
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
    setSurfacePonctuelle("");
    fetchTout();
  }

  async function changerStatut(d: Devis, statut: string) {
    const { error } = await supabase.from("devis").update({ statut }).eq("id", d.id);
    if (error) return;

    const accepte = statut === "accepte" || statut === "signe";
    if (accepte && d.statut !== "accepte" && d.statut !== "signe") {
      await genererFactureAcompte(d);
    }
    fetchTout();
  }


  async function handleGenererFacture(e: React.FormEvent) {
    e.preventDefault();
    if (!devisToBill) return;
    const d = devisToBill;
    
    const numero = await prochainNumero("factures", "FAC");
    let lignesFacture: Ligne[] = [];
    
    if (billType === "totale") {
      // On copie les lignes chiffrées uniquement (jamais les « À CHIFFRER »).
      lignesFacture = d.lignes.filter((l) => !l.a_chiffrer);

      // Récupérer les factures d'acompte existantes pour déduction fiscale
      const { data: acomptesExistants } = await supabase
        .from("factures")
        .select("numero, lignes")
        .eq("devis_id", d.id)
        .eq("type_facture", "acompte");
        
      if (acomptesExistants && acomptesExistants.length > 0) {
        for (const ac of acomptesExistants) {
          const lignesAc = (ac.lignes as unknown as Ligne[]) || [];
          const mntAcompteHT = lignesAc.reduce((sum: number, l: Ligne) => sum + ((l.qte || 0) * (l.pu_ht || 0)), 0);
          lignesFacture.push({
            designation: `Déduction de la facture d'acompte n°${ac.numero}`,
            description: "",
            qte: -1,
            unite: "forfait",
            pu_ht: mntAcompteHT,
            catalogue_id: null,
            pu_revient: null,
            type_cout: null,
            a_chiffrer: false,
          });
        }
      }
    } else if (billType === "acompte") {
      // Ligne unique d'acompte
      const totalHT = calculerDevis(d.lignes).total_ht;
      const montantHT = totalHT * (billPct / 100);
      lignesFacture = [
        {
          designation: `Facture d'acompte (${billPct}%) sur le devis n°${d.numero}`,
          description: d.objet ?? undefined,
          qte: 1,
          unite: "forfait",
          pu_ht: Math.round(montantHT * 100) / 100,
          catalogue_id: null,
          pu_revient: null,
          type_cout: null,
          a_chiffrer: false,
        },
      ];
    } else if (billType === "situation") {
      // Situation: On copie les lignes chiffrées mais on indique le pourcentage d'avancement dans la désignation
      lignesFacture = d.lignes
        .filter((l) => !l.a_chiffrer)
        .map(l => ({
          ...l,
          designation: `[Avancement ${billPct}%] ${l.designation}`,
          pu_ht: typeof l.pu_ht === "number" ? Math.round(l.pu_ht * (billPct / 100) * 100) / 100 : null,
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

    if (existantes && existantes.length > 0) {
      afficherToast(`Acompte déjà généré pour le devis ${d.numero}`);
      return;
    }

    const totalHT = calculerDevis(d.lignes).total_ht;
    const pct = d.acompte_pct ?? 30;
    const montantHT = Math.round(totalHT * (pct / 100) * 100) / 100;

    const numero = await prochainNumero("factures", "FAC");

    const echeance = new Date();
    echeance.setDate(echeance.getDate() + 15);

    const { error } = await supabase.from("factures").insert({
      numero,
      devis_id: d.id,
      client_id: d.client_id,
      chantier_id: d.chantier_id ?? null,
      objet: `Acompte ${pct}% devis ${d.numero}`,
      adresse_chantier: d.adresse_chantier,
      type_travaux: d.type_travaux,
      tva_pct: d.tva_pct,   // Fix #1 : reprend le taux TVA du devis (ex. 10% rénovation)
      type_facture: "acompte",
      statut: "en_attente",
      echeance: echeance.toISOString().slice(0, 10),
      lignes: [
        {
          designation: `Facture d'acompte (${pct}%) sur le devis n°${d.numero}`,
          description: d.objet ?? undefined,
          qte: 1,
          unite: "forfait",
          pu_ht: montantHT,
        },
      ],
    });

    if (error) {
      afficherToast(`⚠️ Erreur génération acompte : ${error.message}`);
      return;
    }

    afficherToast(`✓ Facture d'acompte ${pct}% générée : ${montantHT.toLocaleString("fr-FR")}€`);
    fetchTout();
  }

  async function transformerEnChantier(d: Devis) {
    if (!confirm(`Transformer le devis ${d.numero} en chantier actif ?`)) return;

    const { error: chantierError } = await supabase.from("chantiers").insert({
      nom: d.objet || d.type_travaux || d.numero,
      client_id: d.client_id,
      adresse_chantier: d.adresse_chantier,
      statut: "prevu",
      materiau_structurel: MATERIAU_STRUCTUREL_DEFAUT,
      moyen_acces: MOYEN_ACCES_DEFAUT,
      zone_vent: ZONE_VENT_DEFAUT,
      prix_vente_ht: d.total_ht ?? null,
      surface_m2: d.surface_m2 ?? null,
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
    // Fix #8 : vérification des factures liées avant suppression.
    const { data: facturesLiees } = await supabase
      .from("factures")
      .select("id, numero")
      .eq("devis_id", d.id);
    if (facturesLiees && facturesLiees.length > 0) {
      const nums = facturesLiees.map((f: { numero: string }) => f.numero).join(", ");
      alert(`Impossible de supprimer le devis ${d.numero} : ${facturesLiees.length} facture(s) liée(s) existent (${nums}). Supprimez-les d'abord dans l'onglet Factures.`);
      return;
    }
    const { error } = await supabase.from("devis").delete().eq("id", d.id);
    if (error) {
      alert("Erreur lors de la suppression : " + error.message);
      return;
    }
    fetchTout();
  }

  function imprimer() {
    window.print();
  }

  return (
    <div className="space-y-5">
      {toast && (
        <div className="fixed top-16 left-1/2 z-[300] max-w-[90vw] -translate-x-1/2 rounded-xl border border-emerald-500/40 bg-[#15181E] px-4 py-3 text-sm font-bold text-emerald-400 shadow-xl shadow-black/40">
          {toast}
        </div>
      )}
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
            const totalHT = d.total_ht && d.total_ht > 0 ? d.total_ht : calculerDevis(d.lignes || []).total_ht;
            const totalTTC = totalHT * (1 + (d.tva_pct || 10) / 100);
            const nomClient = d.clients?.societe || d.clients?.nom || "Client direct";
            const nbACHiffrer = (d.lignes || []).filter((l) => l.a_chiffrer).length;
            const margeConnue =
              (d.cout_matiere_ht ?? 0) + (d.cout_main_oeuvre_ht ?? 0) > 0 ||
              (d.marge_ht ?? 0) !== 0;

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
                  
                  {d.profil_revenu && d.profil_revenu !== 'aucun' && (
                    (() => {
                      const aides = calculerAidesITE(d.surface_m2 || 0, d.profil_revenu);
                      if (aides.totalAides > 0) {
                        const reste = Math.max(0, totalTTC - aides.totalAides);
                        return (
                          <div className="flex items-center justify-between rounded-xl bg-cyan-900/20 p-2.5 border border-cyan-500/20 mt-2">
                            <span className="text-[11px] font-bold uppercase text-cyan-400">Reste à charge</span>
                            <span className="text-sm font-black font-mono text-cyan-300">{reste.toFixed(2)} €</span>
                          </div>
                        );
                      }
                      return null;
                    })()
                  )}

                  {(nbACHiffrer > 0 || margeConnue) && (
                    <div className="flex items-center justify-between gap-2 text-[10px]">
                      {margeConnue && (
                        <span className="font-semibold text-emerald-400/90">
                          Marge : {Math.round((d.marge_pct ?? 0) * 100) / 100}% · {(d.marge_ht ?? 0).toFixed(2)} €
                        </span>
                      )}
                      {nbACHiffrer > 0 && (
                        <span className="font-bold text-amber-400">À CHIFFRER ×{nbACHiffrer}</span>
                      )}
                    </div>
                  )}
                </div>

                <div className="mt-3.5 flex items-center justify-between border-t border-white/10/60 pt-3">
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setApercu(d)}
                      className="rounded-xl border border-slate-600 bg-transparent px-3 py-1.5 text-xs font-semibold text-gray-300 hover:bg-[#1A1D24] flex items-center gap-1"
                    >
                      👁️ Aperçu PDF
                    </button>
                    {/* Fix #3 : bouton Facturer → ouvre la modale de génération manuelle */}
                    {(d.statut === "accepte" || d.statut === "signe") && (
                      <button
                        onClick={() => { setDevisToBill(d); setBillType("acompte"); setBillPct(d.acompte_pct ?? 30); }}
                        className="rounded-xl border border-emerald-600/40 bg-emerald-500/10 px-3 py-1.5 text-xs font-semibold text-emerald-400 hover:bg-emerald-500/20"
                        title="Générer une facture (acompte / situation / totale)"
                      >
                        🧾 Facturer
                      </button>
                    )}
                    {d.statut !== "accepte" && d.statut !== "signe" && (
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

      {/* Fix #3 : Modale de génération de facture manuelle */}
      {devisToBill && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm"
          onClick={() => setDevisToBill(null)}
        >
          <form
            onSubmit={handleGenererFacture}
            onClick={(e) => e.stopPropagation()}
            className="bg-[#1A1D24] w-full max-w-md rounded-2xl border border-white/10 shadow-2xl p-6 space-y-5 animate-in fade-in"
          >
            <div className="flex items-center justify-between">
              <div>
                <h2 className="text-base font-bold text-white">Générer une facture</h2>
                <p className="text-xs text-gray-400 mt-0.5">Devis {devisToBill.numero} · {devisToBill.clients?.societe || devisToBill.clients?.nom || "—"}</p>
              </div>
              <button type="button" onClick={() => setDevisToBill(null)} className="text-gray-400 hover:text-white p-1.5">✕</button>
            </div>

            {/* Type de facture */}
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Type de facture</p>
              <div className="grid grid-cols-3 gap-2">
                {(["acompte", "situation", "totale"] as const).map((type) => (
                  <button
                    key={type}
                    type="button"
                    onClick={() => setBillType(type)}
                    className={`rounded-xl border py-2 text-xs font-bold transition-all ${
                      billType === type
                        ? "border-emerald-500 bg-emerald-500/20 text-emerald-400"
                        : "border-white/10 bg-white/5 text-gray-400 hover:border-gray-500"
                    }`}
                  >
                    {type === "acompte" ? "Acompte" : type === "situation" ? "Situation" : "Totale"}
                  </button>
                ))}
              </div>
            </div>

            {/* Pourcentage (si acompte ou situation) */}
            {(billType === "acompte" || billType === "situation") && (
              <div className="space-y-1.5">
                <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                  {billType === "acompte" ? "% d'acompte" : "% d'avancement"}
                </label>
                <div className="flex items-center gap-3">
                  <input
                    type="range"
                    min={5}
                    max={100}
                    step={5}
                    value={billPct}
                    onChange={(e) => setBillPct(parseInt(e.target.value))}
                    className="flex-1 accent-emerald-500"
                  />
                  <span className="w-12 text-right text-sm font-bold text-white">{billPct}%</span>
                </div>
              </div>
            )}

            {/* Aperçu montant */}
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-4 py-3 space-y-1">
              <div className="flex items-center justify-between text-xs text-gray-400">
                <span>Total devis HT</span>
                <span className="font-mono text-gray-200">{(devisToBill.total_ht && devisToBill.total_ht > 0 ? devisToBill.total_ht : calculerDevis(devisToBill.lignes || []).total_ht).toFixed(2)} €</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold uppercase text-gray-300">
                  {billType === "totale" ? "Montant facturé HT" : `Montant ${billType === "acompte" ? "acompte" : "situation"} HT`}
                </span>
                <span className="font-mono text-sm font-black text-emerald-400">
                  {(() => {
                    const base = devisToBill.total_ht && devisToBill.total_ht > 0 ? devisToBill.total_ht : calculerDevis(devisToBill.lignes || []).total_ht;
                    const montant = billType === "totale" ? base : Math.round(base * (billPct / 100) * 100) / 100;
                    return montant.toFixed(2);
                  })()} €
                </span>
              </div>
              <p className="text-[10px] text-gray-500">TVA {devisToBill.tva_pct}% appliquée</p>
            </div>

            <div className="flex gap-2 pt-1">
              <button
                type="button"
                onClick={() => setDevisToBill(null)}
                className="flex-none rounded-xl border border-slate-600 bg-transparent px-4 py-2.5 text-xs font-semibold text-gray-300 hover:bg-white/5"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-1 rounded-xl bg-emerald-600 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-500 shadow-md transition-colors"
              >
                Générer la facture
              </button>
            </div>
          </form>
        </div>
      )}

      {/* FAB (+) */}
      <button
        onClick={() => setModalOuvert(true)}
        aria-label="Créer un devis"
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 items-center justify-center rounded-full bg-red-600 text-slate-950 shadow-2xl shadow-red-600/10 transition-transform active:scale-95 hover:scale-105 hover:bg-red-700"
      >
        <span className="text-2xl font-bold leading-none">+</span>
      </button>

      {modalOuvert &&
        createPortal(
          <div
            className="fixed inset-0 z-[10000] flex items-center justify-center p-3 sm:p-4 bg-black/80 backdrop-blur-sm"
            onClick={() => setModalOuvert(false)}
          >
            <form
              onSubmit={creerDevis}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#1A1D24] w-full max-w-2xl h-[90dvh] sm:h-auto sm:max-h-[85vh] flex flex-col overflow-hidden rounded-xl border border-white/10 shadow-2xl animate-in fade-in"
            >
            <div className="flex items-center justify-between border-b border-white/10 px-4 min-h-[52px] py-2 sm:min-h-0 sm:py-3.5 shrink-0">
              <h2 className="text-[17px] sm:text-lg font-bold text-white">Nouveau Devis</h2>
              <button
                type="button"
                onClick={() => setModalOuvert(false)}
                className="flex h-10 w-10 sm:h-11 sm:w-11 items-center justify-center rounded-lg text-lg sm:text-xl text-gray-400 hover:bg-white/5 hover:text-white"
                aria-label="Fermer"
              >
                ✕
              </button>
            </div>

            <div className="p-3 pb-6 overflow-y-auto flex-1 flex flex-col gap-2.5 sm:gap-4 sm:p-4">
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
                      .select("id, nom, code_acces, adresse_chantier, surface_m2")
                      .eq("client_id", id)
                      .order("created_at", { ascending: false });
                    if (data) setChantiersClient(data);
                  }
                }}
                required
                className="w-full min-h-[42px] rounded-xl border border-slate-600 bg-transparent px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:border-red-600 focus:outline-none sm:py-2.5 sm:text-sm sm:min-h-0"
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
                  className="w-full min-h-[42px] rounded-xl border border-red-700 bg-transparent px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:border-red-600 focus:outline-none sm:py-2.5 sm:text-sm sm:min-h-0"
                >
                  <option value="">-- Lier à un chantier (optionnel) --</option>
                  {chantiersClient.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.nom} {c.code_acces ? `· Code: ${c.code_acces}` : ""}
                    </option>
                  ))}
                </select>
              )}

              {(chantierId || chantiersClient.length > 0) && (
                (() => {
                  const terrain = chantiersClient.find((c) => c.id === chantierId);
                  const surfChantier =
                    terrain && typeof terrain.surface_m2 === "number" && terrain.surface_m2 > 0
                      ? terrain.surface_m2
                      : null;
                  return (
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2 rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5">
                      <div className="flex-1 w-full min-w-[160px]">
                        <label className="text-xs font-semibold uppercase tracking-wide text-gray-400">
                          Surface métré (m²)
                        </label>
                        <input
                          type="number"
                          value={surfacePonctuelle}
                          onChange={(e) => setSurfacePonctuelle(e.target.value)}
                          placeholder={surfChantier ? `automatique : ${surfChantier} m²` : "surface ponctuelle…"}
                          className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-sm text-white placeholder:text-slate-500 focus:border-red-600 focus:outline-none sm:py-2 sm:text-sm sm:min-h-0"
                        />
                      </div>
                      <p className="text-xs text-gray-400 sm:max-w-[240px]">
                        {surfChantier
                          ? `Chantier métré : ${surfChantier} m² — utilisé automatiquement si vide.`
                          : "Si vide : le chantier lié fait foi ; sinon les lignes « m² » restent non chiffrées."}
                      </p>
                    </div>
                  );
                })()
              )}

              <input
                value={objet}
                onChange={(e) => setObjet(e.target.value)}
                placeholder="Objet (ex. Bardage bois claire-voie)"
                className="w-full min-h-[42px] rounded-xl border border-slate-600 bg-transparent px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:border-red-600 focus:outline-none sm:py-2.5 sm:text-sm sm:min-h-0"
              />
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <input
                  value={adresseChantier}
                  onChange={(e) => setAdresseChantier(e.target.value)}
                  placeholder="Adresse du chantier"
                  className="w-full min-h-[42px] rounded-xl border border-slate-600 bg-transparent px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:border-red-600 focus:outline-none sm:py-2.5 sm:text-sm sm:min-h-0"
                />
                <input
                  value={typeTravaux}
                  onChange={(e) => setTypeTravaux(e.target.value)}
                  placeholder="Type de travaux"
                  className="w-full min-h-[42px] rounded-xl border border-slate-600 bg-transparent px-3.5 py-2 text-sm text-white placeholder:text-slate-500 focus:border-red-600 focus:outline-none sm:py-2.5 sm:text-sm sm:min-h-0"
                />
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5 sm:gap-3">
                <div>
                  <label className="text-[11px] font-semibold uppercase text-gray-400 sm:text-xs">Validité (j)</label>
                  <input
                    type="number"
                    value={validite}
                    onChange={(e) => setValidite(parseInt(e.target.value) || 0)}
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-sm text-white focus:border-red-600 focus:outline-none sm:py-2 sm:text-sm sm:min-h-0"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-gray-400 sm:text-xs">Délai (j)</label>
                  <input
                    type="number"
                    value={delai}
                    onChange={(e) => setDelai(parseInt(e.target.value) || 0)}
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-sm text-white focus:border-red-600 focus:outline-none sm:py-2 sm:text-sm sm:min-h-0"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-gray-400 sm:text-xs">Acompte (%)</label>
                  <input
                    type="number"
                    value={acompte}
                    onChange={(e) => setAcompte(parseInt(e.target.value) || 0)}
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-sm text-white focus:border-red-600 focus:outline-none sm:py-2 sm:text-sm sm:min-h-0"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-gray-400 sm:text-xs">TVA (%)</label>
                  <input
                    type="number"
                    step="0.1"
                    value={tva}
                    onChange={(e) => setTva(parseFloat(e.target.value) || 0)}
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-slate-600 bg-transparent px-3 py-2 text-sm text-white focus:border-red-600 focus:outline-none sm:py-2 sm:text-sm sm:min-h-0"
                  />
                </div>
                <div>
                  <label className="text-[11px] font-semibold uppercase text-cyan-400 sm:text-xs">MaPrimeRénov'</label>
                  <select
                    value={profilRevenu}
                    onChange={(e) => setProfilRevenu(e.target.value as ProfilRevenu)}
                    className="mt-1 w-full min-h-[42px] rounded-xl border border-cyan-600/50 bg-cyan-900/10 px-3 py-2 text-sm text-cyan-100 focus:border-cyan-400 focus:outline-none sm:py-2 sm:text-sm sm:min-h-0"
                  >
                    <option value="aucun" className="text-gray-900">Aucun</option>
                    <option value="bleu" className="text-gray-900">Bleu (Très modeste)</option>
                    <option value="jaune" className="text-gray-900">Jaune (Modeste)</option>
                    <option value="violet" className="text-gray-900">Violet (Interm.)</option>
                    <option value="rose" className="text-gray-900">Rose (Aisé)</option>
                  </select>
                </div>
              </div>

              <div className="space-y-2">
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 sm:text-[11px]">Lignes de prestation</p>
                {lignes.map((l, i) => (
                  <div key={i} className="grid grid-cols-3 gap-1.5 rounded-xl border border-white/10 bg-white/[0.04] p-2 sm:grid-cols-12 sm:items-center sm:gap-2 sm:rounded-none sm:border-0 sm:bg-transparent sm:p-0">
                    {l.a_chiffrer && (
                      <div className="col-span-3 flex items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/10 px-2 py-1 sm:col-span-12">
                        <span className="text-xs">⚠️</span>
                        <div className="min-w-0">
                          <p className="text-[10px] font-bold uppercase tracking-wide text-amber-300 sm:text-[11px]">À CHIFFRER</p>
                          <p className="text-[10px] text-amber-200/80 sm:text-[11px]">Cette prestation doit être complétée manuellement.</p>
                        </div>
                      </div>
                    )}
                    <div className="col-span-3 sm:col-span-4">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:hidden">Désignation</label>
                      <input
                        value={l.designation}
                        onChange={(e) => updateLigne(i, { designation: e.target.value })}
                        placeholder="Désignation"
                        className="w-full min-h-[40px] rounded-xl border border-slate-600 bg-transparent px-2.5 py-2 text-sm text-white placeholder:text-slate-500 sm:min-h-0 sm:rounded-lg sm:py-2 sm:text-xs"
                      />
                      {l.justification && (
                        <p className="mt-1 text-[10px] leading-tight text-emerald-300/80 sm:text-[10px]" title={`Confiance : ${Math.round((l.confiance ?? 0) * 100)} %`}>
                          {l.justification}
                        </p>
                      )}
                    </div>
                    <div className="col-span-1 sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:hidden">Quantité</label>
                      <input
                        type="number"
                        value={l.qte ?? ""}
                        onChange={(e) => updateLigne(i, { qte: parseFloat(e.target.value) || 0 })}
                        placeholder="Qté"
                        className="w-full min-h-[40px] rounded-xl border border-slate-600 bg-transparent px-2.5 py-2 text-sm text-white placeholder:text-slate-500 sm:min-h-0 sm:rounded-lg sm:py-2 sm:text-xs"
                      />
                    </div>
                    <div className="col-span-1 sm:col-span-2">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:hidden">Unité</label>
                      <input
                        value={l.unite}
                        onChange={(e) => updateLigne(i, { unite: e.target.value })}
                        placeholder="Unité"
                        className="w-full min-h-[40px] rounded-xl border border-slate-600 bg-transparent px-2.5 py-2 text-sm text-white placeholder:text-slate-500 sm:min-h-0 sm:rounded-lg sm:py-2 sm:text-xs"
                      />
                    </div>
                    <div className="col-span-1 sm:col-span-3">
                      <label className="mb-1 block text-[11px] font-semibold uppercase tracking-wider text-gray-500 sm:hidden">Prix u. HT</label>
                      <input
                        type="number"
                        value={l.pu_ht ?? ""}
                        onChange={(e) => updateLigne(i, { pu_ht: parseFloat(e.target.value) || 0 })}
                        placeholder="PU HT"
                        className="w-full min-h-[40px] rounded-xl border border-slate-600 bg-transparent px-2.5 py-2 text-sm text-white placeholder:text-slate-500 sm:min-h-0 sm:rounded-lg sm:py-2 sm:text-xs"
                      />
                    </div>
                    <div className="col-span-3 flex items-end justify-end sm:col-span-1 sm:items-center sm:justify-center">
                      <button
                        type="button"
                        onClick={() => supprimerLigne(i)}
                        className="flex min-h-[36px] items-center justify-center gap-1 rounded-lg px-2.5 text-xs font-semibold text-gray-500 hover:bg-red-500/10 hover:text-red-400 sm:min-h-0 sm:p-1 sm:text-xs"
                      >
                        <span className="inline sm:hidden">🗑 Supprimer</span>
                        <span className="hidden text-lg leading-none sm:inline">✕</span>
                      </button>
                    </div>
                  </div>
                ))}
                <div className="flex flex-col sm:flex-row items-stretch gap-1.5 sm:gap-2 rounded-xl border border-violet-500/40 bg-violet-500/5 p-1.5 sm:p-2">
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
                      className="w-full min-h-[42px] sm:min-h-0 rounded-lg border border-violet-500/40 bg-transparent pl-3 pr-10 py-2 text-sm text-white placeholder:text-gray-500 disabled:opacity-50 sm:py-1.5 sm:text-xs"
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
                        const SpeechRec = window.SpeechRecognition || window.webkitSpeechRecognition;
                        const recognition = new SpeechRec!();
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
                      className="absolute right-2 text-violet-400 hover:text-violet-300 transition-colors p-2 sm:p-1 disabled:opacity-40 text-lg sm:text-base"
                      title={ecouteEnCours ? "Ecoute en cours..." : "Dicter avec le micro"}
                    >
                      🎙️
                    </button>
                  </div>
                  <button
                    type="button"
                    onClick={genererLigneIA}
                    disabled={genererIAEnCours || !promptIA.trim() || promptIA === "Écoute en cours..."}
                    className="w-full min-h-[44px] sm:w-auto sm:min-h-0 rounded-lg bg-violet-600 hover:bg-violet-500 px-4 py-2.5 text-sm sm:py-1.5 sm:text-xs font-bold text-white disabled:opacity-50 transition-colors whitespace-nowrap"
                  >
                    {genererIAEnCours ? "Génération..." : "✨ Générer avec l'IA"}
                  </button>
                </div>

                <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={ajouterLigne}
                    className="w-full sm:w-auto min-h-[42px] sm:min-h-0 rounded-xl border-2 border-dashed border-slate-600 bg-transparent px-3 py-2 text-sm sm:py-1.5 sm:text-xs font-semibold text-gray-200 hover:bg-white/5 hover:border-gray-300"
                  >
                    + Ajouter une ligne vierge
                  </button>
                  <select
                    defaultValue=""
                    onChange={(e) => {
                      insererDepuisCatalogue(e.target.value);
                      e.target.value = "";
                    }}
                    className="w-full sm:flex-1 min-h-[42px] sm:min-h-0 rounded-xl border border-red-600/50 bg-transparent px-3 py-2 text-sm sm:py-1.5 sm:text-xs text-gray-400 font-medium hover:border-gray-300"
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

              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 px-3 py-2.5 space-y-1.5 sm:px-4 sm:py-4">
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-[11px] font-semibold uppercase tracking-wide text-gray-400">Coût matière</span>
                  <span className="text-sm sm:text-xs font-mono text-gray-200">{apercuCalculs.cout_matiere_ht.toFixed(2)} €</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-[11px] font-semibold uppercase tracking-wide text-gray-400">Main d&apos;œuvre</span>
                  <span className="text-sm sm:text-xs font-mono text-gray-200">{apercuCalculs.cout_main_oeuvre_ht.toFixed(2)} €</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs sm:text-[11px] font-semibold uppercase tracking-wide text-gray-400">Marge estimée</span>
                  <span className="text-sm sm:text-xs font-mono text-emerald-400 font-bold">
                    {apercuCalculs.marge_ht.toFixed(2)} € ({apercuCalculs.marge_pct.toFixed(1)}%)
                  </span>
                </div>
                <div className="h-px bg-white/10/60" />
                <div className="flex items-center justify-between">
                  <span className="text-sm sm:text-sm font-bold uppercase text-gray-100">Total HT</span>
                  <span className="text-lg sm:text-base font-black font-mono text-white">{totalHT.toFixed(2)} €</span>
                </div>
                {profilRevenu !== 'aucun' && (
                  (() => {
                    const terrain = chantiersClient.find((c) => c.id === chantierId);
                    const surfaceCalc = parseFloat(surfacePonctuelle) || (terrain && terrain.surface_m2) || 0;
                    const aides = calculerAidesITE(surfaceCalc, profilRevenu);
                    const totalTTC = totalHT * (1 + tva / 100);
                    const reste = Math.max(0, totalTTC - aides.totalAides);
                    return (
                      <>
                        <div className="flex items-center justify-between text-cyan-300 mt-2">
                          <span className="text-xs sm:text-[11px] font-semibold uppercase tracking-wide">Aides estimées (MPR + CEE)</span>
                          <span className="text-sm sm:text-xs font-mono">- {aides.totalAides.toFixed(2)} €</span>
                        </div>
                        <div className="h-px bg-white/10/60 my-1" />
                        <div className="flex items-center justify-between">
                          <span className="text-sm sm:text-sm font-bold uppercase text-cyan-100">Reste à charge TTC</span>
                          <span className="text-xl sm:text-lg font-black font-mono text-cyan-400">{reste.toFixed(2)} €</span>
                        </div>
                      </>
                    );
                  })()
                )}
              </div>
            </div>

            <div className="p-2.5 border-t border-white/10 flex flex-row sm:justify-end items-center gap-2 mt-auto shrink-0 bg-[#1A1D24] rounded-b-xl z-10 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
              <button
                type="button"
                onClick={() => setModalOuvert(false)}
                className="flex-none min-h-[44px] sm:min-h-0 rounded-xl border border-slate-600 bg-[#1A1D24] px-3 sm:px-4 py-2 text-sm sm:py-2.5 sm:text-xs font-semibold text-gray-300 hover:bg-white/5"
              >
                Annuler
              </button>
              <button
                type="submit"
                className="flex-1 min-w-[0] sm:flex-none min-h-[44px] sm:min-h-0 rounded-xl bg-red-600 px-3 sm:px-5 py-2 text-sm sm:py-2.5 sm:text-xs font-bold text-slate-950 hover:bg-red-700 shadow-md whitespace-nowrap"
              >
                Enregistrer le Devis
              </button>
            </div>
          </form>
        </div>,
          document.body
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
                lignes: (apercu.lignes || [])
                  .filter((l) => !l.a_chiffrer)
                  .map((l) => ({
                    designation: l.designation || "—",
                    description: l.description,
                    qte: typeof l.qte === "number" && l.qte > 0 ? l.qte : 0,
                    unite: l.unite || "forfait",
                    pu_ht: typeof l.pu_ht === "number" && l.pu_ht > 0 ? l.pu_ht : 0,
                  })),
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
                      const ancienStatut = apercu.statut;
                      await supabase
                        .from("devis")
                        .update({ statut: "accepte" })
                        .eq("id", apercu.id);
                      // Fix #2 : cohérence avec changerStatut() — génère l'acompte si
                      // le devis n'était pas encore accepté/signé avant la signature.
                      if (ancienStatut !== "accepte" && ancienStatut !== "signe") {
                        await genererFactureAcompte({ ...apercu, statut: ancienStatut });
                      }
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

export default function DevisPage() {
  // `useSearchParams` n'est utilisée QUE dans DevisContenu : cette page cliente
  // doit être enveloppée dans un <Suspense> (contrainte Next.js) pour ne pas
  // faire échouer le build (prerendering).
  return (
    <Suspense fallback={<div className="p-8 text-center text-sm text-gray-400">Chargement…</div>}>
      <DevisContenu />
    </Suspense>
  );
}

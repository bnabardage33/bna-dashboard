// app/api/espace-client/[code_acces]/route.ts
//
// Récupère les données PUBLIQUES de l'espace client de façon sécurisée.
// Utilise supabaseAdmin (clé service_role, jamais exposée au navigateur)
// puis ne renvoie QUE ce qui concerne le chantier correspondant au
// code_acces fourni, avec une sélection EXPLICITE des colonnes.
//
// SÉCURITÉ : aucune donnée interne ne sort de cette route — ni OTP, ni
// marges/coûts, ni profil de revenu, ni métadonnées de signature. La
// sélection est whitelistée ET un nettoyage défensif s'applique avant envoi.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import {
  calculerAidesITE,
  extraireCodePostal,
  type ProfilRevenu,
} from "@/lib/primesCalcul";

// Force dynamic — never cache this route on Vercel/Next.js
export const dynamic = "force-dynamic";
export const revalidate = 0;

// ❌ Colonnes métier internes, interdites de sortie vers le client.
// Les ajouter ici garantit qu'elles sont supprimées de la réponse même
// si elles se retrouvent un jour dans la sélection SQL (défense en profondeur).
const SENSITIVE_KEYS = [
  // OTP / signature électronique
  "otp_code",
  "otp_expires_at",
  "otp_attempts",
  "signature_date",
  "signature_ip",
  "signature_phone",
  "signature_client",
  "signature_entreprise",
  "signataire_client_nom",
  // Marges et coûts internes (ne JAMAIS exposer au client)
  "marge_ht",
  "marge_pct",
  "cout_matiere_ht",
  "cout_main_oeuvre_ht",
  "total_ht",
  "profil_revenu",
  // Données internes de chantier (calepinage / appro / vent)
  "prix_vente_ht",
  "coef_perte_rendement",
  "singularites_nb",
  "surface_paquet_m2",
  "zone_vent",
  "zone_vent_rive",
  "quantite_coupes_ml",
  "epaisseur_isolant_mm",
  "notes_terrain",
  "horaires",
  // Paramètres financiers internes de l'entreprise
  "seuil_ca",
  "taux_cotisations",
];

// ✅ Sélections whitelistées (colonnes publiques uniquement)
// `as const` : requis pour que la typographie générée par Supabase vérifie la requête.

// Chantier : affichage (nom, adresse) + avancement / date estimée de fin.
const SELECT_CHANTIER = `id, nom, adresse_chantier, statut, surface_m2, created_at, date_debut, date_fin, client_id, clients(id, nom, societe, email, tel, adresse_facturation, code_postal, ville)` as const;

// Devis : ne sort que la désignation, les quantités, les prix de vente
// unitaires (lignes) + en-tête du document et son taux de TVA.
const SELECT_DEVIS = `id, numero, statut, created_at, date_emission, validite_jours, objet, adresse_chantier, type_travaux, lignes, tva_pct, acompte_pct, delai_jours, surface_m2` as const;

// Factures : même principe, + échéance et type de facture.
const SELECT_FACTURES = `id, numero, statut, date_emission, echeance, objet, adresse_chantier, type_travaux, lignes, tva_pct, type_facture` as const;

// Entreprise : uniquement les champs nécessaires à l'affichage du document
// (coordonnées, assurance, IBAN, mentions). Les indicateurs financiers
// internes (seuil_ca, taux_cotisations) restent au serveur.
const SELECT_ENTREPRISE = `id, raison_sociale, siret, telephone, email, adresse, code_postal, ville, assurance, assurance_nom, assurance_numero_police, assurance_zone_geo, mediateur_nom, mediateur_contact, iban, bic, mentions_legales, logo_url` as const;

// Photos de chantier : uniquement ce que le client doit voir (image + titre + date).
// Serties ici (et non via /api/photos-chantier, désormais réservé à l'admin
// connecté) pour rester dans le périmètre SCOPÉ au code d'accès.
const SELECT_PHOTOS = `id, url_image, titre, date_ajout` as const;

// Lignes renvoyées telles quelles au client (type opaque volontaire :
// ces données ne sont jamais lues structurellement côté serveur).
type LignePassePartout = Record<string, unknown>;

// Résultat public de la simulation d'aides MaPrimeRénov' + CEE.
// Pré-calculé côté serveur : le client reçoit UNIQUEMENT les totaux.
interface SimulationAides {
  primeAnah: number;
  primeCEE: number;
  totalAides: number;
  resteACharge: number;
}

type LigneDevis = { qte?: unknown; pu_ht?: unknown };

function nombreColonne(valeur: unknown, defaut = 0): number {
  const n = Number(valeur);
  return Number.isFinite(n) ? n : defaut;
}

// Total HT public reconstruit depuis les lignes du devis (designation / qte / pu_ht).
function totalHTDevis(devis: LignePassePartout): number {
  const lignes = Array.isArray(devis.lignes)
    ? (devis.lignes as LigneDevis[])
    : [];
  return lignes.reduce(
    (somme, ligne) => somme + nombreColonne(ligne?.qte) * nombreColonne(ligne?.pu_ht),
    0
  );
}

// Prépare l'encart "aides d'État" SANS jamais exposer le profil de revenu.
// Utilise la surface du devis (fallback : surface du chantier), le profil
// lu côté serveur, et le total TTC public. Retourne null si aucune aide.
function calculerSimulationAides(
  devis: LignePassePartout,
  profilRevenu: string | null,
  surfaceChantier: number | null
): SimulationAides | null {
  // Active la simulation UNIQUEMENT si l'artisan a configuré un profil de
// revenu éligible ('bleu', 'jaune' ou 'violet'). 'rose' n'est pas couvert
// par les aides Anah et ne doit pas déclencher l'encart.
const PROFILS_VALIDES = ["bleu", "jaune", "violet"];
  if (!profilRevenu || !PROFILS_VALIDES.includes(profilRevenu)) return null;

  const surface = nombreColonne(devis.surface_m2) || nombreColonne(surfaceChantier);
  const totalHT = totalHTDevis(devis);
  if (surface <= 0 || totalHT <= 0) return null;

  const tvaPct = nombreColonne(devis.tva_pct, 20) || 20;
  const aides = calculerAidesITE(
    surface,
    profilRevenu as ProfilRevenu,
    totalHT,
    extraireCodePostal(String(devis.adresse_chantier ?? ""))
  );
  if (aides.totalAides <= 0) return null;

  const totalTTC = totalHT * (1 + tvaPct / 100);
  const resteACharge = Math.max(0, totalTTC - aides.totalAides);

  return {
    primeAnah: Math.round(aides.primeAnah * 100) / 100,
    primeCEE: Math.round(aides.primeCEE * 100) / 100,
    totalAides: Math.round(aides.totalAides * 100) / 100,
    resteACharge: Math.round(resteACharge * 100) / 100,
  };
}

// Nettoyage défensif : retire toute colonne sensible qui passerait dans
// la réponse (protection contre un futur select trop large).
function nettoyer<T>(valeur: T): T {
  if (!valeur || typeof valeur !== "object") return valeur;
  if (Array.isArray(valeur)) {
    return (valeur as unknown[]).map((x) => nettoyer(x)) as unknown as T;
  }
  const copie: Record<string, unknown> = {
    ...(valeur as Record<string, unknown>),
  };
  for (const cle of SENSITIVE_KEYS) {
    delete copie[cle];
  }
  return copie as T;
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ code_acces: string }> }
) {
  const { code_acces } = await params;

  if (!code_acces) {
    return NextResponse.json({ error: "Code d'accès manquant" }, { status: 400 });
  }

  // 1. Paramètres entreprise (affichage logo, coordonnées) — whitelist stricte
  const { data: entreprise } = await supabaseAdmin
    .from("entreprise_settings")
    .select(SELECT_ENTREPRISE)
    .eq("id", 1)
    .single();

  // 2. Chantier correspondant au code d'accès — whitelist stricte
  const { data: chantiers, error: erreurChantier } = await supabaseAdmin
    .from("chantiers")
    .select(SELECT_CHANTIER)
    .eq("code_acces", code_acces)
    .limit(1);

  if (erreurChantier || !chantiers || chantiers.length === 0) {
    // Code invalide : on ne donne aucun indice, juste "introuvable"
    return NextResponse.json({ error: "Code d'accès invalide" }, { status: 404 });
  }

  const chantier = chantiers[0];

  // On récupère toutes les entrées d'avancement pour ce chantier sans ORDER BY SQL
  // (pour éviter tout bug lié aux colonnes de tri absentes ou mal indexées)
  const { data: avancements, error: avError } = await supabaseAdmin
    .from("avancements_chantier")
    .select("id, pourcentage, date, created_at, details")
    .eq("chantier_id", chantier.id);

  let avancement = 0;
  let avancementDetails = null;

  if (avError) {
    console.error("Erreur lecture avancements_chantier :", avError);
  } else if (avancements && avancements.length > 0) {
    // Tri robuste en Javascript (par created_at ou par date)
    const sorted = [...avancements].sort((a, b) => {
      const timeA = new Date(a.created_at || a.date || 0).getTime();
      const timeB = new Date(b.created_at || b.date || 0).getTime();
      // Si les dates sont identiques (ex: pas de time), on utilise l'ID en string locale compare (fallback)
      if (timeA === timeB) {
        return String(b.id).localeCompare(String(a.id));
      }
      return timeB - timeA; // Descending
    });

    // Récupérer le pourcentage de la toute dernière entrée
    const latest = sorted[0];
    avancement = latest.pourcentage != null ? Number(latest.pourcentage) : 0;
    avancementDetails = latest.details;
  }

  // 4. Devis visibles (envoyés, signés ou acceptés) — par chantier, fallback par client.
  //    Sélection EXPLICITE : jamais otp_code / marges / signature / profil_revenu.
  let devisList: LignePassePartout[] = [];
  const { data: devisParChantier } = await supabaseAdmin
    .from("devis")
    .select(SELECT_DEVIS)
    .eq("chantier_id", chantier.id)
    .in("statut", ["envoye", "signe", "accepte"]);

  if (devisParChantier && devisParChantier.length > 0) {
    devisList = devisParChantier as unknown as LignePassePartout[];
  } else if (chantier.client_id) {
    const { data: devisParClient } = await supabaseAdmin
      .from("devis")
      .select(SELECT_DEVIS)
      .eq("client_id", chantier.client_id)
      .in("statut", ["envoye", "signe", "accepte"]);
    if (devisParClient) devisList = devisParClient as unknown as LignePassePartout[];
  }

  // 4bis. Simulation des aides d'État (MaPrimeRénov' + CEE), CALCULÉE CÔTÉ SERVEUR.
  // On relit `profil_revenu` en interne (requête séparée, jamais renvoyée au client)
  // puis on attache le résultat public `simulation_aides` à chaque devis.
  if (devisList.length > 0) {
    const idsDevis = devisList
      .map((d) => d.id)
      .filter((x): x is string => typeof x === "string");

    const { data: profilsDevis } = await supabaseAdmin
      .from("devis")
      .select("id, profil_revenu")
      .in("id", idsDevis);

    const profilsMap = new Map<string, string | null>(
      (profilsDevis ?? []).map((p) => [p.id, p.profil_revenu])
    );

    devisList = devisList.map((devis) => {
      const simulation = calculerSimulationAides(
        devis,
        profilsMap.get(String(devis.id)) ?? null,
        chantier.surface_m2 ?? null
      );
      // Toujours présent côté client : simulation si profil éligible, sinon null.
      devis.simulation_aides = simulation;
      return devis;
    });
  }

  // 5. Factures — par chantier, fallback par client. Whitelist stricte également.
  let facturesList: LignePassePartout[] = [];
  const { data: facturesParChantier } = await supabaseAdmin
    .from("factures")
    .select(SELECT_FACTURES)
    .eq("chantier_id", chantier.id)
    .in("statut", ["emise", "envoyee", "payee"]);

  if (facturesParChantier && facturesParChantier.length > 0) {
    facturesList = nettoyer(facturesParChantier) as unknown as LignePassePartout[];
  } else if (chantier.client_id) {
    const { data: facturesParClient } = await supabaseAdmin
      .from("factures")
      .select(SELECT_FACTURES)
      .eq("client_id", chantier.client_id)
      .in("statut", ["emise", "envoyee", "payee"]);
    if (facturesParClient) facturesList = nettoyer(facturesParClient) as unknown as LignePassePartout[];
  }

  // 6. Rapports hebdomadaires — STRICTEMENT envoyés au client.
  //    Un brouillon ne doit JAMAIS sortir de cette route : filtre SQL
  //    statut = 'envoye' ET re-filtrage défensif avant envoi.
  const { data: rapportsClient } = await supabaseAdmin
    .from("rapports_client")
    .select("id, statut, semaine_label, date_debut, contenu")
    .eq("chantier_id", chantier.id)
    .eq("statut", "envoye")
    .order("date_debut", { ascending: false });

  const rapports = (rapportsClient ?? [])
    .filter((r) => r.statut === "envoye")
    .map(({ id, semaine_label, date_debut, contenu }) => ({
      id,
      semaine_label,
      date_debut,
      contenu,
    }));

  // 7. Intempéries (justificatifs auto) — visibles côté client.
  //    Source de vérité = rapports_intemperies_jours_arretes, en ne remontant
  //    QUE les journées réellement arrêtées (l'ancienne table rapports_intemperies
  //    contient des lignes de test "conditions normales" qui ne doivent pas sortir).
  const { data: intemperiesBruts } = await supabaseAdmin
    .from("rapports_intemperies_jours_arretes")
    .select("id, numero, motif, jour_arrete, cree_le, pluie_cumul, rafales_max, vigilance_officielle")
    .eq("chantier_id", chantier.id)
    .eq("jour_arrete", true)
    .order("cree_le", { ascending: false });

  const intemperies = (intemperiesBruts ?? []).map((r) => ({
    id: r.id,
    numero: r.numero,
    motif: r.motif,
    jour_arrete: r.jour_arrete,
    cree_le: r.cree_le,
    pluie_cumul: r.pluie_cumul,
    rafales_max: r.rafales_max,
    vigilance_officielle: r.vigilance_officielle,
  }));

  // 8. Photos du chantier — serties côté serveur (périmètre scropé au code,
  //    colonnes whitelistées). L'endpoint admin /api/photos-chantier est lui
  //    réservé aux sessions connectées.
  const { data: photosChantier } = await supabaseAdmin
    .from("photos_chantier")
    .select(SELECT_PHOTOS)
    .eq("chantier_id", chantier.id)
    .order("date_ajout", { ascending: false });

  const photos = (photosChantier ?? []).map((p) => ({
    id: p.id,
    url_image: p.url_image,
    titre: p.titre,
    date_ajout: p.date_ajout,
  }));

  return NextResponse.json({
    entreprise: nettoyer(entreprise),
    chantier: nettoyer(chantier),
    client: nettoyer(chantier.clients),
    avancement,
    avancementDetails,
    devis: devisList.map((d) => nettoyer(d)),
    factures: facturesList.map((f) => nettoyer(f)),
    rapports,
    intemperies,
    photos,
  }, {
    headers: {
      "Cache-Control": "no-store, no-cache, must-revalidate",
      "Pragma": "no-cache",
    }
  });
}
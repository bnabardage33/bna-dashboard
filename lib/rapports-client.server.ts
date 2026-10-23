// lib/rapports-client.server.ts
// Agrégation serveur du snapshot hebdo (semaine passée, Europe/Paris).
// À importer UNIQUEMENT dans les route handlers : utilise supabaseAdmin
// (service_role) et ne doit jamais être chargé côté client.
//
// ISOLATION MULTI-ENTREPRISE (O3-B3) : le service_role contourne la RLS, donc
// `construireSnapshot(chantierId, entrepriseId)` exige les DEUX identifiants.
// `entrepriseId` n'est pas optionnel : chaque appelant doit fournir le tenant
// qu'il a déjà validé, et chaque lecture est filtrée puis revalidée.

import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import type { Json } from "@/types/supabase";
import { agregerIntemperiesSemaine } from "@/lib/intemperiesSemaine";
import type {
  FacadeCompteur,
  PhotoRapport,
  SnapshotContenu,
} from "@/lib/rapports-client";

const FUSE_HORAIRE = "Europe/Paris";

const FACADES = ["nord", "sud", "est", "ouest"] as const;
const ETAPES = ["ossature", "isolation", "bardage", "finitions"] as const;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string): boolean {
  return UUID_RE.test(value);
}

// ISOLATION MULTI-ENTREPRISE (O3-B3)
// ------------------------------------------------------------------
// `construireSnapshot` s'exécute sous service_role (le cron O3-B2 n'a pas de
// session), donc la RLS ne filtre RIEN : chaque lecture doit porter un
// `.eq("entreprise_id", …)` explicite.
//
// Double barrière sur chaque accès :
//   1. le filtre `.eq("entreprise_id", entrepriseId)` à l'émission ;
//   2. la revalidation ci-dessous, qui rejette (fail-closed) toute ligne
//      remontée avec une autre entreprise — elle couvrirait aussi une
//      régression du filtre ou une ligne incohérente en base.
// ------------------------------------------------------------------

function exigerEntreprise<T extends { entreprise_id: string }>(
  lignes: T[],
  entrepriseId: string,
  contexte: string
): T[] {
  for (const ligne of lignes) {
    if (ligne.entreprise_id !== entrepriseId) {
      throw new Error(
        `Incohérence d'entreprise sur ${contexte} : ligne hors entreprise attendue`
      );
    }
  }
  return lignes;
}

function exigerEntrepriseUnitaire<T extends { entreprise_id: string }>(
  ligne: T | null | undefined,
  entrepriseId: string,
  contexte: string
): T | null {
  if (ligne && ligne.entreprise_id !== entrepriseId) {
    throw new Error(
      `Incohérence d'entreprise sur ${contexte} : ligne hors entreprise attendue`
    );
  }
  return ligne ?? null;
}

type ChantierSnapshotRow = {
  id: string;
  nom: string | null;
  client_id: string | null;
  date_fin: string | null;
  adresse_chantier: string | null;
  entreprise_id: string;
};

type PhotoRow = {
  date_prise: string | null;
  type: string;
  url: string;
  entreprise_id: string;
};

type PointageGlobalRow = {
  commentaire: string | null;
  coef_meteo: number | null;
  date_saisie: string;
  meteo_relevee: string | null;
  volume_heures_declare: number;
  entreprise_id: string;
};

type RapportIntemperieRow = {
  cree_le: string;
  jour_arrete: boolean;
  motif: string;
  vigilance_officielle: string;
  entreprise_id: string;
};

type AvancementRow = {
  commentaire: string | null;
  created_at: string | null;
  details: Json | null;
  pourcentage: number;
  entreprise_id: string;
};

// -----------------------------------------------------------------------------
// Utilitaires fuseau horaire Europe/Paris
// -----------------------------------------------------------------------------

function decalageFuseauMs(date: Date, timeZone: string): number {
  const partie = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  }).formatToParts(date);

  const valeurs: Record<string, string> = {};
  for (const p of partie) {
    if (p.type !== "literal") valeurs[p.type] = p.value;
  }

  const epochLocal = Date.UTC(
    Number(valeurs.year),
    Number(valeurs.month) - 1,
    Number(valeurs.day),
    Number(valeurs.hour),
    Number(valeurs.minute),
    Number(valeurs.second)
  );

  return epochLocal - date.getTime();
}

// Moment exact de 00:00:00.000 Europe/Paris pour une date "YYYY-MM-DD".
function minuitParis(isoDate: string): Date {
  const [annee, mois, jour] = isoDate.split("-").map(Number);

  // Midi UTC à la même date : sans équivoque, quel que soit le DST.
  const midiUtc = Date.UTC(annee, mois - 1, jour, 12);
  const decalage = decalageFuseauMs(new Date(midiUtc), FUSE_HORAIRE);

  return new Date(Date.UTC(annee, mois - 1, jour) - decalage);
}

// Date calendaire "YYYY-MM-DD" dans Europe/Paris depuis un instant ISO.
function dateParis(iso: string): string {
  const partie = new Intl.DateTimeFormat("en-US", {
    timeZone: FUSE_HORAIRE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(iso));

  const valeurs: Record<string, string> = {};
  for (const p of partie) {
    if (p.type !== "literal") valeurs[p.type] = p.value;
  }

  return `${valeurs.year}-${valeurs.month}-${valeurs.day}`;
}

export function encadrerSemainePassee(now: Date): {
  debut: Date;
  fin: Date;
  lundiISO: string;
  dimancheISO: string;
} {
  const [annee, mois, jour] = dateParis(now.toISOString()).split("-").map(Number);

  // Midi "device local" : on ne lit que le numéro de jour (insensible au DST).
  const aMidi = new Date(annee, mois - 1, jour, 12);
  const decalage = (aMidi.getDay() + 6) % 7; // 0 = lundi … 6 = dimanche

  const lundiPrecedent = new Date(annee, mois - 1, jour - decalage - 7);
  const dimanchePrecedent = new Date(annee, mois - 1, jour - decalage - 1);

  const lundiISO = `${lundiPrecedent.getFullYear()}-${String(
    lundiPrecedent.getMonth() + 1
  ).padStart(2, "0")}-${String(lundiPrecedent.getDate()).padStart(2, "0")}`;

  const dimancheISO = `${dimanchePrecedent.getFullYear()}-${String(
    dimanchePrecedent.getMonth() + 1
  ).padStart(2, "0")}-${String(dimanchePrecedent.getDate()).padStart(2, "0")}`;

  const debut = minuitParis(lundiISO);
  const fin = new Date(minuitParis(dimancheISO).getTime() + 24 * 60 * 60 * 1000 - 1);

  return { debut, fin, lundiISO, dimancheISO };
}

export function libelleSemaine(lundiISO: string, dimancheISO: string): string {
  // Midi UTC pour un rendu de date stable, indépendant du fuseau de la machine.
  const debut = new Date(`${lundiISO}T12:00:00Z`);
  const fin = new Date(`${dimancheISO}T12:00:00Z`);

  return `Semaine du ${debut.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
  })} au ${fin.toLocaleDateString("fr-FR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  })}`;
}

// -----------------------------------------------------------------------------
// Aggrégation — avancement
// -----------------------------------------------------------------------------

function compterFacades(details: Json | null): {
  facades: FacadeCompteur;
  casesCochees: number;
} {
  const compteur: FacadeCompteur = { nord: 0, sud: 0, est: 0, ouest: 0 };
  let cases = 0;

  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return { facades: compteur, casesCochees: cases };
  }

  const brut = details as Record<string, unknown>;

  for (const facade of FACADES) {
    const etapesBrut = brut[facade];

    if (etapesBrut && typeof etapesBrut === "object") {
      const etapes = etapesBrut as Record<string, unknown>;

      for (const etape of ETAPES) {
        if (etapes[etape] === true) {
          compteur[facade] += 1;
          cases += 1;
        }
      }
    }
  }

  return { facades: compteur, casesCochees: cases };
}

// -----------------------------------------------------------------------------
// Aggrégation — intempéries (une entrée par jour, la plus récente)
//
// L'agrégation vit dans `lib/intemperiesSemaine.ts` : PURE, testable sans
// Supabase, et sans couleur inventée (« indisponible » n'est pas « vert »).
// -----------------------------------------------------------------------------

// -----------------------------------------------------------------------------
// Construction du snapshot complet pour un chantier
// -----------------------------------------------------------------------------

export async function construireSnapshot(
  chantierId: string,
  entrepriseId: string
): Promise<SnapshotContenu> {
  if (!estUuid(entrepriseId)) {
    throw new Error("Contexte entreprise invalide");
  }

  if (!estUuid(chantierId)) {
    throw new Error("Chantier invalide");
  }

  const { data: chantierBrut, error: erreurChantier } = await supabase
    .from("chantiers")
    .select("id, nom, client_id, date_fin, adresse_chantier, entreprise_id")
    .eq("id", chantierId)
    .eq("entreprise_id", entrepriseId)
    .maybeSingle();

  if (erreurChantier) {
    throw new Error(`Erreur chargement du chantier : ${erreurChantier.message}`);
  }

  if (!chantierBrut) {
    throw new Error("Chantier introuvable");
  }

  exigerEntrepriseUnitaire(chantierBrut, entrepriseId, "chantiers");

  const ch: ChantierSnapshotRow = chantierBrut;

  // `clients` n'est pas un enfant de chantier : il n'a ni trigger d'entreprise
  // ni contrainte composite. Le seul lien est `chantiers.client_id` (FK
  // simple). On lit donc le client dans l'entreprise DU CHANTIER déjà
  // revalidé, puis on revalide : un client d'un autre tenant ne peut pas
  // enrichir le snapshot.
  let client: { nom: string | null; entreprise_id: string } | null = null;

  if (ch.client_id) {
    const { data: clientBrut } = await supabase
      .from("clients")
      .select("nom, entreprise_id")
      .eq("id", ch.client_id)
      .eq("entreprise_id", ch.entreprise_id)
      .maybeSingle();

    client = exigerEntrepriseUnitaire(clientBrut, ch.entreprise_id, "clients");
  }

  const { debut, fin, lundiISO, dimancheISO } = encadrerSemainePassee(new Date());
  const debutISO = debut.toISOString();
  const finISO = fin.toISOString();

  // --- Avancements -----------------------------------------------------------

  const { data: avancementsBruts, error: erreurAvancements } = await supabase
    .from("avancements_chantier")
    .select("pourcentage, details, commentaire, created_at, entreprise_id")
    .eq("chantier_id", chantierId)
    .eq("entreprise_id", entrepriseId)
    .gte("created_at", debutISO)
    .lte("created_at", finISO)
    .order("created_at", { ascending: false });

  if (erreurAvancements) {
    throw new Error(`Erreur chargement des avancements : ${erreurAvancements.message}`);
  }

  const listeAvancements: AvancementRow[] = exigerEntreprise(
    (avancementsBruts ?? []) as AvancementRow[],
    entrepriseId,
    "avancements_chantier"
  );
  const dernierPeriode = listeAvancements[0];
  const pctFin = dernierPeriode ? Number(dernierPeriode.pourcentage) : 0;

  const { data: avantPeriodeBrut } = await supabase
    .from("avancements_chantier")
    .select("pourcentage, entreprise_id")
    .eq("chantier_id", chantierId)
    .eq("entreprise_id", entrepriseId)
    .lt("created_at", debutISO)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const avantPeriode = exigerEntrepriseUnitaire(
    avantPeriodeBrut as { pourcentage: number; entreprise_id: string } | null,
    entrepriseId,
    "avancements_chantier"
  );

  const pctDebut = avantPeriode?.pourcentage != null ? Number(avantPeriode.pourcentage) : 0;
  const delta = pctFin - pctDebut;

  const { facades, casesCochees } = compterFacades(dernierPeriode?.details ?? null);

  // --- Photos (onglet "Photos & Notes" : table `photos`) ----------------------

  const { data: photosRaw, error: erreurPhotos } = await supabase
    .from("photos")
    .select("url, type, date_prise, entreprise_id")
    .eq("chantier_id", chantierId)
    .eq("entreprise_id", entrepriseId)
    .order("date_prise", { ascending: false });

  if (erreurPhotos) {
    console.error(`Erreur chargement photos chantier ${chantierId} : ${erreurPhotos.message}`);
  }

  const photosPeriode: PhotoRow[] = exigerEntreprise(
    (photosRaw ?? []) as PhotoRow[],
    entrepriseId,
    "photos"
  ).filter((photo) => {
    const jour = String(photo.date_prise ?? "").slice(0, 10);
    return jour >= lundiISO && jour <= dimancheISO;
  });

  const photos: PhotoRapport[] = [...photosPeriode]
    .sort((a, b) => {
      // Priorité au type 'pendant' (chantier en cours), puis date DESC.
      const prioriteA = a.type === "pendant" ? 0 : 1;
      const prioriteB = b.type === "pendant" ? 0 : 1;
      if (prioriteA !== prioriteB) return prioriteA - prioriteB;

      return String(b.date_prise ?? "").localeCompare(String(a.date_prise ?? ""));
    })
    .slice(0, 6)
    .map((photo): PhotoRapport => {
      const jour = String(photo.date_prise ?? "").slice(0, 10);

      return {
        url: photo.url,
        legende:
          photo.type && (photo.type === "avant" || photo.type === "pendant" || photo.type === "apres")
            ? photo.type
            : jour
              ? `Photo du ${jour}`
              : "Photo de chantier",
        date: jour || null,
      };
    });

  // --- Pointages globaux -----------------------------------------------------

  const { data: pointagesBruts, error: erreurPointages } = await supabase
    .from("pointages_globaux")
    .select(
      "volume_heures_declare, meteo_relevee, coef_meteo, commentaire, date_saisie, entreprise_id"
    )
    .eq("chantier_id", chantierId)
    .eq("entreprise_id", entrepriseId)
    .gte("date_saisie", lundiISO)
    .lte("date_saisie", dimancheISO);

  if (erreurPointages) {
    throw new Error(`Erreur chargement des pointages : ${erreurPointages.message}`);
  }

  const listePointages: PointageGlobalRow[] = exigerEntreprise(
    (pointagesBruts ?? []) as PointageGlobalRow[],
    entrepriseId,
    "pointages_globaux"
  );

  const totalHeures = listePointages.reduce(
    (total, p) => total + Number(p.volume_heures_declare || 0),
    0
  );

  const coefs = listePointages
    .map((p) => p.coef_meteo)
    .filter((coef): coef is number => coef != null);

  const coefMeteoMoyen =
    coefs.length > 0
      ? Math.round((coefs.reduce((a, b) => a + b, 0) / coefs.length) * 100) / 100
      : null;

  const meteoReleves = [
    ...new Set(
      listePointages
        .map((p) => p.meteo_relevee)
        .filter((meteo): meteo is string => meteo != null && meteo.trim() !== "")
    ),
  ];

  // --- Rapports intempéries ---------------------------------------------------

  const { data: intemperiesBruts, error: erreurIntemperies } = await supabase
    .from("rapports_intemperies")
    .select("cree_le, motif, jour_arrete, vigilance_officielle, entreprise_id")
    .eq("chantier_id", chantierId)
    .eq("entreprise_id", entrepriseId)
    .gte("cree_le", debutISO)
    .lte("cree_le", finISO)
    .order("cree_le", { ascending: true });

  if (erreurIntemperies) {
    throw new Error(`Erreur chargement des rapports intempéries : ${erreurIntemperies.message}`);
  }

  const intemperies = agregerIntemperiesSemaine(
    exigerEntreprise(
      (intemperiesBruts ?? []) as RapportIntemperieRow[],
      entrepriseId,
      "rapports_intemperies"
    ),
    lundiISO,
    dimancheISO
  );

  // --- Snapshot figé -----------------------------------------------------------

  return {
    periode: {
      debut: lundiISO,
      fin: dimancheISO,
      semaine: libelleSemaine(lundiISO, dimancheISO),
    },
    chantier: {
      id: ch.id,
      nom: ch.nom,
      client_nom: client?.nom ?? null,
      adresse: ch.adresse_chantier,
      date_fin_estimee: ch.date_fin,
    },
    avancement: {
      pct_debut: pctDebut,
      pct_fin: pctFin,
      delta,
      facades,
      cases_cochees: casesCochees,
    },
    photos,
    pointages: {
      total_heures: totalHeures,
      nb_pointages: listePointages.length,
      jours_pointes: new Set(listePointages.map((p) => p.date_saisie)).size,
      coef_meteo_moyen: coefMeteoMoyen,
      meteo_relevee: meteoReleves,
    },
    intemperies: {
      jours_arret_total: intemperies.joursArretTotal,
      details: intemperies.details,
      vigilance_max: intemperies.vigilanceMax,
    },
    communication: {
      observations: dernierPeriode?.commentaire ?? null,
      date_fin_estimee: ch.date_fin,
      message_patron: null,
    },
  };
}
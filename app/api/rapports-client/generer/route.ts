// app/api/rapports-client/generer/route.ts
//
// Génération du rapport hebdomadaire client.
// ------------------------------------------------------------
// Le rapport fige un "snapshot" de la semaine passée (lundi 00:00 ->
// dimanche 23:59, fuseau Europe/Paris) dans la colonne `contenu` (JSONB).
//
// Sources agrégées (tables EXISTANTES) :
//   1. avancements_chantier  -> pct_debut / pct_fin / delta + cases par façade
//   2. photos                -> 6 photos max de la période (type 'pendant' en priorité)
//   3. pointages_globaux     -> heures déclarées, météo relevée, coef météo
//   4. rapports_intemperies  -> une entrée par jour (cree_le), dédupliquée
//   5. chantiers            -> date_fin (estimation)
// ------------------------------------------------------------

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import type { Json } from "@/types/supabase";

export const dynamic = "force-dynamic";
export const revalidate = 0;

// -----------------------------------------------------------------------------
// Types
// -----------------------------------------------------------------------------

type FacadeCompteur = {
  nord: number;
  sud: number;
  est: number;
  ouest: number;
};

type PhotoRapport = {
  url: string;
  legende: string;
  date: string | null;
};

type JourIntemperie = {
  date: string;
  motif: string;
  jour_arrete: boolean;
  vigilance: string;
};

type PointageGlobalRow = {
  commentaire: string | null;
  coef_meteo: number | null;
  date_saisie: string;
  meteo_relevee: string | null;
  volume_heures_declare: number;
};

type RapportIntemperieRow = {
  cree_le: string;
  jour_arrete: boolean;
  motif: string;
  vigilance_officielle: string;
};

type AvancementRow = {
  commentaire: string | null;
  created_at: string | null;
  details: Json | null;
  pourcentage: number;
};

type PhotoRow = {
  date_prise: string | null;
  type: string;
  url: string;
};

type ChantierRow = {
  client_id: string | null;
  date_fin: string | null;
  id: string;
  nom: string | null;
};

type SnapshotContenu = {
  periode: {
    debut: string;
    fin: string;
    semaine: string;
  };
  chantier: {
    id: string;
    nom: string | null;
    client_nom: string | null;
    date_fin_estimee: string | null;
  };
  avancement: {
    pct_debut: number;
    pct_fin: number;
    delta: number;
    facades: FacadeCompteur;
    cases_cochees: number;
  };
  photos: PhotoRapport[];
  pointages: {
    total_heures: number;
    nb_pointages: number;
    jours_pointes: number;
    coef_meteo_moyen: number | null;
    meteo_relevee: string[];
  };
  intemperies: {
    jours_arret_total: number;
    details: JourIntemperie[];
    vigilance_max: string;
  };
  communication: {
    observations: string | null;
    date_fin_estimee: string | null;
    message_patron: string | null;
  };
};

// -----------------------------------------------------------------------------
// Configuration
// -----------------------------------------------------------------------------

const FUSE_HORAIRE = "Europe/Paris";

const FACADES = ["nord", "sud", "est", "ouest"] as const;
const ETAPES = ["ossature", "isolation", "bardage", "finitions"] as const;

const ORDRE_VIGILANCE: Record<string, number> = {
  vert: 0,
  jaune: 1,
  orange: 2,
  rouge: 3,
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

function encadrerSemainePassée(now: Date): {
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

function libelleSemaine(lundiISO: string, dimancheISO: string): string {
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
// -----------------------------------------------------------------------------

function agregerIntemperies(
  lignes: RapportIntemperieRow[],
  lundiISO: string,
  dimancheISO: string
): {
  joursArretTotal: number;
  details: JourIntemperie[];
  vigilanceMax: string;
} {
  const parJour = new Map<string, RapportIntemperieRow>();

  for (const ligne of lignes) {
    const jour = dateParis(ligne.cree_le);

    // Sûreté : on ne garde que la période visée, puis la ligne la plus récente.
    if (jour < lundiISO || jour > dimancheISO) continue;

    const existant = parJour.get(jour);
    if (!existant || ligne.cree_le > existant.cree_le) {
      parJour.set(jour, ligne);
    }
  }

  const joursTries = [...parJour.keys()].sort();

  let joursArretTotal = 0;
  let vigilanceMax = "vert";

  const details: JourIntemperie[] = joursTries.map((jour) => {
    const ligne = parJour.get(jour);

    if (ligne?.jour_arrete) joursArretTotal += 1;

    const niveau = ligne?.vigilance_officielle ?? "vert";
    if ((ORDRE_VIGILANCE[niveau] ?? 0) > (ORDRE_VIGILANCE[vigilanceMax] ?? 0)) {
      vigilanceMax = niveau;
    }

    return {
      date: jour,
      motif: ligne?.motif ?? "Aucun rapport intempéries enregistré.",
      jour_arrete: ligne?.jour_arrete ?? false,
      vigilance: niveau,
    };
  });

  return { joursArretTotal, details, vigilanceMax };
}

// -----------------------------------------------------------------------------
// POST
// -----------------------------------------------------------------------------

export async function POST(request: NextRequest) {
  try {
    // Auth obligatoire : le middleware protège déjà la route, mais on
    // double la vérification pour renvoyer une erreur JSON propre.
    const supabaseAuth = await createClient();
    const {
      data: { user },
    } = await supabaseAuth.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { success: false, error: "Authentification requise" },
        { status: 401 }
      );
    }

    let body: { chantier_id?: unknown } = {};

    try {
      body = await request.json();
    } catch {
      body = {};
    }

    const chantierId =
      typeof body.chantier_id === "string" && body.chantier_id.trim() !== ""
        ? body.chantier_id.trim()
        : null;

    if (!chantierId) {
      return NextResponse.json(
        { success: false, error: "chantier_id est requis" },
        { status: 400 }
      );
    }

    // --- Bornes de la semaine passée (Europe/Paris) -------------------------

    const { debut, fin, lundiISO, dimancheISO } = encadrerSemainePassée(new Date());
    const debutISO = debut.toISOString();
    const finISO = fin.toISOString();

    // --- Doublon : rapport déjà généré pour ce chantier + cette période -----

    const { data: existant, error: erreurExistant } = await supabase
      .from("rapports_client")
      .select("id, semaine_label, statut")
      .eq("chantier_id", chantierId)
      .eq("date_debut", lundiISO)
      .eq("date_fin", dimancheISO)
      .maybeSingle();

    if (erreurExistant) {
      return NextResponse.json(
        { success: false, error: `Erreur vérification rapport existant : ${erreurExistant.message}` },
        { status: 500 }
      );
    }

    if (existant) {
      const tonRapport = new Date().toISOString().replace("T", " ").slice(0, 19);
      console.warn(
        `Rapport client déjà existant (${lundiISO} → ${dimancheISO}) pour le chantier ${chantierId} — refusé à ${tonRapport}`
      );

      return NextResponse.json(
        {
          success: false,
          error: `Un rapport existe déjà pour cette semaine (${lundiISO} → ${dimancheISO})`,
          rapport: existant,
        },
        { status: 409 }
      );
    }

    // --- Chantier -----------------------------------------------------------

    const { data: chantier, error: erreurChantier } = await supabase
      .from("chantiers")
      .select("id, nom, client_id, date_fin")
      .eq("id", chantierId)
      .maybeSingle();

    if (erreurChantier) {
      return NextResponse.json(
        { success: false, error: `Erreur chargement du chantier : ${erreurChantier.message}` },
        { status: 500 }
      );
    }

    if (!chantier) {
      return NextResponse.json(
        { success: false, error: "Chantier introuvable" },
        { status: 404 }
      );
    }

    const ch: ChantierRow = chantier;

    const { data: client } = await supabase
      .from("clients")
      .select("nom")
      .eq("id", ch.client_id ?? "")
      .maybeSingle();

    // --- Avancements --------------------------------------------------------

    const { data: avancements, error: erreurAvancements } = await supabase
      .from("avancements_chantier")
      .select("pourcentage, details, commentaire, created_at")
      .eq("chantier_id", chantierId)
      .gte("created_at", debutISO)
      .lte("created_at", finISO)
      .order("created_at", { ascending: false });

    if (erreurAvancements) {
      return NextResponse.json(
        { success: false, error: `Erreur chargement des avancements : ${erreurAvancements.message}` },
        { status: 500 }
      );
    }

    const listeAvancements: AvancementRow[] = avancements ?? [];
    const dernierPeriode = listeAvancements[0];
    const pctFin = dernierPeriode ? Number(dernierPeriode.pourcentage) : 0;

    const { data: avantPeriode } = await supabase
      .from("avancements_chantier")
      .select("pourcentage")
      .eq("chantier_id", chantierId)
      .lt("created_at", debutISO)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    const pctDebut = avantPeriode?.pourcentage != null ? Number(avantPeriode.pourcentage) : 0;
    const delta = pctFin - pctDebut;

    const { facades, casesCochees } = compterFacades(dernierPeriode?.details ?? null);

    // --- Photos (onglet "Photos & Notes" : table `photos`) ------------------

    const { data: photosRaw, error: erreurPhotos } = await supabase
      .from("photos")
      .select("url, type, date_prise")
      .eq("chantier_id", chantierId)
      .order("date_prise", { ascending: false });

    if (erreurPhotos) {
      console.error(`Erreur chargement photos chantier ${chantierId} : ${erreurPhotos.message}`);
    }

    const photosPeriode: PhotoRow[] = (photosRaw ?? []).filter((photo) => {
      const jour = String(photo.date_prise ?? "").slice(0, 10);
      return jour >= lundiISO && jour <= dimancheISO;
    });

    const photos = [...photosPeriode]
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
          legende: photo.type && (photo.type === "avant" || photo.type === "pendant" || photo.type === "apres")
            ? photo.type
            : jour
              ? `Photo du ${jour}`
              : "Photo de chantier",
          date: jour || null,
        };
      });

    // --- Pointages globaux --------------------------------------------------

    const { data: pointagesData, error: erreurPointages } = await supabase
      .from("pointages_globaux")
      .select("volume_heures_declare, meteo_relevee, coef_meteo, commentaire, date_saisie")
      .eq("chantier_id", chantierId)
      .gte("date_saisie", lundiISO)
      .lte("date_saisie", dimancheISO);

    if (erreurPointages) {
      return NextResponse.json(
        { success: false, error: `Erreur chargement des pointages : ${erreurPointages.message}` },
        { status: 500 }
      );
    }

    const listePointages: PointageGlobalRow[] = pointagesData ?? [];

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

    const meteoReleves = [...new Set(
      listePointages
        .map((p) => p.meteo_relevee)
        .filter((meteo): meteo is string => meteo != null && meteo.trim() !== "")
    )];

    // --- Rapports intempéries -------------------------------------------------

    const { data: intemperiesData, error: erreurIntemperies } = await supabase
      .from("rapports_intemperies")
      .select("cree_le, motif, jour_arrete, vigilance_officielle")
      .eq("chantier_id", chantierId)
      .gte("cree_le", debutISO)
      .lte("cree_le", finISO)
      .order("cree_le", { ascending: true });

    if (erreurIntemperies) {
      return NextResponse.json(
        { success: false, error: `Erreur chargement des rapports intempéries : ${erreurIntemperies.message}` },
        { status: 500 }
      );
    }

    const intemperies = agregerIntemperies(
      (intemperiesData ?? []) as RapportIntemperieRow[],
      lundiISO,
      dimancheISO
    );

    // --- Snapshot figé -------------------------------------------------------

    const contenu: SnapshotContenu = {
      periode: {
        debut: lundiISO,
        fin: dimancheISO,
        semaine: libelleSemaine(lundiISO, dimancheISO),
      },
      chantier: {
        id: ch.id,
        nom: ch.nom,
        client_nom: client?.nom ?? null,
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

    // --- Insertion du snapshot (statut brouillon) ----------------------------

    const { data: rapportCree, error: erreurInsertion } = await supabase
      .from("rapports_client")
      .insert({
        chantier_id: chantierId,
        semaine_label: contenu.periode.semaine,
        date_debut: lundiISO,
        date_fin: dimancheISO,
        contenu,
        statut: "brouillon",
      })
      .select()
      .single();

    if (erreurInsertion || !rapportCree) {
      return NextResponse.json(
        {
          success: false,
          error: erreurInsertion?.message ?? "Impossible de créer le rapport",
        },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, rapport: rapportCree });
  } catch (globale: unknown) {
    const message = globale instanceof Error ? globale.message : String(globale);
    console.error("Erreur globale génération rapport client :", globale);

    return NextResponse.json(
      { success: false, error: message },
      { status: 500 }
    );
  }
}
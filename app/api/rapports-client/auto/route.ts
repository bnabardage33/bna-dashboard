// app/api/rapports-client/auto/route.ts
//
// Cron hebdomadaire (lundi 6h, cf. vercel.json) : pour chaque chantier en
// cours, génère AUTOMATIQUEMENT le rapport de la semaine passée, rédige un
// message patron, et le marque 'envoye' avec date d'envoi — le client le
// voit directement dans son espace client. Aucune action manuelle requise.
//
// Protection : header Authorization: Bearer <CRON_SECRET> (variable d'env),
// vérifié explicitement ici. La route n'est PAS dans PUBLIC_PATHS : elle
//franchit le middleware grâce à l'exception serveur-à-serveur
// `possedeBearerCron` de lib/supabase/middleware.ts, qui reconnaît exactement
// le même bearer. Vercel l'appelle sans session navigateur.

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabaseAdmin";
import type { TablesInsert } from "@/types/supabase";
import {
  construireSnapshot,
  encadrerSemainePassee,
} from "@/lib/rapports-client.server";
import type { SnapshotContenu } from "@/lib/rapports-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

// Aucune marque d'un tenant en dur : la signature provient toujours des
// réglages de l'entreprise traitée, ou de ce libellé neutre.
const SIGNATURE_PAR_DEFAUT = "Votre entreprise";

function estUuid(value: string) {
  return UUID_RE.test(value);
}

type ResultatContexteCron =
  | { ok: true; entrepriseIds: string[] }
  | { ok: false; reponse: NextResponse };

// Contexte tenant d'un cron : aucun claim JWT n'est disponible (appel
// serveur-à-serveur), on exige donc le secret, puis on transforme la liste des
// entreprises actives en une liste de contextes strictement séparés.
async function resoudreContexteCron(
  request: NextRequest
): Promise<ResultatContexteCron> {
  const secret = process.env.CRON_SECRET ?? "";
  const autorisation = request.headers.get("authorization");

  if (secret === "" || autorisation !== `Bearer ${secret}`) {
    return {
      ok: false,
      reponse: NextResponse.json(
        { success: false, error: "Non autorisé" },
        { status: 401 }
      ),
    };
  }

  try {
    const { data, error } = await supabaseAdmin
      .from("entreprises")
      .select("id")
      .eq("actif", true)
      .order("id");

    if (error) {
      return {
        ok: false,
        reponse: NextResponse.json(
          { success: false, error: "Erreur serveur" },
          { status: 500 }
        ),
      };
    }

    const entrepriseIds = [
      ...new Set((data ?? []).map((entreprise) => entreprise.id)),
    ];

    if (entrepriseIds.length === 0) {
      return {
        ok: false,
        reponse: NextResponse.json(
          {
            success: false,
            error: "Aucune entreprise active : traitement interrompu",
          },
          { status: 500 }
        ),
      };
    }

    if (entrepriseIds.some((id) => !estUuid(id))) {
      return {
        ok: false,
        reponse: NextResponse.json(
          { success: false, error: "Contexte entreprise invalide" },
          { status: 500 }
        ),
      };
    }

    return { ok: true, entrepriseIds };
  } catch (err) {
    console.error("Rapports client /auto : erreur de contexte", err);
    return {
      ok: false,
      reponse: NextResponse.json(
        { success: false, error: "Erreur serveur" },
        { status: 500 }
      ),
    };
  }
}

const FACADES = ["nord", "sud", "est", "ouest"] as const;
const ETAPES_LABELS: Record<string, string> = {
  ossature: "la pose de l'ossature",
  isolation: "la pose de l'isolation",
  bardage: "la pose du bardage",
  finitions: "les finitions",
};

async function prochaineEtape(
  entrepriseId: string,
  chantierId: string
): Promise<string> {
  const { data } = await supabaseAdmin
    .from("avancements_chantier")
    .select("details")
    .eq("entreprise_id", entrepriseId)
    .eq("chantier_id", chantierId)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const details = data?.details;
  if (details && typeof details === "object" && !Array.isArray(details)) {
    const brut = details as Record<string, unknown>;
    for (const facade of FACADES) {
      const etapesBrut = brut[facade];
      if (etapesBrut && typeof etapesBrut === "object") {
        const etapes = etapesBrut as Record<string, unknown>;
        for (const [etape, label] of Object.entries(ETAPES_LABELS)) {
          if (etapes[etape] !== true) {
            return `${label} — façade ${facade.charAt(0).toUpperCase()}${facade.slice(1)}`;
          }
        }
      }
    }
  }
  return "la réception du chantier";
}

function redigerMessage(
  contenu: SnapshotContenu,
  signature: string,
  prochaine: string
): string {
  const client = contenu.chantier.client_nom ?? "Madame, Monsieur";
  const chantier = contenu.chantier.nom ?? "votre chantier";
  const pct = contenu.avancement.pct_fin;
  const cases = contenu.avancement.cases_cochees;

  const lignes = [
    `Bonjour ${client},`,
    ``,
    `Chantier « ${chantier} » : cette semaine, l'avancement est de ${pct}% (${cases}/16 étapes réalisées sur les 4 façades).`,
  ];

  const joursArret = contenu.intemperies.jours_arret_total;
  if (joursArret > 0) {
    lignes.push(
      `Le chantier a été arrêté ${joursArret} jour${joursArret > 1 ? "s" : ""} pour cause d'intempéries (un justificatif détaillé est disponible dans votre espace).`
    );
  }

  lignes.push(`Prochaine étape : ${prochaine}.`);
  lignes.push(`Voir les photos du chantier en pièce jointe.`);
  lignes.push(``);
  lignes.push(`Cordialement,`);
  lignes.push(signature || SIGNATURE_PAR_DEFAUT);

  return lignes.join("\n");
}

export async function GET(request: NextRequest) {
  const resultatContexte = await resoudreContexteCron(request);
  if (!resultatContexte.ok) return resultatContexte.reponse;

  const { entrepriseIds } = resultatContexte;

  const { lundiISO, dimancheISO } = encadrerSemainePassee(new Date());

  let total = 0;
  let generes = 0;
  let dejaExistants = 0;
  let enErreur = 0;

  // Un tenant ne voit et ne produit que ses propres données : chaque itération
  // porte un entreprise_id explicite, réutilisé sur TOUS les accès métier.
  for (const entrepriseId of entrepriseIds) {
    // --- Réglages de l'entreprise traitée (jamais `.eq("id", 1)`) ----------

    const { data: settings, error: erreurSettings } = await supabaseAdmin
      .from("entreprise_settings")
      .select("raison_sociale, entreprise_id")
      .eq("entreprise_id", entrepriseId)
      .maybeSingle();

    if (erreurSettings) {
      console.error(
        "Rapports client /auto : erreur chargement réglages",
        erreurSettings
      );
      return NextResponse.json(
        { success: false, error: erreurSettings.message },
        { status: 500 }
      );
    }

    if (settings && settings.entreprise_id !== entrepriseId) {
      return NextResponse.json(
        { success: false, error: "Contexte entreprise invalide" },
        { status: 500 }
      );
    }

    const signature = settings?.raison_sociale?.trim() || SIGNATURE_PAR_DEFAUT;

    // --- Chantiers en cours de CE tenant -----------------------------------

    const { data: chantiers, error: erreurChantiers } = await supabaseAdmin
      .from("chantiers")
      .select("id, nom, entreprise_id")
      .eq("entreprise_id", entrepriseId)
      .eq("statut", "en_cours");

    if (erreurChantiers) {
      console.error(
        "Rapports client /auto : erreur chargement chantiers",
        erreurChantiers
      );
      return NextResponse.json(
        { success: false, error: erreurChantiers.message },
        { status: 500 }
      );
    }

    const listeChantiers = chantiers ?? [];

    if (listeChantiers.some((chantier) => chantier.entreprise_id !== entrepriseId)) {
      return NextResponse.json(
        { success: false, error: "Contexte entreprise invalide" },
        { status: 500 }
      );
    }

    total += listeChantiers.length;

    for (const chantier of listeChantiers) {
      // --- Doublon, scopé par entreprise ET chantier ----------------------

      const { data: existant, error: erreurExistant } = await supabaseAdmin
        .from("rapports_client")
        .select("id, entreprise_id, chantier_id")
        .eq("entreprise_id", entrepriseId)
        .eq("chantier_id", chantier.id)
        .eq("date_debut", lundiISO)
        .eq("date_fin", dimancheISO)
        .maybeSingle();

      if (erreurExistant) {
        enErreur += 1;
        console.error(
          `Rapports client /auto : erreur vérification doublon ${chantier.id}`,
          erreurExistant
        );
        continue;
      }

      if (existant) {
        if (
          existant.entreprise_id !== entrepriseId ||
          existant.chantier_id !== chantier.id
        ) {
          enErreur += 1;
          console.error(
            `Rapports client /auto : rapport existant hors entreprise pour ${chantier.id}`
          );
          continue;
        }

        dejaExistants += 1;
        continue;
      }

      try {
        const contenu = await construireSnapshot(chantier.id);
        const prochaine = await prochaineEtape(entrepriseId, chantier.id);

        const messagePatron = redigerMessage(contenu, signature, prochaine);

        contenu.communication.message_patron = messagePatron;

        // entreprise_id explicite : `rapports_client.entreprise_id` est NOT
        // NULL, on ne dépend plus du trigger pour le renseigner.
        const donneesInsertion: TablesInsert<"rapports_client"> = {
          entreprise_id: entrepriseId,
          chantier_id: chantier.id,
          semaine_label: contenu.periode.semaine,
          date_debut: lundiISO,
          date_fin: dimancheISO,
          contenu,
          statut: "envoye",
          envoye_le: new Date().toISOString(),
        };

        const { data: rapportCree, error: erreurInsertion } = await supabaseAdmin
          .from("rapports_client")
          .insert(donneesInsertion)
          .select("id, entreprise_id, chantier_id")
          .single();

        if (
          erreurInsertion ||
          !rapportCree ||
          rapportCree.entreprise_id !== entrepriseId ||
          rapportCree.chantier_id !== chantier.id
        ) {
          enErreur += 1;
          console.error(
            `Rapports client /auto : échec insertion pour ${chantier.id}`,
            erreurInsertion ?? "Rapport créé hors entreprise"
          );
          continue;
        }

        generes += 1;
      } catch (e: unknown) {
        enErreur += 1;
        console.error(`Rapports client /auto : erreur snapshot ${chantier.id}`, e);
      }
    }
  }

  return NextResponse.json({
    success: true,
    periode: { debut: lundiISO, fin: dimancheISO },
    total,
    generes,
    dejaExistants,
    enErreur,
    envoyesAutomatiquement: true,
  });
}
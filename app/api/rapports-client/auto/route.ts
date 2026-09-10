// app/api/rapports-client/auto/route.ts
//
// Cron hebdomadaire (lundi 6h, cf. vercel.json) : pour chaque chantier en
// cours, génère AUTOMATIQUEMENT le rapport de la semaine passée, rédige un
// message patron, et le marque 'envoye' avec date d'envoi — le client le
// voit directement dans son espace client. Aucune action manuelle requise.
//
// Protection : header Authorization: Bearer <CRON_SECRET> (variable d'env).
// Route ajoutée à PUBLIC_PATHS dans lib/supabase/middleware.ts (elle est
// appelée serveur-à-serveur, sans session navigateur).

import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin as supabase } from "@/lib/supabaseAdmin";
import {
  construireSnapshot,
  encadrerSemainePassee,
} from "@/lib/rapports-client.server";
import type { SnapshotContenu } from "@/lib/rapports-client";

export const dynamic = "force-dynamic";
export const revalidate = 0;

const FACADES = ["nord", "sud", "est", "ouest"] as const;
const ETAPES_LABELS: Record<string, string> = {
  ossature: "la pose de l'ossature",
  isolation: "la pose de l'isolation",
  bardage: "la pose du bardage",
  finitions: "les finitions",
};

async function prochaineEtape(chantierId: string): Promise<string> {
  const { data } = await supabase
    .from("avancements_chantier")
    .select("details")
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
  lignes.push(signature || "BNA Bardage");

  return lignes.join("\n");
}

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const autorisation = request.headers.get("authorization");

  if (secret === "" || autorisation !== `Bearer ${secret}`) {
    return NextResponse.json(
      { success: false, error: "Non autorisé" },
      { status: 401 }
    );
  }

  const { lundiISO, dimancheISO } = encadrerSemainePassee(new Date());

  const { data: chantiers, error: erreurChantiers } = await supabase
    .from("chantiers")
    .select("id, nom")
    .eq("statut", "en_cours");

  if (erreurChantiers) {
    console.error("Rapports client /auto : erreur chargement chantiers", erreurChantiers);
    return NextResponse.json(
      { success: false, error: erreurChantiers.message },
      { status: 500 }
    );
  }

  const { data: entreprise } = await supabase
    .from("entreprise_settings")
    .select("raison_sociale")
    .eq("id", 1)
    .maybeSingle();

  const signature = entreprise?.raison_sociale ?? "BNA Bardage";

  let generes = 0;
  let dejaExistants = 0;
  let enErreur = 0;

  for (const chantier of chantiers ?? []) {
    const { data: existant } = await supabase
      .from("rapports_client")
      .select("id")
      .eq("chantier_id", chantier.id)
      .eq("date_debut", lundiISO)
      .eq("date_fin", dimancheISO)
      .maybeSingle();

    if (existant) {
      dejaExistants += 1;
      continue;
    }

    try {
      const contenu = await construireSnapshot(chantier.id);
      const prochaine = await prochaineEtape(chantier.id);

      const messagePatron = redigerMessage(contenu, signature, prochaine);

      contenu.communication.message_patron = messagePatron;

      const { error: erreurInsertion } = await supabase
        .from("rapports_client")
        .insert({
          chantier_id: chantier.id,
          semaine_label: contenu.periode.semaine,
          date_debut: lundiISO,
          date_fin: dimancheISO,
          contenu,
          statut: "envoye",
          envoye_le: new Date().toISOString(),
        });

      if (erreurInsertion) {
        enErreur += 1;
        console.error(
          `Rapports client /auto : échec insertion pour ${chantier.id}`,
          erreurInsertion
        );
        continue;
      }

      generes += 1;
    } catch (e: unknown) {
      enErreur += 1;
      console.error(`Rapports client /auto : erreur snapshot ${chantier.id}`, e);
    }
  }

  return NextResponse.json({
    success: true,
    periode: { debut: lundiISO, fin: dimancheISO },
    total: chantiers?.length ?? 0,
    generes,
    dejaExistants,
    enErreur,
    envoyesAutomatiquement: true,
  });
}
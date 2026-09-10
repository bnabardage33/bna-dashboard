// app/api/rapports-client/auto/route.ts
//
// Cron hebdomadaire (lundi 6h, cf. vercel.json) : pour chaque chantier en
// cours, génère le brouillon du rapport de la semaine passée s'il est absent
// et crée une note pour le patron. N'envoie JAMAIS au client automatiquement.
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

export const dynamic = "force-dynamic";
export const revalidate = 0;

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

  let generes = 0;
  let dejaExistants = 0;
  let enErreur = 0;
  let notesCreees = 0;

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

      const { error: erreurInsertion } = await supabase
        .from("rapports_client")
        .insert({
          chantier_id: chantier.id,
          semaine_label: contenu.periode.semaine,
          date_debut: lundiISO,
          date_fin: dimancheISO,
          contenu,
          statut: "brouillon",
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

      const { error: erreurNote } = await supabase.from("notes_patron").insert({
        titre: "Rapport hebdo prêt",
        contenu: `Rapport hebdo prêt pour ${chantier.nom ?? chantier.id} (${
          contenu.periode.semaine
        }).`,
      });

      if (erreurNote) {
        console.error(
          `Rapports client /auto : échec création note pour ${chantier.id}`,
          erreurNote
        );
      } else {
        notesCreees += 1;
      }
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
    notesCreees,
  });
}
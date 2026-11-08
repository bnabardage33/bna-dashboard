// Route d'export PDF pour le sous-onglet Terrasse
// POST /api/chantiers/[id]/terrasse/export/pdf

import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { resoudreTenant } from "@/lib/tenant";
import { genererPdfTerrasse } from "@/lib/terrasse/exportPdf";
import type {
  ChantierTerrasseConfig,
  ResultatCalculTerrasse,
} from "@/lib/terrasse/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

interface RouteProps {
  params: Promise<{ id: string }>;
}

const STATUTS_DTU = new Set(["conforme", "avertissement", "non_conforme"]);

function estObjetSimple(val: unknown): val is Record<string, unknown> {
  return typeof val === "object" && val !== null && !Array.isArray(val);
}

function estChaineNonVide(val: unknown): val is string {
  return typeof val === "string" && val.trim().length > 0;
}

function estNombreFiniPositif(val: unknown, strict = false): val is number {
  return typeof val === "number" && Number.isFinite(val) && (strict ? val > 0 : val >= 0);
}

function validerConfigTerrasseExport(
  raw: Record<string, unknown>
): { config: ChantierTerrasseConfig } | { erreur: string } {
  const chainesRequises = [
    "nom",
    "type_sol",
    "essence_bois",
    "type_fixation",
    "type_pose",
    "type_lambourde",
    "type_plots",
  ] as const;

  for (const champ of chainesRequises) {
    if (!estChaineNonVide(raw[champ])) {
      return {
        erreur: `Configuration terrasse incomplète ou invalide : le champ ${champ} est manquant ou vide.`,
      };
    }
  }

  const strictPositifs = [
    "longueur_m",
    "largeur_m",
    "largeur_lame_mm",
    "epaisseur_lame_mm",
    "longueur_lame_m",
    "entraxe_lambourdes_cm",
    "entraxe_plots_cm",
  ] as const;

  for (const champ of strictPositifs) {
    if (!estNombreFiniPositif(raw[champ], true)) {
      return {
        erreur: `Configuration terrasse incomplète ou invalide : le champ ${champ} doit être un nombre strictement positif.`,
      };
    }
  }

  const positifsOuNuls = [
    "hauteur_sol_cm",
    "pente_pct",
    "espacement_lames_mm",
  ] as const;

  for (const champ of positifsOuNuls) {
    if (!estNombreFiniPositif(raw[champ], false)) {
      return {
        erreur: `Configuration terrasse incomplète ou invalide : le champ ${champ} doit être un nombre positif ou nul.`,
      };
    }
  }

  return { config: raw as unknown as ChantierTerrasseConfig };
}

function validerInstantaneResultatsTechniques(
  raw: unknown
): { resultat: ResultatCalculTerrasse } | { erreur: string; status: 422 | 500 } {
  if (raw === null || raw === undefined) {
    return {
      erreur:
        "Aucun instantané des résultats techniques n'est enregistré pour cette terrasse. Veuillez enregistrer le calcul avant d'exporter.",
      status: 422,
    };
  }

  if (!estObjetSimple(raw)) {
    return {
      erreur:
        "L'instantané des résultats techniques enregistré est invalide ou incomplet (format non objet).",
      status: 500,
    };
  }

  if (
    !estNombreFiniPositif(raw.surfaceBruteM2, true) ||
    !estNombreFiniPositif(raw.surfaceNetteM2, false)
  ) {
    return {
      erreur:
        "L'instantané des résultats techniques enregistré est invalide ou incomplet (surfaces manquantes ou invalides).",
      status: 500,
    };
  }

  const lames = raw.lames;
  if (!estObjetSimple(lames) || !estNombreFiniPositif(lames.nbLamesStandard, false)) {
    return {
      erreur:
        "L'instantané des résultats techniques enregistré est invalide ou incomplet (données de lames manquantes).",
      status: 500,
    };
  }

  const lambourdes = raw.lambourdes;
  if (
    !estObjetSimple(lambourdes) ||
    !estChaineNonVide(lambourdes.sectionMm) ||
    !estNombreFiniPositif(lambourdes.entraxeMaxDtuCm, true) ||
    !estNombreFiniPositif(lambourdes.nbRangees, false) ||
    !estNombreFiniPositif(lambourdes.lineaireAvecChutesMl, false) ||
    !estNombreFiniPositif(lambourdes.nbBarres, false)
  ) {
    return {
      erreur:
        "L'instantané des résultats techniques enregistré est invalide ou incomplet (données de lambourdes manquantes).",
      status: 500,
    };
  }

  const plots = raw.plots;
  if (
    !estObjetSimple(plots) ||
    !estNombreFiniPositif(plots.nbPlotsTotal, false) ||
    !estNombreFiniPositif(plots.densiteParM2, false)
  ) {
    return {
      erreur:
        "L'instantané des résultats techniques enregistré est invalide ou incomplet (données de plots manquantes).",
      status: 500,
    };
  }

  const fixations = raw.fixations;
  if (
    !estObjetSimple(fixations) ||
    !estNombreFiniPositif(fixations.nbVisOuClipsTotal, false) ||
    !estNombreFiniPositif(fixations.nbBoites, false)
  ) {
    return {
      erreur:
        "L'instantané des résultats techniques enregistré est invalide ou incomplet (données de fixations manquantes).",
      status: 500,
    };
  }

  const conformite = raw.conformite;
  if (
    !estObjetSimple(conformite) ||
    typeof conformite.statutGlobal !== "string" ||
    !STATUTS_DTU.has(conformite.statutGlobal) ||
    !Array.isArray(conformite.controles)
  ) {
    return {
      erreur:
        "L'instantané des résultats techniques enregistré est invalide ou incomplet (audit DTU manquant ou invalide).",
      status: 500,
    };
  }

  for (const ctrl of conformite.controles) {
    if (
      !estObjetSimple(ctrl) ||
      !estChaineNonVide(ctrl.titre) ||
      !estChaineNonVide(ctrl.regleDtu) ||
      !estChaineNonVide(ctrl.valeurConstatee) ||
      !estChaineNonVide(ctrl.recommandation) ||
      typeof ctrl.statut !== "string" ||
      !STATUTS_DTU.has(ctrl.statut)
    ) {
      return {
        erreur:
          "L'instantané des résultats techniques enregistré est invalide ou incomplet (point de contrôle DTU incomplet).",
        status: 500,
      };
    }
  }

  const chiffrage = raw.chiffrage;
  if (
    !estObjetSimple(chiffrage) ||
    !estNombreFiniPositif(chiffrage.totalHt, false) ||
    !Array.isArray(chiffrage.lignes) ||
    chiffrage.lignes.length === 0
  ) {
    return {
      erreur:
        "L'instantané des résultats techniques enregistré est invalide ou incomplet (chiffrage manquant ou vide).",
      status: 500,
    };
  }

  for (const ligne of chiffrage.lignes) {
    if (
      !estObjetSimple(ligne) ||
      !estChaineNonVide(ligne.code) ||
      !estChaineNonVide(ligne.categorie) ||
      !estChaineNonVide(ligne.designation) ||
      !estChaineNonVide(ligne.unite) ||
      !estNombreFiniPositif(ligne.quantite, false) ||
      !estNombreFiniPositif(ligne.prixUnitaireHt, false) ||
      !estNombreFiniPositif(ligne.totalHt, false)
    ) {
      return {
        erreur:
          "L'instantané des résultats techniques enregistré est invalide ou incomplet (ligne de chiffrage corrompue).",
        status: 500,
      };
    }
  }

  return { resultat: raw as unknown as ResultatCalculTerrasse };
}

export async function POST(_request: NextRequest, { params }: RouteProps) {
  const tenantRes = await resoudreTenant();
  if (!tenantRes.ok) return tenantRes.reponse;
  const { entrepriseId } = tenantRes;

  const { id: chantierId } = await params;
  const supabase = await createClient();

  const { data: chantier, error: errChantier } = await supabase
    .from("chantiers")
    .select("id, nom, clients(nom)")
    .eq("id", chantierId)
    .eq("entreprise_id", entrepriseId)
    .single();

  if (errChantier || !chantier) {
    return NextResponse.json({ error: "Chantier introuvable ou non autorisé" }, { status: 404 });
  }

  if (!estChaineNonVide(chantier.nom)) {
    return NextResponse.json(
      { error: "Le nom du chantier est manquant ou invalide pour l'export." },
      { status: 500 }
    );
  }

  // Lecture stricte de l'instantané persisté en base (sans recalcul indépendant ni surcharge par le body client)
  const { data: terrasseData, error: errTerrasse } = await supabase
    .from("chantier_terrasses")
    .select("*")
    .eq("chantier_id", chantierId)
    .eq("entreprise_id", entrepriseId)
    .order("created_at", { ascending: true })
    .limit(1)
    .maybeSingle();

  if (errTerrasse) {
    return NextResponse.json({ error: errTerrasse.message }, { status: 500 });
  }

  if (!terrasseData) {
    return NextResponse.json(
      { error: "Aucune terrasse configurée pour ce chantier" },
      { status: 404 }
    );
  }

  const validationConfig = validerConfigTerrasseExport(
    terrasseData as unknown as Record<string, unknown>
  );
  if ("erreur" in validationConfig) {
    return NextResponse.json({ error: validationConfig.erreur }, { status: 500 });
  }

  const validationResultat = validerInstantaneResultatsTechniques(
    (terrasseData as Record<string, unknown>).resultats_techniques
  );
  if ("erreur" in validationResultat) {
    return NextResponse.json(
      { error: validationResultat.erreur },
      { status: validationResultat.status }
    );
  }

  try {
    const nomChantier = chantier.nom.trim();
    const pdfBytes = await genererPdfTerrasse({
      terrasse: validationConfig.config,
      resultat: validationResultat.resultat,
      chantierNom: nomChantier,
      clientNom: (chantier.clients as unknown as { nom: string })?.nom,
    });

    const nomFichier = `terrasse-dtu51.4-${nomChantier.replace(/[^a-zA-Z0-9_-]/g, "_")}.pdf`;

    return new Response(Buffer.from(pdfBytes), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${nomFichier}"`,
      },
    });
  } catch (err: unknown) {
    console.error("[terrasse/export/pdf] Erreur génération :", err);
    return NextResponse.json(
      { error: "Erreur serveur lors de la génération du PDF terrasse" },
      { status: 500 }
    );
  }
}

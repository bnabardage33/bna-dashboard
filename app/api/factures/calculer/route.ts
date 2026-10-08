import { NextRequest, NextResponse } from "next/server";
import {
  calculerRetenueFacture,
  calculerSituationAvancement,
  validerTauxRetenue,
  type LigneFacturation,
} from "@/lib/retenueCalculs";

export const dynamic = "force-dynamic";
export const revalidate = 0;

/**
 * POST /api/factures/calculer
 *
 * Moteur de calcul et de simulation financière pour les factures et situations
 * avec retenue de garantie et ventilation multi-TVA (Loi n° 71-584).
 *
 * Source de vérité UNIQUE : délègue à `lib/retenueCalculs.ts`.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => null);

    if (!body || typeof body !== "object") {
      return NextResponse.json(
        { ok: false, error: "Corps de requête JSON invalide." },
        { status: 400 }
      );
    }

    const {
      lignes,
      retenue_garantie_pct,
      tva_defaut_pct,
      avancement_pct,
    } = body as {
      lignes?: LigneFacturation[];
      retenue_garantie_pct?: unknown;
      tva_defaut_pct?: unknown;
      avancement_pct?: unknown;
    };

    if (!Array.isArray(lignes)) {
      return NextResponse.json(
        { ok: false, error: "Le paramètre 'lignes' doit être un tableau." },
        { status: 400 }
      );
    }

    // 1) Validation du taux de retenue (plafond légal 5 % garanti)
    let tauxRetenue: number;
    try {
      tauxRetenue = validerTauxRetenue(retenue_garantie_pct);
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Taux de retenue invalide.";
      return NextResponse.json({ ok: false, error: msg }, { status: 400 });
    }

    // 2) Taux de TVA par défaut
    const tvaDefaut =
      typeof tva_defaut_pct === "number" ? tva_defaut_pct : undefined;

    // 3) Calcul : situation ou facture standard
    const isSituation =
      avancement_pct !== undefined &&
      avancement_pct !== null &&
      Number.isFinite(Number(avancement_pct));

    const resultat = isSituation
      ? calculerSituationAvancement(
          lignes,
          Number(avancement_pct),
          tauxRetenue,
          tvaDefaut ?? 10
        )
      : calculerRetenueFacture({
          lignes,
          retenue_garantie_pct: tauxRetenue,
          tva_defaut_pct: tvaDefaut,
        });

    return NextResponse.json({ ok: true, data: resultat }, { status: 200 });
  } catch (error) {
    console.error("Erreur POST /api/factures/calculer:", error);
    return NextResponse.json(
      { ok: false, error: "Erreur interne lors du calcul." },
      { status: 500 }
    );
  }
}

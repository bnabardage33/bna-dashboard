import { NextResponse } from 'next/server';
import { analyzeChantierHealth, ChantierHealthData } from '@/lib/bna-analyzer';

export async function POST(req: Request) {
  try {
    const data: ChantierHealthData = await req.json();

    // Basic validation
    if (
      typeof data.avancementPct !== 'number' ||
      typeof data.heuresConsommeesPct !== 'number'
    ) {
      return NextResponse.json({ error: "Données de santé invalides. Les champs 'avancementPct' et 'heuresConsommeesPct' sont requis." }, { status: 400 });
    }

    const analysis = analyzeChantierHealth(data);

    return NextResponse.json({
      success: true,
      data: analysis
    });

  } catch (error) {
    console.error("Erreur API analyze-chantier:", error);
    return NextResponse.json({ error: "Erreur lors de l'analyse du chantier." }, { status: 500 });
  }
}

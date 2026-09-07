"use server";

import { createServerClient } from "@supabase/ssr";

async function getSupabase() {
  const { cookies } = await import("next/headers");
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL || "",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          );
        },
      },
    }
  );
}

export async function validerPointageAvecMeteo(chantierId: string, equipeId: string, heures: number, dateSaisie: string, commentaire: string = "") {
  const supabase = await getSupabase();
  try {
    const { data: chantier, error: chantierErr } = await supabase
      .from('chantiers')
      .select('adresse_chantier')
      .eq('id', chantierId)
      .single();

    if (chantierErr) throw chantierErr;
    const adresse = chantier?.adresse_chantier || 'Paris, France';

    const apiKey = process.env.VISUALCROSSING_API_KEY;
    let precip = 0;
    let apiSuccess = false;

    if (apiKey) {
      try {
        const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(adresse)}/${dateSaisie}?unitGroup=metric&key=${apiKey}&contentType=json`;
        const res = await fetch(url);
        if (res.ok) {
          const meteoData = await res.json();
          precip = meteoData?.days?.[0]?.precip || 0;
          apiSuccess = true;
        } else {
          console.warn("Erreur appel Visual Crossing, utilisation du fallback.");
        }
      } catch (err) {
        console.warn("Erreur réseau Visual Crossing, utilisation du fallback.");
      }
    }

    let coef_meteo = 1.0;
    let meteo_relevee = 'Non relevée';

    if (apiSuccess) {
      if (precip < 1) {
        coef_meteo = 1.0;
        meteo_relevee = 'Clément';
      } else if (precip >= 1 && precip <= 3) {
        coef_meteo = 1.15;
        meteo_relevee = 'Pluie fine';
      } else if (precip > 3) {
        coef_meteo = 1.30;
        meteo_relevee = 'Grosse averse';
      }
    }

    let finalEquipeId: string | undefined = equipeId;
    if (equipeId === "00000000-0000-0000-0000-000000000000") {
      const { data: firstEquipe } = await supabase.from('equipe').select('id').limit(1).single();
      if (firstEquipe?.id) {
        finalEquipeId = firstEquipe.id;
      } else {
        finalEquipeId = undefined;
      }
    }

    const payload: Record<string, unknown> = {
      chantier_id: chantierId,
      volume_heures_declare: heures,
      date_saisie: dateSaisie,
      meteo_relevee: meteo_relevee,
      coef_meteo: coef_meteo,
      commentaire: commentaire
    };
    if (finalEquipeId) payload.equipe_id = finalEquipeId;

    const { error: insertErr } = await supabase
      .from('pointages_globaux')
      .insert(payload);

    if (insertErr) throw insertErr;

    return { success: true, precip, coef_meteo, meteo_relevee };

  } catch (error) {
    console.error("Détail erreur pointage:", error);
    return { success: false, error: (error as Error).message || "Erreur inconnue" };
  }
}

export async function supprimerPointageGlob(id: string) {
  const supabase = await getSupabase();
  try {
    const { error } = await supabase.from('pointages_globaux').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error("Erreur supprimer pointage:", error);
    return { success: false, error: (error as Error).message };
  }
}

export async function reinitialiserPointagesChantier(chantierId: string) {
  const supabase = await getSupabase();
  try {
    const { error } = await supabase.from('pointages_globaux').delete().eq('chantier_id', chantierId);
    if (error) throw error;
    return { success: true };
  } catch (error) {
    console.error("Erreur réinitialisation pointages chantier:", error);
    return { success: false, error: (error as Error).message };
  }
}

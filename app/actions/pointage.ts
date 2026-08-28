"use server";

import { createClient } from "@supabase/supabase-js";

// Mock Supabase Server Client setup for the action
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function validerPointageAvecMeteo(chantierId: string, equipeId: string, heures: number, commentaire: string = "") {
  try {
    // 1. Récupérer l'adresse du chantier
    const { data: chantier, error: chantierErr } = await supabase
      .from('chantiers')
      .select('adresse_chantier')
      .eq('id', chantierId)
      .single();
      
    if (chantierErr) throw chantierErr;

    const adresse = chantier?.adresse_chantier || 'Paris, France'; // fallback par défaut
    
    // 2. Fetch de l'API Météo (Visual Crossing) pour la date du jour
    const apiKey = process.env.VISUAL_CROSSING_API_KEY;
    let precip = 0;
    let apiSuccess = false;
    
    if (apiKey) {
      try {
        const url = `https://weather.visualcrossing.com/VisualCrossingWebServices/rest/services/timeline/${encodeURIComponent(adresse)}/today?unitGroup=metric&key=${apiKey}&contentType=json`;
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

    // 3. Barème de pénalité (Logique)
    let coef_meteo = 1.0;
    let meteo_relevee = 'Non relevée';

    if (apiSuccess) {
      if (precip < 1) {
        coef_meteo = 1.0;
        meteo_relevee = 'Clément'; // ☀️ Beau temps
      } else if (precip >= 1 && precip <= 3) {
        coef_meteo = 1.15;
        meteo_relevee = 'Pluie fine'; // 🌧️ Baisse de rendement
      } else if (precip > 3) {
        coef_meteo = 1.30;
        meteo_relevee = 'Grosse averse'; // ⛈️ Forte baisse
      }
    } else {
      // Fallback
      coef_meteo = 1.0;
      meteo_relevee = 'Non relevée';
    }

    // 4. Sauvegarde la saisie globale dans pointages_globaux
    const { error: insertErr } = await supabase
      .from('pointages_globaux')
      .insert({
        chantier_id: chantierId,
        equipe_id: equipeId,
        volume_heures_declare: heures,
        meteo_relevee: meteo_relevee,
        coef_meteo: coef_meteo,
        commentaire: commentaire
      });

    if (insertErr) throw insertErr;

    return { success: true, precip, coef_meteo, meteo_relevee };

  } catch (error) {
    console.error("Erreur validerPointageAvecMeteo:", error);
    return { success: false, error: "Erreur lors de la validation du pointage" };
  }
}

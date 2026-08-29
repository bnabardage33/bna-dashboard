"use server";

import { createClient } from "@supabase/supabase-js";

// Mock Supabase Server Client setup for the action
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

export async function validerPointageAvecMeteo(chantierId: string, equipeId: string, heures: number, dateSaisie: string, commentaire: string = "") {
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
    // Si equipeId est le faux uuid, on essaie de récupérer le premier utilisateur valide de l'équipe pour ne pas bloquer.
    let finalEquipeId = equipeId;
    if (equipeId === "00000000-0000-0000-0000-000000000000") {
      const { data: firstEquipe } = await supabase.from('equipe').select('id').limit(1).single();
      if (firstEquipe?.id) {
        finalEquipeId = firstEquipe.id;
      } else {
        // Fallback ultime : on essaie de ne pas l'insérer si la FK l'accepte
        finalEquipeId = undefined as any; 
      }
    }

    const payload: any = {
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

  } catch (error: any) {
    console.error("Détail erreur pointage:", error);
    return { success: false, error: error.message || "Erreur inconnue" };
  }
}

export async function supprimerPointageGlob(id: string) {
  try {
    const { error } = await supabase.from('pointages_globaux').delete().eq('id', id);
    if (error) throw error;
    return { success: true };
  } catch (error: any) {
    console.error("Erreur supprimer pointage:", error);
    return { success: false, error: error.message };
  }
}

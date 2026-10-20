"use client";

// components/ChantiersMeteoCards.tsx
//
// Composant MÉTÉO MÉTIER du projet. Il est conservé tel quel sur le fond :
//   - il lit `chantiers` en direct (chantiers non terminés) ;
//   - il demande la prévision à `GET /api/meteo` via `fetchMeteo` ;
//   - il applique `evaluerAlerteChantier` (lib/meteoAlerte.ts), c'est-à-dire
//     les seuils matériau × accès, pour une seule chose : l'« impact chantier ».
//
// ─── Ce qui a changé, et pourquoi ────────────────────────────────────────────
//
//  1. LA DONNÉE, hors production. `GET /api/meteo` n'interrogeait qu'une seule
//     source, VisualCrossing, dont la clé `VISUALCROSSING_API_KEY` est
//     volontairement stockée dans les variables Vercel et n'est PAS versionnée.
//     Hors Vercel, `.env.local` porte le placeholder `ta_cle_ici` de
//     `.env.example`, le fournisseur répond 401, la route répondait 502,
//     `fetchMeteo` levait, et le `catch` ci-dessous absorbait l'échec en
//     silence : « Météo indisponible pour cette adresse » sur tout poste de
//     développement. En production la clé réelle répond et ce chemin n'est pas
//     emprunté. La correction est dans la route (`app/api/meteo/route.ts` +
//     `lib/meteoOpenMeteo.ts`), PAS ici : ce composant ne connaît pas et ne
//     choisit pas sa source.
//
//  2. L'AFFICHAGE, partout. Même alimentée, la carte n'en montrait que deux
//     chiffres (`rafales`, `temp`) et jetait le reste : conditions, température
//     actuelle, min/max, cumul de pluie, alerte du jour. Le bloc ressemblait donc
//     à un état vide même lorsqu'il avait des données. Il affiche désormais ce
//     que la réponse contient déjà.
//
// La règle « jamais de faux chiffres » est respectée par la distinction
// `meteo: null` (rien reçu → état vide explicite) contre une prévision
// présente : tout chiffre affiché vient alors de la réponse, jamais d'un
// calcul de repli.
//
// ─── Rendu : la grille d'origine, à l'identique ────────────────────────────
//
// Ces cartes sont nées sur `/terrain/meteo`, dans le conteneur
// `mx-auto max-w-5xl` du `terrain/layout.tsx`, avec la grille
// `grid gap-3 sm:grid-cols-2`. C'est cette grille qu'elles gardent ici.
//
// Une tentative de « correction » avait été faite — passer la rangée en
// `flex flex-wrap justify-center` pour qu'une carte seule se centre au lieu de
// laisser la moitié droite vide. C'est un changement de comportement, pas un
// correctif de mise en page : la carte quittait sa colonne de grille pour
// aller au centre de l'écran, ce qui n'a jamais été le rendu d'origine. La
// grille est donc revenue, et la carte a retrouvé ses classes d'origine —
// sans largeur ajoutée.
//
// Aucune donnée, aucune source météo, aucun calcul d'impact n'est touché :
// la seule modification de la phase de rendu est le `max-w-7xl` du
// conteneur, porté par `app/page.tsx`.

import { useEffect, useState } from "react";
import Link from "next/link";
import { CloudRain, Droplets, Gauge, MapPin, Thermometer, Wind } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { fetchMeteo, type JourMeteo } from "@/lib/meteo";
import { emojiWmo } from "@/lib/meteoOpenMeteo";
import { evaluerAlerteChantier, type Materiau, type Acces } from "@/lib/meteoAlerte";

// NB : la génération des rapports intempéries ne se fait plus ici.
// Elle tourne côté serveur, une fois par jour en fin de journée, via
// l'Edge Function supabase/functions/generer-rapports-intemperies
// (planifiée par cron_rapports_intemperies.sql). Ce composant se contente
// d'afficher le risque technique en temps réel quand quelqu'un ouvre l'appli.

type Niveau = "vert" | "jaune" | "orange" | "rouge" | "inconnu";

/** Une carte = un chantier + sa prévision, ou un chantier sans prévision. */
type ChantierMeteo = {
  id: string;
  nom: string | null;
  adresse: string | null;
  materiau: Materiau;
  acces: Acces;
  zoneVent: number;
  niveau: Niveau;
  motif: string;
  /**
   * Prévision du jour, ou `null` si elle n'a pas pu être obtenue. `null` n'est
   * jamais remplacé par un objet à zéros : il déclenche un état vide qui dit
   * que la donnée manque, au lieu d'afficher « 0 km/h · 0 mm » comme si le
   * chantier était sous un ciel dégagé.
   */
  meteo: JourMeteo | null;
  /** Métier : ce que la météo implique pour la pose, matériau × accès. */
  impact: string | null;
};

const COULEURS: Record<Niveau, string> = {
  vert: "border-emerald-500/40 bg-emerald-500/10",
  jaune: "border-amber-500/40 bg-amber-500/10",
  orange: "border-orange-500/40 bg-orange-500/10",
  rouge: "border-red-500/40 bg-red-500/10",
  inconnu: "border-white/10 bg-[#1E1E1E]",
};

const EMOJIS: Record<Niveau, string> = {
  vert: "🟢",
  jaune: "🟡",
  orange: "🟠",
  rouge: "🔴",
  inconnu: "⚪",
};

const LIBELLES_NIVEAU: Record<Niveau, string> = {
  vert: "Conditions normales",
  jaune: "Vigilance",
  orange: "Conditions difficiles",
  rouge: "Pose interdite",
  inconnu: "Météo indisponible",
};

/**
 * Habillage de la pastille d'état. Même code couleur que la carte, mais avec
 * un texte contrasté : l'état de pose doit rester lisible sans dépendre de la
 * seule couleur de fond.
 */
const PASTILLES_NIVEAU: Record<Niveau, string> = {
  vert: "border-emerald-500/40 bg-emerald-500/10 text-emerald-300",
  jaune: "border-amber-500/40 bg-amber-500/10 text-amber-300",
  orange: "border-orange-500/40 bg-orange-500/10 text-orange-300",
  rouge: "border-red-500/40 bg-red-500/10 text-red-300",
  inconnu: "border-white/15 bg-white/[0.04] text-gray-400",
};

/**
 * Ordre d'AFFICHAGE : les risques critiques d'abord. C'est une présentation,
 * pas une règle métier — les niveaux eux-mêmes viennent tous de
 * `evaluerAlerteChantier`, qui n'est pas modifié.
 */
const ORDRE_NIVEAU: Record<Niveau, number> = {
  rouge: 0,
  orange: 1,
  jaune: 2,
  vert: 3,
  inconnu: 4,
};

/**
 * L'alerte GÉNÉRALE de la journée (rafales / pluie / chaleur sur le site), dont
 * le calcul est fait par la route `/api/meteo` — distincte de l'impact CHANTIER
 * (matériau × accès), qui reste l'information déterminante.
 *
 * Les mots-clefs techniques de l'API sont traduits : « jaune » seul, sans
 * conséquence, ne veut rien dire pour un chef d'équipe.
 */
const LIBELLES_ALERTE_JOUR: Record<string, string> = {
  vert: "Jour : RAS",
  jaune: "Jour : vigilance",
  orange: "Jour : difficile",
  rouge: "Jour : pose interdite",
};

/** Pictogramme du ciel, pour la source qui a répondu. */
function pictogramme(meteo: JourMeteo): string {
  // `icon` n'est pas comparable d'une source à l'autre : chez VisualCrossing
  // c'est un nom d'icône, chez Open-Meteo un code WMO. La route annonce
  // laquelle a répondu via `source` ; on ne devine pas.
  if (meteo.source === "open-meteo") {
    const code = Number.parseInt(meteo.icon, 10);
    return emojiWmo(Number.isNaN(code) ? null : code);
  }
  return "⛅";
}

/**
 * Une mesure chiffrée avec son libellé VISIBLE.
 *
 * Le libellé n'est pas seulement dans un `title` : sur téléphone, il n'y a pas
 * de survol. « Vent » et « Rafales » restent donc distincts à l'écran.
 * `valeur === null` → tiret, jamais un 0 inventé.
 */
function Mesure({
  icone,
  label,
  valeur,
  titre,
}: {
  icone: React.ReactNode;
  label: string;
  valeur: string | null;
  titre?: string;
}) {
  return (
    <div className="rounded-lg bg-[#1E1E1E] px-2 py-1.5" title={titre}>
      <p className="flex items-center gap-1 text-4xs font-bold uppercase tracking-wider text-gray-500">
        <span aria-hidden className="shrink-0">{icone}</span>
        <span className="truncate">{label}</span>
      </p>
      <p className="mt-0.5 truncate text-xs font-semibold text-gray-200">{valeur ?? "—"}</p>
    </div>
  );
}

export default function ChantiersMeteoCards() {
  const [chantiers, setChantiers] = useState<ChantierMeteo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function charger() {
      setLoading(true);

      // FIX BDD : Ajout de 'zone_vent' dans le select
      const { data, error } = await supabase
        .from("chantiers")
        .select("id, nom, adresse_chantier, materiau_structurel, moyen_acces, statut, zone_vent")
        .neq("statut", "termine");

      if (error || !data) {
        console.error(error);
        setLoading(false);
        return;
      }

      type ChantierSupabase = {
        id: string;
        nom: string | null;
        adresse_chantier: string | null;
        materiau_structurel: string | null;
        moyen_acces: string | null;
        statut: string;
        zone_vent: string | null;
      };

      const resultats = await Promise.all(
        (data as unknown as ChantierSupabase[]).map(async (ch) => {
          const adresse = ch.adresse_chantier as string | null;
          const zoneVent = ch.zone_vent ? Number(ch.zone_vent) : 1; // Sécurité fallback zone 1
          const materiau = (ch.materiau_structurel ?? "bois") as Materiau;
          const acces = (ch.moyen_acces ?? "echafaudage") as Acces;

          // Sans adresse, aucune prévision n'est demandée : ce n'est pas un
          // échec technique, c'est une fiche chantier incomplète.
          if (!adresse) {
            return {
              id: ch.id,
              nom: ch.nom,
              adresse: null,
              materiau,
              acces,
              zoneVent,
              niveau: "inconnu" as const,
              motif: "Pas d'adresse renseignée pour ce client.",
              meteo: null,
              impact: null,
            };
          }

          let meteo: JourMeteo | null = null;
          // Motif affiché si la prévision n'arrive pas : par défaut l'état
          // vide, mais si la route explique une localisation non validée, on
          // préfère SON message — c'est ce qui permet de corriger l'adresse au
          // lieu de croire à une panne.
          let motifMeteo = "Météo indisponible pour cette adresse.";
          try {
            meteo = await fetchMeteo(adresse);
          } catch (e) {
            if (e instanceof Error && e.message) motifMeteo = e.message;
            // Trace explicite : ce chemin est la cause historique du
            // « Météo indisponible » généralisé, il ne doit plus être muet.
            console.error(
              "ChantiersMeteoCards : prévision impossible pour « %s » — %s",
              adresse,
              e instanceof Error ? e.message : e,
            );
          }

          if (!meteo) {
            return {
              id: ch.id,
              nom: ch.nom,
              adresse,
              materiau,
              acces,
              zoneVent,
              niveau: "inconnu" as const,
              motif: motifMeteo,
              meteo: null,
              impact: null,
            };
          }

          // Impact CHANTIER : seuils matériau × accès, appliqués aux mesures
          // réellement reçues. C'est la logique métier existante, inchangée.
          const rafalesMax = Math.max(meteo.matin.rafales, meteo.apresMidi.rafales);
          const tempMax = Math.max(meteo.matin.temp, meteo.apresMidi.temp);
          const pluieCumul = meteo.cumulPluie ?? meteo.heures.reduce((s, h) => s + h.pluie, 0);

          // Note : l'angle d'exposition est géré dynamiquement par zone de
          // façade dans `chantier_zones`, pas dans la table racine `chantiers`.
          const alerte = evaluerAlerteChantier(materiau, acces, {
            rafalesMax,
            tempMax,
            pluieCumul,
          });

          return {
            id: ch.id,
            nom: ch.nom,
            adresse,
            materiau,
            acces,
            zoneVent,
            // Le niveau affiché est celui de l'alerte CHANTIER (matériau ×
            // accès), pas celui de l'alerte générale de la journée : c'est le
            // second qui décide si l'équipe peut poser.
            niveau: alerte.niveau as Niveau,
            motif: alerte.motif,
            meteo,
            impact: alerte.motif,
          };
        })
      );

      setChantiers(resultats as ChantierMeteo[]);
      setLoading(false);
    }

    charger();
  }, []);

  if (loading) {
    return (
      <SurfaceVide>
        <p className="text-sm text-gray-400">Chargement de la météo des chantiers…</p>
      </SurfaceVide>
    );
  }

  if (chantiers.length === 0) {
    return (
      <SurfaceVide>
        <p className="text-sm text-gray-500">Aucun chantier actif pour l&apos;instant.</p>
      </SurfaceVide>
    );
  }

  const chantiersTries = [...chantiers].sort(
    (a, b) => ORDRE_NIVEAU[a.niveau] - ORDRE_NIVEAU[b.niveau],
  );

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {chantiersTries.map((ch) => {
        const m = ch.meteo;
        const ventMoyen = m ? Math.max(m.matin.vent, m.apresMidi.vent) : null;
        const rafales = m ? Math.max(m.matin.rafales, m.apresMidi.rafales) : null;

        return (
          <Link
            key={ch.id}
            href={`/terrain/chantier/${ch.id}`}
            className={`rounded-xl border p-3 transition-colors hover:border-white/25 sm:p-4 ${COULEURS[ch.niveau]}`}
          >
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="line-clamp-2 font-semibold leading-snug text-white">
                  {ch.nom || "Chantier"}
                </p>
                {ch.adresse && (
                  <p className="mt-0.5 flex items-center gap-1 text-2xs text-gray-400">
                    <MapPin className="h-3 w-3 shrink-0" aria-hidden />
                    <span className="truncate">{ch.adresse}</span>
                  </p>
                )}
              </div>
              <span className="shrink-0 text-xl" title={LIBELLES_NIVEAU[ch.niveau]} aria-hidden>
                {m ? pictogramme(m) : EMOJIS[ch.niveau]}
              </span>
            </div>

            {/* ── État de pose + zone ──────────────────────────────────── */}
            <div className="mt-2 flex flex-wrap items-center gap-1.5">
              <span className={`rounded-full border px-2 py-0.5 text-2xs font-bold ${PASTILLES_NIVEAU[ch.niveau]}`}>
                {EMOJIS[ch.niveau]} {LIBELLES_NIVEAU[ch.niveau]}
              </span>
              <span className="rounded bg-[#1E1E1E] px-1.5 py-0.5 text-4xs font-semibold text-gray-400">
                Zone {ch.zoneVent}
              </span>
            </div>
            <p className="mt-1.5 line-clamp-2 text-xs leading-snug text-gray-400">
              {ch.impact ?? ch.motif}
            </p>

            {/* ── La météo, quand elle existe ──────────────────────────── */}
            {m ? (
              <div className="mt-2.5 border-t border-white/10 pt-2.5">
                <div className="flex items-center gap-2">
                  <span className="text-xl" aria-hidden>
                    {pictogramme(m)}
                  </span>
                  <span className="text-xl font-black text-white">{m.tempActuelle}°C</span>
                  <span className="truncate text-2xs text-gray-300">{m.conditions}</span>
                </div>

                <div className="mt-2 grid grid-cols-2 gap-1.5">
                  <Mesure
                    icone={<Thermometer className="h-3 w-3" />}
                    label="Min / max"
                    valeur={`${m.tempMinJour}° / ${m.tempMaxJour}°`}
                  />
                  <Mesure
                    icone={<Droplets className="h-3 w-3" />}
                    label="Pluie du jour"
                    valeur={m.cumulPluie !== undefined ? `${m.cumulPluie} mm` : null}
                  />
                  <Mesure
                    icone={<Wind className="h-3 w-3" />}
                    label="Vent moyen"
                    valeur={ventMoyen !== null ? `${ventMoyen} km/h` : null}
                  />
                  <Mesure
                    icone={<Gauge className="h-3 w-3" />}
                    label="Rafales"
                    valeur={rafales !== null ? `${rafales} km/h` : null}
                  />
                  <div className="col-span-2">
                    <Mesure
                      icone={<CloudRain className="h-3 w-3" />}
                      label="Alerte jour"
                      valeur={LIBELLES_ALERTE_JOUR[m.alerte.niveau] ?? null}
                      titre={`Alerte météo générale — ${m.alerte.motif}`}
                    />
                  </div>
                </div>
              </div>
            ) : (
              <p className="mt-2.5 rounded-lg border border-dashed border-white/10 px-2 py-1.5 text-2xs text-gray-500">
                Aucune donnée météo disponible — conditions et impact non déterminés.
              </p>
            )}
          </Link>
        );
      })}
    </div>
  );
}

/** Conteneur d'un état transitoire ou vide — pas une carte de chantier. */
function SurfaceVide({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-white/10 bg-[#1E1E1E]/40 p-6 text-center">
      {children}
    </div>
  );
}

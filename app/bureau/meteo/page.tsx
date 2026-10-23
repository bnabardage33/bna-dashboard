"use client";

import { useEffect, useState } from "react";
import { CloudSun, Mail, ShieldAlert } from "lucide-react";
import { Surface } from '@/components/ui/Surface';
import { SEUILS_ACCES, SEUILS_MATERIAUX } from "@/lib/meteoAlerte";
import { SEUIL_GEL_C, SEUIL_PLUIE_MM } from "@/lib/intemperiesSeuils";

type JourIntemperie = {
  date: string;
  /**
   * Cumul journalier de précipitations (mm) — P5 : `null` vaut « inconnu /
   * indisponible », affiché « — ». Une donnée absente n'est JAMAIS un « 0 mm »
   * qui se lirait comme un temps sec garanti.
   */
  pluie: number | null;
  vent: number;
  tempMin: number;
  intemperie: boolean;
  raisons: string[];
};

type ChantierMeteo = {
  id: string;
  nom: string;
  location: string;
  geocoded: boolean;
  erreurLocalisation?: string | null;
  jours: JourIntemperie[];
  intemperieAujourdhui: boolean;
  intemperiesProchainesJours: boolean;
  emailClient: string | null;
};

type ReponseMeteo = {
  jourAujourdhui: string;
  chantiers: ChantierMeteo[];
  nbIntemperies: number;
};

const fmtDate = (iso: string) => {
  const d = new Date(iso + "T12:00:00");
  return d.toLocaleDateString("fr-FR", { weekday: "short", day: "numeric", month: "short" });
};

// P5 — le sous-titre annonce les seuils RÉELLEMENT appliqués par
// `/api/meteo/intemperies` : pluie et gel viennent des constantes partagées
// (`lib/intemperiesSeuils.ts`, les mêmes que la route) ; le seuil de vent est
// calculé par chantier comme `min(matériau, accès)` dans le barème partagé
// `lib/meteoAlerte.ts` — on n'en affiche donc que la PLAGE réelle, dérivée des
// mêmes tables. Aucun chiffre inventé, aucune valeur recopiée à la main.
const SEUILS_VENT_MATERIAU = Object.values(SEUILS_MATERIAUX).map((s) => s.vent_critique);
const SEUILS_VENT_ACCES = Object.values(SEUILS_ACCES).map((s) => s.vent_critique);
/** Seuil de vent critique le plus bas appliqué par la route (sur toutes les combinaisons matériau × accès). */
const VENT_MIN_CHANTIER = Math.min(...SEUILS_VENT_MATERIAU, ...SEUILS_VENT_ACCES);
/** Seuil de vent critique le plus haut : borne par le `min` métier, jamais au-delà du barème. */
const VENT_MAX_CHANTIER = Math.min(
  Math.max(...SEUILS_VENT_MATERIAU),
  Math.max(...SEUILS_VENT_ACCES),
);

export default function BureauMeteoPage() {
  const [chantiers, setChantiers] = useState<ChantierMeteo[]>([]);
  const [loading, setLoading] = useState(true);
  const [verificationEnCours, setVerificationEnCours] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);

  async function charger() {
    try {
      const res = await fetch("/api/meteo/intemperies");
      if (!res.ok) throw new Error("Erreur API météo");
      const data: ReponseMeteo = await res.json();
      setChantiers(data.chantiers ?? []);
    } catch (err) {
      setFeedback("⚠️ " + (err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    charger();
  }, []);

  async function verifier() {
    setVerificationEnCours(true);
    setFeedback(null);
    try {
      const res = await fetch("/api/meteo/intemperies", { method: "POST" });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur");
      const msg = data.rapportes.length > 0
        ? `✓ ${data.rapportes.length} chantier(s) arrêté(s) déclaré(s) : ${data.rapportes.join(", ")}`
        : data.intemperies.length > 0
        ? `ℹ️ ${data.intemperies.length} intempérie(s) détectée(s), trace déjà enregistrée`
        : "✓ Aucune intempérie aujourd'hui — plein de travail !";
      setFeedback(msg);
      await charger();
    } catch (err) {
      setFeedback("⚠️ " + (err as Error).message);
    } finally {
      setVerificationEnCours(false);
    }
  }

  function notifierClient(ch: ChantierMeteo) {
    const sujet = "Chantier à l'arrêt — intempérie du " + fmtDate(ch.jours[0]?.date ?? "");
    const corps = [
      `Bonjour,`,
      ``,
      `Nous vous informons que le chantier « ${ch.nom} » est à l'arrêt aujourd'hui à cause des conditions météo (${ch.jours[0]?.raisons.join(", ") || "intempérie"}).`,
      ``,
      `Reprise prévue de la prestation demain.`,
      ``,
      `Cordialement,`,
    ].join("\n");

    if (ch.emailClient) {
      window.location.href = `mailto:${ch.emailClient}?subject=${encodeURIComponent(sujet)}&body=${encodeURIComponent(corps)}`;
    } else {
      navigator.clipboard?.writeText(`${sujet}\n\n${corps}`).then(() => {
        setFeedback("✓ Pas d'email client renseigné — message copié dans le presse-papier");
      });
    }
  }

  const nbIntemp = chantiers.filter((c) => c.intemperieAujourdhui).length;

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-white">Veille Météo Intempéries</h1>
          <p className="text-xs text-gray-400">
            {`Pluie > ${SEUIL_PLUIE_MM} mm (pendant les horaires de pose si lisibles, sinon sur la journée) · Vent > seuil chantier (matériau × accès, ${VENT_MIN_CHANTIER} à ${VENT_MAX_CHANTIER} km/h) · Gel < ${SEUIL_GEL_C} °C — détection auto (Open-Meteo) et trace légale`}
          </p>
        </div>
        <button
          onClick={verifier}
          disabled={verificationEnCours}
          className="flex items-center gap-2 rounded-xl bg-red-600 px-4 py-2 text-xs font-bold text-white shadow-lg shadow-red-600/10 transition-all hover:bg-red-700 disabled:opacity-50"
        >
          <CloudSun size={16} />
          {verificationEnCours ? "Vérification…" : "Vérifier intempéries du jour"}
        </button>
      </div>

      {feedback && (
        <Surface className="px-4 py-3 text-sm font-semibold text-gray-200">
          {feedback}
        </Surface>
      )}

      {nbIntemp > 0 && (
        <div className="flex items-center gap-3 rounded-xl border border-red-500/40 bg-red-950/20 px-4 py-3 text-sm font-bold text-red-400">
          <ShieldAlert size={18} />
          {nbIntemp} chantier(s) impraticable(s) aujourd'hui — trace intempérie enregistrée.
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-white/10 bg-[#1E1E1E]/40 p-12 text-center text-xs text-gray-400">
          Chargement de la météo des chantiers…
        </div>
      ) : chantiers.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-white/10 bg-[#1E1E1E]/30 p-12 text-center space-y-3">
          <p className="text-sm font-medium text-gray-400">Aucun chantier en cours. La veille intempéries reprendra dès qu'un chantier démarrera.</p>
        </div>
      ) : (
        <div className="grid gap-3.5 sm:grid-cols-2">
          {chantiers.map((ch) => (
            <div
              key={ch.id}
              className={`flex flex-col justify-between rounded-2xl border bg-[#1E1E1E] p-4.5 shadow-md transition-all ${
                ch.intemperieAujourdhui ? "border-red-500/60 bg-red-950/10" : "border-white/10"
              }`}
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h2 className="text-base font-bold text-white">{ch.nom}</h2>
                    <p className="text-xs text-gray-400">{ch.location}</p>
                  </div>
                  <span
                    className={`shrink-0 rounded-full border px-2.5 py-1 text-2xs font-bold uppercase tracking-wider ${
                      ch.intemperieAujourdhui
                        ? "border-red-500/40 text-red-400"
                        : "border-emerald-500/40 text-emerald-400"
                    }`}
                  >
                    {ch.intemperieAujourdhui ? "⛔ Intempérie" : "✅ Travail possible"}
                  </span>
                </div>

                {ch.erreurLocalisation && (
                  <div className="rounded-xl border border-amber-500/40 bg-amber-950/20 px-3 py-2 text-2xs font-semibold text-amber-300">
                    📍 {ch.erreurLocalisation}
                  </div>
                )}

                <div className="space-y-1.5">
                  {ch.jours.slice(0, 4).map((j) => (
                    <div
                      key={j.date}
                      className={`flex items-center justify-between rounded-xl border px-3 py-2 text-xs ${
                        j.intemperie ? "border-red-500/30 bg-red-950/20" : "border-white/10 bg-transparent"
                      }`}
                    >
                      <div className={j.intemperie ? "font-bold text-red-400" : "font-semibold text-gray-300"}>
                        {fmtDate(j.date)}
                      </div>
                      <div className="flex items-center gap-3 font-mono text-3xs text-gray-400">
                        <span title="Précipitations">
                          💧 {j.pluie === null ? "—" : `${j.pluie}mm`}
                        </span>
                        <span title="Vent">💨 {j.vent} km/h</span>
                        <span title="Température min">🌡️ {j.tempMin}°C</span>
                      </div>
                      <div className="max-w-[40%] text-right text-2xs font-bold text-red-400">
                        {j.intemperie ? j.raisons.join(" · ") : "OK"}
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {ch.intemperieAujourdhui && (
                <button
                  onClick={() => notifierClient(ch)}
                  className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-xs font-bold text-gray-200 transition-colors hover:border-red-600/50 hover:bg-red-600/10 hover:text-red-400"
                >
                  <Mail size={14} />
                  Notifier client
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
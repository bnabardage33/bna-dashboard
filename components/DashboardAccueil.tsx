'use client';

import { useState, type ReactNode } from 'react';
import Link from 'next/link';
import {
  FileText,
  Mic,
  ArrowRight,
  HardHat,
  Bell,
  CloudSun,
  MapPin,
  CalendarDays,
  Loader2,
} from 'lucide-react';
import BoutonMicroNote, { type EtatBoutonMicro } from '@/components/BoutonMicroNote';
import { supabase } from '@/lib/supabase';
import { resoudreContexteEntreprise } from '@/lib/contexteEntreprise';
import { badgeMetierConfig } from '@/lib/fournisseursCommandes';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string | null): value is string {
  return typeof value === 'string' && UUID_RE.test(value);
}

export type Note = {
  id: string;
  titre: string | null;
  contenu: string;
  created_at: string | null;
};

type ChantierAPreparer = {
  id: string;
  nom: string | null;
  adresse: string | null;
  metier?: string | null;
};

type Notification = {
  id: string;
  titre: string;
  message: string | null;
  lien: string | null;
  lu: boolean | null;
  created_at: string | null;
};

type PhaseDictee = 'enregistrement' | 'transcription' | 'reformulation' | 'erreur';

interface DashboardAccueilProps {
  notesInitiales: Note[];
  /** Chantiers au statut `prevu`. Absent = bloc omis (page rendue sans serveur). */
  chantiersAPreparer?: ChantierAPreparer[];
  /** Dernières notifications. Absent = bloc omis. */
  notifications?: Notification[];
  /** Nœud « impact météo » déjà rendu par le serveur. */
  blocMeteo?: ReactNode;
}

function urlHubChantier(id: string, metier?: string | null): string {
  if (metier === 'terrasse') return `/terrain/terrasse/${id}`;
  if (metier === 'cloture') return `/terrain/cloture/${id}`;
  return `/terrain/chantier/${id}`;
}

function normaliserLienNotification(lien: string | null): string | null {
  if (!lien) return null;
  if (lien.startsWith('/bureau/fournisseurs?retard=')) {
    const id = lien.slice('/bureau/fournisseurs?retard='.length);
    return `/bureau/fournisseurs?tab=commandes&retard=${id}`;
  }
  return lien;
}

export default function DashboardAccueil({
  notesInitiales,
  chantiersAPreparer,
  notifications,
  blocMeteo,
}: DashboardAccueilProps) {
  const [dernieresNotes, setDernieresNotes] = useState<Note[]>(notesInitiales);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [phaseDictee, setPhaseDictee] = useState<PhaseDictee | null>(null);
  const [texteDictee, setTexteDictee] = useState('');
  const [erreurDictee, setErreurDictee] = useState<string | null>(null);

  async function handleTexteReformule(texte: string) {
    setIsSavingNote(true);
    const titreExtrait = texte.split('.')[0].slice(0, 40) + '...';

    try {
      const { entreprise_id } = await resoudreContexteEntreprise(null);

      if (!estUuid(entreprise_id)) {
        setError(
          "Impossible d'enregistrer la note : votre session ne contient pas d'entreprise identifiée. Reconnectez-vous et réessayez."
        );
        console.error(
          'Accueil : note patron NON enregistrée — contexte entreprise introuvable ou invalide dans la session.'
        );
        return;
      }

      const { data, error: err } = await supabase
        .from('notes_patron')
        .insert({
          titre: titreExtrait,
          contenu: texte,
          entreprise_id,
        })
        .select();

      if (err) {
        setError('Erreur lors de la sauvegarde de la note : ' + err.message);
        console.error('Accueil : note patron NON enregistrée.', err);
        return;
      }

      if (data) {
        setDernieresNotes((prev) => [data[0], ...prev].slice(0, 3));
      }
    } catch (err) {
      setError((err as Error).message || 'Erreur lors de la sauvegarde');
      console.error(err);
    } finally {
      setIsSavingNote(false);
    }
  }

  function handleEtatDictee(etat: EtatBoutonMicro) {
    if (etat === 'inactif') {
      setPhaseDictee(null);
      return;
    }
    if (etat === 'enregistrement') {
      setTexteDictee('');
      setErreurDictee(null);
    }
    setPhaseDictee(etat);
  }

  const bulleVisible = phaseDictee !== null || isSavingNote;

  const titreBulle =
    phaseDictee === 'enregistrement'
      ? 'Écoute en cours — appuyez sur « Arrêter » pour terminer.'
      : phaseDictee === 'transcription'
        ? 'Transcription de votre note…'
        : phaseDictee === 'reformulation'
          ? 'Reformulation en cours…'
          : phaseDictee === 'erreur'
            ? 'La dictée a échoué'
            : 'Enregistrement de la note…';

  const nonLues = notifications?.filter((n) => !n.lu).length ?? 0;

  return (
    <div className="space-y-5 text-[#F5EFEA]">
      {/* ── 1. Actions rapides terrain ───────────────────────────────────── */}
      <header className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 sm:p-5 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-[#F5EFEA] sm:text-lg">
              Actions rapides du jour
            </h2>
            <p className="text-xs text-[#B8A99E]">
              Dictée vocale instantanée, planning consolidé et bulletin météo complet.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="shrink-0">
              <BoutonMicroNote
                onTexteReformule={handleTexteReformule}
                onErreur={setErreurDictee}
                onEtat={handleEtatDictee}
                onTranscription={setTexteDictee}
              />
            </div>
            <Link
              href="/terrain"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-[#120F0D] px-3.5 py-2 text-xs font-bold text-[#F5EFEA] transition-colors hover:border-[#D96B27]/40 hover:bg-[#221B17]"
            >
              <CalendarDays className="h-4 w-4 text-[#D96B27]" />
              Planning multi-métiers
            </Link>
            <Link
              href="/terrain/meteo"
              className="inline-flex min-h-10 items-center gap-1.5 rounded-xl border border-white/10 bg-[#120F0D] px-3.5 py-2 text-xs font-bold text-[#F5EFEA] transition-colors hover:border-[#D96B27]/40 hover:bg-[#221B17]"
            >
              <CloudSun className="h-4 w-4 text-[#D96B27]" />
              Météo complète
            </Link>
          </div>
        </div>

        {bulleVisible && (
          <div
            role="status"
            aria-live="polite"
            className={`mt-3 rounded-xl border p-3 text-xs ${
              phaseDictee === 'erreur'
                ? 'border-red-200 bg-red-500/15 text-red-300'
                : 'border-[#D96B27]/30 bg-[#D96B27]/10 text-[#F5EFEA]'
            }`}
          >
            <div className="flex items-center gap-2 font-semibold">
              {phaseDictee === 'transcription' || phaseDictee === 'reformulation' || isSavingNote ? (
                <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[#D96B27]" />
              ) : (
                <Mic className="h-4 w-4 shrink-0 text-[#D96B27]" />
              )}
              <span>{titreBulle}</span>
            </div>
            {texteDictee && (
              <p className="mt-1.5 whitespace-pre-wrap text-[#B8A99E]">{texteDictee}</p>
            )}
            {erreurDictee && <p className="mt-1 font-medium text-red-300">{erreurDictee}</p>}
          </div>
        )}

        {error && (
          <p className="mt-3 rounded-xl border border-red-200 bg-red-500/15 p-3 text-xs font-medium text-red-300">
            {error}
          </p>
        )}
      </header>

      {/* ── 3. Impact météo sur les chantiers actifs (compact, sans doublon) ── */}
      {blocMeteo && (
        <section className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 sm:p-5 shadow-xs">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="flex items-center gap-2 text-base font-bold text-[#F5EFEA] sm:text-lg">
              <CloudSun className="h-5 w-5 shrink-0 text-[#D96B27]" />
              Impact météo sur les chantiers actifs
            </h2>
            <Link
              href="/terrain/meteo"
              className="flex shrink-0 items-center gap-1 text-xs font-bold text-[#D96B27] hover:underline"
            >
              Prévisions complètes <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
          {blocMeteo}
        </section>
      )}

      {/* ── 4. Cockpit Quotidien en 2 colonnes ────────────────────────────── */}
      {(chantiersAPreparer || notifications || dernieresNotes) && (
        <div className="grid grid-cols-1 items-start gap-5 lg:grid-cols-2">
          {/* Colonne gauche : Chantiers à préparer */}
          {chantiersAPreparer && (
            <section className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 sm:p-5 shadow-xs">
              <div className="mb-3 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-bold text-[#F5EFEA]">
                  <HardHat className="h-5 w-5 shrink-0 text-[#D96B27]" />
                  Chantiers à préparer
                </h2>
                <Link
                  href="/terrain"
                  className="flex shrink-0 items-center gap-1 text-xs font-bold text-[#D96B27] hover:underline"
                >
                  Planning <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {chantiersAPreparer.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-[#120F0D] p-4 text-center text-xs text-[#8E7F74]">
                  Aucun chantier en attente de préparation.
                </div>
              ) : (
                <ul className="space-y-2.5">
                  {chantiersAPreparer.map((c) => {
                    const badge = badgeMetierConfig(c.metier);
                    return (
                      <li key={c.id}>
                        <Link
                          href={urlHubChantier(c.id, c.metier)}
                          className="group block rounded-xl border border-white/10 bg-[#120F0D] p-3.5 transition-all hover:border-[#D96B27]/50 hover:bg-[#221B17]"
                        >
                          <div className="flex items-start justify-between gap-2">
                            <div className="min-w-0">
                              <span
                                className={`inline-block rounded-full border px-2 py-0.5 text-[10px] font-bold ${badge.badgeClass}`}
                              >
                                {badge.label}
                              </span>
                              <p className="mt-1 line-clamp-2 text-sm font-bold text-[#F5EFEA] group-hover:text-[#D96B27]">
                                {c.nom || 'Chantier sans nom'}
                              </p>
                            </div>
                            <ArrowRight className="h-4 w-4 shrink-0 text-[#8E7F74] transition-transform group-hover:translate-x-1 group-hover:text-[#D96B27]" />
                          </div>
                          {c.adresse && (
                            <p className="mt-1 flex items-center gap-1 text-xs text-[#B8A99E]">
                              <MapPin className="h-3 w-3 shrink-0 text-[#8E7F74]" />
                              <span className="truncate">{c.adresse}</span>
                            </p>
                          )}
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          )}

          {/* Colonne droite : Alertes & Dernières notes */}
          <section className="rounded-2xl border border-white/10 bg-[#1B1511] p-4 sm:p-5 shadow-xs space-y-5">
            {notifications && (
              <div>
                <div className="mb-2.5 flex items-center justify-between gap-2">
                  <h2 className="flex items-center gap-2 text-base font-bold text-[#F5EFEA]">
                    <Bell className="h-5 w-5 shrink-0 text-[#D96B27]" />
                    Alertes
                  </h2>
                  {nonLues > 0 && (
                    <span className="shrink-0 rounded-full bg-[#D96B27] px-2.5 py-0.5 text-[11px] font-bold text-white">
                      {nonLues} non lue{nonLues > 1 ? 's' : ''}
                    </span>
                  )}
                </div>

                {notifications.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-white/10 bg-[#120F0D] p-4 text-center text-xs text-[#8E7F74]">
                    Aucune alerte pour le moment.
                  </div>
                ) : (
                  <ul className="space-y-2">
                    {notifications.map((n) => {
                      const lienNormalise = normaliserLienNotification(n.lien);
                      const contenu = (
                        <>
                          <div className="flex items-center justify-between gap-2">
                            <span className="rounded-full border border-white/10 bg-[#1B1511] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B8A99E]">
                              Alerte
                            </span>
                            {n.created_at && (
                              <span className="shrink-0 text-[11px] text-[#8E7F74]">
                                {new Date(n.created_at).toLocaleDateString('fr-FR')}
                              </span>
                            )}
                          </div>
                          <p className="mt-1.5 text-sm font-bold text-[#F5EFEA]">
                            {!n.lu && (
                              <span
                                className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full bg-[#D96B27] align-middle"
                                aria-label="non lue"
                              />
                            )}
                            {n.titre}
                          </p>
                          {n.message && (
                            <p className="mt-1 line-clamp-2 text-xs text-[#B8A99E]">{n.message}</p>
                          )}
                        </>
                      );

                      return (
                        <li
                          key={n.id}
                          className="rounded-xl border border-white/10 bg-[#120F0D] p-3 transition-colors hover:border-[#D96B27]/40 hover:bg-[#221B17]"
                        >
                          {lienNormalise ? (
                            <Link href={lienNormalise} className="group block">
                              {contenu}
                            </Link>
                          ) : (
                            <div>{contenu}</div>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}

            <div>
              <div className="mb-2.5 flex items-center justify-between gap-2">
                <h2 className="flex items-center gap-2 text-base font-bold text-[#F5EFEA]">
                  <FileText className="h-5 w-5 shrink-0 text-[#D96B27]" />
                  Dernières notes vocales
                </h2>
                <Link
                  href="/terrain/notes"
                  className="flex shrink-0 items-center gap-1 text-xs font-bold text-[#D96B27] hover:underline"
                >
                  Tout voir <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </div>

              {dernieresNotes.length === 0 ? (
                <div className="rounded-xl border border-dashed border-white/10 bg-[#120F0D] p-4 text-center text-xs text-[#8E7F74]">
                  Aucune note récente. Dictez-en une ci-dessus.
                </div>
              ) : (
                <div className="space-y-2">
                  {dernieresNotes.map((n) => (
                    <Link
                      key={n.id}
                      href="/terrain/notes"
                      className="group block rounded-xl border border-white/10 bg-[#120F0D] p-3 transition-colors hover:border-[#D96B27]/40 hover:bg-[#221B17]"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="rounded-full border border-white/10 bg-[#1B1511] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-[#B8A99E]">
                          Note
                        </span>
                        <span className="shrink-0 text-[11px] text-[#8E7F74]">
                          {n.created_at ? new Date(n.created_at).toLocaleDateString('fr-FR') : ''}
                        </span>
                      </div>
                      <h3 className="mt-1.5 line-clamp-1 text-sm font-bold text-[#F5EFEA] group-hover:text-[#D96B27]">
                        {n.titre || 'Note sans titre'}
                      </h3>
                      <p className="mt-0.5 line-clamp-2 text-xs text-[#B8A99E]">{n.contenu}</p>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

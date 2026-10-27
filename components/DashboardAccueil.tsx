'use client';

// components/DashboardAccueil.tsx
// Sous-composant CLIENT du tableau de bord de la page d'accueil (`/`).
//
// Depuis la conversion de app/page.tsx en Server Component, les données
// privées (notes, stats, chantiers à préparer, notifications) sont chargées
// côté serveur avec le cookie de session (jamais la clé anon depuis le
// navigateur) puis passées ici en propriétés initiales. Ce composant ne gère
// que l'INTERACTIVITÉ :
//   * enregistrement vocal (BoutonMicroNote) + sauvegarde de la note ;
//   * mise à jour locale de la liste / des stats après insertion.
//
// PHASE 2 — cet écran est devenu le COCKPIT UNIQUE : les deux anciens cockpits
// parallèles (`/bureau` et `/terrain`) ont été supprimés, et leurs blocs
// réellement utiles sont remontés ici.
//
// ─── ORDRE DES BLOCS (refonte finale, mobile d'abord) ──────────────────────
//
//   1. En-tête compact : titre « Accueil », bouton « Dicter une note »
//      (assistant vocal), et trois accès rapides. La marque n'apparaît plus
//      ici : elle est portée par le logo du layout global (`app/layout.tsx`),
//      le petit sur-titre rouge « BNA Bardage » faisait doublon et a été retiré.
//   2. Météo générale (recherche de ville, jour, matin/après-midi, heure par
//      heure 06-18, cumuls, prévisions J+1 à J+4).
//   3. Impact météo sur les chantiers (ChantiersMeteoCards, fond inchangé).
//   4. Chantiers à préparer.
//   5. Dernières notes et alertes (deux sous-listes).
//
// La météo est la PREMIÈRE grande section informative, juste après l'en-tête :
// l'utilisateur lit température, conditions et précipitations sans devoir
// défiler un grand bloc vocal. Le grand conteneur « Assistant vocal (IA) » et
// ses trois raccourcis redondants (Chantiers / Notes / Météo) ont été
// supprimés : la fonction vocale reste, seule sa présentation a changé.
//
// La séparation 2/3 est volontaire : le bloc 2 est la météo GÉNÉRALE du
// territoire (ville recherchée), le bloc 3 est l'impact OPÉRATIONNEL sur les
// chantiers suivis. La veille des intempéries reste sur `/bureau/meteo`.
//
// ─── COMPOSITION RESPONSIVE ────────────────────────────────────────────────
//
// Mobile d'abord : une seule colonne, aucun débordement horizontal. Les trois
// accès rapides de l'en-tête tiennent sur UNE SEULE rangée dès le mobile
// (`grid grid-cols-3`) ; leurs cibles tactiles restent généreuses (`min-h-10`,
// 40 px). Le bouton vocal garde `min-h-11` (44 px). À partir de `md` (768 px),
// la météo et l'impact partagent la première rangée ; chantiers et notes
// occupent toute la largeur. À partir de `xl` (1280 px), la grille de 12
// colonnes donne 5/12 à la météo et 7/12 à l'impact ; chantiers et notes
// restent en pleine largeur (leurs cartes internes passent à trois colonnes).
//
// Les blocs 2 à 5 restent des PROPRIÉTÉS OPTIONNELLES, toutes nulles par
// défaut. C'est ce qui permet à ce fichier d'être rendu seul — sans
// `app/page.tsx` — par les tests existants, qui ne fournissent que
// `notesInitiales`.
//
// Le bloc « Chiffres clés » (chantiers actifs, devis, factures en retard,
// fournisseurs, notes patron) reste SUPPRIMÉ de l'accueil : ses compteurs ne
// sont plus chargés par `app/page.tsx`, et les écrans qui les affichent
// (`/bureau/factures`, `/bureau/devis-factures`, `/bureau/fournisseurs`,
// `/terrain/chantier`, `/terrain/notes`) restent le bon endroit pour les lire.
//
// ─── DICTÉE VOCALE (bulle) ─────────────────────────────────────────────────
//
// Le bouton « Dicter une note » vit à droite du titre. Il réutilise le
// composant existant `BoutonMicroNote` : aucune seconde reconnaissance n'est
// écrite. Ce composant enregistre l'audio puis l'envoie EN BLOC à Whisper à
// l'arrêt — il ne fournit PAS de transcription mot à mot. La bulle affiche donc
// un état d'écoute, puis le texte disponible dès qu'il revient, et ne promet
// jamais de « direct ». Le texte transcrit est mémorisé avant la reformulation
// pour ne pas être perdu en cas d'erreur ultérieure.
//
//   1. CONTENEUR. `app/page.tsx` borne et centre le contenu
//      (`mx-auto w-full max-w-7xl`, remplissage `px-4`).
//
//   2. GRILLE PRINCIPALE. Une seule colonne sur mobile ; deux colonnes à
//      partir de `md` (768 px) ; grille de 12 colonnes à partir de `xl`
//      (1280 px).
//
//   3. GRILLES INTERNES :
//        - « Chantiers à préparer » : `grid grid-cols-1 gap-3
//          sm:grid-cols-2 xl:grid-cols-3` ;
//        - « Dernières notes » : `grid grid-cols-1 gap-3 sm:grid-cols-2
//          xl:grid-cols-3` ;
//        - cartes météo (impact) : `grid gap-3 sm:grid-cols-2`.
//
//   4. ZONES TACTILES. Les accès rapides portent `min-h-10` (40 px) et le
//      bouton vocal `min-h-11` (44 px) : utilisables au doigt sur chantier,
//      sans dépendre du survol.
//
// Aucune donnée, source météo, seuil ou handler n'est touché.

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
  ShieldAlert,
  Wrench,
  Loader2,
} from 'lucide-react';
import BoutonMicroNote, { type EtatBoutonMicro } from '@/components/BoutonMicroNote';
import MeteoGeneraleAccueil from '@/components/MeteoGeneraleAccueil';
import { supabase } from '@/lib/supabase';
import { resoudreContexteEntreprise } from '@/lib/contexteEntreprise';
import { Surface } from '@/components/ui/Surface';

// O3-B9 : le claim `app_metadata.entreprise_id` doit être un UUID avant d'être
// recopié dans une colonne `uuid`. Sans cette garde, un claim corrompu produirait
// une erreur PostgreSQL opaque ; avec elle, l'échec est explicite et sans écriture.
//
// Le retour est un PRÉDICAT DE TYPE (`value is string`) : c'est ce qui permet à
// TypeScript de rétrécir `string | null` en `string` après l'appel, et donc
// d'exiger `entreprise_id: string` dans l'objet inséré SANS assertion `as`.
const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function estUuid(value: string | null): value is string {
  return typeof value === "string" && UUID_RE.test(value);
}

export type Note = {
  id: string;
  titre: string | null;
  contenu: string;
  created_at: string | null;
};

type ChantierAPreparer = { id: string; nom: string | null; adresse: string | null };

type Notification = {
  id: string;
  titre: string;
  message: string | null;
  lien: string | null;
  lu: boolean | null;
  created_at: string | null;
};

/**
 * État de la bulle de dictée, piloté par les rappels de `BoutonMicroNote`.
 * `null` = aucune dictée en cours (la bulle est masquée).
 */
type PhaseDictee = 'enregistrement' | 'transcription' | 'reformulation' | 'erreur';

interface DashboardAccueilProps {
  notesInitiales: Note[];
  /** Chantiers au statut `prevu`. Absent = bloc omis (page rendue sans serveur). */
  chantiersAPreparer?: ChantierAPreparer[];
  /** Dernières notifications. Absent = bloc omis. */
  notifications?: Notification[];
  /**
   * Nœud « impact météo » déjà rendu par le serveur. C'est ici, et non
   * `<ChantiersMeteoCards />` importé, que le bloc vit : `app/page.tsx` le
   * monte dans l'arbre serveur, ce qui le sort du périmètre de ce composant
   * (et donc des tests qui le rendent isolé, dont le mock Supabase ne sait pas
   * exécuter la chaîne `.select().neq()` du composant météo).
   */
  blocMeteo?: ReactNode;
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

  // ── Bulle de dictée (présentation seulement) ──────────────────────────────
  // Ces trois états ne font que RELAYER ce que `BoutonMicroNote` signale : ils
  // ne relancent aucune reconnaissance et n'inventent aucune donnée.
  const [phaseDictee, setPhaseDictee] = useState<PhaseDictee | null>(null);
  const [texteDictee, setTexteDictee] = useState('');
  const [erreurDictee, setErreurDictee] = useState<string | null>(null);

  async function handleTexteReformule(texte: string) {
    setIsSavingNote(true);
    const titreExtrait = texte.split('.')[0].slice(0, 40) + '...';

    try {
      // O3-B9 : `notes_patron` est une table RACINE (`entreprise_id` NOT NULL
      // sans défaut depuis le 2026-09-22, aucun trigger possible car pas de
      // `chantier_id`). On résout le tenant via le claim
      // `app_metadata.entreprise_id`, même source que `entreprise_courante()`.
      const { entreprise_id } = await resoudreContexteEntreprise(null);

      // Fail-closed : sans contexte entreprise, AUCUNE écriture.
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

      // O3-B9 : l'ERREUR PostgREST ne lève pas d'exception — elle est renvoyée
      // dans `{ error }`. Le `catch` ci-dessous ne se déclenchait donc JAMAIS sur
      // un refus d'écriture, et la note reformulée par l'IA disparaissait sans
      // aucun feedback (ni message, ni trace). On traite `err` explicitement.
      if (err) {
        setError('Erreur lors de la sauvegarde de la note : ' + err.message);
        console.error('Accueil : note patron NON enregistrée.', err);
        return;
      }

      if (data) {
        setDernieresNotes((prev) => [data[0], ...prev].slice(0, 3));
      }
      // Aucun rafraîchissement de compteur ici : le bloc « Chiffres clés », seul
      // lecteur de ces compteurs, a été retiré de l'accueil sur décision
      // explicite. La note reste affichée en tête de « Dernières Notes »,
      // l'information utile que cet écran apportait.
    } catch (err) {
      setError((err as Error).message || 'Erreur lors de la sauvegarde');
      console.error(err);
    } finally {
      setIsSavingNote(false);
    }
  }

  /**
   * Traduit l'état du bouton vocal en état de bulle.
   *
   * `inactif` masque la bulle SAUF pendant l'enregistrement de la note, encore
   * en cours à ce moment-là (ce cas est couvert par `isSavingNote`). `erreur`
   * laisse la bulle ouverte tant que la dictée n'est pas relancée : le message
   * — et le texte déjà transcrit — restent lisibles.
   */
  function handleEtatDictee(etat: EtatBoutonMicro) {
    if (etat === 'inactif') {
      setPhaseDictee(null);
      return;
    }
    if (etat === 'enregistrement') {
      // Nouvelle dictée : on repart d'une bulle propre.
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
    <div className="space-y-4 sm:space-y-5">
      {/* ── 1. En-tête compact : titre, dictée vocale, accès rapides ───
          `mt-1` (4 px) au lieu de `mt-2` (8 px), et de `mt-6` (24 px) à
          l'origine : l'écart entre le bas du logo et le titre passe de 34 px
          à 26 px — sans toucher au header global, au `mt-4` du `<main>` ni au
          reflet rouge. Réduction progressive : seuls 4 px de plus sont
          retirés, à ce seul endroit. Le `space-y-4` du conteneur continue de
          séparer cette section de la suivante. */}
      <header className="mt-1 flex flex-col gap-2.5">
        {/* Le titre « Accueil » et le bouton « Dicter une note » sont sur la
            MÊME ligne (`items-center`) : le bouton est ainsi aligné à la
            hauteur du titre, à sa droite. Le sous-titre passe en dessous, sur
            toute la largeur, pour ne pas décaler ce centrage. */}
        <div className="flex items-center justify-between gap-3">
          <h2 className="min-w-0 text-xl font-bold leading-tight text-white sm:text-2xl">
            Votre activité
          </h2>

          {/* Le bouton vocal remplace l'ancien grand conteneur : même composant,
              même traitement IA de la note, présentation compacte. */}
          <div className="shrink-0">
            <BoutonMicroNote
              onTexteReformule={handleTexteReformule}
              onErreur={setErreurDictee}
              onEtat={handleEtatDictee}
              onTranscription={setTexteDictee}
            />
          </div>
        </div>

        <p className="text-xs text-gray-400 sm:text-sm">
          Suivi quotidien des chantiers et de votre activité.
        </p>

        {/* Bulle de dictée : dans le flux, jamais en surimpression de la météo. */}
        {bulleVisible && (
          <div
            role="status"
            aria-live="polite"
            className={`rounded-xl border p-3 ${
              phaseDictee === 'erreur'
                ? 'border-red-500/30 bg-red-950/30'
                : phaseDictee === 'enregistrement'
                  ? 'border-[#E53935]/40 bg-[#E53935]/10'
                  : 'border-white/10 bg-white/[0.04]'
            }`}
          >
            <div className="flex items-start gap-2.5">
              <span className="mt-0.5 shrink-0">
                {phaseDictee === 'erreur' ? (
                  <ShieldAlert className="h-4 w-4 text-red-400" />
                ) : phaseDictee === 'enregistrement' ? (
                  <Mic className="h-4 w-4 animate-pulse text-[#E53935]" />
                ) : (
                  <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                )}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-xs font-semibold text-white">{titreBulle}</p>
                {texteDictee && (
                  <p className="mt-1 break-words text-xs text-gray-300">
                    « {texteDictee} »
                  </p>
                )}
                {phaseDictee === 'erreur' && erreurDictee && (
                  <p className="mt-1 break-words text-xs text-red-300">{erreurDictee}</p>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Trois accès rapides : une seule rangée dès le mobile, cibles
            tactiles généreuses (`min-h-10`), destinations toutes existantes. */}
        <nav aria-label="Accès rapides" className="grid grid-cols-3 gap-1.5">
          <Link
            href="/bureau/meteo"
            className="inline-flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-1.5 text-center text-2xs font-semibold leading-tight text-gray-300 transition-colors hover:border-[#E53935]/40 hover:text-white"
          >
            <ShieldAlert className="h-4 w-4 shrink-0 text-[#E53935]" />
            <span className="min-w-0">Intempéries</span>
          </Link>
          <Link
            href="/boite-a-outils"
            className="inline-flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-1.5 text-center text-2xs font-semibold leading-tight text-gray-300 transition-colors hover:border-[#E53935]/40 hover:text-white"
          >
            <Wrench className="h-4 w-4 shrink-0 text-[#E53935]" />
            <span className="min-w-0">Boîte à outils</span>
          </Link>
          <Link
            href="/terrain/notes"
            className="inline-flex min-h-10 min-w-0 items-center justify-center gap-1 rounded-lg border border-white/10 bg-white/[0.04] px-1.5 text-center text-2xs font-semibold leading-tight text-gray-300 transition-colors hover:border-[#E53935]/40 hover:text-white"
          >
            <FileText className="h-4 w-4 shrink-0 text-[#E53935]" />
            <span className="min-w-0">Notes</span>
          </Link>
        </nav>
      </header>

      {/* Grille principale : 1 colonne sur mobile, 2 à partir de `md`,
          météo 5/12 + impact 7/12 à partir de `xl`. L'ordre du DOM est
          2 → 5 (la météo d'abord). */}
      <div className="grid grid-cols-1 items-start gap-4 md:grid-cols-2 md:gap-5 xl:grid-cols-12">

      {/* ── 2. Météo générale ───────────────────────────────────────── */}
      <section className="xl:col-span-5">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <CloudSun className="h-5 w-5 shrink-0 text-[#E53935]" />
            Météo générale
          </h2>
          <Link
            href="/terrain/meteo"
            className="flex shrink-0 items-center gap-1 text-xs font-bold text-[#E53935] transition-colors hover:text-red-400"
          >
            Prévisions complètes <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <MeteoGeneraleAccueil />
      </section>

      {/* ── 3. Impact météo sur les chantiers ─────────────────────────── */}
      {blocMeteo && (
        <section className="xl:col-span-7">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white">
              <CloudSun className="h-5 w-5 shrink-0 text-[#E53935]" />
              Impact météo sur les chantiers
            </h2>
            <Link
              href="/bureau/meteo"
              className="flex shrink-0 items-center gap-1 text-xs font-bold text-[#E53935] transition-colors hover:text-red-400"
            >
              Météo & intempéries <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
          {blocMeteo}
        </section>
      )}

      {/* ── 4. Chantiers à préparer ───────────────────────────────────── */}
      {chantiersAPreparer && (
        <section className="md:col-span-2 xl:col-span-12">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
            <h2 className="flex items-center gap-2 text-lg font-bold text-white">
              <HardHat className="h-5 w-5 shrink-0 text-[#E53935]" />
              Chantiers à préparer
            </h2>
            <Link
              href="/terrain/chantier"
              className="flex shrink-0 items-center gap-1 text-xs font-bold text-[#E53935] transition-colors hover:text-red-400"
            >
              Tout voir <ArrowRight className="h-3 w-3" />
            </Link>
          </div>

          {chantiersAPreparer.length === 0 ? (
            <Surface className="border-dashed p-4 text-center text-xs text-gray-500">
              Aucun chantier en attente de préparation.
            </Surface>
          ) : (
            <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {chantiersAPreparer.map((c) => (
                <Surface as="li" key={c.id} className="p-3.5 transition-colors hover:border-[#E53935]/40">
                  <Link href={`/terrain/chantier/${c.id}`} className="group block">
                    <p className="line-clamp-2 text-sm font-semibold leading-snug text-white transition-colors group-hover:text-[#E53935]">
                      {c.nom || 'Chantier sans nom'}
                    </p>
                    {c.adresse && (
                      <p className="mt-1 flex items-center gap-1 text-2xs text-gray-400">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{c.adresse}</span>
                      </p>
                    )}
                    <span className="mt-1.5 inline-block rounded-full bg-white/[0.06] px-2 py-0.5 text-2xs font-medium text-gray-300">
                      Statut : prévu
                    </span>
                  </Link>
                </Surface>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── 5. Dernières notes et alertes ─────────────────────────────── */}
      <section className="md:col-span-2 xl:col-span-12">
        <div className="mb-3 flex flex-wrap items-center justify-between gap-x-3 gap-y-2">
          <h2 className="flex items-center gap-2 text-lg font-bold text-white">
            <Bell className="h-5 w-5 shrink-0 text-[#E53935]" />
            Notes & alertes
          </h2>
          <Link
            href="/terrain/notes"
            className="flex shrink-0 items-center gap-1 text-xs font-bold text-[#E53935] transition-colors hover:text-red-400"
          >
            Toutes les notes <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {error && (
          <div className="mb-3 rounded-xl border border-red-500/30 bg-red-950/30 p-3 text-center text-xs text-red-300">
            {error}
          </div>
        )}

        <div className={`grid grid-cols-1 gap-4 ${notifications ? 'lg:grid-cols-3' : ''}`}>
          {/* Dernières notes */}
          <div className={notifications ? 'lg:col-span-2' : ''}>
            <div className="mb-2 flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                <FileText className="h-4 w-4 shrink-0 text-[#E53935]" />
                Dernières notes
              </h3>
              <span className="shrink-0 text-2xs text-gray-500">3 dernières</span>
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {dernieresNotes.map((n) => (
                <Link
                  key={n.id}
                  href="/terrain/notes"
                  className="group flex flex-col rounded-xl border border-white/10 bg-[#1E1E1E] p-3 transition-colors hover:border-[#E53935]/50"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-4xs font-bold uppercase tracking-wider text-gray-400">
                      Note
                    </span>
                    <span className="shrink-0 text-4xs text-gray-500">
                      {n.created_at ? new Date(n.created_at).toLocaleDateString('fr-FR') : ''}
                    </span>
                  </div>
                  <h4 className="mt-1.5 line-clamp-2 text-sm font-semibold text-white transition-colors group-hover:text-[#E53935]">
                    {n.titre || 'Note sans titre'}
                  </h4>
                  <p className="mt-1 line-clamp-2 text-xs text-gray-400">{n.contenu}</p>
                </Link>
              ))}
              {dernieresNotes.length === 0 && (
                <Surface className="border-dashed p-4 text-center text-xs text-gray-500 sm:col-span-2 xl:col-span-3">
                  Aucune note récente. Dictez-en une ci-dessus.
                </Surface>
              )}
            </div>
          </div>

          {/* Alertes */}
          {notifications && (
            <div>
              <div className="mb-2 flex items-center justify-between gap-2">
                <h3 className="flex items-center gap-2 text-sm font-bold text-white">
                  <Bell className="h-4 w-4 shrink-0 text-[#E53935]" />
                  Alertes
                </h3>
                {nonLues > 0 && (
                  <span className="shrink-0 rounded-full bg-[#E53935] px-2 py-0.5 text-4xs font-bold text-white">
                    {nonLues} non lue{nonLues > 1 ? 's' : ''}
                  </span>
                )}
              </div>

              {notifications.length === 0 ? (
                <Surface className="border-dashed p-4 text-center text-xs text-gray-500">
                  Aucune alerte pour le moment.
                </Surface>
              ) : (
                <ul className="space-y-2">
                  {notifications.map((n) => {
                    const contenu = (
                      <>
                        <div className="flex items-center justify-between gap-2">
                          <span className="rounded-full bg-white/[0.06] px-2 py-0.5 text-4xs font-bold uppercase tracking-wider text-gray-400">
                            Alerte
                          </span>
                          {n.created_at && (
                            <span className="shrink-0 text-4xs text-gray-500">
                              {new Date(n.created_at).toLocaleDateString('fr-FR')}
                            </span>
                          )}
                        </div>
                        <p className="mt-1.5 text-sm font-semibold text-white">
                          {n.lu ? '' : (
                            <span
                              className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full bg-[#E53935] align-middle"
                              aria-label="non lue"
                            />
                          )}
                          {n.titre}
                        </p>
                        {n.message && (
                          <p className="mt-1 line-clamp-2 text-xs text-gray-400">{n.message}</p>
                        )}
                      </>
                    );

                    // `Surface` ne porte que l'habillage (bordure + fond) : le
                    // padding vient de la classe, avec la MÊME valeur que les
                    // cartes de notes (`p-3`).
                    return (
                      <Surface as="li" key={n.id} className="p-3">
                        {n.lien ? (
                          <Link href={n.lien} className="group block">
                            {contenu}
                          </Link>
                        ) : (
                          <div>{contenu}</div>
                        )}
                      </Surface>
                    );
                  })}
                </ul>
              )}
            </div>
          )}
        </div>
      </section>
      </div>
    </div>
  );
}

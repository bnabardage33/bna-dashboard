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
// réellement utiles sont remontés ici. L'ordre des blocs est celui validé :
//   1. Assistance vocale / IA
//   2. Chantiers à préparer
//   3. Météo & impact météo sur les chantiers
//   4. Dernières Notes
//   5. Alertes
//
// Le bloc « Chiffres clés » (chantiers actifs, devis, factures en retard,
// fournisseurs, notes patron) a été SUPPRIMÉ de l'accueil : il ne servait à
// rien dans un cockpit, et ses compteurs ne sont plus chargés par
// `app/page.tsx`. Les écrans qui les affichent (`/bureau/factures`,
// `/bureau/devis-factures`, `/bureau/fournisseurs`, `/terrain/chantier`,
// `/terrain/notes`) sont inchangés et restent le bon endroit pour les lire.
//
// Les blocs 2 à 5 sont des PROPRIÉTÉS OPTIONNELLES, toutes nulles par défaut.
// C'est ce qui permet à ce fichier d'être rendu seul — sans `app/page.tsx` —
// par les tests existants, qui ne fournissent que `notesInitiales`.
//
// ─── RENDU ET RESPONSIVE — reprise de la version de référence ──────────────
//
// Le fond fonctionnel est resté celui de la phase 2. Seule la composition est
// reprise, et elle est reprise PAR COPIE : chaque bloc reprend la grille
// exacte d'un écran de la version déployée, mesurée à HEAD. Aucune logique de
// centrage automatique n'est introduite.
//
//   1. CONTENEUR. `app/page.tsx` ne portait aucun plafond de largeur, alors
//      que tous les autres écrans en portent un (`mx-auto max-w-5xl` dans
//      `app/bureau/layout.tsx` et `app/terrain/layout.tsx`) et que l'ancien
//      cockpit Bureau aussi (`mx-auto max-w-7xl`). D'où `mx-auto w-full
//      max-w-7xl` : le contenu est borné et centré, les cinq sections sont
//      alignées sur le même axe.
//
//   2. GRILLES. Elles ne sont pas réimaginées, elles sont reprises :
//        - « Dernières Notes » : `grid grid-cols-1 md:grid-cols-3 gap-4`, la
//          grille EXACTE de l'accueil d'origine (`app/page.tsx` a HEAD) ;
//        - cartes météo : `grid gap-3 sm:grid-cols-2`, la grille EXACTE de
//          l'écran `/terrain/meteo` a HEAD, où ces cartes étaient rendues ;
//        - « Chantiers à préparer » : `grid grid-cols-1 gap-6
//          md:grid-cols-2 lg:grid-cols-3`, la grille EXACTE du cockpit Bureau
//          a HEAD pour une rangée de cartes de cette taille.
//
//   3. AUCUN CENTRAGE ARTIFICIEL. Une carte seule reste dans la colonne de la
//      grille, à GAUCHE, avec la largeur de cette colonne : c'est le
//      comportement d'origine, qui est le bon. On ne « remplit » pas
//      l'espace disponible. La carte porte donc les MÊMES classes qu'avant,
//      sans largeur ajoutée.
//
//   4. HIÉRARCHIE. Il n'y avait ni `h1` ni sous-titre : l'œil entrait
//      directement dans une carte de pleine largeur, sans point de repère.
//      L'`header` reprend le modèle de l'ancien cockpit.
//
// Seul écart assumé : `flex-wrap` sur les en-têtes de section, qui ne change
// rien au-dessus de ~380 px (le rendu y est identique) et évite que « Tout
// voir » n'écrase le titre sur un écran étroit.
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
} from 'lucide-react';
import BoutonMicroNote from '@/components/BoutonMicroNote';
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

  return (
    <div className="space-y-8">
      {/* En-tête de page : `h1` + sous-titre, sur le modèle du cockpit Bureau
          d'origine. Donne au regard une porte d'entrée et une échelle, et rend
          les cinq blocs lisibles comme des sections de même niveau. */}
      <header>
        <h1 className="text-2xl font-bold text-white sm:text-3xl">Accueil</h1>
        <p className="mt-1 text-sm text-gray-400">
          L&apos;essentiel en un écran : votre assistant, les chantiers à
          préparer, l&apos;impact de la météo, vos dernières notes et les alertes.
        </p>
      </header>

      {/* ── 1. Assistance vocale / Notes Patron ───────────────────────── */}
      <Surface className="p-6 shadow-lg relative overflow-hidden" radius="2xl">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Mic className="w-48 h-48 text-white" />
        </div>

        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2 relative z-10">
          <Mic className="h-5 w-5 shrink-0 text-[#E53935]" />
          Assistant Vocal (IA)
        </h2>
        <p className="text-sm text-gray-400 mb-6 relative z-10">
          Dictez une idée, un rappel ou un compte-rendu. L'IA reformulera votre note et
          l&apos;enregistrera automatiquement.
        </p>

        <div className="flex flex-col items-center justify-center p-6 bg-black/20 rounded-xl border border-white/5 relative z-10">
          <BoutonMicroNote
            onTexteReformule={handleTexteReformule}
            onErreur={(msg) => alert('Erreur IA: ' + msg)}
          />
          <p className="mt-4 text-xs font-semibold text-gray-500 uppercase tracking-widest">
            {isSavingNote ? 'Enregistrement de la note...' : 'Appuyez pour parler'}
          </p>
        </div>
      </Surface>

      {/* ── 2. Chantiers à préparer ───────────────────────────────────── */}
      {chantiersAPreparer && (
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
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
            <Surface className="border-dashed p-6 text-center text-gray-500 text-sm">
              Aucun chantier en attente de préparation.
            </Surface>
          ) : (
            <ul className="grid grid-cols-1 gap-6 md:grid-cols-2 lg:grid-cols-3">
              {chantiersAPreparer.map((c) => (
                <Surface as="li" key={c.id}>
                  <Link href={`/terrain/chantier/${c.id}`} className="group block">
                    <p className="font-semibold text-white text-sm group-hover:text-[#E53935] transition-colors">
                      {c.nom || 'Chantier sans nom'}
                    </p>
                    {c.adresse && (
                      <p className="mt-1 flex items-center gap-1 text-xs text-gray-400">
                        <MapPin className="h-3 w-3 shrink-0" />
                        <span className="truncate">{c.adresse}</span>
                      </p>
                    )}
                    <span className="mt-2 inline-block rounded-full bg-white/[0.06] px-2 py-0.5 text-2xs font-medium text-gray-300">
                      Statut : prévu
                    </span>
                  </Link>
                </Surface>
              ))}
            </ul>
          )}
        </section>
      )}

      {/* ── 3. Météo + impact météo sur les chantiers ─────────────────── */}
      {blocMeteo && (
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
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

      {/* ── 4. Dernières notes ─────────────────────────────────────────── */}
      <section>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="h-5 w-5 shrink-0 text-[#E53935]" />
            Dernières Notes
          </h3>
          <Link
            href="/terrain/notes"
            className="flex shrink-0 items-center gap-1 text-xs font-bold text-[#E53935] transition-colors hover:text-red-400"
          >
            Tout voir <ArrowRight className="h-3 w-3" />
          </Link>
        </div>

        {error && (
          <div className="rounded-xl border border-red-500/30 bg-red-950/30 p-4 text-center text-red-300 text-sm">
            {error}
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {dernieresNotes.map((n) => (
            <Link
              key={n.id}
              href="/terrain/notes"
              className="group rounded-xl border border-white/10 bg-[#1E1E1E] p-4 hover:border-[#E53935]/50 hover:bg-[#1E1E1E]/80 transition-all duration-200 flex flex-col h-32"
            >
              <h4 className="font-semibold text-white text-sm mb-2 truncate group-hover:text-[#E53935] transition-colors">
                {n.titre || 'Note sans titre'}
              </h4>
              <p className="text-xs text-gray-400 line-clamp-3">{n.contenu}</p>
              <span className="mt-auto pt-2 text-2xs text-gray-500 font-medium">
                {n.created_at ? new Date(n.created_at).toLocaleDateString('fr-FR') : ''}
              </span>
            </Link>
          ))}
          {dernieresNotes.length === 0 && (
            <Surface className="col-span-3 border-dashed p-8 text-center text-gray-500 text-sm">
              Aucune note récente. Utilisez le micro ci-dessus !
            </Surface>
          )}
        </div>
      </section>

      {/* ── 5. Notifications / alertes ─────────────────────────────────── */}
      {notifications && (
        <section>
          <div className="mb-4 flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
            <h2 className="text-lg font-bold text-white flex items-center gap-2">
              <Bell className="h-5 w-5 shrink-0 text-[#E53935]" />
              Alertes
            </h2>
            {notifications.some((n) => !n.lu) && (
              <span className="shrink-0 rounded-full bg-[#E53935] px-2 py-0.5 text-2xs font-bold text-white">
                {notifications.filter((n) => !n.lu).length} non lue
                {notifications.filter((n) => !n.lu).length > 1 ? 's' : ''}
              </span>
            )}
          </div>

          {notifications.length === 0 ? (
            <Surface className="border-dashed p-6 text-center text-gray-500 text-sm">
              Aucune alerte pour le moment.
            </Surface>
          ) : (
            <ul className="space-y-2">
              {notifications.map((n) => {
                const contenu = (
                  <>
                    <p className="text-sm font-semibold text-white">
                      {n.lu ? '' : (
                        <span
                          className="mr-2 inline-block h-2 w-2 shrink-0 rounded-full bg-[#E53935] align-middle"
                          aria-label="non lue"
                        />
                      )}
                      {n.titre}
                    </p>
                    {n.message && (
                      <p className="mt-1 text-xs text-gray-400 line-clamp-2">{n.message}</p>
                    )}
                    {n.created_at && (
                      <p className="mt-1 text-2xs text-gray-500">
                        {new Date(n.created_at).toLocaleDateString('fr-FR')}
                      </p>
                    )}
                  </>
                );

                return (
                  <Surface as="li" key={n.id}>
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
        </section>
      )}
    </div>
  );
}
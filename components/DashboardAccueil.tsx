'use client';

// components/DashboardAccueil.tsx
// Sous-composant CLIENT du tableau de bord de la page d'accueil (/).
//
// Depuis la conversion de app/page.tsx en Server Component, les données
// privées (notes, stats) sont chargées côté serveur avec le cookie de
// session (jamais la clé anon depuis le navigateur) puis passées ici en
// propriétés initiales. Ce composant ne gère que l'INTERACTIVITÉ :
//   * enregistrement vocal (BoutonMicroNote) + sauvegarde de la note ;
//   * mise à jour locale de la liste / des stats après insertion.

import { useState } from 'react';
import Link from 'next/link';
import { FileText, Mic, ArrowRight } from 'lucide-react';
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

type Stats = { notes: number; chantiers: number; devis: number };

const STATUTS_CHANTIERS_ACTIFS = [
  'en_cours',
  'En cours',
  'prevu',
  'Actif',
  'Préparation',
  'preparation',
  'nouveau',
];

interface DashboardAccueilProps {
  notesInitiales: Note[];
  statsInitiales: Stats;
}

export default function DashboardAccueil({
  notesInitiales,
  statsInitiales,
}: DashboardAccueilProps) {
  const [dernieresNotes, setDernieresNotes] = useState<Note[]>(notesInitiales);
  const [stats, setStats] = useState<Stats>(statsInitiales);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function raffraichirStats() {
    try {
      const [notesRes, chantiersRes, devisRes] = await Promise.all([
        supabase.from('notes_patron').select('*', { count: 'exact', head: true }),
        supabase
          .from('chantiers')
          .select('*', { count: 'exact', head: true })
          .in('statut', STATUTS_CHANTIERS_ACTIFS),
        supabase.from('devis').select('*', { count: 'exact', head: true }),
      ]);
      setStats({
        notes: notesRes.count || 0,
        chantiers: chantiersRes.count || 0,
        devis: devisRes.count || 0,
      });
    } catch {
      // stats restent à leur valeur actuelle si erreur
    }
  }

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
      await raffraichirStats();
    } catch (err) {
      setError((err as Error).message || 'Erreur lors de la sauvegarde');
      console.error(err);
    } finally {
      setIsSavingNote(false);
    }
  }

  return (
    <>
      {/* Stats rapides */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <div className="rounded-xl border border-white/10 bg-[#1A1D24]/80 p-4 text-center">
          <p className="text-2xl font-black text-white">{stats.notes}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
            Notes récentes
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#1A1D24]/80 p-4 text-center">
          <p
            className={`text-2xl font-black ${isSavingNote ? 'text-[#E30613]' : 'text-gray-500'}`}
          >
            {isSavingNote ? '✓' : '○'}
          </p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Micro</p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#1A1D24]/80 p-4 text-center">
          <p className="text-2xl font-black text-white">{stats.chantiers}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">
            Chantiers
          </p>
        </div>
        <div className="rounded-xl border border-white/10 bg-[#1A1D24]/80 p-4 text-center">
          <p className="text-2xl font-black text-white">{stats.devis}</p>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider font-medium">Devis</p>
        </div>
      </div>

      {/* Assistant Vocal (IA) */}
      <Surface className="p-6 shadow-lg relative overflow-hidden" radius="2xl">
        <div className="absolute top-0 right-0 p-8 opacity-5 pointer-events-none">
          <Mic className="w-48 h-48 text-white" />
        </div>

        <h2 className="text-xl font-bold text-white mb-2 flex items-center gap-2 relative z-10">
          <Mic className="h-5 w-5 text-[#E30613]" />
          Assistant Vocal (IA)
        </h2>
        <p className="text-sm text-gray-400 mb-6 relative z-10">
          Dictez une idée, un rappel ou un compte-rendu. L'IA reformulera votre note et
          l'enregistrera automatiquement.
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

      {/* Dernières Notes */}
      <div>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-bold text-white flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#E30613]" />
            Dernières Notes
          </h3>
          <Link
            href="/terrain/notes"
            className="text-xs font-bold text-[#E30613] hover:text-red-400 flex items-center gap-1 transition-colors"
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
              className="group rounded-xl border border-white/10 bg-[#1A1D24] p-4 hover:border-[#E30613]/50 hover:bg-[#1A1D24]/80 transition-all duration-200 flex flex-col h-32"
            >
              <h4 className="font-semibold text-white text-sm mb-2 truncate group-hover:text-[#E30613] transition-colors">
                {n.titre || 'Note sans titre'}
              </h4>
              <p className="text-xs text-gray-400 line-clamp-3">{n.contenu}</p>
              <span className="mt-auto pt-2 text-[10px] text-gray-500 font-medium">
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
      </div>
    </>
  );
}
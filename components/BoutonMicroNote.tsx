// components/BoutonMicroNote.tsx
// Bouton micro pour dicter une note terrain.
// v2 : enregistre l'audio (MediaRecorder) puis l'envoie une seule fois à la fin
// pour transcription (Whisper via Groq), au lieu d'utiliser la reconnaissance
// vocale "live" du navigateur — instable sur Android avec une connexion faible
// (redémarrages en boucle du moteur causant des mots/phrases dupliqués).
// Flux : enregistrement → /api/transcrire-note (Whisper) → /api/reformuler-note (anonymisation + Groq)
//
// v3 (refonte accueil) : le composant reste l'UNIQUE implémentation de la
// reconnaissance. Il expose simplement son état et le texte transcrit à un
// parent qui veut afficher une bulle de dictée, via deux rappels facultatifs
// (`onEtat`, `onTranscription`). Les appels existants (fiche « Notes ») qui ne
// passent que `onTexteReformule` continuent de fonctionner à l'identique.
//
// IMPORTANT — honnêteté du direct : ce mécanisme N'EST PAS de la dictée mot à
// mot. L'audio part en bloc à l'arrêt et Whisper ne renvoie le texte qu'à la
// fin. Il n'y a donc AUCUN résultat intermédiaire à afficher. Le parent doit
// montrer un état d'écoute, puis le texte disponible — jamais promettre du
// « direct ».

'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

/** États observables du bouton, relayés au parent par `onEtat`. */
export type EtatBoutonMicro =
  | 'inactif'
  | 'enregistrement'
  | 'transcription'
  | 'reformulation'
  | 'erreur';

interface BoutonMicroNoteProps {
  onTexteReformule: (texte: string) => void;
  onErreur?: (message: string) => void;
  /**
   * Notifie chaque changement d'état. Sert à la bulle de dictée du parent ;
   * absent, le composant se comporte exactement comme avant.
   */
  onEtat?: (etat: EtatBoutonMicro) => void;
  /**
   * Livre le texte transcrit dès qu'il est disponible, AVANT la reformulation.
   * C'est ce qui permet de ne pas perdre une transcription déjà obtenue si la
   * reformulation échoue ensuite.
   */
  onTranscription?: (texteBrut: string) => void;
}

export default function BoutonMicroNote({
  onTexteReformule,
  onErreur,
  onEtat,
  onTranscription,
}: BoutonMicroNoteProps) {
  const [etat, setEtat] = useState<EtatBoutonMicro>('inactif');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  /** Change l'état interne ET le signale au parent, en un seul point. */
  const changerEtat = useCallback(
    (nouvel: EtatBoutonMicro) => {
      setEtat(nouvel);
      onEtat?.(nouvel);
    },
    [onEtat],
  );

  const traiterEnregistrement = useCallback(
    async (audioBlob: Blob) => {
      changerEtat('transcription');
      try {
        const formData = new FormData();
        formData.append('audio', audioBlob, 'note.webm');

        const resTranscription = await fetch('/api/transcrire-note', {
          method: 'POST',
          body: formData,
        });

        if (!resTranscription.ok) {
          throw new Error(`Erreur transcription (${resTranscription.status})`);
        }

        const dataTranscription = await resTranscription.json();
        const texteBrut = (dataTranscription.texteBrut ?? '').trim();

        if (!texteBrut) {
          changerEtat('erreur');
          onErreur?.("Aucun texte détecté dans l'enregistrement.");
          return;
        }

        // Le texte transcrit est livré MAINTENANT : même si la reformulation
        // échoue ensuite, il n'est pas perdu.
        onTranscription?.(texteBrut);

        changerEtat('reformulation');
        const resReformulation = await fetch('/api/reformuler-note', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ texteBrut }),
        });

        if (!resReformulation.ok) {
          throw new Error(`Erreur reformulation (${resReformulation.status})`);
        }

        const dataReformulation = await resReformulation.json();
        onTexteReformule(dataReformulation.texteReformule ?? texteBrut);
        changerEtat('inactif');
      } catch (err) {
        // On RESTE en erreur (au lieu de repasser à `inactif`) : la bulle du
        // parent garde ainsi le message et, le cas échéant, la transcription
        // déjà affichée. Le prochain appui relance une dictée propre.
        changerEtat('erreur');
        onErreur?.(`Erreur lors du traitement : ${(err as Error).message}`);
      }
    },
    [changerEtat, onTexteReformule, onErreur, onTranscription],
  );

  const demarrerEnregistrement = useCallback(async () => {
    try {
      // `getUserMedia` n'existe qu'en contexte sécurisé (https ou localhost) :
      // ailleurs, la promesse est rejetée et on affiche l'erreur telle quelle.
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;
      chunksRef.current = [];

      const mimeType = MediaRecorder.isTypeSupported('audio/webm;codecs=opus')
        ? 'audio/webm;codecs=opus'
        : 'audio/webm';

      const mediaRecorder = new MediaRecorder(stream, { mimeType });

      mediaRecorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      mediaRecorder.onstop = async () => {
        streamRef.current?.getTracks().forEach((track) => track.stop());
        streamRef.current = null;

        const audioBlob = new Blob(chunksRef.current, { type: mimeType });

        if (audioBlob.size < 1000) {
          changerEtat('inactif');
          return;
        }

        await traiterEnregistrement(audioBlob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      changerEtat('enregistrement');
    } catch (err) {
      changerEtat('erreur');
      onErreur?.(`Impossible d'accéder au micro : ${(err as Error).message}`);
    }
  }, [changerEtat, onErreur, traiterEnregistrement]);

  const arreterEnregistrement = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const enCours = etat === 'transcription' || etat === 'reformulation';
  const libelle =
    etat === 'enregistrement'
      ? 'Arrêter'
      : etat === 'transcription'
        ? 'Transcription…'
        : etat === 'reformulation'
          ? 'Reformulation…'
          : 'Dicter une note';

  return (
    <button
      type="button"
      onClick={etat === 'enregistrement' ? arreterEnregistrement : demarrerEnregistrement}
      disabled={enCours}
      aria-label={etat === 'enregistrement' ? 'Arrêter la dictée' : 'Dicter une note'}
      className={`inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full px-4 text-sm font-semibold transition-colors
        ${etat === 'enregistrement' ? 'bg-[#E53935]/80 text-white animate-pulse' : ''}
        ${enCours ? 'bg-white/10 text-gray-400 cursor-not-allowed' : ''}
        ${etat === 'inactif' || etat === 'erreur' ? 'bg-[#E53935] text-white hover:bg-red-700' : ''}
      `}
    >
      {enCours && <Loader2 className="h-4 w-4 shrink-0 animate-spin" />}
      {etat === 'enregistrement' && <Square className="h-4 w-4 shrink-0" />}
      {(etat === 'inactif' || etat === 'erreur') && <Mic className="h-4 w-4 shrink-0" />}
      <span className="whitespace-nowrap">{libelle}</span>
    </button>
  );
}

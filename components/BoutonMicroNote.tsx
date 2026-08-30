// components/BoutonMicroNote.tsx
// Bouton micro pour dicter une note terrain.
// v2 : enregistre l'audio (MediaRecorder) puis l'envoie une seule fois à la fin
// pour transcription (Whisper via Groq), au lieu d'utiliser la reconnaissance
// vocale "live" du navigateur — instable sur Android avec une connexion faible
// (redémarrages en boucle du moteur causant des mots/phrases dupliqués).
// Flux : enregistrement → /api/transcrire-note (Whisper) → /api/reformuler-note (anonymisation + Groq)

'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

interface BoutonMicroNoteProps {
  onTexteReformule: (texte: string) => void;
  onErreur?: (message: string) => void;
}

type Etat = 'inactif' | 'enregistrement' | 'transcription' | 'reformulation' | 'erreur';

export default function BoutonMicroNote({ onTexteReformule, onErreur }: BoutonMicroNoteProps) {
  const [etat, setEtat] = useState<Etat>('inactif');
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);

  const demarrerEnregistrement = useCallback(async () => {
    try {
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
          setEtat('inactif');
          return;
        }

        await traiterEnregistrement(audioBlob);
      };

      mediaRecorderRef.current = mediaRecorder;
      mediaRecorder.start();
      setEtat('enregistrement');
    } catch (err: any) {
      const msg = `Impossible d'accéder au micro : ${err.message}`;
      setEtat('erreur');
      onErreur?.(msg);
    }
  }, [onTexteReformule, onErreur]);

  const arreterEnregistrement = useCallback(() => {
    mediaRecorderRef.current?.stop();
  }, []);

  const traiterEnregistrement = async (audioBlob: Blob) => {
    setEtat('transcription');
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
      const texteBrut = dataTranscription.texteBrut?.trim();

      if (!texteBrut) {
        setEtat('inactif');
        onErreur?.('Aucun texte détecté dans l\'enregistrement.');
        return;
      }

      setEtat('reformulation');
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
      setEtat('inactif');
    } catch (err: any) {
      const msg = `Erreur lors du traitement : ${err.message}`;
      onErreur?.(msg);
      setEtat('inactif');
    }
  };

  const enCours = etat === 'transcription' || etat === 'reformulation';

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={etat === 'enregistrement' ? arreterEnregistrement : demarrerEnregistrement}
        disabled={enCours}
        className={`flex items-center justify-center gap-2 rounded-full px-5 py-3 font-medium transition-colors
          ${etat === 'enregistrement' ? 'bg-[#E30613]/80 text-white animate-pulse' : ''}
          ${enCours ? 'bg-white/10 text-gray-400 cursor-not-allowed' : ''}
          ${etat === 'inactif' || etat === 'erreur' ? 'bg-[#E30613] text-white hover:bg-red-700' : ''}
        `}
      >
        {enCours && <Loader2 className="h-5 w-5 animate-spin" />}
        {etat === 'enregistrement' && <Square className="h-5 w-5" />}
        {(etat === 'inactif' || etat === 'erreur') && <Mic className="h-5 w-5" />}

        {etat === 'enregistrement' && 'Arrêter'}
        {etat === 'transcription' && 'Transcription en cours…'}
        {etat === 'reformulation' && 'Reformulation en cours…'}
        {(etat === 'inactif' || etat === 'erreur') && 'Dicter une note'}
      </button>
    </div>
  );
}

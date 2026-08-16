// components/BoutonMicroNote.tsx
'use client';

import { useState, useRef, useCallback } from 'react';
import { Mic, Square, Loader2 } from 'lucide-react';

interface BoutonMicroNoteProps {
  onTexteReformule: (texte: string) => void;
  onErreur?: (message: string) => void;
}

type Etat = 'inactif' | 'ecoute' | 'traitement' | 'erreur';

export default function BoutonMicroNote({ onTexteReformule, onErreur }: BoutonMicroNoteProps) {
  const [etat, setEtat] = useState<Etat>('inactif');
  const [transcriptionLive, setTranscriptionLive] = useState('');
  const recognitionRef = useRef<any>(null);

  const demarrerEcoute = useCallback(() => {
    const SpeechRecognition =
      (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

    if (!SpeechRecognition) {
      const msg = "La reconnaissance vocale n'est pas supportée sur ce navigateur.";
      setEtat('erreur');
      onErreur?.(msg);
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'fr-FR';
    recognition.continuous = true;
    recognition.interimResults = true;

    let texteFinal = '';

    recognition.onstart = () => {
      setEtat('ecoute');
      setTranscriptionLive('');
    };

    recognition.onresult = (event: any) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const transcript = event.results[i][0].transcript;
        if (event.results[i].isFinal) {
          texteFinal += transcript + ' ';
        } else {
          interim += transcript;
        }
      }
      setTranscriptionLive(texteFinal + interim);
    };

    recognition.onerror = (event: any) => {
      const msg = `Erreur de reconnaissance vocale : ${event.error}`;
      setEtat('erreur');
      onErreur?.(msg);
    };

    recognition.onend = async () => {
      if (!texteFinal.trim()) {
        setEtat('inactif');
        return;
      }
      await envoyerPourReformulation(texteFinal.trim());
    };

    recognitionRef.current = recognition;
    recognition.start();
  }, [onTexteReformule, onErreur]);

  const arreterEcoute = useCallback(() => {
    recognitionRef.current?.stop();
  }, []);

  const envoyerPourReformulation = async (texteBrut: string) => {
    setEtat('traitement');
    try {
      const res = await fetch('/api/reformuler-note', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ texteBrut }),
      });

      if (!res.ok) {
        throw new Error(`Erreur serveur (${res.status})`);
      }

      const data = await res.json();
      onTexteReformule(data.texteReformule ?? texteBrut);
      setEtat('inactif');
      setTranscriptionLive('');
    } catch (err: any) {
      onTexteReformule(texteBrut);
      const msg = `Reformulation IA indisponible, texte brut utilisé (${err.message})`;
      onErreur?.(msg);
      setEtat('inactif');
      setTranscriptionLive('');
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <button
        type="button"
        onClick={etat === 'ecoute' ? arreterEcoute : demarrerEcoute}
        disabled={etat === 'traitement'}
        className={`flex items-center justify-center gap-2 rounded-full px-5 py-3 font-medium transition-colors
          ${etat === 'ecoute' ? 'bg-red-600 text-white animate-pulse' : ''}
          ${etat === 'traitement' ? 'bg-gray-300 text-gray-500 cursor-not-allowed' : ''}
          ${etat === 'inactif' || etat === 'erreur' ? 'bg-blue-600 text-white hover:bg-blue-700' : ''}
        `}
      >
        {etat === 'traitement' && <Loader2 className="h-5 w-5 animate-spin" />}
        {etat === 'ecoute' && <Square className="h-5 w-5" />}
        {(etat === 'inactif' || etat === 'erreur') && <Mic className="h-5 w-5" />}

        {etat === 'ecoute' && 'Arrêter'}
        {etat === 'traitement' && 'Reformulation en cours…'}
        {(etat === 'inactif' || etat === 'erreur') && 'Dicter une note'}
      </button>

      {etat === 'ecoute' && transcriptionLive && (
        <p className="text-sm text-gray-500 italic px-2">{transcriptionLive}</p>
      )}
    </div>
  );
}

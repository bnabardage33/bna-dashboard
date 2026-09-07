'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Upload, Check, Loader2, Trash2 } from 'lucide-react';
import Image from "next/image";

interface DocumentCompta {
  id: string;
  type: 'bl' | 'ticket';
  date: string;
  note: string | null;
  montant_ht: number;
  taux_tva: number;
  montant_tva: number;
  montant_ttc: number;
  url_image: string;
}

export default function DocumentsComptaPage() {
  const [type, setType] = useState<'bl' | 'ticket'>('bl');
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [note, setNote] = useState('');
  const [montantHt, setMontantHt] = useState('');
  const [tauxTva, setTauxTva] = useState('20');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<DocumentCompta[]>([]);
  const [loadingDocs, setLoadingDocs] = useState(true);
  const fileRef = useRef<HTMLInputElement>(null);

  const ht = parseFloat(montantHt) || 0;
  const tva = parseFloat(tauxTva) || 0;
  const montantTvaCalcule = ht * (tva / 100);
  const montantTtcCalcule = ht + montantTvaCalcule;

  const loadDocuments = async () => {
    setLoadingDocs(true);
    try {
      const res = await fetch('/api/documents-compta');
      const data = await res.json();
      setDocuments(data.documents || []);
    } catch {
    } finally {
      setLoadingDocs(false);
    }
  };

  useEffect(() => {
    loadDocuments();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setSuccess(false);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) { setError("Choisissez une photo avant d'envoyer."); return; }

    setUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('type', type);
      fd.append('date', date);
      fd.append('note', note.trim());
      fd.append('montant_ht', montantHt || '0');
      fd.append('taux_tva', tauxTva || '20');

      const res = await fetch('/api/documents-compta', { method: 'POST', body: fd });

      let data: Record<string, unknown> = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(`Reponse invalide du serveur (HTTP ${res.status})`);
      }

      if (!res.ok || data.error) {
        throw new Error(String(data.error) || `Erreur serveur HTTP ${res.status}`);
      }

      setSuccess(true);
      setFile(null);
      setPreview(null);
      setNote('');
      setMontantHt('');
      if (fileRef.current) fileRef.current.value = '';
      loadDocuments();
    } catch (e) {
      setError(`Echec de l'envoi : ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer ce document definitivement ?')) return;
    try {
      await fetch(`/api/documents-compta?id=${id}`, { method: 'DELETE' });
      loadDocuments();
    } catch (e) {
      setError(`Erreur suppression : ${(e as Error).message}`);
    }
  };

  return (
    <div className="min-h-screen bg-transparent p-4">
      <div className="max-w-xl mx-auto">
        <div className="bg-[#1A1D24] border border-white/10 rounded-[16px] p-4 mb-4 space-y-4">
          <h1 className="text-lg font-bold text-white">Scanner BL / Ticket</h1>

          <div>
            <label className="text-xs font-bold text-white mb-1 block">Type de document</label>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => setType('bl')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${type === 'bl' ? 'bg-red-600 text-white' : 'bg-transparent border border-white/10 text-gray-400'}`}
              >
                Bon de Livraison
              </button>
              <button
                type="button"
                onClick={() => setType('ticket')}
                className={`flex-1 py-2.5 rounded-xl text-sm font-bold transition-colors ${type === 'ticket' ? 'bg-red-600 text-white' : 'bg-transparent border border-white/10 text-gray-400'}`}
              >
                Ticket
              </button>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-white mb-1 block">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full bg-transparent rounded-xl px-4 py-3 text-sm text-white border border-white/10 focus:border-white/30 outline-none"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="text-xs font-bold text-white mb-1 block">Montant HT (EUR)</label>
              <input
                type="number"
                step="0.01"
                value={montantHt}
                onChange={(e) => setMontantHt(e.target.value)}
                className="w-full bg-transparent rounded-xl px-4 py-3 text-sm text-white border border-white/10 focus:border-white/30 outline-none"
              />
            </div>
            <div>
              <label className="text-xs font-bold text-white mb-1 block">TVA (%)</label>
              <input
                type="number"
                step="0.1"
                value={tauxTva}
                onChange={(e) => setTauxTva(e.target.value)}
                className="w-full bg-transparent rounded-xl px-4 py-3 text-sm text-white border border-white/10 focus:border-white/30 outline-none"
              />
            </div>
          </div>

          <div className="rounded-xl border border-white/10 bg-white/5 p-3 grid grid-cols-2 gap-3 text-center">
            <div>
              <p className="text-[10px] uppercase tracking-wide text-gray-400 font-bold">TVA</p>
              <p className="text-sm font-black text-white">{montantTvaCalcule.toFixed(2)} EUR</p>
            </div>
            <div>
              <p className="text-[10px] uppercase tracking-wide text-red-400 font-bold">Total TTC</p>
              <p className="text-sm font-black text-red-400">{montantTtcCalcule.toFixed(2)} EUR</p>
            </div>
          </div>

          <div>
            <label className="text-xs font-bold text-white mb-1 block">Note (optionnel)</label>
            <input
              className="w-full bg-transparent rounded-xl px-4 py-3 text-sm text-white border border-white/10 focus:border-white/30 outline-none"
              placeholder="ex: Materiaux Leroy Merlin"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          <div
            className="border-2 border-dashed border-white/10 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer gap-2 bg-transparent active:bg-white/10 transition"
            onClick={() => fileRef.current?.click()}
          >
            {preview ? (
              <Image src={preview} alt="preview" className="max-h-48 rounded-xl object-contain"  width={100} height={100} />
            ) : (
              <>
                <Upload size={32} className="text-white" />
                <p className="text-sm font-bold text-white text-center">Appuyer pour scanner / choisir une photo</p>
                <p className="text-xs text-gray-400">JPG, PNG, HEIC acceptes</p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {error && (
            <div className="bg-red-900/20 border border-[#E30613] rounded-xl p-3">
              <p className="text-xs text-[#E30613] font-bold leading-relaxed">{error}</p>
            </div>
          )}

          {success && (
            <div className="bg-green-900/20 border border-white/10 rounded-xl p-3 flex items-center gap-2">
              <Check size={16} className="text-red-400 shrink-0" />
              <p className="text-xs text-red-400 font-bold">Document enregistre avec succes !</p>
            </div>
          )}

          <button
            onClick={handleUpload}
            disabled={uploading || !file}
            className="w-full h-[56px] bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 transition-colors shadow-md"
          >
            {uploading
              ? <><Loader2 size={20} className="animate-spin" /> Envoi en cours...</>
              : <><Upload size={20} /> Enregistrer le document</>
            }
          </button>
        </div>

        <div className="bg-[#1A1D24] border border-white/10 rounded-[16px] p-4">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-white">Documents enregistres</h2>
            <span className="bg-[#1A1D24] text-white text-[10px] font-bold px-2 py-0.5 rounded-full border border-white/10">{documents.length}</span>
          </div>
          {loadingDocs ? (
            <div className="flex justify-center py-8">
              <Loader2 className="animate-spin text-white" size={24} />
            </div>
          ) : documents.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-6 italic">Aucun document enregistre</p>
          ) : (
            <div className="space-y-2">
              {documents.map((d) => (
                <div
                  key={d.id}
                  onClick={() => window.open(d.url_image, '_blank')}
                  className="flex items-center gap-3 rounded-xl border border-white/10 p-2 cursor-pointer active:bg-white/5"
                >
                  <Image src={d.url_image} alt={d.type} className="w-14 h-14 rounded-lg object-cover shrink-0"  width={100} height={100} />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded ${d.type === 'bl' ? 'bg-blue-600/30 text-blue-300' : 'bg-emerald-600/30 text-emerald-300'}`}>
                        {d.type === 'bl' ? 'BL' : 'Ticket'}
                      </span>
                      <span className="text-xs text-gray-400">{new Date(d.date).toLocaleDateString('fr-FR')}</span>
                    </div>
                    {d.note && <p className="text-xs text-gray-300 truncate mt-0.5">{d.note}</p>}
                    <p className="text-sm font-bold text-white mt-0.5">{d.montant_ttc.toFixed(2)} EUR TTC</p>
                  </div>
                  <button
                    onClick={(e) => { e.stopPropagation(); handleDelete(d.id); }}
                    className="w-8 h-8 shrink-0 bg-[#E30613] rounded-full flex items-center justify-center"
                  >
                    <Trash2 size={14} className="text-white" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

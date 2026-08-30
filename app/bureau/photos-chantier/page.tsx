'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Check, Loader2, Trash2 } from 'lucide-react';

interface Photo {
  id: string;
  url_image: string;
  titre: string;
  date_ajout: string;
  chantier_id: string;
}

export default function PhotosChantierAdmin() {
  const [chantier_id, setChantier_id] = useState('');
  const [titre, setTitre] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [loadingPhotos, setLoadingPhotos] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const loadPhotos = async () => {
    if (!chantier_id.trim()) return;
    setLoadingPhotos(true);
    const res = await fetch(`/api/photos-chantier?chantier_id=${chantier_id.trim()}`);
    const data = await res.json();
    setPhotos(data.photos || []);
    setLoadingPhotos(false);
  };

  useEffect(() => { if (chantier_id.trim()) loadPhotos(); }, [chantier_id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setSuccess(false);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file || !chantier_id.trim()) { setError('Choisissez un fichier et entrez un ID chantier'); return; }
    setUploading(true); setError(null); setSuccess(false);
    const fd = new FormData();
    fd.append('file', file);
    fd.append('chantier_id', chantier_id.trim());
    fd.append('titre', titre || 'Photo chantier');
    const res = await fetch('/api/photos-chantier', { method: 'POST', body: fd });
    const data = await res.json();
    setUploading(false);
    if (data.error) { setError(data.error); return; }
    setSuccess(true);
    setFile(null); setPreview(null); setTitre('');
    if (fileRef.current) fileRef.current.value = '';
    loadPhotos();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette photo ?')) return;
    await fetch(`/api/photos-chantier?id=${id}`, { method: 'DELETE' });
    loadPhotos();
  };

  return (
    <div className="min-h-screen bg-[#F2F2F2] p-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="bg-[#111111] text-white rounded-[20px] p-5 mb-4 flex items-center gap-3">
          <span className="text-[#E30613] text-2xl">✦</span>
          <div>
            <h1 className="font-black text-lg">Photos Chantier</h1>
            <p className="text-xs text-white/60">Uploader des photos pour le client</p>
          </div>
        </div>

        {/* Form card */}
        <div className="bg-white border border-[#111111] rounded-[16px] p-4 mb-4 space-y-3">
          <div>
            <label className="text-xs font-bold text-[#111111] mb-1 block">ID du Chantier</label>
            <input
              className="w-full bg-[#F2F2F2] rounded-xl px-4 py-3 text-sm font-mono border border-transparent focus:border-[#111111] outline-none"
              placeholder="ex: 1a2b3c4d-..."
              value={chantier_id}
              onChange={e => setChantier_id(e.target.value)}
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#111111] mb-1 block">Titre / Description</label>
            <input
              className="w-full bg-[#F2F2F2] rounded-xl px-4 py-3 text-sm border border-transparent focus:border-[#111111] outline-none"
              placeholder="ex: Pose de l'isolant Façade Nord"
              value={titre}
              onChange={e => setTitre(e.target.value)}
            />
          </div>

          <div
            className="border-2 border-dashed border-[#111111] rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer gap-2 bg-[#F2F2F2]"
            onClick={() => fileRef.current?.click()}
          >
            {preview ? (
              <img src={preview} alt="preview" className="max-h-48 rounded-xl object-contain" />
            ) : (
              <>
                <Upload size={32} className="text-[#111111]" />
                <p className="text-sm font-bold text-[#111111]">Appuyer pour choisir / prendre une photo</p>
              </>
            )}
            <input ref={fileRef} type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileChange} />
          </div>

          {error && <p className="text-xs text-[#E30613] font-bold">{error}</p>}
          {success && <p className="text-xs text-green-600 font-bold flex items-center gap-1"><Check size={14} /> Photo envoyée avec succès !</p>}

          <button
            onClick={handleUpload}
            disabled={uploading || !file}
            className="w-full h-[52px] bg-[#E30613] hover:bg-[#C00510] disabled:opacity-40 text-white rounded-full font-bold flex items-center justify-center gap-2 transition-colors"
          >
            {uploading ? <><Loader2 size={18} className="animate-spin" /> Envoi...</> : <><Upload size={18} /> Envoyer la photo</>}
          </button>
        </div>

        {/* Gallery */}
        {chantier_id.trim() && (
          <div className="bg-white border border-[#111111] rounded-[16px] p-4">
            <h2 className="font-bold text-[#111111] mb-3">Photos envoyées ({photos.length})</h2>
            {loadingPhotos ? (
              <div className="flex justify-center py-8"><Loader2 className="animate-spin text-[#111111]" /></div>
            ) : photos.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-4 italic">Aucune photo pour ce chantier</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {photos.map(p => (
                  <div key={p.id} className="relative rounded-xl overflow-hidden border border-[#111111] group">
                    <img src={p.url_image} alt={p.titre} className="w-full aspect-square object-cover" />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-2 py-1 font-bold truncate">{p.titre}</div>
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="absolute top-2 right-2 w-7 h-7 bg-[#E30613] rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                    >
                      <Trash2 size={12} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

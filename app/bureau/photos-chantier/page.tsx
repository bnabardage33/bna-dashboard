'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Upload, Check, Loader2, Trash2, ChevronDown } from 'lucide-react';

interface Photo {
  id: string;
  url_image: string;
  titre: string;
  date_ajout: string;
  chantier_id: string;
}

interface Chantier {
  id: string;
  nom: string;
  adresse_chantier?: string;
  statut?: string;
}

export default function PhotosChantierAdmin() {
  const [chantiersList, setChantiersList] = useState<Chantier[]>([]);
  const [loadingChantiers, setLoadingChantiers] = useState(true);
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

  // Charger la liste des chantiers au montage
  useEffect(() => {
    const fetchChantiers = async () => {
      setLoadingChantiers(true);
      try {
        const res = await fetch('/api/photos-chantier');
        const data = await res.json();
        if (data.error) {
          setError(`Erreur chargement chantiers : ${data.error}`);
        } else {
          setChantiersList(data.chantiers || []);
          // Pré-sélectionner le premier chantier
          if (data.chantiers?.length > 0) {
            setChantier_id(data.chantiers[0].id);
          }
        }
      } catch (e: any) {
        setError(`Erreur réseau : ${e.message}`);
      } finally {
        setLoadingChantiers(false);
      }
    };
    fetchChantiers();
  }, []);

  // Charger les photos quand le chantier change
  const loadPhotos = async (id?: string) => {
    const cid = id ?? chantier_id;
    if (!cid) return;
    setLoadingPhotos(true);
    try {
      const res = await fetch(`/api/photos-chantier?chantier_id=${cid}`);
      const data = await res.json();
      setPhotos(data.photos || []);
    } catch {
      // ignore
    } finally {
      setLoadingPhotos(false);
    }
  };

  useEffect(() => {
    if (chantier_id) loadPhotos(chantier_id);
  }, [chantier_id]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setPreview(URL.createObjectURL(f));
    setSuccess(false);
    setError(null);
  };

  const handleUpload = async () => {
    if (!file) { setError('Choisissez une photo avant d\'envoyer.'); return; }
    if (!chantier_id) { setError('Sélectionnez un chantier.'); return; }

    setUploading(true);
    setError(null);
    setSuccess(false);

    try {
      const fd = new FormData();
      fd.append('file', file);
      fd.append('chantier_id', chantier_id);
      fd.append('titre', titre.trim() || 'Photo chantier');

      const res = await fetch('/api/photos-chantier', { method: 'POST', body: fd });

      // Tenter de parser le JSON même si le statut est une erreur
      let data: any = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(`Réponse invalide du serveur (HTTP ${res.status})`);
      }

      if (!res.ok || data.error) {
        throw new Error(data.error || `Erreur serveur HTTP ${res.status}`);
      }

      setSuccess(true);
      setFile(null);
      setPreview(null);
      setTitre('');
      if (fileRef.current) fileRef.current.value = '';
      loadPhotos(chantier_id);
    } catch (e: any) {
      setError(`❌ Échec de l'envoi : ${e.message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette photo définitivement ?')) return;
    try {
      await fetch(`/api/photos-chantier?id=${id}`, { method: 'DELETE' });
      loadPhotos(chantier_id);
    } catch (e: any) {
      setError(`Erreur suppression : ${e.message}`);
    }
  };

  const selectedChantier = chantiersList.find(c => c.id === chantier_id);

  return (
    <div className="min-h-screen bg-[#F2F2F2] p-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        <div className="bg-[#111111] text-white rounded-[20px] p-5 mb-4 flex items-center gap-3">
          <span className="text-[#E30613] text-2xl">✦</span>
          <div>
            <h1 className="font-black text-lg">Photos Chantier</h1>
            <p className="text-xs text-white/60">Uploader des photos VIP pour le client</p>
          </div>
        </div>

        {/* Form card */}
        <div className="bg-white border border-[#111111] rounded-[16px] p-4 mb-4 space-y-4">

          {/* SELECT CHANTIER */}
          <div>
            <label className="text-xs font-bold text-[#111111] mb-1 block">Chantier</label>
            {loadingChantiers ? (
              <div className="w-full bg-[#F2F2F2] rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-gray-400">
                <Loader2 size={14} className="animate-spin" /> Chargement des chantiers...
              </div>
            ) : (
              <div className="relative">
                <select
                  className="w-full bg-[#F2F2F2] rounded-xl px-4 py-3 text-sm font-bold border border-transparent focus:border-[#111111] outline-none appearance-none cursor-pointer"
                  value={chantier_id}
                  onChange={e => setChantier_id(e.target.value)}
                >
                  {chantiersList.length === 0 && (
                    <option value="">Aucun chantier trouvé</option>
                  )}
                  {chantiersList.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.nom} {c.adresse_chantier ? `— ${c.adresse_chantier}` : ''}
                    </option>
                  ))}
                </select>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-[#111111] pointer-events-none" />
              </div>
            )}
            {selectedChantier && (
              <p className="text-[10px] text-gray-400 mt-1 font-mono px-1 truncate">ID: {selectedChantier.id}</p>
            )}
          </div>

          {/* TITRE */}
          <div>
            <label className="text-xs font-bold text-[#111111] mb-1 block">Titre / Description</label>
            <input
              className="w-full bg-[#F2F2F2] rounded-xl px-4 py-3 text-sm border border-transparent focus:border-[#111111] outline-none"
              placeholder="ex: Pose de l'isolant — Façade Nord"
              value={titre}
              onChange={e => setTitre(e.target.value)}
            />
          </div>

          {/* ZONE PHOTO */}
          <div
            className="border-2 border-dashed border-[#111111] rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer gap-2 bg-[#F2F2F2] active:bg-gray-200 transition"
            onClick={() => fileRef.current?.click()}
          >
            {preview ? (
              <img src={preview} alt="preview" className="max-h-48 rounded-xl object-contain" />
            ) : (
              <>
                <Upload size={32} className="text-[#111111]" />
                <p className="text-sm font-bold text-[#111111] text-center">Appuyer pour prendre / choisir une photo</p>
                <p className="text-xs text-gray-400">JPG, PNG, HEIC acceptés</p>
              </>
            )}
            <input
              ref={fileRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          {/* ERREUR */}
          {error && (
            <div className="bg-red-50 border border-[#E30613] rounded-xl p-3">
              <p className="text-xs text-[#E30613] font-bold leading-relaxed">{error}</p>
            </div>
          )}

          {/* SUCCÈS */}
          {success && (
            <div className="bg-green-50 border border-green-500 rounded-xl p-3 flex items-center gap-2">
              <Check size={16} className="text-green-600 shrink-0" />
              <p className="text-xs text-green-700 font-bold">Photo envoyée avec succès !</p>
            </div>
          )}

          {/* BOUTON ENVOI */}
          <button
            onClick={handleUpload}
            disabled={uploading || !file || !chantier_id}
            className="w-full h-[56px] bg-[#E30613] hover:bg-[#C00510] disabled:opacity-40 text-white rounded-full font-bold text-[15px] flex items-center justify-center gap-2 transition-colors"
          >
            {uploading
              ? <><Loader2 size={20} className="animate-spin" /> Envoi en cours...</>
              : <><Upload size={20} /> Envoyer la photo</>
            }
          </button>
        </div>

        {/* GALERIE */}
        {chantier_id && (
          <div className="bg-white border border-[#111111] rounded-[16px] p-4">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-[#111111]">Photos envoyées</h2>
              <span className="bg-[#111111] text-white text-[10px] font-bold px-2 py-0.5 rounded-full">{photos.length}</span>
            </div>
            {loadingPhotos ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-[#111111]" size={24} />
              </div>
            ) : photos.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6 italic">Aucune photo pour ce chantier</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {photos.map(p => (
                  <div key={p.id} className="relative rounded-xl overflow-hidden border border-[#111111] group">
                    <img src={p.url_image} alt={p.titre} className="w-full aspect-square object-cover" />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-[10px] px-2 py-1 font-bold truncate">{p.titre}</div>
                    {/* Bouton delete visible sur mobile tap */}
                    <button
                      onClick={() => handleDelete(p.id)}
                      className="absolute top-2 right-2 w-8 h-8 bg-[#E30613] rounded-full flex items-center justify-center opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity cursor-pointer shadow"
                    >
                      <Trash2 size={14} className="text-white" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* SQL HINT SI ERREUR SUPABASE */}
        <div className="mt-6 bg-white border border-dashed border-gray-300 rounded-[16px] p-4">
          <p className="text-[10px] font-bold text-gray-400 mb-2">🔒 Si l'upload échoue (RLS), exécute ce SQL dans Supabase :</p>
          <pre className="text-[10px] text-gray-600 bg-gray-50 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap">{`-- TABLE: autorise tout depuis le serveur (service_role bypasse déjà)
-- Si tu veux aussi l'accès depuis le navigateur (anon):
ALTER TABLE photos_chantier ENABLE ROW LEVEL SECURITY;
CREATE POLICY "insert_photos" ON photos_chantier
  FOR INSERT WITH CHECK (true);
CREATE POLICY "select_photos" ON photos_chantier
  FOR SELECT USING (true);
CREATE POLICY "delete_photos" ON photos_chantier
  FOR DELETE USING (true);

-- STORAGE: bucket "chantiers-photos" doit être PUBLIC
-- Dans Supabase > Storage > chantiers-photos > Settings > Public = ON`}</pre>
        </div>
      </div>
    </div>
  );
}

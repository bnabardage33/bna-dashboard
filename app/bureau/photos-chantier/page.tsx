'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Upload, Check, Loader2, Trash2, ChevronDown } from 'lucide-react';
import Image from "next/image";
import { Surface } from '@/components/ui/Surface';

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
      } catch (e) {
        setError(`Erreur réseau : ${(e as Error).message}`);
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
      let data: { error?: string | null } = {};
      try {
        data = await res.json();
      } catch {
        throw new Error(`Réponse invalide du serveur (HTTP ${res.status})`);
      }

      if (!res.ok || data.error) {
        throw new Error(String(data.error) || `Erreur serveur HTTP ${res.status}`);
      }

      setSuccess(true);
      setFile(null);
      setPreview(null);
      setTitre('');
      if (fileRef.current) fileRef.current.value = '';
      loadPhotos(chantier_id);
    } catch (e) {
      setError(`❌ Échec de l'envoi : ${(e as Error).message}`);
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Supprimer cette photo définitivement ?')) return;
    try {
      await fetch(`/api/photos-chantier?id=${id}`, { method: 'DELETE' });
      loadPhotos(chantier_id);
    } catch (e) {
      setError(`Erreur suppression : ${(e as Error).message}`);
    }
  };

  const selectedChantier = chantiersList.find(c => c.id === chantier_id);

  return (
    <div className="min-h-screen bg-transparent p-4">
      <div className="max-w-xl mx-auto">
        {/* Header */}
        

        {/* Form card */}
        <Surface className="p-4 mb-4 space-y-4" radius="2xl">

          {/* SELECT CHANTIER */}
          <div>
            <label className="text-xs font-bold text-white mb-1 block">Chantier</label>
            {loadingChantiers ? (
              <div className="w-full bg-transparent rounded-xl px-4 py-3 flex items-center gap-2 text-sm text-gray-400">
                <Loader2 size={14} className="animate-spin" /> Chargement des chantiers...
              </div>
            ) : (
              <div className="relative">
                <select
                  className="w-full bg-transparent rounded-xl px-4 py-3 text-sm font-bold border border-transparent focus:border-white/10 outline-none appearance-none cursor-pointer"
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
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-white pointer-events-none" />
              </div>
            )}
            {selectedChantier && (
              <p className="text-2xs text-gray-400 mt-1 font-mono px-1 truncate">ID: {selectedChantier.id}</p>
            )}
          </div>

          {/* TITRE */}
          <div>
            <label className="text-xs font-bold text-white mb-1 block">Titre / Description</label>
            <input
              className="w-full bg-transparent rounded-xl px-4 py-3 text-sm border border-transparent focus:border-white/10 outline-none"
              placeholder="ex: Pose de l'isolant — Façade Nord"
              value={titre}
              onChange={e => setTitre(e.target.value)}
            />
          </div>

          {/* ZONE PHOTO */}
          <div
            className="border-2 border-dashed border-white/10 rounded-xl p-6 flex flex-col items-center justify-center cursor-pointer gap-2 bg-transparent active:bg-white/10 transition"
            onClick={() => fileRef.current?.click()}
          >
            {preview ? (
              <Image src={preview} alt="preview" className="max-h-48 rounded-xl object-contain"  width={100} height={100} />
            ) : (
              <>
                <Upload size={32} className="text-white" />
                <p className="text-sm font-bold text-white text-center">Appuyer pour prendre / choisir une photo</p>
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
            <div className="bg-red-900/20 border border-[#E30613] rounded-xl p-3">
              <p className="text-xs text-[#E30613] font-bold leading-relaxed">{error}</p>
            </div>
          )}

          {/* SUCCÈS */}
          {success && (
            <div className="bg-green-900/20 border border-white/10 rounded-xl p-3 flex items-center gap-2">
              <Check size={16} className="text-red-400 shrink-0" />
              <p className="text-xs text-red-400 font-bold">Photo envoyée avec succès !</p>
            </div>
          )}

          {/* BOUTON ENVOI */}
          <button
            onClick={handleUpload}
            disabled={uploading || !file || !chantier_id}
            className="w-full h-[56px] bg-red-600 hover:bg-red-700 disabled:opacity-40 text-white rounded-xl font-bold text-[15px] flex items-center justify-center gap-2 transition-colors shadow-md"
          >
            {uploading
              ? <><Loader2 size={20} className="animate-spin" /> Envoi en cours...</>
              : <><Upload size={20} /> Envoyer la photo</>
            }
          </button>
        </Surface>

        {/* GALERIE */}
        {chantier_id && (
          <Surface className="p-4" radius="2xl">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-bold text-white">Photos envoyées</h2>
              <span className="bg-[#1A1D24] text-white text-2xs font-bold px-2 py-0.5 rounded-full">{photos.length}</span>
            </div>
            {loadingPhotos ? (
              <div className="flex justify-center py-8">
                <Loader2 className="animate-spin text-white" size={24} />
              </div>
            ) : photos.length === 0 ? (
              <p className="text-sm text-gray-400 text-center py-6 italic">Aucune photo pour ce chantier</p>
            ) : (
              <div className="grid grid-cols-2 gap-3">
                {photos.map(p => (
                  <div key={p.id} className="relative rounded-xl overflow-hidden border border-white/10 group">
                    <Image src={p.url_image} alt={p.titre} className="w-full aspect-square object-cover"  width={100} height={100} />
                    <div className="absolute bottom-0 left-0 right-0 bg-black/70 text-white text-2xs px-2 py-1 font-bold truncate">{p.titre}</div>
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
          </Surface>
        )}

        {/* SQL HINT SI ERREUR SUPABASE */}
        <div className="mt-6 bg-[#1A1D24] border border-dashed border-white/20 rounded-2xl p-4">
          <p className="text-2xs font-bold text-gray-400 mb-2">🔒 Si l'upload échoue (RLS), exécute ce SQL dans Supabase :</p>
          <pre className="text-2xs text-gray-400 bg-white/5 p-2 rounded-lg overflow-x-auto whitespace-pre-wrap">{`-- TABLE: autorise tout depuis le serveur (service_role bypasse déjà)
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

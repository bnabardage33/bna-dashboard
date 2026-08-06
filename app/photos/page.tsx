'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Chantier = {
  id: string
  clients: { nom: string } | null
}

type Photo = {
  id: string
  chantier_id: string
  url: string
  type: string
  date_prise: string
}

export default function PhotosPage() {
  const [chantiers, setChantiers] = useState<Chantier[]>([])
  const [photos, setPhotos] = useState<Photo[]>([])
  const [chantierId, setChantierId] = useState('')
  const [type, setType] = useState('avant')
  const [uploading, setUploading] = useState(false)
  const [loading, setLoading] = useState(true)

  async function fetchChantiers() {
    const { data } = await supabase
      .from('chantiers')
      .select('id, clients(nom)')
      .order('created_at', { ascending: false })
    if (data) setChantiers(data as unknown as Chantier[])
  }

  async function fetchPhotos() {
    setLoading(true)
    const { data, error } = await supabase
      .from('photos')
      .select('*')
      .order('date_prise', { ascending: false })
    if (error) console.error(error)
    else setPhotos(data as Photo[])
    setLoading(false)
  }

  useEffect(() => {
    fetchChantiers()
    fetchPhotos()
  }, [])

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file || !chantierId) {
      alert('Choisis un chantier avant d\'ajouter une photo.')
      return
    }

    setUploading(true)

    const fileName = `${chantierId}/${Date.now()}-${file.name}`
    const { error: uploadError } = await supabase.storage
      .from('photos')
      .upload(fileName, file)

    if (uploadError) {
      alert('Erreur upload : ' + uploadError.message)
      setUploading(false)
      return
    }

    const { data: urlData } = supabase.storage.from('photos').getPublicUrl(fileName)

    const { error: insertError } = await supabase.from('photos').insert({
      chantier_id: chantierId,
      url: urlData.publicUrl,
      type,
      date_prise: new Date().toISOString(),
    })

    if (insertError) {
      alert('Erreur enregistrement : ' + insertError.message)
    }

    setUploading(false)
    fetchPhotos()
    e.target.value = ''
  }

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Photos</h1>

      <div className="mb-8 space-y-3 border p-4 rounded-lg">
        <h2 className="font-semibold">Ajouter une photo</h2>
        <select
          className="border p-2 w-full rounded"
          value={chantierId}
          onChange={(e) => setChantierId(e.target.value)}
        >
          <option value="">-- Choisir un chantier --</option>
          {chantiers.map((c) => (
            <option key={c.id} value={c.id}>{c.clients?.nom || 'Client inconnu'}</option>
          ))}
        </select>
        <select
          className="border p-2 w-full rounded"
          value={type}
          onChange={(e) => setType(e.target.value)}
        >
          <option value="avant">Avant</option>
          <option value="pendant">Pendant</option>
          <option value="apres">Après</option>
        </select>
        <input
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleUpload}
          disabled={uploading}
          className="border p-2 w-full rounded"
        />
        {uploading && <p className="text-sm text-gray-500">Envoi en cours...</p>}
      </div>

      <h2 className="font-semibold mb-3">Galerie</h2>
      {loading ? (
        <p>Chargement...</p>
      ) : photos.length === 0 ? (
        <p className="text-gray-500">Aucune photo pour l'instant.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          {photos.map((p) => (
            <div key={p.id} className="border rounded-lg overflow-hidden">
              <img src={p.url} alt={p.type} className="w-full h-32 object-cover" />
              <p className="text-xs p-1 bg-gray-100 capitalize">{p.type}</p>
            </div>
          ))}
        </div>
      )}
    </main>
  )
}

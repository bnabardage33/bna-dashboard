'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Client = {
  id: string
  nom: string
  adresse_chantier: string | null
}

type Chantier = {
  id: string
  client_id: string
  date_debut: string | null
  date_fin: string | null
  statut: string
  checklist: {
    tasseaux?: boolean
    pare_pluie?: boolean
    pose?: boolean
    finition?: boolean
  }
  clients: { nom: string; adresse_chantier: string | null } | null
}

export default function ChantiersPage() {
  const [chantiers, setChantiers] = useState<Chantier[]>([])
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [clientId, setClientId] = useState('')
  const [dateDebut, setDateDebut] = useState('')
  const [dateFin, setDateFin] = useState('')
  const [meteoMsg, setMeteoMsg] = useState<{ [key: string]: string }>({})

  async function fetchClients() {
    const { data } = await supabase.from('clients').select('id, nom, adresse_chantier').order('nom')
    if (data) setClients(data as Client[])
  }

  async function fetchChantiers() {
    setLoading(true)
    const { data, error } = await supabase
      .from('chantiers')
      .select('*, clients(nom, adresse_chantier)')
      .order('created_at', { ascending: false })

    if (error) console.error(error)
    else setChantiers(data as Chantier[])
    setLoading(false)
  }

  useEffect(() => {
    fetchClients()
    fetchChantiers()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!clientId) return

    const { error } = await supabase.from('chantiers').insert({
      client_id: clientId,
      date_debut: dateDebut || null,
      date_fin: dateFin || null,
      statut: 'prevu',
      checklist: { tasseaux: false, pare_pluie: false, pose: false, finition: false },
    })

    if (error) {
      alert('Erreur : ' + error.message)
      return
    }

    setClientId('')
    setDateDebut('')
    setDateFin('')
    fetchChantiers()
  }

  async function toggleTache(chantier: Chantier, tache: string) {
    const newChecklist = { ...chantier.checklist, [tache]: !chantier.checklist[tache as keyof typeof chantier.checklist] }
    const { error } = await supabase
      .from('chantiers')
      .update({ checklist: newChecklist })
      .eq('id', chantier.id)

    if (!error) fetchChantiers()
  }

  async function changerStatut(chantier: Chantier, statut: string) {
    const { error } = await supabase.from('chantiers').update({ statut }).eq('id', chantier.id)
    if (!error) fetchChantiers()
  }

  async function verifierMeteo(chantier: Chantier) {
    const adresse = chantier.clients?.adresse_chantier
    if (!adresse) {
      setMeteoMsg((m) => ({ ...m, [chantier.id]: "Pas d'adresse renseignée pour ce client." }))
      return
    }

    const apiKey = process.env.NEXT_PUBLIC_OPENWEATHER_API_KEY

    try {
      const geoRes = await fetch(
        `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(adresse)}&limit=1`
      )
      const geoData = await geoRes.json()

      if (!geoData.features || geoData.features.length === 0) {
        setMeteoMsg((m) => ({ ...m, [chantier.id]: "Adresse introuvable (vérifie qu'elle inclut la ville)." }))
        return
      }

      const [lon, lat] = geoData.features[0].geometry.coordinates
      const villeTrouvee = geoData.features[0].properties.city

      const forecastRes = await fetch(
        `https://api.openweathermap.org/data/2.5/forecast?lat=${lat}&lon=${lon}&appid=${apiKey}&units=metric&lang=fr`
      )
      const forecastData = await forecastRes.json()

      if (!forecastData.list) {
        setMeteoMsg((m) => ({ ...m, [chantier.id]: 'Erreur météo : ' + (forecastData.message || 'clé API pas encore active ?') }))
        return
      }

      const targetTime = Date.now() + 6 * 24 * 60 * 60 * 1000
      let closest = forecastData.list[0]
      let closestDiff = Infinity
      for (const entry of forecastData.list) {
        const diff = Math.abs(entry.dt * 1000 - targetTime)
        if (diff < closestDiff) {
          closestDiff = diff
          closest = entry
        }
      }

      const probaPluie = Math.round((closest.pop || 0) * 100)
      const temp = Math.round(closest.main.temp)
      const description = closest.weather[0].description
      const statutMeteo = probaPluie >= 50 ? 'alerte' : 'normal'

      await supabase.from('meteo_log').insert({
        chantier_id: chantier.id,
        date: new Date(closest.dt * 1000).toISOString().split('T')[0],
        prevision_json: closest,
        probabilite_pluie: probaPluie,
        temperature: temp,
        statut: statutMeteo,
      })

      const alerte = probaPluie >= 50 ? ' ⚠️ Reporter la pose ?' : ''
      setMeteoMsg((m) => ({
        ...m,
        [chantier.id]: `${villeTrouvee} — J+6 : ${description}, ${temp}°C, pluie ${probaPluie}%.${alerte}`,
      }))
    } catch (err) {
      setMeteoMsg((m) => ({ ...m, [chantier.id]: 'Erreur météo : ' + (err as Error).message }))
    }
  }

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Chantiers</h1>

      <form onSubmit={handleSubmit} className="mb-8 space-y-3 border p-4 rounded-lg">
        <h2 className="font-semibold">Créer un chantier</h2>
        <select
          className="border p-2 w-full rounded"
          value={clientId}
          onChange={(e) => setClientId(e.target.value)}
          required
        >
          <option value="">-- Choisir un client --</option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>{c.nom}</option>
          ))}
        </select>
        <label className="block text-sm">Date début</label>
        <input
          type="date"
          className="border p-2 w-full rounded"
          value={dateDebut}
          onChange={(e) => setDateDebut(e.target.value)}
        />
        <label className="block text-sm">Date fin</label>
        <input
          type="date"
          className="border p-2 w-full rounded"
          value={dateFin}
          onChange={(e) => setDateFin(e.target.value)}
        />
        <button type="submit" className="bg-black text-white px-4 py-2 rounded">
          Créer le chantier
        </button>
      </form>

      <h2 className="font-semibold mb-3">Liste des chantiers</h2>
      {loading ? (
        <p>Chargement...</p>
      ) : chantiers.length === 0 ? (
        <p className="text-gray-500">Aucun chantier pour l'instant.</p>
      ) : (
        <ul className="space-y-3">
          {chantiers.map((ch) => (
            <li key={ch.id} className="border p-3 rounded-lg">
              <p className="font-medium">{ch.clients?.nom || 'Client inconnu'}</p>
              <p className="text-sm text-gray-600">
                {ch.date_debut || '?'} → {ch.date_fin || '?'}
              </p>
              <select
                className="border p-1 rounded mt-2 text-sm"
                value={ch.statut}
                onChange={(e) => changerStatut(ch, e.target.value)}
              >
                <option value="prevu">Prévu</option>
                <option value="en_cours">En cours</option>
                <option value="termine">Terminé</option>
              </select>
              <div className="mt-2 space-y-1 text-sm">
                {['tasseaux', 'pare_pluie', 'pose', 'finition'].map((tache) => (
                  <label key={tache} className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={!!ch.checklist?.[tache as keyof typeof ch.checklist]}
                      onChange={() => toggleTache(ch, tache)}
                    />
                    {tache.replace('_', ' ')}
                  </label>
                ))}
              </div>

              {ch.statut !== 'termine' && (
                <div className="mt-3">
                  <button
                    onClick={() => verifierMeteo(ch)}
                    className="bg-blue-600 text-white px-3 py-1 rounded text-sm"
                  >
                    Vérifier météo
                  </button>
                  {meteoMsg[ch.id] && (
                    <p className="text-sm mt-2 text-gray-700">{meteoMsg[ch.id]}</p>
                  )}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

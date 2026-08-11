'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabase'

type Client = {
  id: string
  nom: string
  adresse_chantier: string | null
  tel: string | null
  email: string | null
  created_at: string
}

export default function ClientsPage() {
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [nom, setNom] = useState('')
  const [adresse, setAdresse] = useState('')
  const [tel, setTel] = useState('')
  const [email, setEmail] = useState('')

  async function fetchClients() {
    setLoading(true)
    const { data, error } = await supabase
      .from('clients')
      .select('*')
      .order('created_at', { ascending: false })

    if (error) console.error(error)
    else setClients(data as Client[])
    setLoading(false)
  }

  useEffect(() => {
    fetchClients()
  }, [])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!nom) return

    const { error } = await supabase.from('clients').insert({
      nom,
      adresse_chantier: adresse || null,
      tel: tel || null,
      email: email || null,
    })

    if (error) {
      alert('Erreur : ' + error.message)
      return
    }

    setNom('')
    setAdresse('')
    setTel('')
    setEmail('')
    fetchClients()
  }

  return (
    <main className="p-6 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-6">Clients</h1>

      <form onSubmit={handleSubmit} className="mb-8 space-y-3 border p-4 rounded-lg">
        <h2 className="font-semibold">Ajouter un client</h2>
        <input
          className="border p-2 w-full rounded"
          placeholder="Nom"
          value={nom}
          onChange={(e) => setNom(e.target.value)}
          required
        />
        <input
          className="border p-2 w-full rounded"
          placeholder="Adresse chantier"
          value={adresse}
          onChange={(e) => setAdresse(e.target.value)}
        />
        <input
          className="border p-2 w-full rounded"
          placeholder="Téléphone"
          value={tel}
          onChange={(e) => setTel(e.target.value)}
        />
        <input
          className="border p-2 w-full rounded"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />
        <button type="submit" className="bg-black text-white px-4 py-2 rounded">
          Ajouter
        </button>
      </form>

      <h2 className="font-semibold mb-3">Liste des clients</h2>
      {loading ? (
        <p>Chargement...</p>
      ) : clients.length === 0 ? (
        <p className="text-gray-500">Aucun client pour l'instant.</p>
      ) : (
        <ul className="space-y-2">
          {clients.map((c) => (
            <li key={c.id} className="border p-3 rounded-lg">
              <p className="font-medium">{c.nom}</p>
              {c.adresse_chantier && <p className="text-sm text-gray-600">{c.adresse_chantier}</p>}
              {c.tel && <p className="text-sm text-gray-600">{c.tel}</p>}
              {c.email && <p className="text-sm text-gray-600">{c.email}</p>}
            </li>
          ))}
        </ul>
      )}
    </main>
  )
}

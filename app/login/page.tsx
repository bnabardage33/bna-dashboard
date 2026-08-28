'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault()
    setError('')

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError("Pas de connexion internet. Verifie ton reseau et reessaie.")
      return
    }

    setLoading(true)

    try {
      const supabase = createClient()
      const { error } = await supabase.auth.signInWithPassword({ email, password })

      if (error) {
        setError('Email ou mot de passe incorrect.')
        setLoading(false)
        return
      }

      router.push('/')
      router.refresh()
    } catch (err) {
      setError("Connexion impossible. Verifie ton reseau et reessaie.")
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50">
      <form onSubmit={handleLogin} className="w-full max-w-sm bg-white p-8 rounded-2xl shadow-sm border border-slate-100 space-y-4">
        <h1 className="text-xl font-bold text-slate-800">Connexion BNA</h1>
        <input
          type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-400 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
          required
        />
        <input
          type="password" placeholder="Mot de passe" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 text-slate-900 placeholder:text-slate-400 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
          required
        />
        {error && (
          <div className="bg-red-50 border border-red-200 rounded-xl p-3">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
        <button type="submit" disabled={loading}
          className="w-full py-3 bg-slate-900 text-white rounded-xl font-bold disabled:opacity-50">
          {loading ? 'Connexion...' : error ? 'Reessayer' : 'Se connecter'}
        </button>
      </form>
    </div>
  )
}

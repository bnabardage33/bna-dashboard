'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const autoSubmitted = useRef(false)

  const submit = useCallback(async () => {
    setError('')

    if (typeof navigator !== 'undefined' && !navigator.onLine) {
      setError("Pas de connexion internet. Verifie ton reseau et reessaie.")
      return
    }

    setLoading(true)

    try {
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
  }, [email, password, router])

  const handleLogin = (e: React.FormEvent) => {
    e.preventDefault()
    submit()
  }

  // Auto-connexion quand les 2 champs sont remplis d'un coup (autofill Bitwarden)
  useEffect(() => {
    if (autoSubmitted.current) return
    if (!email || !password) return

    autoSubmitted.current = true
    const timer = setTimeout(() => {
      submit()
    }, 400)

    return () => clearTimeout(timer)
  }, [email, password, submit])

  // Auto-redirection si une session valide existe déjà.
  // Le proxy peut renvoyer vers /login « par erreur » (micro-coupure réseau
  // pendant getUser, course de rotation de jeton). Au lieu de rester bloqué
  // sur le formulaire, on regagne le tableau de bord — la session, elle,
  // est bien là.
  useEffect(() => {
    let actif = true
    supabase.auth
      .getSession()
      .then(({ data }) => {
        if (actif && data.session) {
          router.replace('/')
          router.refresh()
        }
      })
      .catch(() => {
        // hors-ligne : on reste sur le formulaire, pas de boucle
      })
    return () => {
      actif = false
    }
  }, [router])

  return (
    <div className="min-h-screen flex items-center justify-center bg-transparent">
      <form onSubmit={handleLogin} className="w-full max-w-sm bg-[#1A1D24] p-8 rounded-2xl shadow-sm border border-slate-100 space-y-4">
        <h1 className="text-xl font-bold text-gray-300">Connexion BNA</h1>
        <input
          type="email" placeholder="Email" value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="w-full px-3 py-2 text-white placeholder:text-gray-400 border border-white/10 rounded-xl outline-none focus:border-white/10"
          required
        />
        <input
          type="password" placeholder="Mot de passe" value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full px-3 py-2 text-white placeholder:text-gray-400 border border-white/10 rounded-xl outline-none focus:border-white/10"
          required
        />
        {error && (
          <div className="bg-red-900/20 border border-red-200 rounded-xl p-3">
            <p className="text-red-600 text-sm">{error}</p>
          </div>
        )}
        <button type="submit" disabled={loading}
          className="w-full py-3 bg-transparent text-white rounded-xl font-bold disabled:opacity-50">
          {loading ? 'Connexion...' : error ? 'Reessayer' : 'Se connecter'}
        </button>
      </form>
    </div>
  )
}

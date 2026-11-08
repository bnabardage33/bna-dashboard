import type { Database } from '@/types/supabase'
import { createBrowserClient } from '@supabase/ssr'

let supabaseInstance: ReturnType<typeof createBrowserClient<Database>> | null = null

export function getSupabase() {
  if (!supabaseInstance) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const anonKey =
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
      process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY

    if (!url || !anonKey) {
      throw new Error(
        'Supabase mal configuré : NEXT_PUBLIC_SUPABASE_URL et NEXT_PUBLIC_SUPABASE_ANON_KEY sont requis.'
      )
    }

    supabaseInstance = createBrowserClient<Database>(url, anonKey)
  }
  return supabaseInstance
}

// Accès PARESSEUX : importer ce module ne crée pas le client, donc ne lève pas
// au build/prerender quand les variables d'environnement ne sont pas encore
// disponibles (cas d'un prerender statique). Le client est instancié au premier
// usage réel, avec un message d'erreur explicite si la configuration manque.
export const supabase = new Proxy({} as ReturnType<typeof getSupabase>, {
  get(_target, prop) {
    const client = getSupabase()
    const value = Reflect.get(client, prop, client)
    return typeof value === 'function' ? value.bind(client) : value
  },
  has(_target, prop) {
    return prop in getSupabase()
  },
})

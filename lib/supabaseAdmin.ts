import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/types/supabase';

// ⚠️ Ce client utilise la clé service_role : il contourne toutes les
// policies RLS. Il ne doit JAMAIS être importé dans un composant "use client"
// ni exposé au navigateur — uniquement dans app/api/**/route.ts (côté serveur).

let adminInstance: SupabaseClient<Database> | null = null;

function getSupabaseAdmin(): SupabaseClient<Database> {
  if (typeof window !== 'undefined') {
    throw new Error('supabaseAdmin ne doit pas être importé côté client. Utilisez @/lib/supabase/server.ts à la place.');
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url) {
    throw new Error('NEXT_PUBLIC_SUPABASE_URL manquante dans les variables d\'environnement');
  }

  if (!serviceKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY manquante dans les variables d\'environnement');
  }

  if (!adminInstance) {
    adminInstance = createClient<Database>(url, serviceKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });
  }

  return adminInstance;
}

// Accès PARESSEUX : importer ce module ne crée pas le client et ne lève donc
// pas au build/collecte des routes si la clé service_role n'est pas encore
// disponible. L'erreur claire survient au premier usage réel.
export const supabaseAdmin = new Proxy({} as SupabaseClient<Database>, {
  get(_target, prop) {
    const client = getSupabaseAdmin();
    const value = Reflect.get(client, prop, client);
    return typeof value === 'function' ? value.bind(client) : value;
  },
  has(_target, prop) {
    return prop in getSupabaseAdmin();
  },
});

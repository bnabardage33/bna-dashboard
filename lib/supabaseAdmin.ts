import { createClient } from '@supabase/supabase-js';

// ⚠️ Ce client utilise la clé service_role : il contourne toutes les
// policies RLS. Il ne doit JAMAIS être importé dans un composant "use client"
// ni exposé au navigateur — uniquement dans app/api/**/route.ts (côté serveur).

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (typeof window !== 'undefined') {
  throw new Error('supabaseAdmin ne doit pas être importé côté client. Utilisez @/lib/supabase/server.ts à la place.');
}

if (!supabaseServiceKey) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY manquante dans les variables d\'environnement');
}

export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

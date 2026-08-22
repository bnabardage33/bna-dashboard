// lib/supabaseAdmin.ts
//
// Client Supabase avec la clé service_role.
// Bypass RLS — À N'UTILISER QUE côté serveur (routes API, Edge Functions).
// Ne JAMAIS importer ce fichier dans un composant client.

import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!

export const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey)

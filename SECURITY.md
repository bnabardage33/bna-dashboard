# Sécurité — BNA Dashboard

## ⚠️ Règles critiques

1. **`SUPABASE_SERVICE_ROLE_KEY` ne doit JAMAIS apparaître dans du code côté client.**
   - Utiliser `@/lib/supabase/server.ts` pour les Server Components et Route Handlers.
   - `lib/supabaseAdmin.ts` lance une erreur au runtime si importé côté client.

2. **Les variables d'environnement** sont dans `.env.local` (ignoré par Git). Copier `.env.example` pour configurer un nouvel environnement.

3. **RLS Supabase** : la clé `service_role` contourne toutes les policies. Utiliser `@supabase/ssr` (`createServerClient`) pour respecter les règles RLS côté serveur.

4. **Le proxy Next.js 16** (`proxy.ts`, anciennement `middleware.ts`) protège les routes internes. Les routes publiques sont dans `PUBLIC_PATHS` (`lib/supabase/middleware.ts`).

## Clés requises

| Variable | Usage | Côté |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | URL Supabase | Public |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Clé anon (lecture/écriture limitée) | Public |
| `SUPABASE_SERVICE_ROLE_KEY` | Clé admin (contourne RLS) | Serveur uniquement |
| `GOOGLE_GENERATIVE_AI_API_KEY` | IA devis (`/api/ia-devis`) | Serveur uniquement |
| `GROQ_API_KEY` | Transcription/reformulation IA | Serveur uniquement |
| `VISUALCROSSING_API_KEY` | Météo | Serveur uniquement |
| `FINANCE_PIN` | Verrouillage module Finance | Serveur uniquement |
| `METEOFRANCE_APPLICATION_ID` | Alertes Météo-France | Serveur uniquement |

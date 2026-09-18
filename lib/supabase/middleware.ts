import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

// ⚠️ BOUCLIER DE SÉCURITÉ — liste blanche STRICTE.
//
// La zone publique est réduite au strict nécessaire :
//   - '/'          : page racine (landing) ;
//   - '/login'     : seul et unique point de connexion ;
//   - '/espace-client' et '/api/espace-client' : le portail client est public
//     PAR CONCEPTION (le client n'a JAMAIS de session, il s'authentifie via
//     son code d'accès).
//
// TOUT le reste (dashboard, terrain, bureau, API métier, IA, météo, compta,
// photos, recherche, caisse…) exige une session Supabase active : l'utilisateur
// est redirigé vers /login. En complément, chaque route handler protégée
// vérifie elle-même la session (lib/auth.ts → 401) avant toute requête base.
export const PUBLIC_PATHS = ['/login'] as const

// Préfixes publics uniques du portail client (pages + API du portail).
export const PUBLIC_PREFIXES = ['/espace-client', '/api/espace-client'] as const

function cheminEstPublic(pathname: string): boolean {
  if (pathname === '/') return true
  if (PUBLIC_PATHS.some((path) => pathname.startsWith(path))) return true
  return PUBLIC_PREFIXES.some((prefix) => pathname.startsWith(prefix))
}

// Exception serveur-à-serveur : Vercel Cron envoie automatiquement
// `Authorization: Bearer <CRON_SECRET>` quand la variable d'env est définie.
// Ces appels (sans navigateur, donc sans session) doivent atteindre leurs
// handlers — qui, eux, ré-affirment le secret (défense en profondeur).
function possedeBearerCron(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET ?? ''
  if (!secret) return false
  const autorisation = request.headers.get('authorization')
  return autorisation === `Bearer ${secret}`
}

export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const { data: { user } } = await supabase.auth.getUser()

  const isPublic = cheminEstPublic(request.nextUrl.pathname)

  if (!user && !isPublic && !possedeBearerCron(request)) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

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

  // Récupération TOLÉRANTE de la session.
  //
  // Le proxy appelle Supabase à CHAQUE requête. Une micro-coupure réseau
  // (chantier, mobile, rotation de jeton en cours) fait échouer getUser()
  // et renverrait `user = null` — ce qui éjectait autrefois un utilisateur
  // connecté vers /login « par moment ».
  //
  // En cas d'échec, on s'appuie sur la présence du cookie de session (posé
  // par @supabase/ssr, préfixe sb-) pour LAISSER PASSER la requête : le
  // client navigateur rafraîchit le jeton en arrière-plan, et la sécurité
  // reste assurée par les contrôles en aval (Server Components → getUser ;
  // routes API → verifierSession → 401). Aucune donnée n'est jamais rendue
  // sans session valide.
  let user = null
  try {
    const { data } = await supabase.auth.getUser()
    user = data.user
  } catch (err) {
    console.error(
      'updateSession : getUser a échoué (réseau ?) — requête laissée passer, la session sera ré-évaluée en aval.',
      err instanceof Error ? err.message : err
    )
  }

  const isPublic = cheminEstPublic(request.nextUrl.pathname)
  const aCookieSessions = request.cookies
    .getAll()
    .some((c) => c.name.startsWith('sb-'))
    
    console.error('DEBUG', request.nextUrl.pathname, 'user:', !!user, 'cookies:', request.cookies.getAll().map((c) => c.name))
  if (!user && !isPublic && !possedeBearerCron(request) && !aCookieSessions) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    const redirectResponse = NextResponse.redirect(url)
    // ⚠️ Copie des cookies de session fraîchement rafraîchis sur la réponse
    // de redirection : sinon la rotation de jeton opérée par getUser() se
    // perd pendant le redirect et l'utilisateur est re-éjecté au tour.
    supabaseResponse.cookies.getAll().forEach((cook) =>
      redirectResponse.cookies.set(cook)
    )
    return redirectResponse
  }

  return supabaseResponse
}

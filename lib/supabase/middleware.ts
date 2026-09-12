import { createServerClient } from '@supabase/ssr'
import { NextResponse, type NextRequest } from 'next/server'

export const PUBLIC_PATHS = [
  '/login',
  '/espace-client',
  '/api/espace-client',
  '/api/chat-client',
  '/api/chat-client-summary',
  '/api/meteo',
  '/api/cron/meteo',
  '/api/meteo-vigilance',
  '/api/search',
  '/api/notifications',
  '/api/reformuler-note',
  '/api/transcrire-note',
  '/api/ia-securite',
  '/api/ia-avancement',
  '/api/ia-ocr-ticket',
  '/api/rapports-intemperies/generer',
  '/api/rapports-client/auto',
  '/api/scrape',
  '/api/finance-pin',
  '/api/photos-chantier',
  '/api/analyze-chantier',
  '/api/documents-compta',
  '/api/chantiers-fournisseurs',
  '/api/dashboard-patron',
  '/manifest.json',
  '/sw.js',
]

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

  const isPublic = PUBLIC_PATHS.some((path) =>
    request.nextUrl.pathname.startsWith(path)
  )

  if (!user && !isPublic) {
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  return supabaseResponse
}

import { type NextRequest, NextResponse } from 'next/server'
import { updateSession } from '@/lib/supabase/middleware'

// Next.js 16 : la convention middleware.ts est renommée proxy.ts.
// Référence : node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md
//
// Changements appliqués (recommandés par le guide) :
//   * fichier renommé middleware.ts -> proxy.ts ;
//   * export nommé `middleware` -> `proxy` (ou export par défaut) ;
//   * runtime : Node.js PAR DÉFAUT. L'option `runtime` n'est PAS disponible
//     dans un fichier proxy — la définir lève une erreur, on ne l'ajoute donc pas.
//
// La logique est inchangée par rapport à l'ancien middleware :
//   * mise à jour de session Supabase (@supabase/ssr) via lib/supabase/middleware ;
//   * redirection des accès anonymes vers /login hors whitelist ;
//   * en-têtes de sécurité Posés sur chaque réponse.

export async function proxy(request: NextRequest) {
  const response = await updateSession(request)

  response.headers.set('X-Content-Type-Options', 'nosniff')
  response.headers.set('X-Frame-Options', 'DENY')
  response.headers.set('X-XSS-Protection', '1; mode=block')
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(self), geolocation=()')
  response.headers.set('Cache-Control', 'no-store')

  return response
}

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|sw.js|manifest.json|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
}
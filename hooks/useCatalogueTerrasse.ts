"use client"

import { useCallback, useEffect, useState } from "react"

export type CatalogueTerrasseLame = {
  id: string
  entreprise_id: string
  designation: string | null
  description: string | null
  fournisseur: string | null
  reference_fournisseur: string | null
  essence: string | null
  type_material: string | null
  longueur_mm: number | null
  largeur_utile_mm: number | null
  epaisseur_mm: number | null
  prix_m2_ht: number | null
  prix_unitaire_lame: number | null
  image_url: string | null
  fiche_technique_pdf: string | null
  created_at: string
  updated_at: string
}

export type CatalogueTerrasseAccessoire = {
  id: string
  entreprise_id: string
  designation: string | null
  description: string | null
  fournisseur: string | null
  categorie: string | null
  materiel_compatibles: unknown
  conditionnement: string | null
  prix_conditionnement: number | null
  unite_mesure: string | null
  specifications_dt: unknown
  /** `'matiere' | 'main_oeuvre'` — nullable en base (DEFAULT 'matiere'). */
  type_cout: string | null
  pu_ht: number | null
  pu_revient: number | null
  created_at: string
  updated_at: string
}

/**
 * Charge le catalogue Terrasse via la route serveur `/api/catalogue-terrasse`.
 *
 * Ce hook NE DOIT JAMAIS importer `lib/supabase/server.ts` : ce module dépend de
 * `next/headers`, interdit dans un Client Component. Toute la récupération (et
 * la résolution du tenant) est faite côté serveur par la route.
 *
 * @param type restreint la réponse à `lames` ou `accessoires` ; omis ⇒ les deux.
 * @returns `refetch` force un rechargement (utilisé après une écriture CRUD).
 */
export function useCatalogueTerrasse(type?: "lames" | "accessoires") {
  const [lames, setLames] = useState<CatalogueTerrasseLame[]>([])
  const [accessoires, setAccessoires] = useState<CatalogueTerrasseAccessoire[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [reloadKey, setReloadKey] = useState(0)

  // Force une nouvelle exécution de l'effet de chargement (utilisé après une
  // écriture CRUD pour rafraîchir la liste sans remonter le composant).
  const refetch = useCallback(() => setReloadKey((k) => k + 1), [])

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        setLoading(true)
        // `credentials` par défaut (`same-origin`) envoie les cookies de session.
        const suffixe = type ? `?type=${type}` : ""
        const res = await fetch(`/api/catalogue-terrasse${suffixe}`, {
          cache: "no-store",
        })
        if (!res.ok) {
          let message = `Erreur ${res.status}`
          try {
            const corps = (await res.json()) as { error?: string }
            if (corps?.error) message = corps.error
          } catch {
            /* corps non JSON : on garde le message générique */
          }
          throw new Error(message)
        }
        const corps = (await res.json()) as {
          lames?: CatalogueTerrasseLame[]
          accessoires?: CatalogueTerrasseAccessoire[]
        }
        if (!mounted) return
        setLames(corps.lames ?? [])
        setAccessoires(corps.accessoires ?? [])
        setError(null)
      } catch (e) {
        if (!mounted) return
        setError(e instanceof Error ? e.message : "Erreur de chargement")
      } finally {
        if (mounted) setLoading(false)
      }
    }
    load()
    return () => {
      mounted = false
    }
  }, [type, reloadKey])

  return { lames, accessoires, loading, error, refetch }
}

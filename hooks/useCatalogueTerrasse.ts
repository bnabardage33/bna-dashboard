"use client"

import { useEffect, useState } from "react"
import { createClient } from "@/lib/supabase/server"
import { resoudreTenant } from "@/lib/tenant"

export type CatalogueTerrasseLame = {
  id: string
  entreprise_id: string
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
  categorie: string | null
  materiel_compatibles: unknown
  conditionnement: string | null
  prix_conditionnement: number | null
  unite_mesure: string | null
  specifications_dt: unknown
  created_at: string
  updated_at: string
}

export function useCatalogueTerrasse() {
  const [lames, setLames] = useState<CatalogueTerrasseLame[]>([])
  const [accessoires, setAccessoires] = useState<CatalogueTerrasseAccessoire[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let mounted = true
    async function load() {
      try {
        setLoading(true)
        const ctx = await resoudreTenant()
        if (!ctx.ok) throw new Error("Entreprise introuvable")
        const entrepriseId = ctx.entrepriseId
        const supabase = await createClient()
        const [lamesRes, accRes] = await Promise.all([
          supabase
            .from("catalogue_terrasse_lames")
            .select("*")
            .eq("entreprise_id", entrepriseId)
            .order("essence", { ascending: true })
            .order("longueur_mm", { ascending: true })
            .order("largeur_utile_mm", { ascending: true }),
          supabase
            .from("catalogue_terrasse_accessoires")
            .select("*")
            .eq("entreprise_id", entrepriseId),
        ])
        if (lamesRes.error) throw lamesRes.error
        if (accRes.error) throw accRes.error
        if (!mounted) return
        setLames((lamesRes.data as any) || [])
        setAccessoires((accRes.data as any) || [])
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
  }, [])

  return { lames, accessoires, loading, error }
}

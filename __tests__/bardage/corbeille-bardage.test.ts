// __tests__/bardage/corbeille-bardage.test.ts
// Tests unitaires et d'intégration du système de Corbeille Bardage et traitement des données GPS / Itinéraires

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  estUuid,
  mettreChantierBardageEnCorbeille,
  restaurerChantierBardage,
  supprimerDefinitivementChantierBardage,
  recupererChantiersCorbeilleBardage,
} from "@/lib/bardage/corbeilleService";
import {
  recupererChantiersCorbeilleTerrasse,
} from "@/lib/terrasse/corbeilleService";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

describe("SYSTÈME CORBEILLE BARDAGE & TRAITEMENT GPS ITINÉRAIRES", () => {
  const CHANTIER_BARDAGE_ID = "c206dbfc-72f8-440b-ae04-1025e11762a2"; // TEST_P1 Bardage HPL
  const CHANTIER_TERRASSE_ID = "55555555-5555-4555-a555-555555555555";

  let baseDonnees: {
    chantiers: Record<string, any>;
    chantier_zones: Record<string, any>;
    chantier_zones_percages: Record<string, any>;
    chantier_zones_modules: Record<string, any>;
    chantier_zones_module_groups: Record<string, any>;
    chantier_zones_ouvertures: Record<string, any>;
    chantier_terrasses: Record<string, any>;
    frais_deplacement: Record<string, any>;
    rapports_intemperies: Record<string, any>;
    factures: Record<string, any>;
    devis: Record<string, any>;
    chantier_retenues_garantie: Record<string, any>;
  };

  function createMockSupabase(): SupabaseClient<Database> {
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-chef-chantier-uuid" } },
          error: null,
        }),
      },
      from: vi.fn((table: string) => {
        return {
          select: vi.fn((cols?: string) => {
            const tableRows = Object.values(
              baseDonnees[table as keyof typeof baseDonnees] || {}
            );

            return {
              eq: vi.fn((field: string, val: any) => {
                const rows = Object.values(
                  baseDonnees[table as keyof typeof baseDonnees] || {}
                ).filter((r: any) => r[field] === val);

                const promise = Promise.resolve({ data: rows, error: null });
                return Object.assign(promise, {
                  single: vi.fn(async () => {
                    const row = rows[0];
                    if (!row) return { data: null, error: { message: "Non trouvé" } };
                    return { data: { ...row }, error: null };
                  }),
                  maybeSingle: vi.fn(async () => {
                    const row = rows[0] || null;
                    return { data: row ? { ...row } : null, error: null };
                  }),
                  order: vi.fn(() => Promise.resolve({ data: rows, error: null })),
                });
              }),
              in: vi.fn((field: string, vals: any[]) => {
                const rows = Object.values(
                  baseDonnees[table as keyof typeof baseDonnees] || {}
                ).filter((r: any) => vals.includes(r[field]));
                return Promise.resolve({ data: rows, error: null });
              }),
              order: vi.fn(() => Promise.resolve({ data: tableRows, error: null })),
            };
          }),
          update: vi.fn((updates: any) => {
            return {
              eq: vi.fn(async (field: string, val: any) => {
                const row = baseDonnees[table as keyof typeof baseDonnees]?.[val];
                if (!row) return { error: { message: "Ligne inexistante" } };
                baseDonnees[table as keyof typeof baseDonnees][val] = {
                  ...row,
                  ...updates,
                };
                return { error: null };
              }),
            };
          }),
          delete: vi.fn(() => {
            return {
              eq: vi.fn(async (field: string, val: any) => {
                const map = baseDonnees[table as keyof typeof baseDonnees] || {};
                for (const k of Object.keys(map)) {
                  if (field === "id" && k === val) {
                    delete map[k];
                  } else if (map[k][field] === val) {
                    delete map[k];
                  }
                }
                return { error: null };
              }),
              in: vi.fn(async (field: string, vals: any[]) => {
                const map = baseDonnees[table as keyof typeof baseDonnees] || {};
                for (const k of Object.keys(map)) {
                  if (vals.includes(map[k][field])) {
                    delete map[k];
                  }
                }
                return { error: null };
              }),
            };
          }),
        } as any;
      }),
    } as unknown as SupabaseClient<Database>;
  }

  beforeEach(() => {
    baseDonnees = {
      chantiers: {
        [CHANTIER_BARDAGE_ID]: {
          id: CHANTIER_BARDAGE_ID,
          nom: "TEST_P1 Bardage HPL",
          adresse_chantier: "14 Rue des Artisans, 33000 Bordeaux",
          metier: "bardage",
          statut: "en_cours",
          checklist: {
            pose: false,
            finition: false,
            tasseaux: false,
            pare_pluie: false,
          },
          created_at: "2026-11-01T10:00:00Z",
        },
        [CHANTIER_TERRASSE_ID]: {
          id: CHANTIER_TERRASSE_ID,
          nom: "Terrasse IPE Piscine",
          adresse_chantier: "8 Avenue de la Plage, 33120 Arcachon",
          metier: "terrasse",
          statut: "en_cours",
          checklist: {
            metier: "terrasse",
          },
          created_at: "2026-11-05T14:00:00Z",
        },
      },
      chantier_zones: {
        "zone-1": {
          id: "zone-1",
          chantier_id: CHANTIER_BARDAGE_ID,
          nom: "Façade Nord",
          materiau: "HPL",
          largeur: 12.5,
          hauteur_mur: 4.2,
        },
        "zone-2": {
          id: "zone-2",
          chantier_id: CHANTIER_BARDAGE_ID,
          nom: "Pignon Ouest",
          materiau: "HPL",
          largeur: 8.0,
          hauteur_mur: 6.5,
        },
      },
      chantier_zones_percages: {},
      chantier_zones_modules: {},
      chantier_zones_module_groups: {},
      chantier_zones_ouvertures: {},
      chantier_terrasses: {
        "terrasse-1": {
          id: "terrasse-1",
          chantier_id: CHANTIER_TERRASSE_ID,
          longueur_m: 10,
          largeur_m: 4,
        },
      },
      frais_deplacement: {
        "frais-1": {
          id: "frais-1",
          chantier_id: CHANTIER_BARDAGE_ID,
          date: "2026-11-02",
          adresse_depart: "Dépôt BNA, Mérignac",
          adresse_arrivee: "14 Rue des Artisans, 33000 Bordeaux",
          distance_aller_km: 18.5,
          distance_retour_km: 18.5,
          tarif_km: 0.65,
          montant_ht: 24.05,
          motif: "Livraison ossature et pare-pluie",
        },
        "frais-terrasse": {
          id: "frais-terrasse",
          chantier_id: CHANTIER_TERRASSE_ID,
          date: "2026-11-06",
          distance_aller_km: 45.0,
          distance_retour_km: 45.0,
          montant_ht: 58.5,
        },
      },
      rapports_intemperies: {
        "intemp-1": {
          id: "intemp-1",
          chantier_id: CHANTIER_BARDAGE_ID,
          date: "2026-11-03",
        },
      },
      factures: {},
      devis: {
        "dev-1": {
          id: "dev-1",
          chantier_id: CHANTIER_BARDAGE_ID,
          numero: "DEV-2026-001",
        },
      },
      chantier_retenues_garantie: {},
    };
  });

  // 1. Validation des identifiants UUID
  it("1. Valide rigoureusement le format UUID", () => {
    expect(estUuid("c206dbfc-72f8-440b-ae04-1025e11762a2")).toBe(true);
    expect(estUuid("pas-un-uuid")).toBe(false);
    expect(estUuid(null)).toBe(false);
    expect(estUuid("")).toBe(false);
  });

  // 2. Mise à la corbeille (Soft Delete) et conservation absolue des données GPS
  it("2. Mise à la corbeille : passe le statut à 'corbeille' et conserve 100% des données GPS et zones", async () => {
    const mockSupabase = createMockSupabase();

    const res = await mettreChantierBardageEnCorbeille(
      mockSupabase,
      CHANTIER_BARDAGE_ID
    );
    expect(res.success).toBe(true);

    const chantier = baseDonnees.chantiers[CHANTIER_BARDAGE_ID];
    expect(chantier.statut).toBe("corbeille");

    // Vérification des métadonnées de corbeille
    expect(chantier.checklist.corbeille).toBeDefined();
    expect(chantier.checklist.corbeille.deleted_from).toBe("bardage");
    expect(chantier.checklist.corbeille.previous_statut).toBe("en_cours");
    expect(chantier.checklist.corbeille.deleted_by).toBe("user-chef-chantier-uuid");

    // VÉRIFICATION PRIORITAIRE GPS :
    // - L'adresse physique du chantier est intacte
    expect(chantier.adresse_chantier).toBe("14 Rue des Artisans, 33000 Bordeaux");
    // - Les enregistrements de frais_deplacement ne sont PAS supprimés
    expect(baseDonnees.frais_deplacement["frais-1"]).toBeDefined();
    expect(baseDonnees.frais_deplacement["frais-1"].distance_aller_km).toBe(18.5);
    expect(baseDonnees.frais_deplacement["frais-1"].adresse_arrivee).toBe(
      "14 Rue des Artisans, 33000 Bordeaux"
    );

    // VÉRIFICATION MÉTIER BARDAGE :
    // - Les 2 façades sont 100% conservées
    expect(baseDonnees.chantier_zones["zone-1"]).toBeDefined();
    expect(baseDonnees.chantier_zones["zone-2"]).toBeDefined();
    // - Les devis et rapports d'intempéries sont conservés
    expect(baseDonnees.devis["dev-1"]).toBeDefined();
    expect(baseDonnees.rapports_intemperies["intemp-1"]).toBeDefined();
  });

  // 3. Restauration depuis la corbeille
  it("3. Restauration : rétablit le statut initial et réactive l'accès aux itinéraires GPS", async () => {
    const mockSupabase = createMockSupabase();

    // 1. Mise en corbeille
    await mettreChantierBardageEnCorbeille(mockSupabase, CHANTIER_BARDAGE_ID);
    expect(baseDonnees.chantiers[CHANTIER_BARDAGE_ID].statut).toBe("corbeille");

    // 2. Restauration
    const res = await restaurerChantierBardage(mockSupabase, CHANTIER_BARDAGE_ID);
    expect(res.success).toBe(true);

    const chantier = baseDonnees.chantiers[CHANTIER_BARDAGE_ID];
    // Statut initial restauré
    expect(chantier.statut).toBe("en_cours");
    // Clé corbeille nettoyée
    expect(chantier.checklist.corbeille).toBeUndefined();

    // Données GPS et itinéraire toujours disponibles
    expect(chantier.adresse_chantier).toBe("14 Rue des Artisans, 33000 Bordeaux");
    expect(baseDonnees.frais_deplacement["frais-1"]).toBeDefined();
    expect(baseDonnees.chantier_zones["zone-1"]).toBeDefined();
  });

  // 4. Suppression définitive : purge ordonnée et résolution du problème RESTRICT sur frais_deplacement
  it("4. Suppression définitive : purge frais_deplacement d'abord pour éviter l'erreur ON DELETE RESTRICT et éliminer les orphelins", async () => {
    const mockSupabase = createMockSupabase();

    // Mise en corbeille préalable
    await mettreChantierBardageEnCorbeille(mockSupabase, CHANTIER_BARDAGE_ID);

    // Suppression définitive
    const res = await supprimerDefinitivementChantierBardage(
      mockSupabase,
      CHANTIER_BARDAGE_ID
    );
    expect(res.success).toBe(true);

    // 1. frais_deplacement du chantier supprimé est purgé
    expect(baseDonnees.frais_deplacement["frais-1"]).toBeUndefined();
    // 2. Les itinéraires des AUTRES chantiers restent intacts
    expect(baseDonnees.frais_deplacement["frais-terrasse"]).toBeDefined();
    // 3. Les zones bardage sont purgées
    expect(baseDonnees.chantier_zones["zone-1"]).toBeUndefined();
    expect(baseDonnees.chantier_zones["zone-2"]).toBeUndefined();
    // 4. Le chantier racine est supprimé
    expect(baseDonnees.chantiers[CHANTIER_BARDAGE_ID]).toBeUndefined();
  });

  // 5. Blocage de la suppression définitive si factures émises
  it("5. Sécurité comptable : bloque la suppression définitive si des factures légales existent", async () => {
    const mockSupabase = createMockSupabase();

    baseDonnees.factures["fac-1"] = {
      id: "fac-1",
      chantier_id: CHANTIER_BARDAGE_ID,
      numero: "FAC-2026-001",
      statut: "emise",
    };

    await expect(
      supprimerDefinitivementChantierBardage(mockSupabase, CHANTIER_BARDAGE_ID)
    ).rejects.toThrow("facture(s) légale(s) émise(s)");

    // Données non détruites
    expect(baseDonnees.chantiers[CHANTIER_BARDAGE_ID]).toBeDefined();
    expect(baseDonnees.frais_deplacement["frais-1"]).toBeDefined();
  });

  // 6. Cloisonnement strict des Corbeilles Bardage et Terrasse
  it("6. Cloisonnement : la corbeille Bardage ne renvoie QUE du bardage, et la corbeille Terrasse QUE de la terrasse", async () => {
    const mockSupabase = createMockSupabase();

    // Mettre les deux chantiers en corbeille
    baseDonnees.chantiers[CHANTIER_BARDAGE_ID].statut = "corbeille";
    baseDonnees.chantiers[CHANTIER_BARDAGE_ID].checklist.corbeille = {
      deleted_from: "bardage",
      previous_statut: "en_cours",
    };
    baseDonnees.chantiers[CHANTIER_BARDAGE_ID].chantier_zones = [
      { id: "z1", nom: "Façade Nord" },
    ];
    baseDonnees.chantiers[CHANTIER_BARDAGE_ID].chantier_terrasses = [];

    baseDonnees.chantiers[CHANTIER_TERRASSE_ID].statut = "corbeille";
    baseDonnees.chantiers[CHANTIER_TERRASSE_ID].checklist.corbeille = {
      deleted_from: "terrasse",
      previous_statut: "en_cours",
    };
    baseDonnees.chantiers[CHANTIER_TERRASSE_ID].chantier_terrasses = [
      { id: "t1" },
    ];

    // Corbeille Bardage
    const corbeilleBardage = await recupererChantiersCorbeilleBardage(mockSupabase);
    expect(corbeilleBardage.some((c) => c.id === CHANTIER_BARDAGE_ID)).toBe(true);
    expect(corbeilleBardage.some((c) => c.id === CHANTIER_TERRASSE_ID)).toBe(false);

    // Corbeille Terrasse
    const corbeilleTerrasse = await recupererChantiersCorbeilleTerrasse(mockSupabase);
    expect(corbeilleTerrasse.some((c) => c.id === CHANTIER_TERRASSE_ID)).toBe(true);
    expect(corbeilleTerrasse.some((c) => c.id === CHANTIER_BARDAGE_ID)).toBe(false);
  });

  // 7. Vérifications d'interface et d'harmonisation visuelle
  it("7. Interface : Présence du bouton Corbeille dans le bandeau de /terrain/chantier", () => {
    const filePath = path.resolve(process.cwd(), "app/terrain/chantier/page.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Bouton corbeille dans le header
    expect(content).toContain("Corbeille");
    expect(content).toContain("CorbeilleBardageModal");
    expect(content).toContain("nbCorbeille");
    expect(content).toContain("setCorbeilleOuverte(true)");
  });

  it("8. Interface : Remplacement de l'action texte 'Supprimer' par l'icône corbeille et maintien du lien GPS", () => {
    const filePath = path.resolve(process.cwd(), "app/terrain/chantier/page.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Le texte d'action "Supprimer" sur la carte a été remplacé par l'action corbeille moderne
    expect(content).not.toContain('<span>Supprimer</span>');
    expect(content).not.toContain('<span>Suppression…</span>');

    // Bouton corbeille carré et icône Trash2
    expect(content).toContain("setChantierAMettreEnCorbeille(ch)");
    expect(content).toContain("Trash2");
    expect(content).toContain("ConfirmationSuppressionModal");

    // Le lien GPS Itinéraire réel est bien maintenu
    expect(content).toContain("🗺️ GPS Itinéraire");
    expect(content).toContain("google.com/maps/dir/?api=1&destination=");
  });

  it("9. Interface : Modale Corbeille Bardage complète et conforme à la charte BNA", () => {
    const filePath = path.resolve(
      process.cwd(),
      "components/bardage/CorbeilleBardageModal.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    expect(content).toContain("Corbeille des Chantiers Bardage");
    expect(content).toContain("Restaurer");
    expect(content).toContain("Supprimer définitivement");
    expect(content).toContain("ConfirmationSuppressionModal");
    expect(content).toContain("recupererChantiersCorbeilleBardage");
  });
});

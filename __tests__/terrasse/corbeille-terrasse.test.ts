// __tests__/terrasse/corbeille-terrasse.test.ts
// Tests unitaires et d'intégration du système de gestion de Corbeille et Accueil Chantier Terrasse

import { describe, it, expect, vi, beforeEach } from "vitest";
import fs from "fs";
import path from "path";
import {
  estUuid,
  mettreChantierTerrasseEnCorbeille,
  restaurerChantierTerrasse,
  supprimerDefinitivementChantierTerrasse,
  recupererChantiersCorbeilleTerrasse,
} from "@/lib/terrasse/corbeilleService";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/supabase";

describe("SYSTÈME CORBEILLE & ACCUEIL CHANTIER TERRASSE", () => {
  const MOCK_TERRASSE_ID = "11111111-1111-4111-a111-111111111111";
  const MOCK_BARDAGE_ID = "c206dbfc-72f8-440b-ae04-1025e11762a2"; // TEST_P1 Bardage HPL

  // Simulation d'une base en mémoire
  let baseDonnees: {
    chantiers: Record<string, any>;
    chantier_terrasses: Record<string, any>;
    chantier_terrasse_reservations: Record<string, any>;
    factures: Record<string, any>;
    frais_deplacement: Record<string, any>;
    devis: Record<string, any>;
  };

  function createMockSupabase(): SupabaseClient<Database> {
    return {
      auth: {
        getUser: vi.fn().mockResolvedValue({
          data: { user: { id: "user-test-uuid" } },
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
        };
      }),
    } as unknown as SupabaseClient<Database>;
  }

  beforeEach(() => {
    baseDonnees = {
      chantiers: {
        [MOCK_TERRASSE_ID]: {
          id: MOCK_TERRASSE_ID,
          nom: "Terrasse Ipe Vue Mer",
          client_id: "client-uuid-1",
          statut: "en_cours",
          metier: "terrasse",
          checklist: {
            metier: "terrasse",
            essence: "Ipe",
            surface_m2: 45,
          },
          chantier_terrasses: [
            { id: "terrasse-uuid-1", chantier_id: MOCK_TERRASSE_ID, nom: "Plage piscine" },
          ],
        },
        [MOCK_BARDAGE_ID]: {
          id: MOCK_BARDAGE_ID,
          nom: "TEST_P1 Bardage HPL",
          client_id: "client-uuid-2",
          statut: "en_cours",
          metier: "bardage",
          checklist: {
            metier: "bardage",
            zones_bardage_count: 2,
          },
          chantier_terrasses: [
            { id: "terrasse-test-p1", chantier_id: MOCK_BARDAGE_ID, nom: "Terrasse test liée" },
          ],
        },
      },
      chantier_terrasses: {
        "terrasse-uuid-1": {
          id: "terrasse-uuid-1",
          chantier_id: MOCK_TERRASSE_ID,
          nom: "Plage piscine",
        },
        "terrasse-test-p1": {
          id: "terrasse-test-p1",
          chantier_id: MOCK_BARDAGE_ID,
          nom: "Terrasse test liée",
        },
      },
      chantier_terrasse_reservations: {
        "res-1": { id: "res-1", terrasse_id: "terrasse-uuid-1", nom: "Poteau pergola" },
        "res-2": { id: "res-2", terrasse_id: "terrasse-test-p1", nom: "Arbre central" },
      },
      factures: {},
      frais_deplacement: {
        "dep-1": { id: "dep-1", chantier_id: MOCK_TERRASSE_ID, kilometres: 35 },
      },
      devis: {
        "dev-1": { id: "dev-1", chantier_id: MOCK_TERRASSE_ID, numero: "DEV-2026-001" },
      },
    };
  });

  // 1. Suppression logique d'un chantier Terrasse
  it("1. Suppression logique : place le chantier en 'corbeille' sans détruire ses données", async () => {
    const mockSupabase = createMockSupabase();

    const resultat = await mettreChantierTerrasseEnCorbeille(
      mockSupabase,
      MOCK_TERRASSE_ID
    );

    expect(resultat.success).toBe(true);
    const row = baseDonnees.chantiers[MOCK_TERRASSE_ID];
    expect(row.statut).toBe("corbeille");
    expect(row.checklist.corbeille).toBeDefined();
    expect(row.checklist.corbeille.previous_statut).toBe("en_cours");
    expect(row.checklist.corbeille.deleted_from).toBe("terrasse");
    expect(row.checklist.corbeille.deleted_at).toBeDefined();

    // Vérifie que les données techniques sont conservées
    expect(row.checklist.essence).toBe("Ipe");
    expect(baseDonnees.chantier_terrasses["terrasse-uuid-1"]).toBeDefined();
    expect(baseDonnees.chantier_terrasse_reservations["res-1"]).toBeDefined();
  });

  // 2. Disparition de la liste active
  it("2. Disparition de la liste active : les requêtes chantiers actifs excluent statut 'corbeille'", async () => {
    const mockSupabase = createMockSupabase();
    await mettreChantierTerrasseEnCorbeille(mockSupabase, MOCK_TERRASSE_ID);

    // Une requête avec .neq("statut", "corbeille") ne doit pas retourner ce chantier
    const chantiersActifs = Object.values(baseDonnees.chantiers).filter(
      (c) => c.statut !== "corbeille"
    );
    const idsActifs = chantiersActifs.map((c) => c.id);
    expect(idsActifs).not.toContain(MOCK_TERRASSE_ID);
  });

  // 3. Présence du chantier dans la corbeille
  it("3. Présence dans la corbeille : recupererChantiersCorbeilleTerrasse le liste avec ses métadonnées", async () => {
    const mockSupabase = createMockSupabase();
    await mettreChantierTerrasseEnCorbeille(mockSupabase, MOCK_TERRASSE_ID);

    const corbeille = await recupererChantiersCorbeilleTerrasse(mockSupabase);
    expect(corbeille.length).toBeGreaterThanOrEqual(1);

    const item = corbeille.find((c) => c.id === MOCK_TERRASSE_ID);
    expect(item).toBeDefined();
    expect(item?.nom).toBe("Terrasse Ipe Vue Mer");
    expect(item?.metier_reel).toBe("terrasse");
    expect(item?.deleted_at).toBeDefined();
  });

  // 4. Restauration du chantier
  it("4. Restauration : réintègre le chantier dans la liste active avec son statut initial", async () => {
    const mockSupabase = createMockSupabase();
    await mettreChantierTerrasseEnCorbeille(mockSupabase, MOCK_TERRASSE_ID);

    const resRestauration = await restaurerChantierTerrasse(
      mockSupabase,
      MOCK_TERRASSE_ID
    );
    expect(resRestauration.success).toBe(true);

    const row = baseDonnees.chantiers[MOCK_TERRASSE_ID];
    expect(row.statut).toBe("en_cours"); // statut original restauré
    expect(row.checklist.corbeille).toBeUndefined(); // corbeille purgée de checklist
  });

  // 5. Vérification de la conservation intégrale des données après restauration
  it("5. Conservation des données : toutes les fiches techniques, devis et trajets restent intacts", async () => {
    const mockSupabase = createMockSupabase();
    await mettreChantierTerrasseEnCorbeille(mockSupabase, MOCK_TERRASSE_ID);
    await restaurerChantierTerrasse(mockSupabase, MOCK_TERRASSE_ID);

    expect(baseDonnees.chantier_terrasses["terrasse-uuid-1"]).toBeDefined();
    expect(baseDonnees.chantier_terrasse_reservations["res-1"]).toBeDefined();
    expect(baseDonnees.frais_deplacement["dep-1"]).toBeDefined();
    expect(baseDonnees.devis["dev-1"]).toBeDefined();
    expect(baseDonnees.chantiers[MOCK_TERRASSE_ID].checklist.surface_m2).toBe(45);
  });

  // 6. Suppression définitive après confirmation
  it("6. Suppression définitive d'un chantier terrasse : purge complète et ordonnée", async () => {
    const mockSupabase = createMockSupabase();

    const res = await supprimerDefinitivementChantierTerrasse(
      mockSupabase,
      MOCK_TERRASSE_ID
    );
    expect(res.success).toBe(true);

    // Vérifie que toutes les tables liées et la ligne racine sont supprimées
    expect(baseDonnees.chantiers[MOCK_TERRASSE_ID]).toBeUndefined();
    expect(baseDonnees.chantier_terrasses["terrasse-uuid-1"]).toBeUndefined();
    expect(baseDonnees.chantier_terrasse_reservations["res-1"]).toBeUndefined();
    expect(baseDonnees.frais_deplacement["dep-1"]).toBeUndefined();
    expect(baseDonnees.devis["dev-1"]).toBeUndefined();
  });

  // 7. Impossibilité de restaurer un chantier définitivement supprimé
  it("7. Sécurité : échec lors d'une tentative de restauration d'un chantier définitivement détruit", async () => {
    const mockSupabase = createMockSupabase();
    await supprimerDefinitivementChantierTerrasse(mockSupabase, MOCK_TERRASSE_ID);

    await expect(
      restaurerChantierTerrasse(mockSupabase, MOCK_TERRASSE_ID)
    ).rejects.toThrow("Chantier introuvable");
  });

  // 8. Contrôle des autorisations, validation UUID et protection comptable
  it("8. Contrôle des autorisations : rejette les UUID invalides et bloque la purge si facture validée", async () => {
    const mockSupabase = createMockSupabase();

    // A. Validation UUID
    expect(estUuid("uuid-invalide-123")).toBe(false);
    expect(estUuid(MOCK_TERRASSE_ID)).toBe(true);
    await expect(
      mettreChantierTerrasseEnCorbeille(mockSupabase, "mauvais-id")
    ).rejects.toThrow("Identifiant de chantier invalide");

    // B. Protection comptable stricte : chantier avec facture validée
    baseDonnees.factures["facture-1"] = {
      id: "facture-1",
      chantier_id: MOCK_TERRASSE_ID,
      numero: "FAC-2026-001",
      statut: "emise", // Non brouillon !
    };

    await expect(
      supprimerDefinitivementChantierTerrasse(mockSupabase, MOCK_TERRASSE_ID)
    ).rejects.toThrow("facture(s) légale(s) émise(s)");
  });

  // 9. RÈGLE D'OR : Protection absolue des chantiers Bardage (notamment TEST_P1 Bardage HPL)
  it("9. Protection Bardage : la suppression définitive depuis Terrasse NE DÉTRUIT PAS le chantier Bardage racine", async () => {
    const mockSupabase = createMockSupabase();

    // TEST_P1 Bardage HPL a metier='bardage' et une terrasse liée par test
    expect(baseDonnees.chantiers[MOCK_BARDAGE_ID].metier).toBe("bardage");

    // 1. Mettre à la corbeille depuis terrasse
    await mettreChantierTerrasseEnCorbeille(mockSupabase, MOCK_BARDAGE_ID);
    expect(baseDonnees.chantiers[MOCK_BARDAGE_ID].statut).toBe("corbeille");

    // 2. Suppression définitive demandée depuis la corbeille Terrasse
    const res = await supprimerDefinitivementChantierTerrasse(
      mockSupabase,
      MOCK_BARDAGE_ID
    );
    expect(res.success).toBe(true);

    // 3. VÉRIFICATIONS STRICTES :
    // - La fiche chantier_terrasses rattachée a bien été supprimée
    expect(baseDonnees.chantier_terrasses["terrasse-test-p1"]).toBeUndefined();
    // - Les réservations de terrasse liées sont purgées
    expect(baseDonnees.chantier_terrasse_reservations["res-2"]).toBeUndefined();

    // - LE CHANTIER RACINE BARDAGE EXISTE TOUJOURS !
    expect(baseDonnees.chantiers[MOCK_BARDAGE_ID]).toBeDefined();
    expect(baseDonnees.chantiers[MOCK_BARDAGE_ID].metier).toBe("bardage");
    // - Son statut a été restauré à son statut métier ("en_cours")
    expect(baseDonnees.chantiers[MOCK_BARDAGE_ID].statut).toBe("en_cours");
    // - Ses données de bardage sont restées 100% intactes
    expect(
      baseDonnees.chantiers[MOCK_BARDAGE_ID].checklist.zones_bardage_count
    ).toBe(2);
  });

  // 10. Vérifications UI et boutons demandés
  it("10. Interface : Bouton 'Accueil chantier' présent sur /terrain/terrasse/[id]", () => {
    const filePath = path.resolve(
      process.cwd(),
      "app/terrain/terrasse/[id]/page.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Bouton Accueil chantier clairement identifiable avec icône Home
    expect(content).toContain("Accueil chantier");
    expect(content).toContain("href=\"/terrain/terrasse\"");
    expect(content).toContain("<Home");

    // Bouton de retour cartes intérieur toujours présent et distinct
    expect(content).toContain("← Retour à la navigation par cartes du Hub");
  });

  it("11. Interface : Bouton 'Corbeille' et suppression par carte présents sur /terrain/terrasse", () => {
    const filePath = path.resolve(process.cwd(), "app/terrain/terrasse/page.tsx");
    const content = fs.readFileSync(filePath, "utf-8");

    // Bouton corbeille avec compteur
    expect(content).toContain("Corbeille");
    expect(content).toContain("CorbeilleTerrasseModal");

    // Suppression sur les cartes de chantier (bouton carré rouge doux)
    expect(content).toContain("ConfirmationSuppressionModal");
    expect(content).toContain("Trash2");
    expect(content).toContain("bg-red-50");
    expect(content).toContain("text-red-500");
    expect(content).toContain("setChantierAMettreEnCorbeille");
    expect(content).toContain("handleConfirmerMiseEnCorbeille");
    expect(content).toContain("mettreChantierTerrasseEnCorbeille");

    // Filtrage des chantiers supprimés hors de la vue active
    expect(content).toContain('.neq("statut", "corbeille")');
  });

  it("12. Interface : Modale Corbeille respecte la charte Météo (fond clair, cuivre)", () => {
    const filePath = path.resolve(
      process.cwd(),
      "components/terrasse/CorbeilleTerrasseModal.tsx"
    );
    const content = fs.readFileSync(filePath, "utf-8");

    // Charte visuelle Météo
    expect(content).toContain("#B85B2B");
    expect(content).toContain("#F8F9FA");
    expect(content).toContain("Corbeille des Chantiers Terrasse");
    expect(content).toContain("Restaurer");
    expect(content).toContain("Supprimer définitivement");
  });
});

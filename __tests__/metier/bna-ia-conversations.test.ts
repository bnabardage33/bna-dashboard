import { describe, expect, it } from "vitest";
import type { BnaIaMessage } from "@/lib/bnaIaService";
import {
  detecterMetierConversation,
  estConversationSystemeSeulement,
  fusionnerConversations,
  genererTitreConversation,
  getBadgeMetierConversation,
  preparerMessagesPourSauvegarde,
  type BnaIaSavedConversation,
} from "@/lib/bnaIaConversations";

function msg(
  id: string,
  role: "user" | "assistant",
  content: string,
  extra?: Partial<BnaIaMessage>
): BnaIaMessage {
  return {
    id,
    role,
    content,
    timestamp: "2026-11-17T10:00:00.000Z",
    ...extra,
  };
}

describe("BNA-IA Historique des conversations", () => {
  it("détecte si la conversation ne contient que le message d'accueil ou reset", () => {
    expect(
      estConversationSystemeSeulement([
        msg("welcome-bna-ia", "assistant", "Bonjour !"),
      ])
    ).toBe(true);

    expect(
      estConversationSystemeSeulement([
        msg("reset-123", "assistant", "Nouvelle session prête."),
      ])
    ).toBe(true);

    expect(
      estConversationSystemeSeulement([
        msg("welcome-bna-ia", "assistant", "Bonjour !"),
        msg("u1", "user", "Météo à Madrid demain"),
      ])
    ).toBe(false);
  });

  it("génère automatiquement un titre propre depuis le premier message utilisateur", () => {
    const titreCourt = genererTitreConversation([
      msg("welcome-bna-ia", "assistant", "Bonjour !"),
      msg("u1", "user", "  **Devis bardage** claire-voie 45 m² à Bordeaux  "),
    ]);
    expect(titreCourt).toBe("Devis bardage claire-voie 45 m² à Bordeaux");

    const titreLong = genererTitreConversation([
      msg(
        "u1",
        "user",
        "Bonjour je voudrais chiffrer une terrasse composite sur plots de 65 m2 avec double lambourdage et margelles autour de la piscine"
      ),
    ]);
    expect(titreLong.length).toBeLessThanOrEqual(65);
    expect(titreLong.endsWith("…")).toBe(true);

    const titreFallback = genererTitreConversation(
      [msg("welcome-bna-ia", "assistant", "Bonjour !")],
      new Date("2026-11-17T12:00:00.000Z")
    );
    expect(titreFallback).toContain("Conversation BNA-IA du");
  });

  it("détecte le métier principal de la conversation (Bardage, Terrasse, Clôture, Général)", () => {
    expect(
      detecterMetierConversation([
        msg("u1", "user", "Chiffrage bardage claire-voie mélèze 50 m² DTU 41.2"),
      ])
    ).toBe("bardage");

    expect(
      detecterMetierConversation([
        msg("u1", "user", "Terrasse bois exotique sur plots 35 m²"),
      ])
    ).toBe("terrasse");

    expect(
      detecterMetierConversation([
        msg("u1", "user", "Pose clôture composite avec portillon sur 24 ml"),
      ])
    ).toBe("cloture");

    expect(
      detecterMetierConversation([
        msg("u1", "user", "Quel est mon bilan trésorerie ce mois-ci ?"),
      ])
    ).toBe("general");

    expect(
      detecterMetierConversation(
        [msg("u1", "user", "Prépare le chiffrage")],
        "TERRASSE SUR PLOTS 40 M2"
      )
    ).toBe("terrasse");
  });

  it("prépare les messages pour la sauvegarde en excluant welcome/reset et imageBase64", () => {
    const prepares = preparerMessagesPourSauvegarde([
      msg("welcome-bna-ia", "assistant", "Bienvenue"),
      msg("u1", "user", "Photo fissure", {
        tags: ["Diagnostic photo"],
        imageBase64: "data:image/jpeg;base64,AAA",
      }),
      msg("a1", "assistant", "Constat DTU"),
    ]);

    expect(prepares).toHaveLength(2);
    expect(prepares[0].id).toBe("u1");
    expect(prepares[0].imageBase64).toBeUndefined();
    expect(prepares[0].tags).toEqual(["Diagnostic photo"]);
  });

  it("fusionne et trie les conversations distantes et locales par date décroissante", () => {
    const localOld: BnaIaSavedConversation = {
      id: "1",
      titre: "Ancienne locale",
      metier: "general",
      messages: [],
      dernier_prechiffrage: null,
      nb_messages: 2,
      created_at: "2026-11-15T10:00:00.000Z",
      updated_at: "2026-11-15T10:00:00.000Z",
      source: "local",
    };
    const remoteUpdated: BnaIaSavedConversation = {
      ...localOld,
      titre: "Synchronisée cloud",
      updated_at: "2026-11-17T09:00:00.000Z",
      source: "supabase",
    };
    const localRecent: BnaIaSavedConversation = {
      id: "2",
      titre: "Locale récente",
      metier: "cloture",
      messages: [],
      dernier_prechiffrage: null,
      nb_messages: 4,
      created_at: "2026-11-17T11:00:00.000Z",
      updated_at: "2026-11-17T11:00:00.000Z",
      source: "local",
    };

    const fusion = fusionnerConversations([remoteUpdated], [localOld, localRecent]);
    expect(fusion).toHaveLength(2);
    expect(fusion[0].id).toBe("2");
    expect(fusion[1].id).toBe("1");
    expect(fusion[1].titre).toBe("Synchronisée cloud");
    expect(getBadgeMetierConversation(fusion[0].metier).label).toBe("Clôture");
  });
});

import { describe, expect, it } from "vitest";
import {
  addDaysLocal,
  buildUnifiedPlanning,
  categorizeNature,
  compterEvenementsSemaineCourante,
  formatYMD,
  getStartOfWeekLocal,
  normaliserMetier,
  parseYMD,
  type PlanningChantierInput,
  type PlanningCommandeInput,
} from "@/lib/services/planningService";
import type { RendezVousRow } from "@/lib/services/rendezVousService";

describe("planningService", () => {
  it("parses and adds local dates without UTC drift", () => {
    const d = parseYMD("2026-03-29"); // Changement d'heure DST en Europe
    expect(d).not.toBeNull();
    if (!d) return;
    expect(formatYMD(d)).toBe("2026-03-29");
    expect(addDaysLocal("2026-03-29", 1)).toBe("2026-03-30");
    expect(addDaysLocal("2026-03-29", 7)).toBe("2026-04-05");

    const fr = parseYMD("15/11/2026");
    expect(fr ? formatYMD(fr) : "").toBe("2026-11-15");

    const monday = getStartOfWeekLocal(new Date(2026, 10, 18)); // Mercredi 18 nov 2026
    expect(formatYMD(monday)).toBe("2026-11-16");
  });

  it("categorizes natures and métiers accurately", () => {
    expect(normaliserMetier("terrasse_bois")).toBe("Terrasse");
    expect(normaliserMetier("cloture_alu")).toBe("Clôture");
    expect(normaliserMetier("bardage_zinc")).toBe("Bardage");

    expect(categorizeNature("Visite technique DTU pare-pluie", "rdv")).toBe("technique");
    expect(categorizeNature("Signature PV de réception", "rdv")).toBe("reception");
    expect(categorizeNature("Réunion client choix teinte", "rdv")).toBe("client");
    expect(categorizeNature("Livraison colis", "livraison")).toBe("livraison");
  });

  it("builds unified planning from real bna-dashboard chantiers, commandes, and rendez_vous", () => {
    const chantiers: PlanningChantierInput[] = [
      {
        id: "ch-1",
        nom: "Bardage Dupont",
        client_nom: "Dupont",
        adresse_chantier: "Pessac",
        metier: "bardage",
        statut: "en_cours",
        date_debut: "2026-11-16",
        date_fin: "2026-11-22",
        checklist: [{ fait: true }, { fait: false }],
      },
      {
        id: "ch-arch",
        nom: "Ancien chantier",
        client_nom: "Test",
        adresse_chantier: null,
        metier: "terrasse",
        statut: "archive",
        date_debut: "2026-11-16",
        date_fin: "2026-11-20",
        checklist: null,
      },
    ];

    const commandes: PlanningCommandeInput[] = [
      {
        id: "cmd-1",
        designation: "Lames Cumaru 21x145",
        statut: "commandee",
        date_commande: "2026-11-17",
        date_livraison_prevue: "2026-11-20",
        date_livraison_reelle: null,
        chantier_id: "ch-1",
        montant_ht: 2400,
        fournisseur_nom: "Dispano",
      },
    ];

    const rdvs: RendezVousRow[] = [
      {
        id: "r-1",
        entreprise_id: "ent-1",
        chantier_id: "ch-1",
        client_id: null,
        titre: "Contrôle ossature & équerres",
        nature: "technique",
        date: "2026-11-18",
        heure_debut: "09:30",
        heure_fin: "11:00",
        lieu: "Pessac",
        notes: null,
        statut: "planifie",
        created_at: "2026-11-15T10:00:00Z",
        updated_at: "2026-11-15T10:00:00Z",
      },
      {
        id: "r-annule",
        entreprise_id: "ent-1",
        chantier_id: null,
        client_id: null,
        titre: "RDV annulé",
        nature: "client",
        date: "2026-11-18",
        heure_debut: "14:00",
        heure_fin: null,
        lieu: null,
        notes: null,
        statut: "annule",
        created_at: "2026-11-15T10:00:00Z",
        updated_at: "2026-11-15T10:00:00Z",
      },
    ];

    const items = buildUnifiedPlanning(chantiers, commandes, rdvs);
    expect(items).toHaveLength(4); // 1 chantier + 1 rdv + 1 commande + 1 livraison
    expect(items.some((i) => i.rawId === "ch-arch")).toBe(false);
    expect(items.some((i) => i.rawId === "r-annule")).toBe(false);

    const chItem = items.find((i) => i.type === "chantier");
    expect(chItem?.avancement).toBe(50);
    expect(chItem?.metier).toBe("Bardage");

    const rdvItem = items.find((i) => i.type === "rdv");
    expect(rdvItem?.metier).toBe("Bardage");
    expect(rdvItem?.heure).toBe("09:30 - 11:00");

    const countWeek = compterEvenementsSemaineCourante(items, new Date(2026, 10, 18));
    expect(countWeek).toBe(4);
  });
});

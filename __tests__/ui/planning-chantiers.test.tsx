// @vitest-environment node
import { describe, it, expect } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import PlanningChantiers, {
  type PlanningChantierItem,
} from "@/components/PlanningChantiers";

describe("PlanningChantiers — Composant unifié clair (Bardage + Terrasse + Clôture)", () => {
  it("affiche les 3 métiers avec leurs couleurs dédiées et l'estimation pointillée quand date_fin est absente", () => {
    const aujourdhui = new Date();
    const ymd = `${aujourdhui.getFullYear()}-${String(aujourdhui.getMonth() + 1).padStart(2, "0")}-${String(aujourdhui.getDate()).padStart(2, "0")}`;

    const chantiers: PlanningChantierItem[] = [
      {
        id: "c1",
        nom: "Façade Résidence Parc",
        client_nom: "Dupont",
        client_societe: null,
        adresse_chantier: "Lyon",
        date_debut: ymd,
        date_fin: ymd,
        statut: "en_cours",
        metier: "bardage",
      },
      {
        id: "c2",
        nom: "Terrasse Pin Villa",
        client_nom: "Martin",
        client_societe: null,
        adresse_chantier: "Annecy",
        date_debut: ymd,
        date_fin: null,
        statut: "prevu",
        metier: "terrasse",
        heures_estimees: 32,
      },
      {
        id: "c3",
        nom: "Clôture Composite Sud",
        client_nom: "Bernard",
        client_societe: null,
        adresse_chantier: "Grenoble",
        date_debut: ymd,
        date_fin: ymd,
        statut: "prevu",
        metier: "cloture",
      },
    ];

    const html = renderToStaticMarkup(
      <PlanningChantiers chantiers={chantiers} onUpdateDates={() => {}} />
    );

    expect(html).toContain("Semaine");
    expect(html).toContain("Mois");
    expect(html).toContain("3 chantier(s) sur la période");
    expect(html).toContain("Bardage");
    expect(html).toContain("Terrasse");
    expect(html).toContain("Clôture");
    expect(html).toContain("border-dashed");
    expect(html).toContain("(est.)");
  });
});

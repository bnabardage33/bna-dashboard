// @vitest-environment node
import { describe, it, expect } from "vitest";
import {
  DICTIONNAIRE_METIER_BNA,
  normaliserRequeteMetier,
} from "@/lib/bnaDictionnaireMetier";

describe("Dictionnaire Métier BTP BNA", () => {
  it("couvre les 3 piliers métiers avec règles obligatoires et interdits DTU", () => {
    const piliers = new Set(DICTIONNAIRE_METIER_BNA.map((e) => e.pilier));
    expect(piliers).toEqual(new Set(["bardage", "terrasse", "cloture"]));
    for (const entree of DICTIONNAIRE_METIER_BNA) {
      expect(entree.reglesObligatoires.length).toBeGreaterThan(0);
      expect(entree.interditsDtu.length).toBeGreaterThan(0);
    }
  });

  it("normalise les phonétiques Whisper / abréviations Bardage & ITE et extrait les fiches CSTB 3194", () => {
    const res = normaliserRequeteMetier(
      "bardage très pas i t e 2 double façade 5 par 8 avec bavete et linto"
    );
    expect(res.texteNormalise).toContain("HPL Trespa");
    expect(res.texteNormalise).toContain("ITE 2");
    expect(res.texteNormalise).toContain("5x8");
    expect(res.texteNormalise).toContain("bavette");
    expect(res.texteNormalise).toContain("linteau");
    const ids = res.entreesPertinentes.map((e) => e.id);
    expect(ids).toContain("hpl_compact");
    expect(ids).toContain("ite_couches");
    expect(ids).toContain("habillage_ouvertures");
    expect(res.contexteDictionnairePrompt).toContain("3,05 × 1,30 m");
    expect(res.contexteDictionnairePrompt).toContain("INTERDIT");
  });

  it("extrait les règles NF DTU 51.4, NF P90-308 et Clôture (soubassement / redans / portillon)", () => {
    const terrasse = normaliserRequeteMetier(
      "terrasse mobile p 90 308 avec lam bourde et a boutage"
    );
    expect(terrasse.texteNormalise).toContain("NF P90-308");
    expect(terrasse.texteNormalise).toContain("lambourde");
    expect(terrasse.texteNormalise).toContain("aboutage");
    expect(terrasse.entreesPertinentes.map((e) => e.id)).toContain(
      "terrasse_mobile_p90_308"
    );

    const cloture = normaliserRequeteMetier(
      "clôture avec soubasment 250 redant et portillion"
    );
    expect(cloture.texteNormalise).toContain("soubassement");
    expect(cloture.texteNormalise).toContain("redans");
    expect(cloture.texteNormalise).toContain("portillon");
    const idsCloture = cloture.entreesPertinentes.map((e) => e.id);
    expect(idsCloture).toContain("cloture_soubassement");
    expect(idsCloture).toContain("cloture_redans_pente");
    expect(idsCloture).toContain("cloture_portillon");
  });
});

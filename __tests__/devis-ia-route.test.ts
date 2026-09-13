// __tests__/devis-ia-route.test.ts
// ÉTAPE 2 — couverture « route » par analyse statique du code réel (verrous source).
// Ceci complète les trous identifiés : chemin d'échec, ordre archive→remplacement,
// timestamps (revendication/succès/échec), et « aucun LLM avant revendication réussie ».
// La confirmation RUNTIME (données réellement intactes en base) relève des I/O.

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";

const source = readFileSync("./app/api/devis/[devis_id]/analyse/route.ts", "utf8");

function segment(debut: string, fin: string): string {
  const i = source.indexOf(debut);
  const j = source.indexOf(fin, i + 1);
  if (i === -1) return "";
  return source.slice(i, j === -1 ? undefined : j);
}

describe("chemin d'échec — la route ne détruit jamais l'analyse précédente", () => {
  const echec = segment("Échec après revendication", "  } catch (err) {");

  it("basculer statut vers en_echec à la seule mise à jour sur échec", () => {
    expect(echec).toContain(`statut: "en_echec"`);
  });

  it("rafraîchit updated_at à l'échec", () => {
    expect(echec).toContain(`updated_at: new Date().toISOString()`);
  });

  it("ne touche PAS le contenu de l'analyse précédente", () => {
    expect(echec).not.toContain("lignes_proposees:");
    expect(echec).not.toContain("analyse_resultats:");
    expect(echec).not.toContain("total_estime:");
    expect(echec).not.toContain("version,");
  });

  it("ne crée AUCUNE archive historique à l'échec", () => {
    expect(echec).not.toContain("devis_ia_historique");
  });

  it("ne passe jamais en terminee sur l'échec", () => {
    expect(echec).not.toContain(`statut: "terminee"`);
  });
});

describe("ordre — l'archive précède le remplacement de l'analyse courante", () => {
  const presenceOrdre = () => {
    const archive = source.indexOf(".from(\"devis_ia_historique\")");
    const terminee = source.indexOf(`statut: "terminee"`);
    return { archive, terminee, ok: archive !== -1 && terminee !== -1 && archive < terminee };
  };

  it("l'insertion de l'historique (snapshot) est bien AVANT l'écriture terminee", () => {
    expect(presenceOrdre().ok).toBe(true);
  });
});

describe("timestamps — updated_at maintenu sur toutes les transitions", () => {
  const revendication = segment("revendiquerAnalyse", "// ── POST : lancer");
  const succes = segment("Historique append-only", "// ── GET : lecture");

  it("updated_at rafraîchi à la REVENDICATION (statut en_cours)", () => {
    expect(revendication).toContain(`.update({ statut: "en_cours", updated_at: new Date().toISOString() })`);
  });

  it("updated_at rafraîchi au SUCCÈS (statut terminee)", () => {
    expect(succes).toContain(`statut: "terminee"`);
    expect(succes).toContain(`updated_at: new Date().toISOString()`);
  });

  it("updated_at rafraîchi à l'ÉCHEC (en_echec)", () => {
    expect(source).toContain(`update({ statut: "en_echec", updated_at: new Date().toISOString() })`);
  });
});

describe("aucun appel LLM avant une revendication réussie", () => {
  it("le LLM (generateText) n'apparaît qu'APRÈS revendiquerAnalyse", () => {
    const revendication = source.indexOf("const revendication = await revendiquerAnalyse(devisId)");
    const llm = source.indexOf("generateText({");
    expect(revendication).not.toBe(-1);
    expect(llm).not.toBe(-1);
    expect(revendication).toBeLessThan(llm);
  });

  it("le marqueur d'observabilité entoure l'appel LLM (1 analyse = 1 appel)", () => {
    expect(source).toMatch(/console\.info\(`\[devis_ia\] analyse LLM lancée devis_id=\$\{devisId\}`\)/);
  });

  it("le 409 de course est la SEULE réponse sur statut verrouillé", () => {
    const verrou = segment("Une analyse est déjà en cours", "devisIaId = revendication.id");
    expect(verrou).toContain("Une analyse est déjà en cours pour ce devis.");
    expect(verrou).toContain("{ status: 409 },");
  });
});
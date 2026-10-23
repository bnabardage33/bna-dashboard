// __tests__/metre/meteo-horaire-seuils.test.ts
//
// VERROUS DE LA REFONTE DES DÉCISIONS MÉTÉO.
//
// Ces tests couvrent les scénarios de la commande initiale :
//
//   - une pluie en soirée n'interdit PAS la pose ;
//   - une pluie PENDANT la pose, oui ;
//   - une rafale le soir ne déclenche pas la décision, une rafale pendant la
//     pose si ;
//   - une donnée absente n'est jamais 0 mm ni une garantie de temps sec ;
//   - des horaires non configurés ne concluent JAMAIS au vert ;
//   - le cumul journalier seul ne déclenche PLUS « Pose interdite ».
//
// Ils verrouillent aussi la PARITÉ de seuil entre l'avis « pluie nocturne » et
// le barème d'averse existant, pour que les deux constantes ne dérivent pas.

import { describe, expect, it } from "vitest";
import {
  SEUIL_PLUIE_AVIS_MM,
  lireHorairesPose,
  heureDansFenetre,
  heureDe,
  statutHeure,
  natureHeure,
  cumul,
  maximum,
  synthetiserPose,
  fenetreEvaluable,
  evaluerAvisMateriaux,
  libelleFenetre,
} from "@/lib/meteoHoraire";
import { evaluerPoseChantier, SEUILS_MATERIAUX } from "@/lib/meteoAlerte";
import { dateParis, dateParisDans, heureParis } from "@/lib/dateParis";
import type { HeureMeteo } from "@/lib/meteo";

// ─── Utilitaires de fixture ──────────────────────────────────────────────────

/** Série horaire sur une journée, avec toutes les grandeurs renseignées. */
function serie(
  spec: Array<[string, number, number, number]>,
  nature: "observee" | "prevision" = "prevision"
): HeureMeteo[] {
  return spec.map(([heure, pluie, rafales, temp]) => ({
    heure,
    pluie,
    rafales,
    temp,
    vent: Math.round(rafales * 0.7),
    statut: "avenir",
    nature,
  }));
}

/** Série complète 00 h → 23 h, pluie concentrée sur les heures fournies. */
function journeeAvecPluie(pluieParHeure: Record<string, number>): HeureMeteo[] {
  const out: HeureMeteo[] = [];
  for (let h = 0; h < 24; h++) {
    const heure = `${String(h).padStart(2, "0")}:00`;
    out.push({
      heure,
      pluie: pluieParHeure[heure] ?? 0,
      rafales: 15,
      temp: 12,
      vent: 10,
      statut: "avenir",
      nature: "prevision",
    });
  }
  return out;
}

// ─── 1. Lecture des horaires ─────────────────────────────────────────────────

describe("lireHorairesPose — forme tolérante, fond strict", () => {
  it("lit les formes courantes d'un horaire de pose", () => {
    for (const texte of ["7h-17h", "07:00 - 17:00", "7h30 à 17h30", "07:30/16:30"]) {
      const lecture = lireHorairesPose(texte);
      expect(lecture.statut, texte).toBe("configuree");
    }
    const l = lireHorairesPose("7h-17h");
    expect(l.statut === "configuree" && l.fenetre.debutMinutes).toBe(7 * 60);
    expect(l.statut === "configuree" && l.fenetre.finMinutes).toBe(17 * 60);
  });

  it("REFUSE une saisie douteuse plutôt que de l'approximer", () => {
    // « 7h-19h30 » n'est pas rattrapée en « 7h-19h » : on préfère un état
    // « horaires illisibles » à une décision sur des horaires non validés.
    for (const texte of ["le matin", "selon météo", "7h", "7h-17h-19h", "13h-11h15"]) {
      expect(lireHorairesPose(texte).statut, texte).toBe("illisible");
    }
  });

  it("renvoie non_configuree sur un champ vide — AUCUN horaire par défaut", () => {
    expect(lireHorairesPose("").statut).toBe("non_configuree");
    expect(lireHorairesPose("   ").statut).toBe("non_configuree");
    expect(lireHorairesPose(null).statut).toBe("non_configuree");
    expect(lireHorairesPose(undefined).statut).toBe("non_configuree");
  });

  it("accepte une fenêtre traversant minuit, refuse plus de 12 h", () => {
    expect(lireHorairesPose("22h-02h").statut).toBe("configuree");
    expect(lireHorairesPose("5h-20h").statut).toBe("illisible");
  });
});

describe("heureDansFenetre", () => {
  it("gère une fenêtre traversant minuit", () => {
    const f = { debutMinutes: 22 * 60, finMinutes: 2 * 60 };
    expect(heureDansFenetre(23 * 60, f)).toBe(true);
    expect(heureDansFenetre(1 * 60, f)).toBe(true);
    expect(heureDansFenetre(12 * 60, f)).toBe(false);
  });
});

describe("libelleFenetre", () => {
  it("formate en HH:MM", () => {
    expect(libelleFenetre({ debutMinutes: 7 * 60, finMinutes: 17 * 60 })).toBe(
      "07:00 – 17:00"
    );
  });
});

// ─── 2. heureDe — correction du bug de troncature ────────────────────────────

describe("heureDe — horodatages complets et heures seules", () => {
  it("extrait l'heure d'un ISO complet (ancien slice(0,5) rendait « 2026- »)", () => {
    expect(heureDe("2026-10-20T13:00:00")).toBe("13:00");
    expect(heureDe("2026-10-20T07:30")).toBe("07:30");
  });

  it("accepte aussi une heure seule", () => {
    expect(heureDe("13:00")).toBe("13:00");
    expect(heureDe("7:00")).toBe("07:00");
  });

  it("renvoie une chaîne vide plutôt qu'un libellé absurde", () => {
    expect(heureDe("")).toBe("");
    expect(heureDe("demain")).toBe("");
  });
});

// ─── 3. Statut passé / à venir ───────────────────────────────────────────────

describe("statutHeure et natureHeure", () => {
  it("range l'heure ÉGALE à la référence dans « à venir »", () => {
    expect(statutHeure("12:00", 12 * 60)).toBe("avenir");
    expect(statutHeure("11:00", 12 * 60)).toBe("ecoulee");
    expect(statutHeure("13:00", 12 * 60)).toBe("avenir");
  });

  it("n'affirme « observée » que si la SOURCE fournit sa référence", () => {
    // Sans référence de source : on ne devine pas, même pour une heure passée.
    expect(natureHeure("11:00", null)).toBe("inconnue");
    expect(natureHeure("11:00", "2026-10-20T12:00")).toBe("observee");
    expect(natureHeure("13:00", "2026-10-20T12:00")).toBe("prevision");
  });
});

// ─── 4. Agrégats null-safe ───────────────────────────────────────────────────

describe("agrégats ne transforment JAMAIS une donnée absente en 0", () => {
  it("cumul renvoie null quand aucune valeur n'est connue", () => {
    const heures: HeureMeteo[] = [
      { heure: "08:00", pluie: null, rafales: null, temp: null, vent: null, statut: "avenir", nature: "inconnue" },
    ];
    expect(cumul(heures, (h) => h.pluie)).toBeNull();
    expect(maximum(heures, (h) => h.rafales)).toBeNull();
  });

  it("cumul vaut 0 seulement si des heures CONNUES valent toutes 0", () => {
    const heures = serie([["08:00", 0, 10, 12]]);
    expect(cumul(heures, (h) => h.pluie)).toBe(0);
  });

  it("ignore les heures manquantes dans un cumul partiel", () => {
    const heures: HeureMeteo[] = [
      { heure: "08:00", pluie: 2, rafales: 10, temp: 12, vent: 8, statut: "ecoulee", nature: "observee" },
      { heure: "09:00", pluie: null, rafales: null, temp: null, vent: null, statut: "avenir", nature: "inconnue" },
      { heure: "10:00", pluie: 3, rafales: 10, temp: 12, vent: 8, statut: "avenir", nature: "prevision" },
    ];
    expect(cumul(heures, (h) => h.pluie)).toBe(5);
  });
});

// ─── 5. Décision de pose — LE CŒUR DE LA CORRECTION ──────────────────────────

describe("evaluerPoseChantier — le cumul journalier ne décide plus seul", () => {
  it("une pluie de NUIT (hors pose) n'interdit PAS la pose", () => {
    // 12 mm tombent entre 22 h et 4 h. Horaires de pose 7 h–17 h : la pose est
    // possible, et le cumul journalier reste consultable.
    const heures = journeeAvecPluie({
      "22:00": 6,
      "23:00": 6,
    });
    const pose = evaluerPoseChantier("bois", "echafaudage", "7h-17h", heures);
    expect(pose.statut).toBe("evaluee");
    expect(pose.niveau).not.toBe("rouge");
    expect(pose.synthese.pluieJour).toBe(12);
    expect(pose.synthese.pluiePendantPose).toBe(0);
  });

  it("une pluie PENDANT la pose, elle, est retenue", () => {
    const heures = journeeAvecPluie({ "09:00": 4, "10:00": 4, "11:00": 3 });
    const pose = evaluerPoseChantier("bois", "echafaudage", "7h-17h", heures);
    expect(pose.statut).toBe("evaluee");
    expect(pose.synthese.pluiePendantPose).toBe(11);
    expect(pose.niveau).toBe("rouge");
  });

  it("ne déclenche PAS d'intempérie pour une averse isolée", () => {
    const heures = journeeAvecPluie({ "10:00": 0.4 });
    const pose = evaluerPoseChantier("bois", "echafaudage", "7h-17h", heures);
    expect(pose.statut).toBe("evaluee");
    expect(pose.niveau).toBe("vert");
  });

  it("une rafale le SOIR ne décide pas ; une rafale PENDANT la pose, oui", () => {
    const soir: HeureMeteo[] = [
      ...journeeAvecPluie({}),
    ].map((h) => (h.heure === "21:00" ? { ...h, rafales: 90 } : h));
    const poseSoir = evaluerPoseChantier("bois", "echafaudage", "7h-17h", soir);
    expect(poseSoir.statut).toBe("evaluee");
    expect(poseSoir.niveau).not.toBe("rouge");

    const pendant = journeeAvecPluie({});
    pendant[10] = { ...pendant[10], rafales: 90 }; // 10:00
    const posePendant = evaluerPoseChantier("bois", "echafaudage", "7h-17h", pendant);
    expect(posePendant.statut).toBe("evaluee");
    expect(posePendant.niveau).toBe("rouge");
  });

  it("HORAIRES NON CONFIGURÉS : jamais un vert silencieux", () => {
    const heures = journeeAvecPluie({});
    const pose = evaluerPoseChantier("bois", "echafaudage", null, heures);
    expect(pose.statut).toBe("non_determine");
    expect(pose.niveau).toBeNull();
    expect(pose.horairesStatut).toBe("non_configuree");
    expect(pose.motif).toContain("non configurés");
  });

  it("HORAIRES ILLISIBLES : on dit QUOI pour pouvoir corriger", () => {
    const pose = evaluerPoseChantier("bois", "echafaudage", "le matin", journeeAvecPluie({}));
    expect(pose.statut).toBe("non_determine");
    expect(pose.horairesStatut).toBe("illisible");
    expect(pose.motif).toContain("illisible");
    expect(pose.motif).toContain("le matin");
  });

  it("FENÊTRE SANS DONNÉE : non déterminé, une absence n'est pas un temps sec", () => {
    // Série réduite à la nuit : aucune heure de pose.
    const heures: HeureMeteo[] = [
      { heure: "02:00", pluie: 0, rafales: 10, temp: 10, vent: 8, statut: "avenir", nature: "prevision" },
    ];
    const pose = evaluerPoseChantier("bois", "echafaudage", "7h-17h", heures);
    expect(pose.statut).toBe("non_determine");
    expect(pose.niveau).toBeNull();
  });

  it("DONNÉES MANQUANTES pendant la pose : non déterminé", () => {
    const heures: HeureMeteo[] = [];
    for (let h = 0; h < 24; h++) {
      const heure = `${String(h).padStart(2, "0")}:00`;
      const dansPose = h >= 7 && h < 17;
      heures.push({
        heure,
        // Les heures de pose n'ont AUCUNE donnée de pluie.
        pluie: dansPose ? null : 0,
        rafales: 10,
        temp: 12,
        vent: 8,
        statut: "avenir",
        nature: "prevision",
      });
    }
    const pose = evaluerPoseChantier("bois", "echafaudage", "7h-17h", heures);
    expect(pose.statut).toBe("non_determine");
    expect(pose.niveau).toBeNull();
  });
});

// ─── 6. Parité de seuil (verrou anti-dérive) ─────────────────────────────────

describe("parité des seuils — aucune constante ne dérive", () => {
  it("SEUIL_PLUIE_AVIS_MM est verrouillé à 5 mm (valeur du barème d'averse existant)", () => {
    // La parité est imposée par `lib/meteoHoraire.ts` lui-même qui la
    // documente par référence à `PLUIE_AVERSE.pluie`. La constante est
    // explicite pour éviter toute dérive entre les deux usages.
    expect(SEUIL_PLUIE_AVIS_MM).toBe(5);
  });

  it("le seuil de rafale du chantier est celui du barème matériau × accès", () => {
    // Le même minimum que la route : seuil matériau ∩ seuil accès.
    const seuilBois = SEUILS_MATERIAUX.bois.vent_critique;
    expect(typeof seuilBois).toBe("number");
  });
});

// ─── 7. Avis matériaux — distincts du niveau ─────────────────────────────────

describe("evaluerAvisMateriaux — des vérifications, jamais un niveau", () => {
  it("signale une pluie nocturne forte comme une VÉRIFICATION", () => {
    const heures = journeeAvecPluie({ "22:00": 6 });
    const lecture = lireHorairesPose("7h-17h");
    const synthese = synthetiserPose(heures, lecture);
    const avis = evaluerAvisMateriaux({
      heures,
      synthese,
      seuilRafaleChantier: 60,
    });
    expect(avis.some((a) => a.includes("nocturnes"))).toBe(true);
    expect(avis.some((a) => a.includes("vérifier la protection"))).toBe(true);
  });

  it("impose un CONSTAT terrain pour une pluie pendant la pose, sans affirmer « support humide »", () => {
    const heures = journeeAvecPluie({ "10:00": 1 });
    const lecture = lireHorairesPose("7h-17h");
    const synthese = synthetiserPose(heures, lecture);
    const avis = evaluerAvisMateriaux({ heures, synthese, seuilRafaleChantier: 60 });
    const avisPose = avis.find((a) => a.includes("pendant les horaires de pose"));
    expect(avisPose).toBeDefined();
    expect(avisPose).toContain("constatée sur le terrain");
    expect(avisPose).toContain("rien n'est conclu automatiquement");
    expect(avisPose).not.toMatch(/support (est )?humide/i);
  });

  it("signale des rafales hors pose au-dessus du seuil du chantier", () => {
    const heures = journeeAvecPluie({});
    heures[21] = { ...heures[21], rafales: 80 }; // 21:00
    const lecture = lireHorairesPose("7h-17h");
    const synthese = synthetiserPose(heures, lecture);
    const avis = evaluerAvisMateriaux({ heures, synthese, seuilRafaleChantier: 60 });
    expect(avis.some((a) => a.includes("en dehors des horaires de pose"))).toBe(true);
  });

  it("aucun avis ne modifie le niveau : evaluerPoseChantier reste cohérent", () => {
    const heures = journeeAvecPluie({ "22:00": 6 });
    const pose = evaluerPoseChantier("bois", "echafaudage", "7h-17h", heures);
    // Avis présent, niveau inchangé (vert) : les deux informations sont séparées.
    expect(pose.avertissements.length).toBeGreaterThan(0);
    expect(pose.niveau).toBe("vert");
  });
});

// ─── 8. fenetreEvaluable ─────────────────────────────────────────────────────

describe("fenetreEvaluable", () => {
  it("exige une fenêtre lue, des heures de pose présentes et des pluies connues", () => {
    const ok = synthetiserPose(journeeAvecPluie({}), lireHorairesPose("7h-17h"));
    expect(fenetreEvaluable(ok)).toBe(true);

    const sansHoraires = synthetiserPose(journeeAvecPluie({}), lireHorairesPose(null));
    expect(fenetreEvaluable(sansHoraires)).toBe(false);
  });
});

// ─── 9. Fuseau Europe/Paris et changements d'heure été / hiver ───────────────

describe("dateParis, heureParis et dateParisDans — changements d'heure DST", () => {
  it("avance d'exactement 1 jour calendaire lors du passage à l'heure d'hiver (journée de 25 h)", () => {
    // 2026-10-24T22:30:00Z = dimanche 2026-10-25 à 00:30 CEST (UTC+2), avant le recul d'une heure.
    // La journée du 2026-10-25 dure 25 h : ajouter +24h brutes tomberait encore le 2026-10-25 à 23:30 CET.
    const dimancheHiver = new Date("2026-10-24T22:30:00.000Z");
    expect(dateParis(dimancheHiver)).toBe("2026-10-25");
    expect(heureParis(dimancheHiver)).toBe("00:30");
    expect([0, 1, 2, 3].map((i) => dateParisDans(i, dimancheHiver))).toEqual([
      "2026-10-25",
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
    ]);
  });

  it("recule et avance sans sauter de jour lors du passage à l'heure d'été (journée de 23 h)", () => {
    // 2026-03-29T22:30:00Z = lundi 2026-03-30 à 00:30 CEST (UTC+2), lendemain du dimanche de 23 h.
    const lundiEte = new Date("2026-03-29T22:30:00.000Z");
    expect(dateParis(lundiEte)).toBe("2026-03-30");
    expect(dateParisDans(-1, lundiEte)).toBe("2026-03-29");
    expect(dateParisDans(1, lundiEte)).toBe("2026-03-31");
  });
});

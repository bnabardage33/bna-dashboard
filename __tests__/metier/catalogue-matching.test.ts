import { describe, it, expect } from 'vitest'
import {
  normaliser,
  racine,
  tokensConcept,
  distance,
  scoreConceptVsItem,
  meilleureCorrespondance,
  SEUIL_CORRESPONDANCE,
  type ItemCatalogue,
  type Correspondance,
} from '@/lib/catalogueMatching'

// Références réelles du catalogue de test (source de vérité — AUCUNE association
// spécifique au test dans le moteur : on vérifie qu'il raisonne sur le SENS).
function catalogue(item: Partial<ItemCatalogue>): ItemCatalogue {
  return {
    id: item.id ?? '',
    designation: item.designation ?? '',
    description: item.description ?? null,
    famille_label: item.famille_label ?? '',
    unite: item.unite ?? '',
    type_cout: item.type_cout ?? 'matiere',
  }
}

const COMPOSITE = catalogue({
  id: 'cat-composite',
  designation: 'Bardage PVC composite faux claire-voie bi-ton Ligna shadow – CAFE',
  description: 'Lame de bardage composite imitation bois',
  famille_label: 'COMPOSITE',
  unite: 'm²',
})

const ALU = catalogue({
  id: 'cat-alu',
  designation: "Bandeau de finition en aluminium anodisé argent pour SLID'UP 160 - 170 - 1,95 m",
  description: 'Profilé de finition aluminium',
  famille_label: 'ALU FINITION',
  unite: 'm²',
})

const CHEVRON = catalogue({
  id: 'cat-chevron',
  designation: 'Chevron sapin de pays traite bois brut 58 × 70 mm',
  description: 'Élément d\'ossature en bois',
  famille_label: 'OSSATURE',
  unite: 'unité',
})

const POSE = catalogue({
  id: 'cat-pose',
  designation: 'pose verture',
  description: 'Prestation de main-d\'œuvre de pose',
  famille_label: 'PRESTATIONS',
  unite: 'heure',
  type_cout: 'main_oeuvre',
})

const ITEMS = [COMPOSITE, ALU, CHEVRON, POSE]

function meilleure(concept: string): Correspondance | null {
  return meilleureCorrespondance(concept, ITEMS)
}

describe('catalogueMatching — normalisation', () => {
  it('supprime accents, casse et caractères spéciaux', () => {
    expect(normaliser('Bardage ÉLÉGANT m² – café')).toBe('bardage elegant m2 cafe')
  })
  it('supprime les exposants en chiffre', () => {
    expect(normaliser('24 m²')).toBe('24 m2')
    expect(normaliser('1,95 m')).toBe('1 95 m')
  })
  it("laisse intacts les termes courts pertinents (pvc, alu)", () => {
    expect(tokensConcept('bardage pvc alu').join(' ')).toBe('bardage pvc alu')
  })
  it('calcule la racine des pluriels', () => {
    expect(racine('chevrons')).toBe('chevron')
    expect(racine('bandeaux')).toBe('bandeau')
    expect(racine('pièces')).toBe('pièce')
  })
})

describe('catalogueMatching — distance typographique', () => {
  it('détecte une faute de frappe classique', () => {
    expect(distance('bardge', 'bardage')).toBe(1)
    expect(distance('chevron', 'chevons')).toBeLessThanOrEqual(2)
  })
})

describe('catalogueMatching — ancrage lexical', () => {
  it('ne fait rien sauter quand la recherche est vide', () => {
    expect(tokensConcept('   ').length).toBe(0)
    expect(scoreConceptVsItem('', COMPOSITE).score).toBe(0)
  })
  it('match un mot précis sur la désignation exacte', () => {
    expect(scoreConceptVsItem('chevron', ITEMS[2]).score).toBeGreaterThanOrEqual(SEUIL_CORRESPONDANCE)
  })
})

describe('catalogueMatching — désignations exactes du catalogue', () => {
  it('retrouve la lame composite par sa désignation', () => {
    const best = meilleure('bardage pvc composite faux claire-voie café')
    expect(best?.item.id).toBe(COMPOSITE.id)
    expect(best!.score).toBe(1)
  })
  it('retrouve le chevron par sa désignation', () => {
    expect(meilleure('chevron sapin de pays bois brut')?.item.id).toBe(CHEVRON.id)
  })
  it('retrouve le bandeau alu par sa désignation', () => {
    const best = meilleure('bandeau de finition aluminium anodisé')!
    expect(best.item.id).toBe(ALU.id)
    expect(best.score).toBeGreaterThanOrEqual(1)
  })
})

describe('catalogueMatching — formulation libre (synonymes, mots partiels)', () => {
  it('comprend « bandeau aluminium » sans le mot finition', () => {
    const best = meilleure('bandeau aluminium')
    expect(best?.item.id).toBe(ALU.id)
    expect(best!.score).toBe(1)
  })
  it('reconnaît le claire-voie composite via « claire voie »', () => {
    const best = meilleure('claire voie')
    expect(best?.item.id).toBe(COMPOSITE.id)
  })
  it('tolère une faute de frappe sur « bardage »', () => {
    expect(meilleure('bardge')?.item.id).toBe(COMPOSITE.id)
  })
  it('gère le pluriel « chevrons »', () => {
    expect(meilleure('chevrons')?.item.id).toBe(CHEVRON.id)
  })
  it('gère les accents différents (« café »/« CAFE »)', () => {
    expect(meilleure('bardage pvc cafe')?.item.id).toBe(COMPOSITE.id)
  })
})

describe('catalogueMatching — arbitrage sémantique', () => {
  it('score très faible (concept absurde) → null (seuil < 0.55)', () => {
    const absurde = 'un concept complètement abstrait et inconnu au bataillon'
    const corr = meilleureCorrespondance(absurde, ITEMS)
    expect(corr).toBeNull()
  })

  it('Faille 2 corrigée : Rejet en cas d\'ex aequo strict', () => {
    const HPL_ROUGE = catalogue({
      id: 'hpl-rouge',
      designation: 'Panneau HPL 8mm standard',
      famille_label: 'HPL',
    })
    const HPL_GRIS = catalogue({
      id: 'hpl-gris',
      designation: 'Panneau HPL 8mm standard',
      famille_label: 'HPL',
    })

    // Le concept matche exactement les deux avec le même score et le même nombre de mots trouvés.
    const corr = meilleureCorrespondance('Panneau HPL 8mm standard', [HPL_ROUGE, HPL_GRIS])

    // La fonction doit renvoyer null pour forcer "À CHIFFRER" car on ne peut pas deviner arbitrairement
    expect(corr).toBeNull()
  })

  it('une description métier vague ne produit pas de faux positif : elle part en arbitrage', () => {
    const best = meilleure('habillage extérieur imitation bois')
    expect(best).toBeNull()
  })
  it('« montage des éléments » ne crée pas de faux positif : arbitrage requis', () => {
    expect(meilleure('montage des éléments')).toBeNull()
  })
  it('« pose » seule tombe bien sur la prestation de pose', () => {
    const best = meilleure('pose')
    expect(best?.item.id).toBe(POSE.id)
  })
  it('le concept tautologique « bois » seul retombe en arbitrage (ex aequo entre composite et chevron)', () => {
    // Faille 2 corrigée : Avant, ce test s'attendait à COMPOSITE juste parce qu'il était
    // en 1ère position dans le tableau, ignorant silencieusement CHEVRON (qui a aussi "bois").
    // Désormais, on vérifie que l'algorithme est honnête et lève l'ambiguïté.
    const best = meilleure('bois')
    expect(best).toBeNull()
  })
})

describe('catalogueMatching — robustesse du score', () => {
  it('expose une justification lisible des appariements', () => {
    const best = meilleure('chevrons')!
    expect(best.justification).toContain('chevrons')
  })
  it('la confiance est bornée sur [0,1]', () => {
    for (const c of ['pose', 'claire voie', 'chevron', 'bois']) {
      const best = meilleure(c)
      if (best) {
        expect(best.score).toBeGreaterThanOrEqual(0)
        expect(best.score).toBeLessThanOrEqual(1)
      }
    }
  })
})
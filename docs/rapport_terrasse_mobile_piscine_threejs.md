# BNA — Rapport Technique : Implémentation Terrasse Mobile Coulissante sur Rails & Rendu 3D Three.js PBR

> **Projet :** BNA Dashboard (Next.js 16 / React 19 / Three.js / @react-three/fiber / Supabase)  
> **Domaine Métier :** Couverture sécurisée de piscine & terrasse mobile (NF DTU 51.4 / NF P90-308)  
> **Date :** 13 Novembre 2026  
> **Auteur :** Antigravity AI Assistant  
> **Statut :** Livré et validé en production  

---

## 1. Contexte & Objectifs

L'objectif de cette évolution majeure est d'enrichir le module **Terrasse Pro** avec la gestion complète d'une **terrasse mobile coulissante sur rails au-dessus d'une réservation piscine** :
1. **Modélisation et dimensionnement réglementaire** : Respect des charges d'exploitation piscine ($\ge 2,5\text{ kN/m}^2$ selon NF DTU 51.4 et norme sécurité abris piscine NF P90-308), calcul automatique des profilés aluminium, des linéaires de rails inox 316L et du nombre de galets de roulement.
2. **Intégration au quantitatif de contrat** : Intégration des composants mobiles dans le bordereau de fourniture et débit ($Q_{\text{net}}$, $Q_{\text{tech}}$, $Q_{\text{appro}}$).
3. **Migration du moteur 3D vers Three.js** : Remplacement de l'ancien moteur 3D SVG par Three.js (`@react-three/fiber` et `@react-three/drei`) avec `InstancedMesh` pour garantir 60 FPS constants sur mobile et tablette.
4. **Finition esthétique réaliste PBR** :
   - Habillage complet en applique (jupe périphérique 4 faces masquant châssis alu et galets pour un rendu caisson fermé monobloc).
   - Rails inox brossé extra-plats (28×5 mm) posés à fleur sur la plage fixe dans le sens du coulissement.
   - Textures PBR procédurales rainurées (bois/composite), bassin avec margelle, liner bleu lagon, eau turquoise semi-transparente et éclairage directionnel avec ombres portées douces.

---

## 2. Modèle de Données (`lib/terrasse/types.ts`)

Les structures de données suivantes ont été ajoutées pour supporter tous les modes de terrasse mobile :

```typescript
export type ModeTerrasseMobile = "1_plateau" | "2_demi_plateaux";
export type SensRefoulementTerrasseMobile = "gauche" | "droite" | "haut" | "bas";

export interface ConfigTerrasseMobile {
  active: boolean;
  mode: ModeTerrasseMobile;
  sens_refoulement: SensRefoulementTerrasseMobile;
  hauteur_chassis_alu_mm?: number;          // 80 à 120 mm (défaut 100 mm)
  jeu_fonctionnel_peripherique_mm?: number; // 10 à 50 mm (défaut 20 mm)
  section_profil_alu_mm?: "80x40" | "100x40" | "120x40";
  charge_exploitation_kn_m2?: number;       // Défaut 2.5 kN/m² (DTU 51.4 & NF P90-308)
  motorise?: boolean;
  longueur_rails_sol_m?: number;
}

export interface ResultatPlateauMobile {
  active: boolean;
  mode: ModeTerrasseMobile;
  sensRefoulement: SensRefoulementTerrasseMobile;
  hauteurChassisMm: number;
  jeuPeripheriqueMm: number;
  dimensionsPlateau: {
    longueurM: number;
    largeurM: number;
    epaisseurTotaleMm: number;
    surfaceM2: number;
    poidsPropreKg: number;
    poidsTotalChargeKg: number;
  };
  rails: {
    type: "rail_inox_v_sol" | "rail_inox_plat";
    lineaireTotalM: number;
    zoneRefoulementM: number;
    nbRails: number;
    entraxeRailsM: number;
    longueurUnitaireM: number;
  };
  galets: {
    nombreTotal: number;
    type: string;
    chargeAdmissibleParGaletKg: number;
    chargeEffectiveParGaletKg: number;
  };
  structureChassis: {
    sectionAluMm: string;
    lineaireProfilsAluM: number;
    poidsAluKg: number;
  };
  platelageMobile: {
    lineaireLamesM: number;
    nbLames: number;
    nbVisFixation: number;
  };
}
```

---

## 3. Algorithme Métier & Calculs (`lib/terrasse/pro/terrasse-mobile.ts`)

Le sous-ensemble indépendant terrasse mobile est calculé par `calculerSousEnsembleTerrasseMobile()` :

1. **Dimensions hors-tout du plateau fermé** :
   $$\text{Largeur} = \text{Largeur}_{\text{piscine}} + 2 \times \text{Jeu}_{\text{périphérique}}$$
   $$\text{Longueur} = \text{Longueur}_{\text{piscine}} + 2 \times \text{Jeu}_{\text{périphérique}}$$
2. **Descente de charges selon NF DTU 51.4 & NF P90-308** :
   - Poids propre platelage : 16 à 24 kg/m² selon essence (résineux, composite, bois exotique).
   - Poids propre châssis aluminium : 11 à 14 kg/m² selon section de profilé (80 à 120 mm).
   - Surcharge d'exploitation sécuritaire piscine : 255 kg/m² ($2,5\text{ kN/m}^2$).
3. **Dimensionnement des galets de roulement** :
   - Galets doubles sur roulements étanches inox AISI 316L (capacité 250 kg par point).
   - Répartition équilibrée le long des rails inox au sol avec calcul de la charge unitaire réelle.
4. **Calcul de la zone de refoulement et des rails de guidage** :
   - Course nominale $C_{\text{max}} = L + 0,20\text{ m}$ (1 plateau) ou $L/2 + 0,15\text{ m}$ (2 demi-plateaux symétriques).
   - Linéaire de rails inox = $\text{nbRails} \times (\text{Longueur bassin} + \text{Zone refoulement} + \text{Marge sécurité})$.

---

## 4. Visualisation 3D WebGL Three.js (`components/terrasse/TerrasseVue3D.tsx`)

### Architecture du moteur 3D
- **Framework** : `@react-three/fiber` (R3F) et `@react-three/drei` (`OrbitControls`).
- **Performance 60 FPS** : Rendu des lames fixes standard et réemployées via `InstancedMesh` avec matrices d'instances transformées une seule fois lors du chargement.
- **Layer 6 (Rails & Châssis mobile)** :
  - Rails plats en inox brossé posés à fleur sur la plage fixe (`meshStandardMaterial`, `metalness: 0.96`, `roughness: 0.22`, `castShadow`, `receiveShadow`).
  - Châssis mobile portant en profilés aluminium et galets de roulement.
  - Platelage supérieur synchronisé avec le calepinage.
  - **Habillage en applique (jupe 4 faces)** : 4 bandeaux de finition verticaux descendant à 8 mm de la plage fixe, masquant entièrement l'armature métallique de profil (caisson fermé).
- **Curseur interactif d'ouverture** : Slider $0\%$ (fermé) à $100\%$ (ouvert) avec bouton Play/Pause d'animation fluide $T(t)$ appliquant la translation vectorielle selon le sens de refoulement.
- **Matériaux PBR et Éclairage** :
  - Textures procédurales de rainurage antidérapant haute définition (`map` + `bumpMap` sur canvas dynamique).
  - Eau turquoise semi-transparente (`#06b6d4`, `opacity: 0.78`, `roughness: 0.04`, `depthWrite: false`).
  - Margelle périphérique calcaire (`#e2e8f0`) et cuvelage recevant les ombres portées.
  - Lumière directionnelle avec carte d'ombres douces PCF 2048×2048 (`castShadow` et `receiveShadow`).

---

## 5. Validation et Tests

- **Tests unitaires dédiés** : [__tests__/terrasse/terrasse-mobile.test.ts](file:///data/data/com.termux/files/home/bna-dashboard/__tests__/terrasse/terrasse-mobile.test.ts) (4 tests exhaustifs couvrant monobloc, demi-plateaux, calcul des rails et intégration quantitatif).
- **Couverture globale Terrasse** : 16 suites de tests, **143 tests passés avec 100 % de succès**.
- **Contrôle TypeScript** : `NODE_OPTIONS="--max-old-space-size=4096" tsc --noEmit` validé sans aucune erreur.
- **Rétrocompatibilité** : Chantiers terrasses sans piscine ou sans terrasse mobile 100 % fonctionnels et inchangés.

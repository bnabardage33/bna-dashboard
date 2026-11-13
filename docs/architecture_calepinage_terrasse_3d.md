# Architecture & Analyse Technique : Calepinage & Moteur 3D Terrasse

> **Projet :** BNA Dashboard (Next.js 16 / React 19 / Node.js / Supabase)  
> **Domaine Métier :** Terrasse Pro & Aménagements Extérieurs (NF DTU 51.4 / DTA Composites)  
> **Date de rédaction :** 13 Novembre 2026  
> **Statut :** Documentation de référence de l'architecture existante & feuille de route d'évolution  

---

## Sommaire

1. [Arborescence et Stack Technique](#1-arborescence-et-stack-technique)
2. [Architecture du Moteur 3D](#2-architecture-du-moteur-3d)
3. [Algorithme de Calepinage et d'Optimisation des Découpes](#3-algorithme-de-calepinage-et-doptimisation-des-découpes)
4. [Flux de Données Frontend / Backend](#4-flux-de-données-frontend--backend)
5. [Limites Actuelles et Pistes d'Évolution](#5-limites-actuelles-et-pistes-dévolution)

---

## 1. Arborescence et Stack Technique

### 1.1 Cartographie des dossiers et fichiers principaux

L'ensemble des fonctionnalités de calepinage, dimensionnement et visualisation 3D de terrasse est strictement cloisonné pour respecter l'indépendance avec le domaine Bardage :

```text
bna-dashboard/
├── app/
│   ├── terrain/terrasse/
│   │   ├── page.tsx                     # Cockpit terrain des chantiers terrasse
│   │   └── [id]/page.tsx                # Hub Chantier Terrasse (navigation 8 modules)
│   ├── bureau/catalogue-terrasse/
│   │   └── page.tsx                     # Gestion des fournitures (lames, lambourdes, clips, plots)
│   └── api/
│       ├── chantiers/[id]/terrasse/
│       │   ├── route.ts                 # API REST CRUD, validation DTU & persistance Supabase
│       │   └── export/
│       │       ├── excel/route.ts       # Export du bordereau de débit et quantitatif Excel (ExcelJS)
│       │       └── pdf/route.ts         # Export du dossier technique et plan en PDF (pdf-lib)
│       └── catalogue-terrasse/route.ts  # API de consultation des fournitures et grilles tarifaires
├── components/terrasse/
│   ├── ChantierTerrasseTab.tsx          # Orchestrateur central d'état (config, calculs, sous-onglets)
│   ├── TerrasseVue3D.tsx                # Moteur 3D vectoriel SVG (caméra orbitale, mode éclaté DTU)
│   ├── TerrassePlanCanvas2D.tsx         # Moteur 2D HTML5 Canvas (calepinage interactif, cotes, survol)
│   ├── TerrasseConfigForm.tsx           # Formulaire de configuration des paramètres terrasse
│   ├── TerrasseConformiteDTU.tsx        # Audit normatif automatisé NF DTU 51.4 (P1-1 / P1-2)
│   ├── TerrasseQuantitatifTable.tsx     # Tableau de chiffrage structuré (Q_net, Q_tech, Q_appro)
│   ├── NouveauChantierTerrasseModal.tsx # Modale de création rapide
│   └── hub/                             # Modules spécialisés du Hub terrain
│       ├── TerrasseCalepinageModule.tsx # Intégration du calepinage dans le Hub
│       ├── TerrasseAvancementModule.tsx # Suivi des 6 phases DTU 51.4
│       └── ...
└── lib/terrasse/
    ├── types.ts                         # Interfaces TypeScript, modèles de données et contrats
    ├── calculs.ts                       # Point d'entrée de calcul quantitatif et d'orchestration
    ├── dtu51_4.ts                       # Moteur de règles normatives, portées et entraxes admissibles
    ├── compatAccessoires.ts             # Règles de compatibilité fixations / lames / lambourdes
    ├── exportExcel.ts                   # Générateur de classeur Excel multi-onglets
    ├── exportPdf.ts                     # Générateur de planches techniques PDF
    ├── pro/                             # Moteur géométrique & calepinage avancé (Terrasse Pro)
    │   ├── presets-regles.ts            # Brique 1 : Presets, sollicitations mécaniques (1 à 3), règles
    │   ├── geometrie-structure.ts       # Brique 2 : Géométrie 2D, lambourdes, chevêtres et plots
    │   ├── calepinage-decoupe.ts        # Brique 3 : Placement lames, joints, optimiseur 1D et chutes
    │   └── quantitatifs-contrat.ts      # Brique 4 : Contrat Q_net / Q_tech / Q_appro & quincaillerie
    ├── composite/                       # Spécifications pour lames bois polymère (WPC sous DTA)
    │   ├── dilatation.ts                # Modèle thermo-mécanique de dilatation et jeux de pose
    │   ├── fabricants.ts                # Presets fabricants (Silvadec, Fiberdeck, Neowood, Océwood)
    │   └── calculs.ts / audit.ts        # Moteur de calcul et audit DTA
    └── bois/                            # Spécifications bois massif (résineux et feuillus exotiques)
        ├── vissage.ts / clipsBois.ts    # Dimensionnement vis traversantes (Tableau 9) / clips
        └── audit.ts                     # Contrôles de durabilité, séchage et classes d'emploi
```

### 1.2 Dépendances du package.json et choix d'implémentation

L'inspection de `package.json` révèle une caractéristique architecturale majeure :

```json
{
  "dependencies": {
    "next": "^16.4.6",
    "react": "19.2.8",
    "react-dom": "19.2.8",
    "@supabase/ssr": "^0.12.5",
    "@supabase/supabase-js": "^2.112.4",
    "exceljs": "^4.4.0",
    "pdf-lib": "^1.17.1",
    "lucide-react": "^1.31.0",
    "recharts": "^3.10.1",
    "papaparse": "^5.7.0"
  }
}
```

- **Bibliothèques 3D (Three.js, @react-three/fiber, Babylon.js) :** **Aucune**.
- **Bibliothèques géométriques / découpe (Clipper, Earcut, Turf.js, MaxRectsPacker) :** **Aucune**.
- **Choix d'architecture :** L'intégralité du moteur géométrique, de l'optimiseur de découpe 1D et du moteur de rendu 3D vectoriel est **implémentée sur-mesure en TypeScript pur**. Cela évite tout surpoids de bundle, assure une exécution ultra-rapide sur terminaux mobiles (chantier) et garantit une fidélité stricte aux équations du DTU 51.4 sans dépendance tierce.

---

## 2. Architecture du Moteur 3D

Le moteur 3D réside dans [`components/terrasse/TerrasseVue3D.tsx`](file:///data/data/com.termux/files/home/bna-dashboard/components/terrasse/TerrasseVue3D.tsx) (948 lignes). Il s'agit d'un visualiseur 3D temps réel vectoriel SVG développé spécifiquement pour le contrôle technique de pose.

### 2.1 Modélisation de la scène et des couches DTU 51.4

La scène décompose la terrasse en un assemblage volumétrique de parallélépipèdes 3D (polygones à 6 faces générés par la fonction `createBoxPolys`), structurés en 5 couches ordonnées (`layerId`) :

```mermaid
graph TD
    L1["Layer 1 : Sol / Dalle béton / Sol brut stabilisé"]
    L2["Layer 2 : Plots réglables polymères / Cales d'isolation"]
    L3["Layer 3 : Structure lambourdes courantes, doubles aboutages & chevêtres"]
    L4["Layer 4 : Platelage (lames débitées réelles, joints, chutes réemployées ♻️)"]
    L5["Layer 5 : Réservations (Bassin piscine avec eau, arbres) & Escaliers Blondel"]

    L1 --> L2 --> L3 --> L4 --> L5
```

1. **Layer 1 — Sol / Assise :**
   - Représente la dalle béton ou le sol compacté avec une teinte ardoise foncée (`#1e293b` ou `#292524`).
2. **Layer 2 — Plots & Cales :**
   - Positionne les plots polymères réglables aux coordonnées calculées $(X, Y, Z)$ issues du moteur structurel.
   - Différenciation visuelle par couleur : ambre/jaune pour les plots courants, bleu cyan pour les plots de renfort de chevêtre, vert émeraude pour les cales d'isolation sur dalle.
3. **Layer 3 — Structure porteuse :**
   - Modélise les lambourdes porteuses en bois classe 4, bois exotique ou profilés aluminium.
   - Intègre les **doubles lambourdes d'aboutage** (jumelées à chaque ligne de jonction de lames) et les **chevêtres d'encadrement** des trémies.
4. **Layer 4 — Platelage :**
   - Modélise chaque segment individuel de lame issu de l'optimiseur de découpe, avec prise en compte de l'essence (ipé, cumaru, pin cl4, composite).
   - Met en surbrillance vert émeraude (`#059669`) les **chutes réemployées** (♻️) pour un repérage immédiat par le poseur.
5. **Layer 5 — Réservations, Bassin & Escaliers :**
   - **Bassin de piscine :** Modélisé en volume 3D avec eau cyan semi-transparente (`rgba(14, 165, 233, 0.78)`), bordure supérieure et parois latérales.
   - **Escaliers :** Génération géométrique des marches et contremarches selon la loi de confort de Blondel ($2H + G \in [60, 64]\text{ cm}$).

### 2.2 Moteur trigonométrique et projection en perspective

La projection de l'espace 3D cartésien vers le repère 2D de l'élément `<svg viewBox={...}>` est exécutée via une matrice de rotation orbitale à deux degrés de liberté :
- **$\text{yaw}$ ($\theta$) :** Rotation azimutale horizontale ($[-175^\circ, +175^\circ]$).
- **$\text{pitch}$ ($\phi$) :** Inclinaison d'élévation verticale ($[8^\circ, 86^\circ]$).

Formules mathématiques appliquées à chaque point $P(x, y, z)$ :
$$\begin{aligned}
x_1 &= x \cos(\text{yaw}) - y \sin(\text{yaw}) \\
y_1 &= x \sin(\text{yaw}) + y \cos(\text{yaw}) \\
\text{screenY} &= y_1 \sin(\text{pitch}) - z \cos(\text{pitch}) \\
\text{depth} &= y_1 \cos(\text{pitch}) + z \sin(\text{pitch}) \\
\text{perspective} &= \frac{D_{\text{cam}}}{D_{\text{cam}} + \text{depth} \times 0.45} \\
S_x &= x_1 \times \text{perspective} \\
S_y &= \text{screenY} \times \text{perspective}
\end{aligned}$$

### 2.3 Tri en profondeur (Algorithme du peintre)

En l'absence de GPU / Z-buffer natif dans le DOM SVG, l'ordre d'affichage est garanti par un tri multicritère (`projected.sort`) exécuté à chaque déplacement de caméra :
1. Priorité stricte au `layerId` (Sol < Plots < Lambourdes < Lames < Réservations).
2. Altitude moyenne $\text{avgZ}$ de l'élément (si écart $> 8\text{ mm}$).
3. Profondeur projetée $\text{avgDepth}$ (du polygone le plus éloigné au plus proche de l'œil).

### 2.4 Gestion des états et fonctionnalités interactives

- **Mode Éclaté DTU 51.4 (`eclate`) :** Introduit un écartement d'altitude réglable ($gapZ = 0.28\text{ m}$) entre les couches, permettant d'inspecter visuellement les plots sous les lambourdes et les fixations sous le platelage.
- **Caméra tactile fluide :** Utilise `useRef` (`dragRef`) et `onPointerMove` pour manipuler la caméra sans déclencher de re-renders superflus.
- **Isolation de couches :** Toggles indépendants `showSol`, `showPlots`, `showLambourdes`, `showLames`.
- **Inspection au clic (`selectedMeta`) :** Clic sur n'importe quelle pièce pour ouvrir une fiche technique descriptive :
  - Lame : N° de rangée, longueur nette, appuis sous segment, origine (barre neuve ou chute réemployée).
  - Lambourde : Rôle (courante, chevêtre, jumelée), portée maximale entre plots, nombre d'appuis.
  - Plot : Charge caractéristique $F_{Rk}$, type d'appui, hauteur sous lame.

> [!NOTE]
> **Précision d'audit sur la « terrasse mobile sur rails » :**  
> Dans la version actuelle, la piscine est modélisée comme une **réservation fixe** au sein du platelage (plage fixe avec encadrement de chevêtres). La terrasse mobile coulissante sur rails et l'animation cinématique motorisée d'ouverture/fermeture ne sont pas encore codées en tant qu'entités indépendantes. L'architecture géométrique actuelle permet toutefois d'intégrer très simplement un sous-ensemble `ChassisMobile` avec translation $T_x(t)$.

---

## 3. Algorithme de Calepinage et d'Optimisation des Découpes

Le calepinage est gouverné par les 4 briques modulaires de [`lib/terrasse/pro/`](file:///data/data/com.termux/files/home/bna-dashboard/lib/terrasse/pro/) :

```mermaid
flowchart LR
    subgraph B1["Brique 1 : presets-regles.ts"]
        R1["Sollicitations 1, 2, 3"]
        R2["Jeux pose / Dilation"]
        R3["Règle anti-micro-pièces"]
    end

    subgraph B2["Brique 2 : geometrie-structure.ts"]
        G1["Contour I, L, U & Réservations"]
        G2["Lambourdes simples & doubles"]
        G3["Chevêtres & Plots de renfort"]
    end

    subgraph B3["Brique 3 : calepinage-decoupe.ts"]
        C1["Poses Alignée / Perdue / 1/3"]
        C2["Optimiseur 1D Bar-Cutting"]
        C3["Trait scie 3mm & Purge 15mm"]
    end

    subgraph B4["Brique 4 : quantitatifs-contrat.ts"]
        Q1["Q_net : Géométrique"]
        Q2["Q_tech : Découpé + chutes"]
        Q3["Q_appro : Colisage commercial"]
    end

    B1 --> B2 --> B3 --> B4
```

### 3.1 Brique 1 — Presets et règles normatives (`presets-regles.ts`)

- **Catégories de sollicitations (DTU 51.4 §4) :**
  - Catégorie 1 : Privatif résidentiel ($2.5\text{ kN/m}^2$, flèche lame $\le 5\text{ mm}$, plot $F_{Rk} \ge 5\text{ kN}$).
  - Catégorie 2 : ERP / Collectif modéré ($4.0\text{ kN/m}^2$, plot $F_{Rk} \ge 7.5\text{ kN}$).
  - Catégorie 3 : Public lourd ($5.0\text{ kN/m}^2$, plot $F_{Rk} \ge 12.5\text{ kN}$).
- **Règle bloquante anti-micro-pièces ($R\text{-MET-}01$) :**
  - Longueur nette minimale d'un segment de lame : **$L_{\text{net}} \ge 400\text{ mm}$**.
  - Tout segment doit reposer sur **au moins 2 appuis** (bois) ou **3 appuis** (composite ou segment $< 800\text{ mm}$).
  - Porte-à-faux d'extrémité borné : **$20\text{ mm} \le \text{PAF} \le \min(100\text{ mm}, 3 \times e)$**.
  - Si le calepinage en quinconce viole cette règle, il est rejeté et l'algorithme propose automatiquement les 2 meilleurs scénarios admissibles (`topAdmissibleScenarios`).

### 3.2 Brique 2 — Moteur géométrique 2D de structure (`geometrie-structure.ts`)

- **Gestion des formes et réservations :**
  - Support des formes en $I$, $L$, $U$ et polygones orthogonaux.
  - Soustraction des réservations (piscines, skimmers, arbres, trappes techniques) avec calcul exact de la surface nette $S_{\text{net}} = S_{\text{brute}} - S_{\text{reservations}}$.
- **Implantation des lambourdes :**
  - Entraxe maximal calculé selon la charge et l'épaisseur de lame (ex: $40\text{ cm}$ pour lame résineuse de $21\text{ mm}$).
  - **Double lambourdage d'aboutage :** Lorsque deux lames s'aboutent bout à bout, le moteur positionne automatiquement deux lambourdes jumelées espacées de $50\text{ mm}$, garantissant un vissage à plus de $20\text{ mm}$ des rives de bout conformément au DTU 51.4 §5.5.6.
- **Chevêtres automatiques :**
  - Génération de lambourdes transversales d'encadrement à chaque franchissement de trémie de piscine ou d'obstacle.
- **Implantation des plots :**
  - Portée admissible selon la section de lambourde ($L \le 700\text{ mm}$ pour $\ge 3$ appuis, $L \le 600\text{ mm}$ pour 2 appuis).
  - Positionnement systématique de plots de renfort sous chaque angle de chevêtre.

### 3.3 Brique 3 — Calepinage des lames et optimiseur de découpe 1D (`calepinage-decoupe.ts`)

- **Modes de pose :**
  - `ALIGNEE` : Joints d'aboutage alignés sur lignes structurelles continues.
  - `COUPE_PERDUE` : La chute de la dernière lame d'une rangée est réinjectée en départ de rangée suivante si elle mesure $\ge 400\text{ mm}$.
  - `QUINCONCE` : Décalage régulier d'un tiers ou d'une demi-longueur.
- **Optimiseur de découpe linéaire 1D (Bar-Cutting) :**
  - Débit dans les longueurs commerciales disponibles (ex: $3.0\text{ m}, 4.2\text{ m}, 4.8\text{ m}$).
  - Déduction systématique du trait de scie (`kerfMm` = $3\text{ mm}$).
  - Purge d'extrémité (`endTrimMm` = $10\text{ à }15\text{ mm}$) pour éliminer les fentes de séchage en bout de lame.
  - Suivi des statuts de chutes : `REUSED_IN_PLAN`, `REUSABLE_STOCK` ($\ge 1.0\text{ m}$), ou `WASTE_SCRAP` (rebut).
  - Calcul du taux de perte effectif (`bladeWasteRatePercent`).

### 3.4 Brique 4 — Contrat de sortie quantitatif (`quantitatifs-contrat.ts`)

L'algorithme sépare formellement les trois niveaux de métré :
1. **$Q_{\text{net}}$ (Quantités géométriques nettes) :** Surface nette de platelage, linéaire net posé de lambourdes, nombre exact d'appuis.
2. **$Q_{\text{tech}}$ (Quantités techniques découpées) :** Nombre réel de barres commerciales débitées et volume des chutes réelles.
3. **$Q_{\text{appro}}$ (Quantités d'approvisionnement) :** Ajout de la marge de tri chantier ($+3\%$) et colisage commercial fournisseur (boîtes de 200 vis, rouleaux de bande d'étanchéité EPDM de $20\text{ m}$, cartons de 100 clips).
4. **Dimensionnement des vis (Tableau 9 DTU 51.4) :**
   - Épaisseur $21\text{–}25\text{ mm}$ $\rightarrow$ Vis $\varnothing 5\text{ mm}$, longueur $50\text{–}60\text{ mm}$.
   - Épaisseur $> 25\text{ mm}$ $\rightarrow$ Vis $\varnothing 6\text{ mm}$, longueur $70\text{–}80\text{ mm}$.
   - Grade Inox A4 obligatoire en environnement piscine (chlore/sel) et littoral.

---

## 4. Flux de Données Frontend / Backend

Le cycle de vie des données garantit à la fois une réactivité immédiate sur le terrain et l'intégrité technique des devis et PV de réception :

```mermaid
sequenceDiagram
    autonumber
    actor Tech as Poseur / Métreur (Terrain)
    participant Front as Client Next.js (React 19)
    participant Calc as Moteur Local (calculs.ts)
    participant API as Route API (/api/chantiers/.../terrasse)
    participant DB as Base de Données (Supabase PostgreSQL)

    Tech->>Front: Modification paramètres (L, l, essence, bassin)
    Front->>Calc: Réévaluation instantanée (useMemo)
    Calc-->>Front: Mise à jour 2D Canvas, 3D SVG & Quantitatifs (0 ms latence)
    
    Tech->>Front: Clic "Enregistrer la configuration"
    Front->>API: POST /api/chantiers/[id]/terrasse (JSON)
    API->>API: Résolution tenant & contrôle cloisonnement métier
    API->>API: Validation bornes numériques (validerNombresTerrasse)
    API->>API: Recalcul côté serveur (sécurité & intégrité)
    API->>DB: UPSERT `chantier_terrasses` & `chantier_terrasse_reservations`
    DB-->>API: Enregistrement confirmé
    API-->>Front: Réponse { ok: true, terrasse, resultat }
    Front-->>Tech: Toast de succès
```

### 4.1 Réactivité 100 % Client
Dans [`ChantierTerrasseTab.tsx`](file:///data/data/com.termux/files/home/bna-dashboard/components/terrasse/ChantierTerrasseTab.tsx) :
```tsx
const resultat = useMemo<ResultatCalculTerrasse>(() => {
  return calculerTerrasse(config, reservations);
}, [config, reservations]);
```
Toute saisie dans le formulaire re-calcule immédiatement le calepinage et rafraîchit la 3D sans aucune latence réseau.

### 4.2 Persistance et validation serveur
- La route API [`app/api/chantiers/[id]/terrasse/route.ts`](file:///data/data/com.termux/files/home/bna-dashboard/app/api/chantiers/[id]/terrasse/route.ts) reçoit le payload.
- Elle valide les bornes géométriques (`longueur_m`, `largeur_m`, entraxes) pour empêcher toute valeur aberrante.
- Elle vérifie le cloisonnement du chantier (`chantier.metier === "terrasse"`).
- Elle **ré-exécute le calcul côté serveur** afin que le snapshot `resultats_techniques` persisté en base de données reflète la vérité normative et ne dépende pas de l'exécution client.

### 4.3 Structure des tables Supabase
- `chantier_terrasses` : Paramètres de configuration, essence, lambourdes, prix catalogue, snapshot JSON des résultats techniques.
- `chantier_terrasse_reservations` : Enregistrements distincts pour chaque trémie/bassin avec position $(X, Y)$, dimensions ($L \times l$ ou diamètre) et type (`piscine`, `skimmer`, `arbre`, `trappe`).

---

## 5. Limites Actuelles et Pistes d'Évolution

| Domaine | Architecture Actuelle | Limites Identifiées | Bibliothèques Open-Source & Pistes d'Évolution Recommandées |
| :--- | :--- | :--- | :--- |
| **Géométrie & Découpes 2D** | Bandes orthogonales manuelles (`intersectHorizontalBandWithDomainMm`). | Limité aux angles droits. Découpes biseautées, poses en diagonale ($45^\circ$) ou piscines ovales très complexes à modéliser sans approximations. | **`clipper2-js`** : Moteur de clipping de polygones robuste. Permet l'intersection booléenne exacte ($Terrasse \setminus Bassin$), les découpes en biais à n'importe quel angle et le calcul automatique du décalage d'offset pour le jeu de dilatation périphérique ($10\text{ mm}$). |
| **Rendu 3D & Framerate** | Moteur vectoriel SVG trigonométrique avec tri de faces manuel (Algorithme du peintre). | Chute de fluidité au-delà de 300 éléments SVG sur mobile. Pas d'éclairage réaliste, pas d'ombrage ni de textures bois/eau. Artefacts de tri possibles lors de croisement d'angles. | **`@react-three/fiber` + `@react-three/drei` (Three.js)** : Rendu WebGL 3D natif GPU. Utilisation de `InstancedMesh` pour afficher 3 000 vis, lames et plots à 60 FPS constants. Shaders PBR réalistes (eau animée avec reflets, rainures bois). |
| **Optimisation des découpes** | Algorithme 1D glouton linéaire avec réemploi local de chutes. | L'optimisation se fait ligne par ligne séquentiellement, ce qui peut laisser des chutes résiduelles sous-optimales à l'échelle globale du chantier. | **`maxrects-packer`** : Idéal si le projet évolue vers des dalles carrelage sur plots (packing 2D). Pour les lames de terrasse (1D), intégrer un solveur de coupe 1D global (type *Best-Fit Decreasing* ou problème du sac à dos) pour abaisser le taux de chute sous $4\%$. |
| **Terrasse mobile sur rails** | Modélisation statique de la réservation piscine. | Absence d'entité châssis roulant, de profilés de rails et d'animation cinématique motorisée. | Création d'un module `TerrasseChassisMobile` avec état de translation $T_x(t)$ animé par un curseur d'ouverture ($0\%$ fermé $\rightarrow 100\%$ ouvert au-dessus de la piscine) avec détection de butées et rails de guidage inox. |

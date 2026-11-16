# Rapport d'audit & socle métier — Module Clôture (`metier = 'cloture'`)

Date : 2026-11-16  
Source analysée : `/data/data/com.termux/files/home/Bna-app`  
Cible : `bna-dashboard` (3e pilier métier : `BARDAGE` / `TERRASSE` / `CLOTURE`, accent Terracotta `#B85B2B`)

---

## 1. Inventaire du calepinage Clôture récupérable dans `Bna-app`

| Fichier source (`Bna-app`) | Rôle & contenu | Réutilisabilité dans `bna-dashboard` |
| :--- | :--- | :--- |
| `src/lib/cloture/calepinageCloture.ts` (420 lignes) | Moteur pur `calculateFenceLayout(config)` : 1 à 4 côtés (`DROITE`, `EN_L`, `EN_U`, `4_COTES`), matériaux (`BOIS`, `COMPOSITE`, `ALU`), extrémités (`LIBRE`, `DEPART_MUR`, `ENTRE_MURS`), pose (`DIRECT_SOL`, `SUR_MURET`), calcul des poteaux sans doublons aux angles, lames, béton, platines et taux de chute. | **Directement récupérable** dans `lib/cloture/calepinageCloture.ts` comme socle de calcul. |
| `src/lib/cloture/cloture.test.ts` (130 lignes) | 5 scénarios de tests unitaires (1 côté, en L sur muret, en U entre murs + alerte chute > 15 %, 4 côtés boucle fermée, 4 côtés entre murs). | **À adapter** en suite Vitest dans `__tests__/metier/cloture-calcul.test.ts`. |
| `src/components/calepinage/ClotureCalepinagePanel.tsx` (2 583 lignes) | Interface complète + 2 plans SVG natifs cotés : `PlanCalepinage4Cotes2DSvg` (vue en plan terrain N/S/E/O, poteaux, travées T1..Tn) et `ElevationPlan2DSvg` (vue en élévation de face). | **Logique SVG réutilisable**, à réhabiller selon la charte claire BNA Dashboard (cartes blanches épurées + accents Terracotta `#B85B2B`). |
| `src/app/calepinage-cloture/page.tsx` (49 lignes) | Page conteneur pour `ClotureCalepinagePanel`. | **Non reprise telle quelle** (intégration prévue dans les fiches chantier `metier = 'cloture'`). |

### Formules et constantes extraites de `calepinageCloture.ts`

- **Constantes (`FENCE_CONSTANTS`)** :
  - Section poteau : `0,07 m` (70 mm)
  - Profondeur feuillure : `0,015 m` de chaque côté
  - Jeu de dilatation thermique obligatoire par travée : `0,01 m`
  - Portée maximale absolue : `2,00 m` (bornée par `min(2.0, longueurLameBrute)`, lame brute entre `1,50 m` et `2,40 m`)
  - Garde de scellement sol : `+0,50 m` (`2` sacs de béton 35 kg par poteau scellé)
  - Garde platine sur muret : `+0,02 m` (`1` platine par poteau)
  - Seuil d'alerte chute : `15 %`
- **Formules clés** :
  - `nbTraveesSegment = max(1, ceil(longueurSegment / porteeMax))`
  - `largeurTraveeAxe = longueurSegment / nbTraveesSegment`
  - `largeurLibre = max(0, largeurTraveeAxe - 0.07)`
  - `longueurCoupeLame = largeurLibre + 2 * 0.015 - 0.01`
  - `nbLamesParTravee = ceil(hauteurUtile / hauteurLame)`
  - Décompte sans doublon des poteaux d'angle (`0` à `4`), intermédiaires (`nbTravees - 1`), terminaisons et demi-poteaux muraux.

### Éléments absents de `Bna-app` à développer dans `lib/cloture/`

1. **Plaques de soubassement béton** (hauteur utile déduite des lames, nombre de plaques = `nbTraveesTotal`, rallonge poteaux).
2. **Portillons** (déduction d'ouverture sur un tronçon, poteaux renforcés / gâche, impact sur les travées).
3. **Pentes et redans** (calcul du dénivelé par travée, hauteur supplémentaire des poteaux en escalier / redans).
4. **Chiffrage matière + main-d'œuvre** (passerelle directe vers `devisCalcul.ts`).
5. **Visualisation 3D** (seule la 2D SVG existe dans `Bna-app`).

---

## 2. Socle Base de Données & Registre des Métiers mis en place

- `lib/metiers/registry.ts` : ajout de `"CLOTURE"` dans `METIERS_CODES`, `PhaseMainOeuvreCloture`, `OngletTechniqueChantier` (`"cloture"`), `TableCatalogueSupabase` (`"catalogue_cloture"`), et entrée `METIERS_REGISTRY.CLOTURE` (Terracotta `#B85B2B`).
- `types/supabase.ts` : typage des tables `catalogue_cloture`, `chantier_clotures` et `chantier_cloture_troncons`.
- `supabase/migrations/20261116_chantier_cloture.sql` : contrainte `chantiers.metier IN ('bardage', 'terrasse', 'cloture')`, vue `v_chantiers_cloture`, tables `catalogue_cloture`, `chantier_clotures`, `chantier_cloture_troncons`, triggers d'intégrité métier et politiques RLS multi-entreprise.
- `__tests__/metier/registry.test.ts` : validation des 3 métiers (`BARDAGE`, `TERRASSE`, `CLOTURE`).

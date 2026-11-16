# Rapport d'audit — Estimation des temps de pose, heures de main-d'œuvre et chiffrage du travail

**Périmètre analysé :** Bardage, Terrasse, Catalogue, Devis/Factures et Base de données (`supabase/`).

---

## 1. Moteurs de calcul (`lib/bardage/`, `lib/terrasse/`, `lib/poseCalcul.ts`, `lib/calepinageCalcul.ts`, `lib/gaelLogic.ts`)

### Bardage (`lib/poseCalcul.ts`, `lib/poseCompositeCalcul.ts`, `lib/calepinageCalcul.ts`, `lib/bardage/`)
* **Aucun calcul de temps de pose ni d'heures de main-d'œuvre.** Ces moteurs sont exclusivement géométriques et quantitatifs matière (chevrons, équerres, chevilles, vis, isolant, bande EPDM, imbrication 2D des plaques).
* *Précision :* dans `components/ZoneCard.tsx` (`calculerZone`), `coefPerteRendement` (`1.1` pour les lames, `1.15` pour les plaques) est un coefficient de **chute matière** (`surfaceACommander = surfaceNette * marge`), et non un rendement horaire. En revanche, `calculerZone` calcule `totalCoupesML` et `nombreOuvertures`, qui alimentent ensuite l'estimation horaire.

### Terrasse (`lib/terrasse/calculs.ts`, `lib/terrasse/composite/calculs.ts`, `lib/terrasse/pro/`)
* **Aucun calcul de temps de pose ni d'heures.** `calculerTerrasse()` dans `lib/terrasse/calculs.ts` produit uniquement des quantités techniques (lames, lambourdes, plots, vis/clips, EPDM, géotextile, escalier, garde-corps, terrasse mobile) et un chiffrage HT **100 % fournitures** basé sur `TARIFS_INDICATIFS` et `TarifsCatalogueTerrasse`.

### Moteur de temps existant — « Gaël Logic » (`lib/gaelLogic.ts`)
C'est le seul moteur de calcul de temps de pose du dépôt. Il expose 4 fonctions :
* `calculerTempsBudget` :
  $$\text{TempsBudget (h)} = (\text{surfaceM2} \times \text{tempsUnitaireSurface}) + (\text{quantiteCoupesMl} \times \text{tempsUnitaireCoupe}) + (\text{singularitesNb} \times \text{tempsUnitaireSingularite})$$
* `calculerTempsPlanification` (défaut `coefPerteRendement = 1.8`) :
  $$\text{TempsPlanification (h)} = \frac{\text{tempsBudget}}{\text{coefPerteRendement}}$$
* `calculerTempsConsommeMeteo` :
  $$\text{TempsConsomme (h)} = \sum \frac{\text{volumeHeures}}{\text{coefMeteo} \parallel 1.0}$$
* `calculerBilanRentabilite` :
  $$\text{Écart (h)} = \text{tempsBudget} - \text{tempsConsomme}$$
  *(positif = gain, négatif = perte).*

### Analytique Main-d'Œuvre (`lib/mainOeuvreAnalytique.ts`)
* `analyserRentabiliteMainOeuvre(chantierId)` compare par phase (`ossature`, `isolation`, `bardage`, `finitions`, `general`) le coût réel des `pointages` (`heures * taux_horaire_charge`) au budget vendu issu des lignes `main_oeuvre` des devis signés/acceptés.
* Il convertit le budget vendu en heures via un **taux horaire moyen codé en dur** :
  `tempsBudgetPhase = vendu > 0 ? vendu / 28.50 : 0`.

---

## 2. Interfaces Terrain & Bureau

### Bardage — Heures & Cadences (`components/bardage/hub/BardageHeuresModule.tsx` & `components/TempsHeuresViews.tsx`)
* `BardageCalepinageModule` synchronise `surface_m2`, `quantite_coupes_ml` et `singularites_nb` sur la table `chantiers`, qui sont transmis à `BardageHeuresModule` depuis `app/terrain/chantier/[id]/page.tsx`.
* `ChantiersCalepinageView` et `TableauDeBordRentabiliteView` calculent le temps budget à la volée, **mais uniquement avec des constantes mockées en dur** dans `components/TempsHeuresViews.tsx` :
  * `MOCK_CATALOGUE = { surface: 0.5, coupe: 0.3, singularite: 1.5 }` (`0.5` h/m², `0.3` h/ml de coupe, `1.5` h/singularité), avec `coef = 1.8`.
* `PointageEquipeView` saisit des heures forfaitaires dans `pointages_globaux` (avec météo et `coef_meteo` via `validerPointageAvecMeteo`).
* `TableauDeBordRentabiliteView` compare visuellement `Budget` vs `Pointé brut` et `Consommé ajusté` (météo). Le temps budget n'est **jamais persisté** en base.

### Terrasse (`components/terrasse/TerrasseQuantitatifTable.tsx` & `components/terrasse/hub/TerrasseHeuresModule.tsx`)
* `TerrasseQuantitatifTable.tsx` affiche uniquement les quantitatifs matière et le `Total Fournitures HT`. Lors du pré-remplissage de commande fournisseur (`handleCreerCommande`), toute ligne `main_oeuvre`, `pose`, `prestation` ou d'unité `h`/`heure` est explicitement exclue.
* `TerrasseHeuresModule.tsx` permet de saisir et lister les **heures réalisées uniquement** dans `pointages_globaux`, ventilées sur 4 phases (`terrassement_support`, `structure_plots_lambourdes`, `pose_platelage`, `finitions_rives` stockées via `[Phase: ...]` dans `commentaire`). **Il n'y a aucune estimation d'heures prévues ni comparaison prévu/réalisé.**

### Devis & Factures (`app/bureau/devis-factures/page.tsx`, `lib/devisCalcul.ts`, `lib/metreVersPostes.ts`, `lib/iaDevisMetre.ts`, `app/api/ia-devis/route.ts`)
* `calculerDevis()` dans `lib/devisCalcul.ts` sépare `cout_matiere_ht` et `cout_main_oeuvre_ht` (via `qte * pu_revient` selon `type_cout`).
* **Un devis ne génère pas automatiquement de lignes de main-d'œuvre :**
  * Dans le flux `metre-complet` (`lib/metreVersPostes.ts` → `lib/iaDevisMetre.ts`), seuls les postes `metrage` (*Bardage — surface à commander* en m²), `isolant` (m²) et `pose` (*Bande EPDM* en ml) sont extraits : aucun poste de temps de pose / main-d'œuvre n'est généré.
  * Dans l'insertion catalogue manuelle (`insererDepuisCatalogue`), la surface pré-remplit une ligne en `m²` si l'utilisateur sélectionne lui-même un ouvrage `main_oeuvre`, sans ajout automatique.
  * Dans le flux IA legacy (`app/api/ia-devis/route.ts`), une ligne `main_oeuvre` n'apparaît que si le prompt dicté la demande et matche un ouvrage du catalogue (généralement en `m²`, pas en heures).

---

## 3. Base de données & Catalogue (`supabase/`, `catalogue_ouvrages`, `catalogue-terrasse`)

* **`catalogue_temps` (`types/supabase.ts`) :**
  * Contient les colonnes `id`, `nom_tache`, `temps_unitaire_heure`.
  * Déclarée dans `lib/metiers/registry.ts` et protégée par RLS multi-entreprise (`supabase/migrations/20260922_isolation_multi_entreprise_phase1_part2.sql`), **mais totalement inutilisée dans le code** (zéro requête `supabase.from("catalogue_temps")`, zéro interface CRUD).
* **`catalogue_ouvrages` (`types/supabase.ts`) :**
  * Contient `type_cout` (`'matiere' | 'main_oeuvre'`), `unite`, `pu_ht`, `pu_revient`. **Aucune colonne de temps unitaire ou de cadence.** Les prestations seedées dans `supabase/migrations/20260916_seed_main_oeuvre.sql` (Pose ITE, Pose Ossature, Pose Parement) sont tarifées au `m²` sans durée unitaire.
* **`catalogue_terrasse_accessoires` (`types/supabase.ts`, migrations `20261020` / `20261021`) :**
  * Contient `type_cout` (`'matiere' | 'main_oeuvre'`), `pu_ht`, `pu_revient`, `unite_mesure` (géré dans `/bureau/catalogue-terrasse`). **Aucune colonne de temps unitaire / cadence**, et ces prestations ne sont pas consommées par `calculerTerrasse()`.
* **`pointages` & `pointages_globaux` :**
  * Stockent uniquement le **réalisé** (`heures`, `taux_horaire_charge`, `phase_travail` sur `pointages` ; `volume_heures_declare`, `coef_meteo`, `phase_travail` sur `pointages_globaux`).

---

## 4. Synthèse, écarts et points de branchement

| Domaine | Existant | Manque / Écart | Point de branchement propre (sans casser l'existant) |
| :--- | :--- | :--- | :--- |
| **Catalogue / BDD** | Table `catalogue_temps` existante (`temps_unitaire_heure`), `type_cout` sur les catalogues | `catalogue_temps` non requêtée ; pas de cadence sur `catalogue_ouvrages` / `catalogue_terrasse_accessoires` | Ajouter `temps_unitaire_heure` (nullable) sur `catalogue_ouvrages` et `catalogue_terrasse_accessoires`, ou exploiter `catalogue_temps` avec une UI de paramétrage dans `/bureau/catalogue` et `/bureau/catalogue-terrasse` |
| **Calcul Bardage** | `gaelLogic.ts` + `MOCK_CATALOGUE` (`0.5` h/m², `0.3` h/ml, `1.5` h/sing.) | Ratios mockés en dur, pas de distinction ossature/ITE/parement/finitions | Garder `lib/poseCalcul.ts` purement géométrique ; enrichir `lib/gaelLogic.ts` (ou créer `lib/bardage/tempsPose.ts`) en consommant `ResultatMetre` + les cadences réelles BDD pour alimenter `TempsHeuresViews.tsx` |
| **Calcul Terrasse** | `TerrasseHeuresModule.tsx` avec 4 phases définies | Zéro estimation d'heures prévues ni comparaison prévu/réalisé | Garder `lib/terrasse/calculs.ts` purement technique ; créer un calculateur additif (ex. `lib/terrasse/tempsPose.ts`) prenant `ResultatCalculTerrasse` (surface nette, ml lambourdes, nb plots, escalier, garde-corps, mobile) → heures prévues par phase, puis afficher l'écart dans `TerrasseHeuresModule.tsx` |
| **Devis / Factures** | `devisCalcul.ts` (`cout_main_oeuvre_ht`), `mainOeuvreAnalytique.ts` (`/ 28.50`) | Pas de génération auto de lignes MO depuis le métré Bardage ou le chiffrage Terrasse | Ajouter une étape optionnelle/paramétrable dans `lib/metreVersPostes.ts` (postes `main_oeuvre` par phase ou heures estimées) et un export Devis depuis Terrasse incluant les prestations `type_cout = "main_oeuvre"` ; exposer le taux horaire entreprise au lieu du `28.50` codé en dur |

# Rapport d'audit — Nommage, cohérence et structure de l'arborescence

**Périmètre analysé :** `app/`, `components/`, `lib/`, `hooks/`, `types/`, `__tests__/`.

---

## 1. Dossier `lib/`

| Chemin actuel | Rôle réel dans le code | Problème de nommage / structure | Nouveau nom proposé | Impact (réfs) |
| :--- | :--- | :--- | :--- | :--- |
| `lib/documents.ts` | Génère les numéros séquentiels (`prochainNumero` pour `pv_receptions`, `prochainNumeroDevis`, `prochainNumeroFacture`). | Nom générique trompeur : ne gère ni fichiers ni PDF, uniquement la **numérotation**. | `lib/numerotationDocuments.ts` | ~38 réfs (dont tests) |
| `lib/meteoVigilance.ts` | Simple passerelle (`export * from "./vigilanceMeteoFrance"`). | Doublon / reliquat historique faisant double emploi avec `vigilanceMeteoFrance.ts`. | **À supprimer** (importer `vigilanceMeteoFrance.ts` directement) | 2 réfs (`meteoAlerte.ts`, `api/meteo/intemperies`) |
| `lib/poseCalcul.ts` | Moteur de calcul ossature / ITE / fixation **Bardage** (DTU 41.2). | Isolé à la racine de `lib/` alors que tout le métier bardage est dans `lib/bardage/`. | `lib/bardage/poseCalcul.ts` | 17 réfs |
| `lib/poseCompositeCalcul.ts` | Simulation de calepinage et réemploi de chutes pour **lames composites de bardage**. | Isolé à la racine de `lib/` ; nom ambigu (on pourrait croire à de la terrasse composite). | `lib/bardage/poseCompositeCalcul.ts` | 2 réfs |
| `lib/calepinageCalcul.ts` | Moteur de découpe et nesting 2D des panneaux **HPL/Bardage**. | Isolé à la racine de `lib/` à côté du sous-dossier `lib/calepinage/` et de `lib/bardage/pro/calepinage-decoupe.ts`. | `lib/calepinage/calepinageCalcul.ts` (ou `lib/bardage/calepinageCalcul.ts`) | 17 réfs |
| `lib/iaDevisLegacy.ts` | Repli de génération de devis IA sans métré persisté (règles textuelles). | Suffixe `Legacy` flou ; utilisé uniquement par `app/api/ia-devis/route.ts`. | `lib/iaDevisTexteRepli.ts` | 1 réf |
| `lib/otp.ts` | Génération et vérification des codes OTP de l'espace client. | Sigle trop court et générique (`otp.ts`). | `lib/codeVerificationClient.ts` | 12 réfs |
| `lib/cn.ts` | Utilitaire Tailwind `clsx` + `twMerge`. | Abréviation minimale (`cn.ts`), convention shadcn/ui isolée. | `lib/classesCss.ts` *(ou conserver `cn.ts` si convention UI assumée)* | 3 réfs |
| `lib/anonymizeText.ts` | Anonymisation des données personnelles avant appel IA. | Tout en anglais alors que le reste de `lib/` est en français (`contexteEntreprise.ts`, `devisCalcul.ts`). | `lib/anonymisationTexte.ts` | 7 réfs |
| `lib/fetchWithTimeout.ts` | Wrapper `fetch` avec `AbortController` et délai max. | Tout en anglais. | `lib/requeteTimeout.ts` | 7 réfs |
| `lib/imageCompress.ts` | Compression d'images côté client avant upload. | Anglais abrégé (`Compress`). | `lib/compressionImage.ts` | 1 réf |
| `lib/supabaseAdmin.ts` & `lib/supabase.ts` | Clients Supabase navigateur et service-role, à côté de `lib/supabase/{server,middleware}.ts`. | Mélange entre fichiers à plat (`supabase.ts`, `supabaseAdmin.ts`) et sous-dossier `lib/supabase/`. | `lib/supabase/client.ts` et `lib/supabase/admin.ts` | Fort impact |
| `lib/metre-*.ts` & `lib/servir-metre-complet.ts` vs `lib/metreVersPostes.ts` | Pipeline métré complet → postes devis. | Mélange `kebab-case` (`metre-complet.ts`, `servir-metre-complet.ts`) et `camelCase` (`metreVersPostes.ts`). | Uniformiser en `camelCase` (`metreComplet.ts`, `servirMetreComplet.ts`, `metrePersistance.ts`, `metreSerialisation.ts`) | ~15–20 réfs |
| `lib/espace-chat-*.ts`, `lib/espace-chantier-code.ts`, `lib/rapports-client*.ts` | Espace client, chat et rapports PDF client. | `kebab-case` + franglais (`summary`, `utils`) au milieu de `lib/` en `camelCase`. | `lib/espaceClientChatResume.server.ts`, `lib/espaceClientChatOutils.ts`, `lib/codeEspaceChantier.ts`, `lib/rapportsClient.ts` | ~10 réfs |
| `lib/terrasse/dtu51_4.ts` | Règles normatives NF DTU 51.4 terrasse bois. | `snake_case` isolé (`dtu51_4.ts`) au milieu de fichiers `camelCase` (`compatAccessoires.ts`). | `lib/terrasse/dtu514.ts` | ~8 réfs |

---

## 2. Dossier `components/`

| Chemin actuel | Rôle réel dans le code | Problème de nommage / structure | Nouveau nom proposé | Impact (réfs) |
| :--- | :--- | :--- | :--- | :--- |
| `components/TempsHeuresViews.tsx` | 3 vues temps/pointage/rentabilité Bardage (`ChantiersCalepinageView`, `PointageEquipeView`, `TableauDeBordRentabiliteView`). | Franglais (`TempsHeures` + `Views`) et hors du dossier `components/bardage/hub/`. | `components/bardage/hub/BardageTempsHeuresVues.tsx` | 1 réf (`BardageHeuresModule.tsx`) |
| `components/RegisterSW.tsx` | Enregistre le Service Worker PWA (`/sw.js`). | Anglais + sigle opaque (`SW`). | `components/EnregistrementServiceWorker.tsx` | 1 réf (`app/layout.tsx`) |
| `components/catalogue/useScraping.ts` | Hook React de scraping tarifaire fournisseur. | Hook placé dans `components/catalogue/` au lieu de `hooks/`. | `hooks/useScrapingCatalogue.ts` | 4 réfs |
| `components/catalogue/mappers.ts` & `types.ts` & `ProductFormModal.tsx` | Formulaire unifié catalogue Bardage/Terrasse + mappers/types. | Tout en anglais (`ProductFormModal`, `mappers`) dans un module métier français. | `ProduitCatalogueModal.tsx`, `catalogueMappers.ts`, `catalogueTypes.ts` | ~5 réfs chacun |
| `components/AvancementFacadesWrapper.tsx` & `components/RapportClientWrapper.tsx` | ErrorBoundary React autour de `AvancementFacades` et `RapportClient`. | Suffixe technique `Wrapper` qui masque le vrai rôle (ErrorBoundary). | `AvancementFacadesSecurise.tsx` & `RapportClientSecurise.tsx` | 1 et 3 réfs |
| `components/Drawer.tsx` | Menu de navigation latéral mobile/tablette. | Nom générique anglais (`Drawer`) sans contexte métier. | `components/MenuNavigationMobile.tsx` | 15 réfs |
| `components/SearchNav.tsx` | Barre de recherche globale de navigation. | Anglais abrégé (`SearchNav`). | `components/BarreRechercheNavigation.tsx` | 7 réfs |
| `components/InactivityLogout.tsx` | Déconnexion automatique après inactivité. | Tout en anglais. | `components/DeconnexionInactivite.tsx` | ~2 réfs |
| `components/ZoneCard.tsx`, `components/PlanCalepinage.tsx`, `components/FicheDebitPDF.tsx`, `components/VisualiseurDebitPlaques.tsx` | Composants métier **Bardage/Calepinage** à la racine de `components/`. | Dispersés à la racine au lieu d'être regroupés dans `components/calepinage/` ou `components/bardage/`. | Déplacer vers `components/calepinage/` (ex. `CarteZoneBardage.tsx`) | 16 réfs pour `ZoneCard.tsx` |
| `components/ui/Surface.tsx` & `components/ui/FloatingActionButton.tsx` | Composants UI de base (carte sombre et bouton flottant). | Anglais dans un projet francophone. | `CarteSurface.tsx` & `BoutonActionFlottant.tsx` *(optionnel)* | ~10 réfs |

---

## 3. Dossier `app/`

| Chemin actuel | Rôle réel dans le code | Problème de nommage / structure | Nouveau nom proposé | Impact (réfs) |
| :--- | :--- | :--- | :--- | :--- |
| `app/(dashboard)/finance/components/UrsaafWidget.tsx` | Widget d'estimation des cotisations **URSSAF**. | **Faute d'orthographe** (`Ursaaf` au lieu de `Urssaf`). | `app/(dashboard)/finance/components/UrssafWidget.tsx` | 3 réfs |
| `app/api/deplacements/utils.ts` | Résolution tenant (`getEntrepriseCouranteId`), vérif chantier et lecture tarif déplacement. | Nom générique `utils.ts` dans un dossier de route API ; fait doublon avec `lib/tenant.ts` / `lib/deplacement/service.ts`. | Déplacer vers `lib/deplacement/tenantHelpers.ts` (ou fusionner dans `lib/deplacement/service.ts`) | 8 réfs |
| `app/api/chat-client-summary/route.ts` vs `app/api/espace-client/[code_acces]/chat-summary/route.ts` | Consolidation IA du chat client côté patron vs côté portail client. | Nommage anglais (`summary`) et 2 routes séparées à noms différents (`chat-client-summary` vs `chat-summary`). | `app/api/chat-client-resume/route.ts` *(ou conserver si endpoints déjà consommés côté client)* | 122 réfs texte/route |
| `app/api/espace-client/[code_acces]/_encre-signature.ts` & `_garde-signature.ts` | Validation PNG et garde de signature électronique. | Modules métier privés placés dans `app/api/` au lieu de `lib/signature/`. | `lib/signature/encreSignature.ts` & `lib/signature/gardeSignature.ts` | ~4 réfs |

---

## 4. Dossier `__tests__/`

| Chemin actuel | Rôle réel | Problème de nommage / structure | Nouveau nom proposé | Impact |
| :--- | :--- | :--- | :--- | :--- |
| `__tests__/metier/poseCompositeCalcul.test.ts` | Tests du moteur `poseCompositeCalcul.ts`. | Seul fichier en `camelCase` dans `__tests__/metier/` (tous les autres sont en `kebab-case`). | `__tests__/metier/pose-composite-calcul.test.ts` | 0 import |
| `__tests__/metiers/cloisonnement-chantiers.test.ts` vs `__tests__/metier/` | Tests de cloisonnement multi-métiers. | Dossier au pluriel (`metiers/`) à côté du dossier principal au singulier (`metier/`). | Déplacer dans `__tests__/metier/cloisonnement-chantiers.test.ts` | 0 import |
| `__tests__/securite/_fabrique-png.ts` & `_lecture-source.ts` | Helpers de test (PNG factice et lecture source). | Préfixe `_` dans un sous-dossier de tests. | `__tests__/helpers/fabrique-png.ts` & `lecture-source.ts` | ~4 réfs |

---

## 5. Synthèse des priorités recommandées

1. **Lot 1 (Zéro risque / Gains immédiats) :**
   * Supprimer `lib/meteoVigilance.ts` (re-export inutile de `vigilanceMeteoFrance.ts`).
   * Renommer `UrsaafWidget.tsx` → `UrssafWidget.tsx`.
   * Renommer `TempsHeuresViews.tsx` → `components/bardage/hub/BardageTempsHeuresVues.tsx`.
   * Uniformiser `__tests__/metier/poseCompositeCalcul.test.ts` et fusionner `__tests__/metiers/` dans `__tests__/metier/`.
2. **Lot 2 (Clarification métier `lib/` & `components/`) :**
   * `lib/documents.ts` → `lib/numerotationDocuments.ts`.
   * `app/api/deplacements/utils.ts` → `lib/deplacement/tenantHelpers.ts`.
   * `components/catalogue/useScraping.ts` → `hooks/useScrapingCatalogue.ts`.
   * `lib/iaDevisLegacy.ts` → `lib/iaDevisTexteRepli.ts`, `lib/otp.ts` → `lib/codeVerificationClient.ts`, `components/RegisterSW.tsx` → `components/EnregistrementServiceWorker.tsx`.
3. **Lot 3 (Regroupement architectural, plus large) :**
   * Rapatrier `lib/poseCalcul.ts` et `lib/poseCompositeCalcul.ts` dans `lib/bardage/`, et uniformiser `kebab-case`/`camelCase` sur `lib/metre*`.

# Audit Technique Complet — Dépôt `bna-dashboard` (23 octobre 2026)

> **Mode d’exécution** : Audit réalisé en lecture seule et vérifications locales non destructives (`git`, `tsc`, `eslint`, analyse statique du code et des migrations). Format 100 % vertical sans tableau pour lecture sur mobile Termux.

---

## 1. Verdict Global : la vérité technique sans filtre

**Le projet n’est PAS dans un état catastrophique sur le plan de l’ingénierie logicielle, mais il est dans un état d’entre-deux opérationnel dangereux qui interdirait une mise en production immédiate sans assainissement.**

Voici la réalité exacte :
- **Ce qui est sain (le cœur du code)** :
  - Compilation TypeScript stricte (`tsc --noEmit`) : **0 erreur** sur l’ensemble du dépôt (fichiers modifiés et non suivis inclus).
  - Linter ESLint (`eslint app components lib types`) : **0 erreur, 0 warning** sur tout le code applicatif (**0 erreur, 27 warnings** dans `__tests__/`).
  - Les moteurs métier purs (Bardage DTU 41.2, Terrasse bois DTU 51.4, Terrasse composite, Retenue de garantie loi 71-584, Devis/Marge, Suivi terrain, Registre multi-métier) sont écrits proprement, bien typés, sans dépendance cachée.
  - L’architecture multi-tenant (`resoudreTenant()` + RLS Supabase + RPC `SECURITY DEFINER`) a été déployée sur la quasi-totalité des routes API (45 routes sur 47 passent par `resoudreTenant()`).
- **Ce qui est dangereux aujourd’hui (les 4 vrais problèmes immédiats)** :
  1. **Un arbre Git en « chantier ouvert »** : `agent-workflow` a **31 commits d’avance** sur `main` (dont des correctifs de sécurité absents de `main`), et contient en plus **39 éléments locaux non commités** (24 fichiers modifiés + 15 fichiers non suivis) qui mélangent **3 sujets différents** (Météo/Intempéries, Suivi Terrain/Ossature, et Sélection Catalogue Terrasse + Migration SQL `20261022`).
  2. **Une désynchronisation bloquante Code <-> Base Supabase sur le module Terrasse** : le code local de `app/api/chantiers/[id]/terrasse/route.ts` (ligne 316) exige 5 nouvelles colonnes (`lame_id`, `clip_id`, `lambourde_id`, `plot_id`, `quantite_accessoires`) dont la migration (`supabase/migrations/20261022_add_catalogue_selections_chantier_terrasses.sql`) est encore non suivie (`??`) et non appliquée. Tant qu’elle n’est pas passée, l’API Terrasse plante en HTTP 500.
  3. **Des failles et bugs réels dans le code** : une faille **SSRF critique** dans `/api/scrape`, une **Server Action de pointage cassée en base** (`entreprise_id` manquant sur `pointages_globaux`), une **absence de vérification d’appartenance du `client_id` au tenant** lors de la création d’un devis via `supabaseAdmin`, et un **test de garde-fou CI en échec garanti** (`audit-snapshot-routes.test.ts` bloqué à 46 routes au lieu de 47).
  4. **L’outil de test Vitest est en panne sur cet appareil Termux ARM64** : il manque le binaire natif `@rollup/rollup-android-arm64`, ce qui empêche de lancer `npm test` localement sur le téléphone et explique pourquoi des tests cassés ont pu passer inaperçus.

---

## 2. État exact de Git : `main`, `agent-workflow` et `git status`

### 2.1. Topologie des branches
- **Branche active de travail** : `agent-workflow` (HEAD sur `d02e3e5`, synchronisée avec `origin/agent-workflow`).
- **Branche `main`** : sur le commit `1dcada8` (31 commits derrière `agent-workflow`).
- **Écart `main` <-> `agent-workflow`** :
  - `0` commit sur `main` absent de `agent-workflow` avant l’ajout de ce rapport.
  - **`31` commits sur `agent-workflow` absents de `main`**.
- **Conséquence critique pour `main`** :
  - La branche `main` **ne contient pas** les correctifs de sécurité multi-tenant (`fb38b61` et `be4033d` : durcissement de `/api/ia-ocr-ticket`, `/api/analyse-plan`, `/api/extraction-plan`, `/api/devis/[id]`), ni les timeouts réseau (`71d2f88`), ni le catalogue Terrasse (`a000e6b`, `be10ab9`), ni les améliorations Météo. Si Vercel déploie `main`, la production tourne sur une version ancienne et plus vulnérable.

### 2.2. État du Working Tree (`git status` sur `agent-workflow`)
Le working tree local de `agent-workflow` contient **39 entrées non commitées** (`1 926 lignes ajoutées, 274 lignes supprimées` rien que sur les fichiers suivis), réparties en **3 chantiers mélangés** :

- **Lot 1 — Météo, Intempéries & Horaires Paris (17 fichiers modifiés + 6 fichiers non suivis)** :
  - Modifiés :
    - `app/api/meteo/route.ts`
    - `app/api/meteo/intemperies/route.ts`
    - `app/api/rapports-intemperies/generer/route.ts`
    - `app/bureau/meteo/page.tsx`
    - `app/terrain/meteo/page.tsx`
    - `app/terrain/chantier/[id]/page.tsx`
    - `components/ChantiersMeteoCards.tsx`
    - `components/MeteoGeneraleAccueil.tsx`
    - `lib/dateParis.ts`
    - `lib/meteo.ts`
    - `lib/meteoAlerte.ts`
    - `lib/meteoOpenMeteo.ts`
    - `__tests__/audit/regressions-p2.test.ts`
    - `__tests__/metre/date-paris-alertes.test.ts`
    - `__tests__/metre/meteo-open-meteo.test.ts`
    - `__tests__/ui/terrain-meteo-alertes.test.tsx`
  - Non suivis (`??`) :
    - `components/TableauPrecipitations.tsx`
    - `lib/intemperiesSeuils.ts`
    - `lib/meteoHoraire.ts`
    - `__tests__/metre/meteo-horaire-seuils.test.ts`
    - `__tests__/ui/bureau-meteo-veille.test.tsx`
    - `__tests__/ui/tableau-precipitations.test.tsx`

- **Lot 2 — Parcours « Ossature posée » & Registre Multi-Métier (6 fichiers non suivis)** :
  - `components/OssaturePosee.tsx`
  - `lib/suiviTerrain.ts`
  - `lib/metiers/registry.ts`
  - `__tests__/metier/registry.test.ts`
  - `__tests__/metre/suivi-terrain-ossature.test.ts`
  - `__tests__/ui/ossature-posee.test.tsx`

- **Lot 3 — Sélection Catalogue Terrasse & Chiffrage HT (7 fichiers modifiés + 3 fichiers non suivis)** :
  - Modifiés :
    - `app/api/chantiers/[id]/terrasse/route.ts`
    - `components/terrasse/TerrasseConfigForm.tsx`
    - `components/terrasse/TerrasseQuantitatifTable.tsx`
    - `lib/terrasse/calculs.ts`
    - `lib/terrasse/composite/calculs.ts`
    - `lib/terrasse/types.ts`
    - `types/supabase.ts`
  - Non suivis (`??`) :
    - `supabase/migrations/20261022_add_catalogue_selections_chantier_terrasses.sql`
    - `__tests__/terrasse/chantier-terrasse-route.test.ts`
    - `__tests__/terrasse/terrasse-config-selection-prix.test.tsx`

---

## 3. État exact de Supabase (Migrations, Schéma, RLS, Types)

- **Volume** : 48 fichiers SQL dans `supabase/migrations/` (47 suivis par Git + 1 non suivi `20261022`), et 36 tables typées dans `types/supabase.ts`.
- **Point fort — Isolation Multi-Entreprise (RLS)** :
  - La série de migrations `20260922` à `20261009` + `20261021` a mis en place une isolation RLS sérieuse via `public.entreprise_courante()` (qui lit `entreprise_membres` avec repli sur `profiles.entreprise_id`) et des politiques `SELECT / INSERT / UPDATE / DELETE` sur les tables métiers.
  - Les opérations transactionnelles sensibles (réception de commande, sortie de stock vers chantier, validation de pointage, synchronisation des achats) passent par des fonctions RPC PostgreSQL (`valider_reception_commande`, `sortir_stock_vers_chantier`, `valider_pointage_atomique`, `synchroniser_cout_achats_chantier`) qui verrouillent les lignes (`FOR UPDATE`) et vérifient le tenant.
- **Point faible majeur — Schéma initial non versionné (« Split-Brain »)** :
  - Les tables fondatrices du projet (`chantiers`, `clients`, `devis`, `factures`, `profiles`, `situations`, `rapports_intemperies`, `vigilance_captures`, `fournisseurs`, `pointages_heures`, `pointages_globaux`, `commandes_fournisseurs`, `catalogue_ouvrages`) ont été créées dans le Dashboard Supabase **avant** la première migration SQL (`20260322`).
  - **Conséquence** : Il est **impossible** de reconstruire une base Supabase vierge ou de lancer `supabase start` en local uniquement à partir du dossier `supabase/migrations/` (les migrations `ALTER TABLE public.chantiers ...` échoueront car `CREATE TABLE public.chantiers` n’existe dans aucun fichier).

---

## 4. Liste exhaustive des problèmes classés par gravité

### 🔴 GRAVITÉ CRITIQUE (Sécurité, Pannes garanties, Intégrité multi-tenant)

#### C1. Faille SSRF (Server-Side Request Forgery) totale dans `/api/scrape`
- **Fichier** : `app/api/scrape/route.ts` (lignes 5 à 25)
- **Preuve** :
  - Ligne 9 : `const urlToScrape = searchParams.get('url');`
  - Ligne 16 : `const res = await fetch(urlToScrape, { headers: ... })`
  - Ligne 36 : renvoie le corps HTML brut de la cible (`data: html`).
- **Problème** : Contrairement à `app/api/ia-ocr-ticket/route.ts` (ligne 28) qui utilise `estUrlStockageSupabaseAutorisee` (`lib/urlStockageAutorisee.ts`), la route `/api/scrape` n’effectue **aucun filtrage d’URL** et n’a **aucun timeout**.
- **Conséquences possibles** : Tout utilisateur connecté peut forcer le serveur Next.js/Vercel à interroger des adresses internes (`http://127.0.0.1`, `http://169.254.169.254/latest/meta-data/` sur AWS/Cloud, intranet) et lire la réponse complète, ou bloquer un worker serveur indéfiniment via une cible lente.

#### C2. Crash SQL garanti et défaut d’isolation dans la Server Action `pointage.ts`
- **Fichier** : `app/actions/pointage.ts` (lignes 24 à 118)
- **Preuve** :
  - Lignes 72 à 79 : `validerPointageAvecMeteo` insère dans `pointages_globaux` un objet contenant `chantier_id`, `volume_heures_declare`, `date_saisie`, `meteo_relevee`, `coef_meteo`, `commentaire`, `user_id` — **sans renseigner `entreprise_id`**.
  - Or la migration `20260922_isolation_multi_entreprise_phase1_part1.sql` (lignes 194–202) a posé `ALTER TABLE public.pointages_globaux ALTER COLUMN entreprise_id SET NOT NULL;` et aucune migration n’a créé de trigger `BEFORE INSERT` d’auto-affectation d’`entreprise_id` sur `pointages_globaux` (contrairement à `journal_chantier` ou `stock_mouvements`).
  - Lignes 99 à 118 : `supprimerPointageGlob(id)` et `reinitialiserPointagesChantier(chantierId)` exécutent `.delete()` sans appeler `resoudreTenant()` ni filtrer par `.eq('entreprise_id', ...)`.
- **Conséquences possibles** : Tout appel à `validerPointageAvecMeteo` échoue en base avec une violation `NOT NULL` (`23502`) ou un rejet RLS (`42501`).

#### C3. Absence de vérification multi-tenant sur `client_id` lors de la création de devis et factures
- **Fichiers** :
  - `app/api/devis/route.ts` (lignes 148 à 248)
  - `app/api/factures/route.ts` (lignes 89 à 228)
- **Preuve** :
  - Dans `POST /api/devis` (lignes 174–191), le serveur vérifie bien que `chantier_id` appartient à `tenant.entrepriseId`, mais **ne vérifie jamais que `client_id` appartient à `tenant.entrepriseId`**. Pire : l’insertion ligne 244 est faite avec **`supabaseAdmin.from("devis").insert(insertDevis)`** (rôle `service_role` qui contourne RLS).
  - Dans `POST /api/factures` (lignes 134–169), `chantier_id` et `devis_id` sont vérifiés contre `tenant.entrepriseId`, mais **`client_id` ne l’est pas**.
- **Conséquences possibles** : Un utilisateur authentifié de l’entreprise A connaissant l’UUID d’un client de l’entreprise B peut créer un devis ou une facture dans l’entreprise A rattaché(e) par clé étrangère au client de l’entreprise B.

#### C4. Désynchronisation Code <-> Base Supabase sur `chantier_terrasses`
- **Fichiers** :
  - `app/api/chantiers/[id]/terrasse/route.ts` (ligne 316)
  - `supabase/migrations/20261022_add_catalogue_selections_chantier_terrasses.sql` (lignes 1 à 162)
- **Preuve** : La route sélectionne explicitement `lame_id, clip_id, lambourde_id, plot_id, quantite_accessoires` (ligne 316) et les écrit (lignes 505–509), alors que la migration `20261022` est non suivie (`??`) et non appliquée.
- **Conséquences possibles** : Erreur **HTTP 500** systématique sur l’onglet Terrasse d’un chantier tant que la migration `20261022` n’est pas appliquée sur la base cible.

---

### 🟠 GRAVITÉ ÉLEVÉE (Tests CI cassés, Environnement bloqué, Risques de concurrence)

#### E1. Test de garde-fou d’architecture en échec garanti (`46` routes attendues vs `47` réelles)
- **Fichiers** :
  - `__tests__/system/audit-snapshot-routes.test.ts` (lignes 300 à 329)
  - `audit_bna_dashboard.md` (ligne 20)
- **Preuve** :
  - Le commit `a000e6b` a ajouté la 47e route API : `app/api/catalogue-terrasse/route.ts`.
  - Or `audit_bna_dashboard.md` (ligne 20) indique toujours `**46** routes API` et ne mentionne pas `catalogue-terrasse/route.ts` dans son arbre (lignes 22–70).
  - Le test `S3` de `audit-snapshot-routes.test.ts` (ligne 327) contient en dur `expect(ARBRE.length).toBe(46)`.
- **Conséquences possibles** : La suite de tests échoue immédiatement en CI sur les tests `S1`, `S2` et `S3` de `audit-snapshot-routes.test.ts`.

#### E2. Exécution locale de Vitest impossible sur Termux Android ARM64
- **Preuve** : L’exécution de `vitest run` échoue au chargement avec :
  `Error: Cannot find module @rollup/rollup-android-arm64` (requis par `node_modules/rollup/dist/native.js:59`).
- **Conséquences possibles** : Aucun test unitaire ou d’intégration (sur les 83 fichiers de test du dépôt) ne peut être exécuté depuis Termux tant que le binaire ARM64 ou l’alternative `@rollup/wasm-node` n’est pas installée. Cela fait travailler à l’aveugle sur mobile.

#### E3. Absence de contrainte `UNIQUE(chantier_id)` sur `public.chantier_terrasses`
- **Fichiers** :
  - `supabase/migrations/20261010_chantier_terrasse.sql` (lignes 14 à 53)
  - `app/api/chantiers/[id]/terrasse/route.ts` (lignes 314 à 326)
- **Preuve** : `20261010_chantier_terrasse.sql` crée un simple index non-unique `idx_chantier_terrasses_chantier_id`. Pourtant, la route API fait `.eq("chantier_id", chantierId).maybeSingle()` : en cas de double clic ou de deux requêtes concurrentes `POST`, deux lignes sont insérées pour le même chantier ; ensuite, `.maybeSingle()` renvoie une erreur PostgREST (`PGRST116: multiple rows returned`) et bloque définitivement la lecture (`GET` renvoie 500) et la sauvegarde (`POST` tente un nouvel `INSERT` en boucle).

#### E4. Schéma de base non reconstructible et seed `20261012` cassé
- **Fichier** : `supabase/migrations/20261012_bna_golden_seed.sql` (ligne 112)
- **Preuve** : Le script insère dans `public.chantiers (..., nom_chantier, ...)` alors que la colonne réelle dans `types/supabase.ts` et dans toutes les routes API est `nom`. De plus, l’absence des `CREATE TABLE` initiaux empêche toute création d’environnement de test automatisé depuis zéro.

---

### 🟡 GRAVITÉ MOYENNE (Fiabilité réseau, Sémantique HTTP, Fuites d’erreurs)

#### M1. Appels `fetch` externes sans timeout (`AbortController`) malgré l’audit C5 marqué « RÉSOLU »
- **Preuve** : Bien que `audit_bna_dashboard.md` (ligne 797) indique `C5 [RÉSOLU]`, 9 appels `fetch` externes n’utilisent toujours **pas** `fetchWithTimeout` (`lib/fetchWithTimeout.ts`) :
  - `app/api/ia-avancement/route.ts` (ligne 22 — Groq API)
  - `app/api/ia-securite/route.ts` (ligne 17 — Groq API)
  - `app/api/reformuler-note/route.ts` (ligne 64 — Groq API)
  - `app/api/transcrire-note/route.ts` (ligne 28 — Groq Whisper API)
  - `app/api/scrape/route.ts` (ligne 16 — URL externe)
  - `app/api/meteo/route.ts` (ligne 161 — VisualCrossing fallback)
  - `app/api/meteo/intemperies/route.ts` (lignes 225 et 330 — VisualCrossing)
  - `app/api/rapports-intemperies/generer/route.ts` (ligne 273 — VisualCrossing)
- **Conséquences possibles** : Si Groq ou VisualCrossing pend sans répondre, la requête Next.js reste bloquée jusqu’au timeout global de la plateforme.

#### M2. Écriture en base déclenchée par une requête HTTP `GET` sur `/api/rapports-intemperies/generer`
- **Fichier** : `app/api/rapports-intemperies/generer/route.ts` (lignes 778 à 797)
- **Preuve** : La fonction `export async function GET(req: NextRequest)` construit une requête `POST` synthétique et appelle `return POST(postReq)`, ce qui interroge VisualCrossing et **insère des lignes dans `rapports_intemperies`**.
- **Conséquences possibles** : Un simple préchargement de lien par le navigateur ou un rafraîchissement d’onglet déclenche des écritures en base et consomme du quota API météo. En outre, cette route renvoie HTTP 500 si `VISUALCROSSING_API_KEY` est absente (ligne 477), sans repli sur Open-Meteo.

#### M3. Exposition de messages d’exception bruts (`debug: message`) dans 3 routes IA
- **Fichiers** :
  - `app/api/ia-avancement/route.ts` (ligne 59)
  - `app/api/reformuler-note/route.ts` (ligne 98)
  - `app/api/transcrire-note/route.ts` (ligne 60)
- **Preuve** : Ces routes retournent `{ error: 'Erreur serveur', debug: message }` avec un statut 500 au navigateur.

#### M4. `catalogue_ouvrages` partagé sans filtre `entreprise_id` dans `POST /api/devis`
- **Fichier** : `app/api/devis/route.ts` (lignes 159 à 161)
- **Preuve** : `await supabaseAdmin.from("catalogue_ouvrages").select(...)` charge tous les ouvrages de la table via `supabaseAdmin` sans filtrer par tenant (la table historique `catalogue_ouvrages` étant globale, contrairement à `catalogue_ouvrages_prix` qui est par entreprise).

---

### 🟢 GRAVITÉ FAIBLE (Dette technique, Nettoyage, Warnings de tests)

#### F1. Dualité `proxy.ts` vs `middleware.ts` à surveiller selon la version exacte de Next.js 16
- **Fichiers** : `proxy.ts` (lignes 1 à 19) et `lib/supabase/middleware.ts` (lignes 1 à 78)
- **Constat** : Le projet utilise la convention Next.js 16 `proxy.ts` (qui exporte `proxy()` appelant `updateSession`). De plus, toutes les routes API privées appellent elles-mêmes `resoudreTenant()`, ce qui garantit une double barrière (défense en profondeur) même si une route n’était pas interceptée en amont.

#### F2. 27 warnings ESLint dans le dossier `__tests__/`
- **Constat** : Le code source applicatif (`app/`, `components/`, `lib/`, `types/`) a **0 warning**, mais `__tests__/` compte 27 warnings (variables ou imports inutilisés dans des mocks de tests).

---

## 5. Ce qui est solide et réussi dans le dépôt (les vrais acquis)

- **Architecture Multi-Tenant (`lib/tenant.ts`) rigoureuse** :
  - `resoudreTenant()` résout proprement l’utilisateur, vérifie son appartenance active dans `entreprise_membres`, gère le repli contrôlé sur `profiles.entreprise_id`, et protège 45 routes API sur 47.
- **Calculs financiers et normatifs côté serveur (le navigateur ne décide jamais des prix)** :
  - `lib/retenueCalculs.ts` : respect strict du plafond légal de 5 % (loi n° 71-584), ventilation multi-TVA au centime près.
  - `lib/devisCalcul.ts` et `app/api/devis/route.ts` : écrasement des prix soumis par ceux du catalogue officiel et marquage explicite `À CHIFFRER` en cas de donnée incomplète (zéro invention de prix).
  - `lib/terrasse/calculs.ts` (DTU 51.4 bois) et `lib/terrasse/composite/calculs.ts` (composite par clips) : moteurs purs, déterministes, et le nouveau chiffrage HT dans `app/api/chantiers/[id]/terrasse/route.ts` (lignes 166–295) recalcule tous les montants côté serveur à partir des lignes actives du catalogue du tenant.
- **Nouveaux modules purs en cours (`lib/metiers/registry.ts`, `lib/suiviTerrain.ts`, `lib/meteoHoraire.ts`, `lib/intemperiesSeuils.ts`)** :
  - Ces 4 nouveaux modules non suivis sont propres, sans dette technique, 100 % typés (`0` erreur `tsc`, `0` warning `eslint`) et accompagnés de leurs tests unitaires.
- **Migration SQL `20261022` (Sélection Catalogue Terrasse)** :
  - Le fichier `20261022_add_catalogue_selections_chantier_terrasses.sql` est très bien écrit : gardes préalables, validation JSONB stricte, et clés étrangères composites `(lame_id, entreprise_id)` qui rendent physiquement impossible dans PostgreSQL le rattachement d’un article de catalogue appartenant à une autre entreprise.

---

## 6. Ordre de bataille recommandé pour la remise au propre

1. **Étape 1 — Réparer Vitest sur Termux ARM64** : installer le support Rollup compatible Android ARM64 (`@rollup/wasm-node` ou binaire natif) pour retrouver l’exécution locale des 83 fichiers de test.
2. **Étape 2 — Séparer et commiter proprement les 3 lots du working tree sur `agent-workflow`** :
   - Commit A : Socle Registre Multi-Métier (`lib/metiers/registry.ts` + test).
   - Commit B : Suivi Terrain « Ossature posée » + Météo/Intempéries (`lib/suiviTerrain.ts`, `lib/meteoHoraire.ts`, `lib/intemperiesSeuils.ts`, composants et routes météo + tests).
   - Commit C : Sélection Catalogue Terrasse + migration `20261022` (après exécution du protocole de validation 2I/2K sur la base isolée).
3. **Étape 3 — Corriger les 4 bugs critiques et le test CI cassé** :
   - Fermer la faille SSRF de `/api/scrape` (ou supprimer la route si elle n’est plus utilisée).
   - Corriger `app/actions/pointage.ts` (`resoudreTenant()` + `entreprise_id`).
   - Vérifier l’appartenance de `client_id` à `tenant.entrepriseId` dans `POST /api/devis` et `POST /api/factures`.
   - Mettre à jour `audit_bna_dashboard.md` et `__tests__/system/audit-snapshot-routes.test.ts` (47 routes API).
4. **Étape 4 — Aligner `main` avec `agent-workflow`** une fois tous les tests au vert.

# 📋 Audit — BNA Dashboard

> Fichier de référence unique pour reprendre le projet. Il décrit **l'état réel
> du dépôt**, vérifié à `ad6404a`. Toute affirmation y est soit vérifiable dans
> le code, soit explicitement marquée « non vérifié ».
>
> Convention : les chemins sont relatifs à la racine du dépôt.

---

## 📸 Snapshot

| | |
|---|---|
| Branche | `agent-workflow` |
| `HEAD` | `71d2f88` — (Post-correction sécurité RLS + Robustesse) |
| `origin/main` | `ad6404a` (aligné, 0 commit d'écart) |
| Arbre de travail | propre |
| Stack | Next.js `16.3` (App Router) · React `19.2.8` · TypeScript `5.9.3` · Tailwind CSS `4` · Supabase `2.112.4` + `@supabase/ssr` `0.12.5` · Vitest `4` |
| Routes | **38** pages (`app/**/page.tsx`) · **47** routes API (`app/api/**/route.ts`) |
| Base | **41** migrations SQL · `types/supabase.ts` (3003 l.) déclare 58 entrées : 44 tables, 1 vue, 13 fonctions |

### Portes de qualité (mesurées à `ad6404a`)

| Porte | Résultat |
|---|---|
| `npx tsc --noEmit` | **0 erreur** |
| `npx eslint app components hooks lib types` | **0 erreur, 0 warning** |
| `npx eslint .` (dépôt entier) | 0 erreur, **26 warning** (tests) |
| `npx vitest run` | **1121 / 1121** verts, 66 fichiers |
| `npm run build` | ✓ 51 / 51 pages |
| `git diff --check` | vide |

Les 26 warnings du dépôt entier sont des avertissements de tests, aucun en
production. Le compte `any` d'ESLint en production est **0**.

---

## 🏗️ Architecture

### Empilement

- **UI** : Tailwind CSS 4, tokens centralisés dans le bloc `@theme` de
  `app/globals.css`. Aucun littéral de fond dans les composants : ils passent
  par `Surface` (`components/ui/Surface.tsx`) ou par les tokens.
- **Base** : Supabase PostgreSQL + Storage. Accès navigateur via
  `lib/supabase.ts` (singleton `createBrowserClient` de `@supabase/ssr`, porte la
  session), serveur via `lib/supabase/server.ts`, et `lib/supabaseAdmin.ts` (clé
  `service_role` — **contourne le RLS**, cf. Sécurité).
- **PDF** : `window.print()` avec composants React masqués (`hidden print:block`).
  Vues d'impression : `BilanChantierPDF`, `RapportMensuelPDF`, `RapportClientPrint`.
- **IA** :
  - `openai/gpt-oss-20b` (Groq) — chat client, résumé de conversation, consignes
    PPSPS, reformulation.
  - `whisper-large-v3` (Groq) — transcription audio (notes vocales, dictée).
  - `gemini-3.5-flash-lite` (`@ai-sdk/google`, Vercel AI SDK) — génération de
    devis **et** OCR vision de tickets/BL.
  - Stack **unifiée sur un seul modèle LLM** depuis le 10/09 : les fournisseurs
    précédents (Anthropic, `groq/compound-mini`) ont été abandonnés pour instabilité (TPM,
    décommissionnement) au profit du SDK Vercel.
- **Météo** : Météo-France DPVigilance (alertes) · Visual Crossing (détail, clé
  payante en production) · **Open-Meteo** (repli automatique, sans clé). Veille
  intempéries : seuils pluie > 10 mm, vent > 50 km/h, gel < 0 °C.
- **Crons Vercel** (`vercel.json`) : `/api/rapports-client/auto` (`0 6 * * 1`) et
  `/api/cron/meteo` (`0 6 * * *`).

### Multi-tenant

L'isolation par entreprise est la **fondation** du modèle de sécurité, pas une
surcouche tardive. Elle repose sur :

- la table `entreprises` et la table de rattachement `entreprise_membres` ;
- la fonction `entreprise_courante()`, qui résout le tenant depuis la GUC
  `app.entreprise_id`, à défaut du claim JWT `app_metadata.entreprise_id` ;
- le résolveur applicatif `resoudreContexteEntreprise()` côté navigateur, même
  source de vérité ;
- des migrations en 5 parties + 2 phases (`20260922`, `20260925`).

Toute requête écrite en `supabaseAdmin` **doit** donc porter son filtre tenant
explicitement : ce client contourne le RLS. Voir « Points de vigilance » pour
les 3 routes qui ne le font pas encore.

### Navigation effective

| Route | Rôle |
|---|---|
| `/` | Cockpit — rend `components/DashboardAccueil.tsx` (accueil mobile/desktop) |
| `/terrain/chantier` | Destination de `/terrain` |
| `/terrain/chantier/[id]` | Fiche chantier, 10 onglets |
| `/bureau/meteo` | Destination de `/terrain/meteo` |
| `/chantiers` → `/terrain/chantier` | Redirection legacy |
| `/boite-a-outils` → `/terrain/outils` | Redirection legacy |
| `/bureau-etudes` → `/bureau/clients` | Redirection legacy |

Le menu hamburger est un `Drawer` unique (`components/Drawer.tsx`). Ses groupes
sont un **accordéon** : un groupe se déplie sur place, ce qui évite d'ajouter une
route par section. L'état d'ouverture distingue trois origines — « ouvert parce
que l'utilisateur a cliqué », « ouvert parce que c'est la catégorie courante »,
« mémorisé » — ce qu'un simple `Set<string>` ne pouvait pas représenter.

---

## 🎨 Charte graphique

Palette centralisée dans le bloc `@theme` de `app/globals.css`. C'est la **source
unique** : les composants consomment les tokens, pas des littéraux.

| Token | Valeur | Rôle |
|---|---|---|
| `--color-surface-page` | `#121212` | fond d'application (`<body>`) |
| `--color-surface` | `#1E1E1E` | cartes, modales, zones vides |
| `--color-surface-raised` | `#252525` | champs de saisie, en-têtes de tableau |
| `--color-surface-drawer` | `#1A1A1A` | fond du menu hamburger |
| `--color-surface-mobile` | `#232323` | carte sur petit écran |
| `--color-border` / `--color-divider` | `#2E2E2E` / `#3A3A3A` | bordures |
| `--color-brand` | `#E53935` | action principale, rouge BNA |
| `--color-brand-dark` / `--color-brand-light` | `#C62828` / `#FF6F60` | survol, variantes |
| `--color-ink-title` / `--color-ink` | `#F5F5F5` / `#E0E0E0` | titres, texte |
| `--color-ink-muted` / `--color-ink-disabled` | `#BDBDBD` / `#757575` | texte secondaire |
| `--foreground` | `#E0E0E0` | couleur de texte globale |

Les échelles `red-*` et `gray-*` sont **redéfinies** dans le même bloc pour
s'aligner sur ces tokens.

### Le reflet rouge

Le halo rouge du haut de page est porté par le `background-image` du
`<main id="main-content-wrapper">` de `app/layout.tsx`, avec `bg-top`,
`bg-no-repeat` et `bg-size-[100%_380px]`. Il est ainsi défini **une seule fois**
pour toutes les pages. Il ne doit pas être redéfini localement : c'est exactement
ce qui avait produit deux copies divergentes dans `app/page.tsx`.

> Note Tailwind : le moteur minifie `ellipse at top` en `at top` et
> `rgba(229,57,53,0.15)` en `#e5393526`. C'est normal, pas une régression.

### Standard des modales

Overlay `fixed inset-0 z-[210] pt-48`, conteneur `w-full max-w-2xl
max-h-[80vh] flex flex-col rounded-xl`, en-tête et pied statiques, corps
`overflow-y-auto flex-1`. Le `pt-48` et le `z-[210]` servent à passer au-dessus de
l'en-tête global.

> **Écart constaté** : 8 fichiers en `pt-48`, 2 en `pt-44`, 11 en `z-[210]`. Le
> standard n'est pas appliqué uniformément — voir « Points de vigilance ».

### Composant `Surface`

`HABILLAGE = 'border border-white/10 bg-surface'` + `rounded-xl`.

`Surface` ne définit **que l'habillage** : ni padding, ni couleur de texte, ni
largeur. C'est volontaire : chaque appelant qui a besoin d'un confort
interne le pose lui-même, et les tests le vérifient section par section
(voir « Tests de composition »).

---

## 🗺️ Modules

### Accueil (`/`, `components/DashboardAccueil.tsx`)

Cockpit en 5 blocs, dans cet ordre : **Assistant vocal → Chantiers à préparer →
Météo → Dernières Notes → Alertes**. Grilles : notes `grid-cols-1 md:grid-cols-3`,
chantiers `grid-cols-1 md:grid-cols-2 lg:grid-cols-3`, météo `grid gap-3
sm:grid-cols-2`.

Règles de composition verrouillées par les tests : conteneur borné et centré
(`max-w-7xl`), **aucune largeur propre sur une carte** (une carte prend la
largeur de sa colonne, rien d'autre) et **aucun centrage artificiel** des rangées
en `flex flex-wrap justify-center` — ce glissement « remplit » le vide mais sort
la carte de sa colonne.

**Confort des cartes Notes et Alertes.** Les deux sections alignent titre, texte
et date sur une carte, donc elles doivent partager le **même** padding. Le test
`accueil-responsive.test.ts` compare les deux listes de tokens de padding
(`toEqual`) au lieu d'écrire `p-4` en dur : l'exigence porte sur le confort
partagé, pas sur une valeur. **Ce couplage est délibéré** — le test doit échouer
si l'une des deux sections évolue sans l'autre, et il échoue en nommant laquelle.
Ne pas le découpler sans décision explicite.

La carte d'alerte ne doit ni redéfinir fond, bordure ni arrondi (ils appartiennent
à `HABILLAGE`), ni prendre de largeur propre.

### Terrain

| Route | Contenu |
|---|---|
| `/terrain/chantier` | Liste des chantiers |
| `/terrain/chantier/[id]` | Fiche, 10 onglets — voir ci-dessous |
| `/terrain/notes` | Notes chantier |
| `/terrain/outils` | Boîte à outils |
| `/terrain/fiche-technique` | Fiches DTU |
| `/terrain/metre-ia` | Métré IA (photogrammétrie mobile) |

Les 10 onglets de la fiche chantier : Général · Avancement · Rapport Client · Temps
Heures · Métrés & Technique · Terrasse · Météo & Intempéries · Photos & Notes · Documents ·
Déplacements.

L'avancement suit une logique **façades** : le pourcentage global est calculé à
la volée côté client à partir du JSON `details`, jamais recopié d'une colonne, ce
qui supprime les désynchronisations.

**Métré IA** (`/terrain/metre-ia`) : photogrammétrie sur canvas HTML5, trois modes
— `Étalonnage` (trait de référence + dimension réelle → ratio px/mètre),
`Façades` (polygones libres, surface par formule des cordons), `Vides`
(déduction fenêtres/portes). Surface nette calculée en temps réel pendant le
dessin.

**Import bookmarklet** : contournement client des protections Cloudflare /
Datadome des sites fournisseurs. Injecte `?importUrl=…&importTitle=…&
importPrice=…` dans `/bureau/catalogue`, où un `useEffect` parse le titre pour en
extraire les dimensions L × l × Ep (en mm) et pré-remplit le formulaire.

### Module Déplacements

Sept fichiers dans `lib/deplacement/` : `adresse.ts`, `calcul.ts`, `geocodage.ts`,
`itineraire.ts`, `service.ts`, `types.ts`, `validation.ts`.

- **Géocodage** : Nominatim (OpenStreetMap). `extraireCodePostal()` extrait le CP
  à 5 chiffres **depuis la chaîne d'adresse** pour piéger les communes
  homonymes — d'où l'inclusion du code postal dans l'adresse composée.
- **Itinéraire** : OSRM (`router.project-osrm.org`). Réserve connue : écart
  observé entre la distance OSRM et celle d'un affichage Google Maps.
- **Adresse de départ** : préremplie depuis `entreprise_settings` (la source
  unique, également écrite par `/parametres`), composée en
  `"12 rue X, 33000 Bordeaux"` via la fonction pure `composerAdresseDepart()`.
  Le champ **reste éditable** (trajet exceptionnel) ; sans adresse enregistrée il
  reste vide et conserve son placeholder. Une indication discrète
  « Adresse de départ récupérée depuis vos paramètres » s'affiche sous le champ,
  **uniquement tant que la valeur est celle qui a été chargée** : c'est une
  affirmation d'origine, la laisser visible sur une saisie manuelle serait faux.
- L'adresse d'arrivée est celle du chantier et n'est jamais modifiée. L'adresse
  de départ n'est **pas** dupliquée dans la base du chantier.
- La page hôte `app/terrain/chantier/[id]/page.tsx` est `"use client"` : elle lit
  `entreprise_settings` et transmet la valeur en prop. Lire dans
  `FraisDeplacementTab` aurait imposé de charger `@/lib/supabase` dans le
  composant, dont le singleton est construit au chargement du module — ce qui
  casse les tests existants qui comptent précisément les appels `fetch`.

### Bureau

| Route | Contenu |
|---|---|
| `/bureau` | Dashboard Bureau |
| `/bureau/dashboard-patron` | Vue patron (inclut un bloc « Alertes ») |
| `/bureau/clients` | Clients |
| `/bureau/devis-factures` | Devis + facturation automatique d'acompte à l'acceptation |
| `/bureau/factures` | Factures |
| `/bureau/fournisseurs` | Fournisseurs, commandes, **calepinage** et bon de commande quincaillerie |
| `/bureau/catalogue` | Catalogue + RAL + dimensions |
| `/bureau/sav` | SAV |
| `/bureau/fin-chantier` | PV de réception |
| `/bureau/rapports-intemperies` | Rapports d'intempéries |
| `/bureau/meteo` | Météo chantiers J → J+3, badges, vérification manuelle |
| `/bureau/documents-compta` | Scan BL/tickets, TVA en direct |
| `/bureau/photos-chantier` | Photos chantier |
| `/bureau/portails-clients` | Gestion des portails client |

**Notifications de retard fournisseur.** Le lien de la notification
« Livraison en retard » ouvre `/bureau/fournisseurs?retard=<id>` : la page
consomme le paramètre pour présélectionner la commande. Ce chemin est validé par
test.

**Deep-liens fournisseurs.** `/bureau/fournisseurs` accepte un paramètre d'onglet
(`fournisseurs`, `commandes`, `analyse`) en plus du paramètre de retard.

**Calepinage (DTU 41.2 / 45.4).** Calcul automatique des mètres linéaires de
chevrons (entraxe 60 cm max) et d'équerres (entraxe 1,20 m max) avec ancrages,
connecté au moteur IA. Un bouton du métré pré-remplit le bon de commande
quincaillerie via `calculerBesoinsBardage`, avec affectation dynamique des
fournisseurs et des prix.

**Planning Gantt** (`components/PlanningGantt.tsx`, `/terrain/chantier`) : vue
macro sur 6 mois, glisser-déposer tactile par Pointer Events pour décaler les
dates, indicateurs aujourd'hui / statuts, bordure rouge et icône d'alerte si
arrêt météo actif.

**Météo chantiers** (`/bureau/meteo`) : cartes par chantier actif sur J → J+3,
géocodage Nominatim avec repli France, badge rouge « Alerte intempéries
aujourd'hui » ou vert « Conditions OK », boutons manuels **« Vérifier
intempéries du jour »** (`POST /api/meteo/intemperies`) et **« Notifier
client »** (mailto). La veille déduplique par jour et trace `avancements_chantier`
sans modifier les cases, puis crée un justificatif `rapports_intemperies` visible
côté client.

**Docs Compta** (`/bureau/documents-compta`) : liste à plat, sans rattachement
à un chantier. Table `documents_compta` (RLS + GRANT `authenticated` /
`service_role`, même politique que le reste du dashboard). TVA calculée en direct
à la saisie. L'attribut `capture="environment"` a été **retiré** pour laisser le
sélecteur natif proposer appareil photo *et* galerie. Le clic sur une ligne
ouvre l'image ; le bouton de suppression utilise `stopPropagation()`.

### Finance (`/(dashboard)/finance/*`)

Écran verrouillé par PIN : tableau de bord (KPIs, rentabilité par chantier, CA,
TVA, trésorerie, URSSAF, rapport PDF mensuel, export CSV), saisie pointage, saisie
dépense, saisie frais d'interim, saisie feuille d'heures, historique (30 derniers
pointages et dépenses, suppressibles).

> **La saisie d'avancement n'existe plus** dans le module Finance : l'avancement
> est géré dans l'onglet « Avancement » de chaque chantier (logique façades).

### Espace client (`/espace-client/[code_acces]`)

Portail **public par conception** : le client n'a jamais de session, il
s'authentifie par son code d'accès. Le code est le seul secret ; le client voit
uniquement **son** chantier.

- **Carte d'avancement** : pourcentage issu de `avancements_chantier` (tri
  `created_at` DESC), barre animée, frise 3 étapes dynamique — `0–15 %`
  Préparation · `16–85 %` Préparation + Pose · `86–100 %` Préparation + Pose +
  Finitions. Badges par façade (Terminée / En cours / À commencer) selon le
  nombre de sous-tâches validées.
- **Date de fin estimée** : lue dans `chantiers.date_fin_estimee`, avec repli
  « Date à redéfinir » si absente ou dépassée, sinon `created_at + 2 mois`.
- **Rapports hebdomadaires** : uniquement ceux au statut `envoye` (double filtre
  côté API) — **le brouillon ne sort jamais**. Photo de couverture, delta
  d'avancement, aperçu imprimable.
- **Intempéries & justificatifs** : badges « Chantier à l'arrêt le … / Reprise
  prévue dès la fin des intempéries » ou « Intempérie signalée », n° de
  justificatif, motif — envoyables à l'assurance.
- **Mes Documents** : devis, factures, signature électronique.
- **Chatbot IA** flottant + résumé en arrière-plan, **prompt construit sur les
  données réelles** du chantier (avancement, cases sur 16, date de fin, devis,
  factures, arrêts intempéries des 14 derniers jours). Aucun scénario
  d'exemple n'est hardcodé. Règle explicite : ne jamais inventer un retard ou une
  livraison.
- Photos chantier, galerie bridée au chantier courant.

### Paramètres (`/parametres`)

Raison sociale, SIRET, coordonnées, IBAN/BIC, mentions légales, assurance
décennale, médiateur, seuil de CA, taux de cotisations, **upload du logo**
(bucket `photos`). Cette page est la **source unique** de l'adresse utilisée pour
le trajet (cf. Module Déplacements).

---

## 🔌 Routes API

| Route | Rôle |
|---|---|
| `/api/meteo` | Visual Crossing (fr) avec repli Open-Meteo |
| `/api/meteo/intemperies` | Veille auto (POST) et lecture des relevés (GET) |
| `/api/meteo-vigilance` | Alertes DPVigilance |
| `/api/cron/meteo` | Cron quotidien → relaance le POST intempéries |
| `/api/rapports-client/auto` | Cron hebdo (lundi 6h) : génère et marque `envoye` + `envoye_le` |
| `/api/rapports-client/generer` | Génération manuelle |
| `/api/rapports-intemperies/generer` | Génération de rapports d'intempéries |
| `/api/chat-client-summary` | Résumé de conversation + notification `client_alert` + note patron |
| `/api/espace-client/[code_acces]` | Données du portail client |
| `/api/espace-client/[code_acces]/chat` | Échange chatbot |
| `/api/espace-client/[code_acces]/chat-summary` | Résumé côté portail |
| `/api/espace-client/[code_acces]/send-otp` | OTP SMS du portail : clé **HMAC**, cooldown **persistant** (`devis_otp`) |
| `/api/espace-client/[code_acces]/verify-otp` | Consommation de l'OTP **+ preuve `devis_signatures`** en une seule RPC, contrôle d'encre serveur |
| ~~`/api/espace-client/[code_acces]/signer`~~ | **RETIRÉE** — signature sans OTP ni preuve |
| `/api/devis` | Liste / création de devis (**filtre tenant**) |
| `/api/devis/[id]/analyse` | Analyse IA d'un devis |
| ~~`/api/devis/[id]/send-otp`~~ | **RETIRÉE** — OTP en clair, téléphone fourni par le corps |
| ~~`/api/devis/[id]/verify-otp`~~ | **RETIRÉE** — anti-bruteforce en mémoire, aucune trace |
| `/api/deplacements` | Frais de déplacement |
| `/api/deplacements/[id]` | Mise à jour d'un frais (liste blanche) |
| `/api/deplacements/[id]/lier` | Rattachement à un devis via RPC |
| `/api/deplacements/evaluer` | Évaluation d'un trajet |
| `/api/transcrire-note` | Audio → texte (Groq Whisper) |
| `/api/reformuler-note` | Reformulation IA |
| `/api/ia-avancement` | Dictée vocale de l'avancement |
| `/api/ia-devis` | Génération de lignes de devis (Gemini) |
| `/api/ia-securite` | Consignes PPSPS |
| `/api/ia-ocr-ticket` | OCR vision de tickets/BL |
| `/api/documents-compta` | Scan BL/tickets (GET/POST/DELETE) |
| `/api/photos-chantier` | Upload / liste / suppression (bucket `chantiers-photos`) |
| `/api/chantiers/[id]/metre-complet` | Métré complet d'un chantier |
| `/api/chantiers/[id]/retenue-garantie` | Consultation de la retenue de garantie et des réserves (Loi n° 71-584) |
| `/api/chantiers/[id]/retenue-garantie/liberer` | Libération totale ou partielle de la retenue via RPC sécurisée |
| `/api/factures` | Liste et création sécurisée de factures (situations, acomptes, solde) |
| `/api/factures/[id]` | Détail, mise à jour et suppression d'une facture |
| `/api/factures/calculer` | Calcul financier d'une facture (lignes, TVA, acomptes déduits, retenue) |
| `/api/search` | Recherche globale |
| `/api/scrape` | Scraping produits fournisseurs (Cheerio) |
| `/api/finance-pin` | Vérification du PIN Finance |
| `/api/admin/rattacher-entreprise` | Rattachement d'un profil à une entreprise |
| `/api/dashboard-patron` | Données de la vue patron |
| `/api/chantiers-fournisseurs` | Données fournisseurs d'un chantier |
| `/api/calepinage/calculer` | Calcul complet du calepinage 2D/pro, perçages et persistance atomique |
| `/api/calepinage/export/excel` | Export Excel du bordereau de débit et de la liste des modules |
| `/api/calepinage/export/pdf` | Export PDF A4 avec plan vectoriel et schémas de perçage cotés |
| `/api/catalogue-terrasse` | Lecture du catalogue Terrasse (lames et accessoires compatibles par tenant) |
| `/api/chantiers/[id]/terrasse` | Configuration terrasse DTU 51.4 et persistance (GET/POST) |
| `/api/chantiers/[id]/terrasse/export/excel` | Export Excel du calepinage terrasse |
| `/api/chantiers/[id]/terrasse/export/pdf` | Export PDF de conformité terrasse DTU 51.4 |
| `/api/commandes/[id]/email` | Envoi officiel bon de commande PDF par email et historisation multi-tenant |

`/api/notifications` et `/api/chat-client` **n'existent plus** (voir
« Historique des décisions »).

Le tableau ci-dessus énumère les **47** routes actives. Les trois lignes barrées
(`~~…~~` + **RETIRÉE**) documentent des routes supprimées et ne comptent pas. Le
compteur de la ligne 20 et cette liste sont **vérifiés par
`__tests__/system/audit-snapshot-routes.test.ts`**, qui les compare à
l'arborescence réelle : toute divergence — route absente du document, route
documentée mais inexistante, compteur faux — fait échouer la suite.

---

## 🗄️ Base de données

### Tables

`types/supabase.ts` déclare 55 entrées : **42 tables**, 1 vue
(`rapports_intemperies_jours_arretes`) et 12 fonctions. Tables métier
principales :

`profiles` · `entreprises` · `entreprise_membres` · `entreprise_settings` ·
`chantiers` · `chantier_zones` · `clients` · `devis` · `lignes_commande` ·
`factures` · `commandes` · `fournisseurs` · `catalogue_ouvrages` ·
`catalogue_ouvrages_prix` · `catalogue_temps` · `frais_deplacement` ·
`frais_interim` · `avancements_chantier` · `pointages` · `pointages_globaux` ·
`depenses_chantier` · `tickets_sav` · `pv_receptions` · `situations` ·
`fiches_techniques` · `notes_patron` · `journal_chantier` · `photos` ·
`photos_chantier` · `documents_compta` · `rapports_client` ·
`rapports_intemperies` · `notifications` · `parametres_finance` · `parametres_entreprise` ·
`meteo_log` · `vigilance_captures` · `articles` · `devis_ia` ·
`devis_ia_historique` · `espace_client_conversations` · `entreprise_membres`.

> Deux noms ont changé par rapport aux anciens audits : `zones_chantier` →
> `chantier_zones`, `photos_notes_chantier` → `photos`. Le code n'utilise plus
> les anciens noms (0 occurrence).

### Migrations

**41 fichiers** dans `supabase/migrations/`, du `20260821` au `20261003`.
Séquencement notable : `20260922_isolation_multi_entreprise_phase1_part1..5`
(fondation du multi-tenant), `20260925_o3b6_isolation_espace_client_rpc`,
`20260926_o3b6_notifications_collectif`, `20260929_create_frais_deplacement`,
`20260930_c1_search_path_security_definer`, `20261001_generer_prochain_numero_devis_factures`.

> **Le dépôt seul ne permet pas de savoir ce qui est appliqué en production.**
> Il n'existe ni `SUPABASE_ACCESS_TOKEN`, ni `SUPABASE_DB_URL`, ni
> `supabase/config.toml`, ni journal d'application. Un fichier SQL présent ne
> prouve pas son exécution, et `types/supabase.ts` ne la prouve pas non plus :
> un type généré décrit une intention, pas un objet en base.
>
> L'état ci-dessous provient donc de **relevés effectués depuis le SQL Editor de
> Supabase**, en lecture seule. Ce que ces relevés établissent est l'**état
> observé** — présence des objets, `proconfig`, droits d'exécution. Ils ne
> constituent pas une preuve du journal d'exécution du fichier SQL : une base peut
> avoir atteint le même état par un autre chemin. C'est la limite de la méthode,
> et elle est assumée.

**Effet attendu confirmé en base — vérification SQL en lecture seule :**

- `20260910_parametres_entreprise.sql` — **effet attendu confirmé en base**.
  Relevé sur `information_schema.tables` : `public.parametres_entreprise` existe
  réellement. Ce qui est prouvé est la **présence de la structure attendue**, pas
  le journal d'exécution du fichier.
- `20260912_espace_client_conversations.sql` — **effet attendu confirmé en base**.
  Le fichier crée `public.espace_client_conversations`, ajoute la colonne
  `notes_patron.espace_client_id` et définit les RPC `espace_client_append` /
  `espace_client_consolider`. Ces trois objets ont été relevés en lecture
  seule.
- `20260924_C_o2_situations_numero.sql` — **effet attendu confirmé en base**.
  Relevé sur `pg_proc` : les **trois** signatures attendues sont présentes, chacune
  en `search_path = public` — `generer_prochain_numero_sit()`,
  `generer_prochain_numero_sit(uuid)` et
  `generer_prochain_numero_sit_ctx(uuid)`.

  Le fichier porte dans son contenu une mention de non-exécution : elle est
  **infirmée** pour la structure des fonctions, qui est bien en base. Seule la
  trace d'exécution du script reste inconnue.
- `20260926_o3b6_notifications_collectif.sql` — **effet attendu confirmé en
  base**. Commentaires `O3-B6/N1` présents en base sur la table et sur
  `destinataire_id` ; RLS actif ; le rôle `anon` sans JWT voit 0 des 3 lignes
  existantes.
- `20260929_harden_lier_deplacement_devis.sql` — **effet attendu confirmé en
  base**. Relevé sur `pg_proc`, trois points contrôlés :
  - `lier_deplacement_devis(p_deplacement_id uuid, p_devis_id uuid)` —
    `prosecdef = true`, `proconfig = {search_path=public}`,
    `anon_peut = false`, `auth_peut = true` ;
  - `lier_deplacement_devis_ctx(… 3 arguments)` — mêmes drapeaux, mais
    `anon_peut = false` **et** `auth_peut = false` : elle n'est pas atteignable
    depuis le navigateur ;
  - **aucune signature à 3 arguments** de `lier_deplacement_devis` : le `drop
    function` a bien eu lieu, la surface d'élévation est fermée.
- `20260930_c1_search_path_security_definer.sql` — **effet attendu confirmé en
  base**. Relevé sur `pg_proc` : plus aucune fonction `SECURITY DEFINER` du
  schéma `public` n'est dépourvue de `search_path = public`. Le lot est
  intégralement traité, sans reliquat.
- `20261001_generer_prochain_numero_devis_factures.sql` — **effet attendu
  confirmé en base**. Relevé sur `pg_proc` : les **six** fonctions attendues sont
  présentes, toutes en `prosecdef = true` et `proconfig = {search_path=public}`,
  en deux familles — `generer_prochain_numero_{dev,fac}` déclinée chacune en
  `_ctx(uuid)` (helper interne, tenant explicite), enveloppe sans argument, et
  enveloppe à `p_entreprise_id`.

  Le contrôle décisif porte sur les **droits d'exécution**, pas sur la seule
  présence :

  | Fonction | `anon` | `authenticated` | `service_role` |
  |---|---|---|---|
  | `generer_prochain_numero_dev()` | `false` | `true` | `true` |
  | `generer_prochain_numero_dev(uuid)` | `false` | `true` | `true` |
  | `generer_prochain_numero_dev_ctx(uuid)` | `false` | `false` | `false` |
  | `generer_prochain_numero_fac()` | `false` | `true` | `true` |
  | `generer_prochain_numero_fac(uuid)` | `false` | `true` | `true` |
  | `generer_prochain_numero_fac_ctx(uuid)` | `false` | `false` | `false` |

  Les deux `_ctx` sont injoignables par les trois rôles : aucun utilisateur
  authentifié ne peut numéroter pour une autre entreprise et déduire son volume
  d'émissions. C'est la propriété que la migration vise, et un simple constat
  de présence ne l'aurait pas révélée.
- `20261003_devis_signature_provenance.sql` — **effet attendu confirmé en base**,
  verdict **58/58** contrôles SQL en lecture seule, dont **30/30** sur le
  périmètre E (OTP/signature). Chiffres relevés : `devis_signatures` = **21
  colonnes**, `devis_otp` = **10 colonnes** ; FK au nommage `{table}_{colonne}_fkey`
  (ex. `devis_signatures_otp_id_fkey`, `ON DELETE RESTRICT`) ; RPC
  `signature_devis_valider_otp` `security definer`,
  `set search_path = public, extensions`, retour `jsonb`, **8 arguments** ;
  colonnes ajoutées présentes (`devis.signature_image`,
  `devis.telephone_source`, `devis.devis_empreinte_sha256`,
  `chantiers.code_acces_expires_at`, `chantiers.code_acces_utilise_at`,
  `clients.tel_normalise`, `clients.tel_verifie`, toutes nullables).

  `types/supabase.ts` a été **régénéré** depuis cette base (44 tables + 1 vue +
  13 fonctions, 3003 l.), ce qui ajoute `devis_otp`, `devis_signatures` et la
  RPC `signature_devis_valider_otp` aux types ; les directives `@ts-expect-error`
  devenues inutiles ont été retirées (routes send-otp/verify-otp, page
  devis-factures).

**Non vérifié — les 33 autres migrations.**

Aucun relevé n'a été effectué pour elles : l'état en base est **inconnu**, ni
confirmé ni infirmé. Aucune n'est citée ici comme appliquée, et aucune ne doit
l'être sans relevé. Le point 14 (*B4 — schéma réel non versionné*) porte sur ce
reste : un dump du schéma réellement en base est le seul contrôle qui couvre les
44 tables et la vue d'un coup, alors que les relevés sur `pg_proc` ne portent que
sur les fonctions et les quelques tables citées.

> ⚠️ **Ordre de mise en ligne — désormais respecté.** `20260929` devait être
> jouée **avant** toute mise en ligne du code appelant : tant qu'elle ne l'était
> pas, `/api/deplacements/[id]/lier` appelait une signature à 2 arguments absente
> et échouait en `400 CONTEXTE_ENTREPRISE`. Elle est désormais confirmée en base,
> donc la liaison déplacement → devis fonctionne.

`situations`, `rapports_intemperies` et `vigilance_captures` existent en base sans
migration de création versionnée : **aucun fichier de `supabase/migrations/` ne
les crée**. Les trois sont typées dans `types/supabase.ts` et utilisées par le
code ; elles ont été créées manuellement côté Supabase. `supabase/scripts/` ne contient
qu'un script de diagnostic (`inventaire_sql_diagnostic.sql`), pas une migration.

### Edge Function

`supabase/functions/generer-rapports-intemperies/index.ts` — deux modes :
`capture` (photographie de la vigilance Météo-France pour chaque chantier actif,
matin et après-midi) et `generer` (relit les captures, récupère la météo réelle,
décide si la journée est arrêtée ou soumise à validation). **Le déploiement n'est
pas vérifiable depuis ce dépôt** (ni `SUPABASE_ACCESS_TOKEN`, ni
`supabase/config.toml`).

---

## 🔐 Sécurité

### Authentification et middleware

Supabase Auth, email / mot de passe. Le point d'entrée racine est **`proxy.ts`**
(Next 16 a renommé `middleware.ts` en `proxy.ts`) ; il délègue à
`lib/supabase/middleware.ts`, qui applique une **liste blanche stricte** :

```ts
PUBLIC_PATHS    = ['/login']
PUBLIC_PREFIXES = ['/espace-client', '/api/espace-client']
```

Trois exceptions, et elles seulement :

1. `/` — page racine (landing) ;
2. le portail client, public **par conception** (le client s'authentifie par son
   code d'accès, jamais par une session) ;
3. un appel portant `Authorization: Bearer <CRON_SECRET>` — Vercel Cron l'envoie
   automatiquement ; les handlers ré-affirment le secret (défense en profondeur).

S'y ajoute une tolérance explicite : si `getUser()` échoue mais qu'un cookie de
session `sb-*` est présent, la requête **passe quand même**. Une micro-coupure
réseau éjectait autrefois l'utilisateur vers `/login` « par moment ». La sécurité
reste assurée en aval — Server Components via `getUser`, routes API via
`verifierSession` (401).

> **Il n'y a plus de liste blanche de routes API.** Une ancienne version de cet
> audit en décrivait une liste d'une vingtaine de routes à alimenter pour chaque
> appel serveur-à-serveur. Ce mécanisme n'existe plus : les handlers protégés
> vérifient eux-mêmes la session. Ne pas « réconcilier » ce qui n'existe plus.

`lib/supabase.ts` (navigateur) et `lib/supabase/server.ts` (serveur) passent par
`@supabase/ssr`. `lib/supabase.ts` expose un singleton navigateur construit au
chargement du module. Le répertoire `lib/supabase/` ne contient que deux
fichiers : `middleware.ts` et `server.ts`.

Déconnexion : manuelle via le `Drawer`, et automatique après 15 min
d'inactivité sur tout le dashboard interne (`components/InactivityLogout.tsx`,
hors `/login`, `/espace-client`).

### RLS

- Policy d'authentification `acces_authentifie_uniquement`
  (`auth.uid() IS NOT NULL`) — historiquement la seule policy des tables métier,
  avec GRANT `SELECT/INSERT/UPDATE/DELETE` au rôle `authenticated`. Elle subsiste
  sur les tables créées après l'isolation multi-tenant.
- **Isolation par tenant** via `entreprise_courante()` : c'est désormais le modèle
  dominant : 58 occurrences dans les migrations, sur **35 tables** — 33 dans la
  boucle de `20260922_..._part2`, plus `profiles` et `catalogue_ouvrages_prix` en
  policy nominative. C'est cette couche, et
  non la policy d'authentification, qui porte la sécurité multi-tenant.
- GRANT `service_role` sur les tables du schéma public — un trou identifié
  tardivement (`avancements_chantier` provoquait un `permission denied` silencieux
  malgré l'usage de `supabaseAdmin`).
- Buckets Storage : policies de listing **retirées** sur `sav_photos`, `tickets`,
  `photos`. `getPublicUrl()` continue de fonctionner ; seul le parcours complet
  du dossier est bloqué.
- `ON DELETE CASCADE` entre `chantiers` et ses tables liées : supprimer un
  chantier de test nettoie tout son historique. **Irréversible** — à garder en
  tête sur un vrai chantier client.

### Notifications — modèle collectif

Migration `20260926_o3b6_notifications_collectif.sql` : les policies
`notifications_ent_*` sont remplacées par le seul filtrage
`entreprise_id = public.entreprise_courante()`. Modèle **collectif par tenant** —
ni pont `profiles.user_id`, ni table d'état de lecture par utilisateur, ni
nouvelle architecture d'identité. Les notifications sont donc collectives : il n'y
a pas de lecture par utilisateur.

Le raisonnement qui a conduit à cette correction mérite d'être conservé, parce
qu'il distingue trois niveaux qui se confondent facilement :

1. **Défaut structurel — démontré.** `notifications.destinataire_id` référence
   `profiles(id)`, dont `id` est un uuid autonome sans colonne `user_id`, et le
   schéma ne contient **aucun pont vers `auth.users`**. La clause
   `destinataire_id = auth.uid()` de l'ancienne policy était donc structurellement
   invalide : aucun code applicatif ne pouvait la rendre vraie.
2. **Risque fonctionnel — théorique.** *Si* une `client_alert` ciblée avait été
   produite, l'ancienne policy l'aurait rendue invisible à tout lecteur.
   L'élargissement reste borné au tenant : `entreprise_id` et le RLS sont intacts.
3. **Fait observé au 26/09/2026.** Aucune ligne `client_alert` n'avait jamais été
   produite : 3 lignes au total, de types `general` et `commande_retard`. La
   correction est donc **préventive** — elle corrige un défaut réel, mais n'a rétabli
   la visibilité d'aucune notification existante.

Le `CHECK` de type n'est pas en cause : le fichier
`20260916_fix_notifications_constraints.sql` ajoute une contrainte qui **prévoit**
les 9 types, `commande_retard` et `client_alert` inclus — ce que le code producteur
émet effectivement. Ce que le fichier prévoit est vérifiable dans le dépôt ;
ce que la base applique ne l'est pas (migration non relevée, cf. *Non vérifié*
ci-dessus), et l'analyse ne conclut rien de ce côté.

L'alerte « Livraison en retard » était **morte depuis 4 jours** : le producteur
navigateur insérait sans `entreprise_id` (NOT NULL depuis la migration d'isolation
du 22/09) et sans déstructurer `error` — échec `23502` totalement muet. Corrigé via
`resoudreContexteEntreprise(null)`, **fail-closed** si le claim est absent,
déduplication scopée par `.eq("entreprise_id")`, erreurs de lecture et d'insert
explicites. Le cast `as TablesInsert<"notifications">` a été supprimé : il masquait
l'erreur de compilation, donc `tsc` exige désormais réellement `entreprise_id`.

### PIN Finance

`FinancePinGate` devant `app/(dashboard)/finance/*`, code à 6 chiffres vérifié
côté serveur (`app/api/finance-pin/route.ts`, env `FINANCE_PIN`). Persistance en
`sessionStorage`, bouton « Verrouiller » manuel, reverrouillage automatique après
15 min d'inactivité.

### Variables d'environnement

`.env.local` est gitignoré. `.env.example` est suivi et ne contient que des
placeholders.

| Variable | Usage |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase |
| `SUPABASE_SERVICE_ROLE_KEY` | `supabaseAdmin` — **contourne le RLS** |
| `GROQ_API_KEY` / `GROQ_MODEL` | Groq (chat, résumé, Whisper) |
| `GOOGLE_GENERATIVE_AI_API_KEY` | Gemini (devis, OCR) |
| `VISUALCROSSING_API_KEY` | Météo détaillée. **Placeholder volontairement présent** : en local, `GET /api/meteo` reçoit un 401 et bascule sur Open-Meteo, donc la météo fonctionne sans compte payant |
| `METEOFRANCE_APPLICATION_ID` | DPVigilance |
| `FINANCE_PIN` | Verrou Finance |
| `CRON_SECRET` | Bearer des crons Vercel |
| `NOMINATIM_EMAIL` | User-Agent Nominatim — **exigé par la politique d'utilisation** d'OSM. À définir en Vercel aussi, sinon les appels peuvent être bloqués |

> `METEOFRANCE_API_KEY` est référencée dans le code mais **absente de
> `.env.example`**. À ajouter.

### PWA

`public/manifest.json` + `public/sw.js` (service worker minimal, **sans cache
offline**) + `components/RegisterSW.tsx`. Icônes `icon-192.png` / `icon-512.png`
aux tailles exactes exigées par Chrome. App installable, ouverture plein écran.

---

## 🧪 Tests et qualité

**1121 tests, 66 fichiers, 0 échec.** La suite est une partie de la
maintenance, pas un artefact : plusieurs décisions ci-dessus n'existent que
parce qu'un test les verrouille.

### Tests de composition

Ces tests lisent les **sources** (helpers `CODE()` / `PAGE()`) plutôt que de
faire le rendu, ce qui est la convention du dépôt pour les pages qui lisent
Supabase. `CODE()` supprime les commentaires avant toute assertion, pour qu'un
test ne vérifie pas sa propre documentation.

Portée : ordre des blocs de l'accueil · grilles d'origine · absence de largeur
propre sur une carte · absence de centrage artificiel · **confort partagé des
cartes Notes et Alertes** · proportions de la carte météo · état vide reprenant
la portée de la grille.

> Un garde-fou de `accueil-responsive.test.ts` était **mort** : sa branche
> ciblait `key={c.id}` alors que le code rend `key={n.id}`, donc elle ne matchait
> aucune occurrence et la protection ne vérifiait pas les cartes d'alerte. Elle a
> été réparée. À l'inverse, si une regex de test ne matche plus rien, c'est un
> signal : le vérifier avant de conclure que le test passe.

### Tests de sécurité

`__tests__/securite/` couvre le middleware et l'isolation du portail client. Le
test d'isolation `espace-client-entreprise-tenant` n'inspecte **que**
`app/api/espace-client/[code_acces]/route.ts` : son périmètre est volontairement
disjoint, et `.eq("id", 1)` y est **interdit** — le portail est multi-tenant.

### Périmètre de mocking Supabase

`lib/supabase.ts` exporte un singleton construit au chargement du module, sans
env injecté par Vitest. Supabase-js passe par le `fetch` global, **mocké et
compté précisément** dans plusieurs tests (`toHaveBeenCalledTimes`). Ajouter une
lecture Supabase dans un composant testé casse ces assertions. C'est pourquoi la
lecture de l'adresse de départ se fait dans la page hôte et transite en prop.

### Dette de tests connue

**Aucun test ne couvre l'OTP de signature devis** (`send-otp` / `verify-otp`),
alors que ces routes présentent les défauts les plus graves décrits ci-dessous.

---

## ⚠️ Problèmes ouverts

### Sécurité

**[RESOLU] Routes OTP legacy supprimées. Parcours signé unique via espace-client.**

**2. L'OTP de signature n'est jamais envoyé.** `send-otp` journalise le code en
`console.log` sous le libellé `[SMS MOCK]` : aucun fournisseur SMS n'est appelé.
La signature électronique par code est donc **non fonctionnelle en production**.

**3. Le verrou anti-bruteforce de l'OTP est en mémoire.** `verify-otp` tient le
compteur dans une `Map` au niveau du module : il est propre à chaque instance et
se réinitialise à chaque démarrage à froid. Le commentaire du code l'admet
lui-même (« le lock définitif (par base de données) reste recommandé »). Même
remarque pour le cooldown d'une minute de `send-otp`.

### Fonctionnel

**4. Onglet « Analyse des Marges » vide.** Dans
`app/bureau/fournisseurs/page.tsx`, l'onglet `analyse` existe dans l'état et
dans la barre d'onglets, mais **n'a aucun bloc de rendu** : le contenu manque à
concevoir. Ce n'est pas une régression.

**5. Fallbacks d'exemple dans l'espace client.** `app/espace-client/[code_acces]/page.tsx`
affiche encore « Villa Arcachon », « 33380 Arcachon », `BNA-7429`, le badge
« ★ CLIENT PREMIUM » et un WhatsApp `33600000000` quand la donnée est absente. À
remplacer par des valeurs neutres ou des états vides.

**6. Zéro `sky-*` / `blue-*` n'a été atteint.** Une ancienne règle d'audit
annonçait l'éradication totale du bleu ; le code en conserve plus de 60
occurrences (`sky-400`, `sky-500`, `sky-600`, `blue-500`…). L'éradication est
**non faite**. À décider : refaire, ou assumer explicitement ces accents.

**7. Standard des modales non appliqué uniformément.** 8 fichiers en `pt-48`,
2 en `pt-44`.

**8. Palette du portail client.** `#E30613` y est encore utilisé (17 occurrences)
alors que le reste de l'application est passé à `--color-brand` (`#E53935`, 48
occurrences). Divergence assumée à arbitriter.

**9. `#232323` non appliqué.** Le token `--color-surface-mobile` existe mais la
carte mobile ne l'utilise pas.

**10. Vues d'impression non régénérées.** `BilanChantierPDF` et
`RapportMensuelPDF` sont passés à `#1E1E1E` ; les PDF restent à produire pour
constater le rendu.

### Qualité

**11. `zod` n'est pas déclaré.** C4 (validation Zod des routes JSON) n'est pas
amorcé : `zod@4.4.3` n'est présent que comme dépendance transitive de `ai`,
`@ai-sdk/google` et `@mistralai/mistralai`, sans import direct. L'ajouter
explicitement avant de commencer.

**[RÉSOLU] C5 — timeouts des `fetch` externes.** Ajout de `lib/fetchWithTimeout.ts` (wrapper partagé : `AbortController` manuel, journalisation `[TIMEOUT]`, `ErreurTimeout`, `estDelaiDepasse`). Bornés : Groq (`lib/espace-chat-summary.server.ts`), Gemini (`app/api/devis/[id]/analyse/route.ts`, `app/api/ia-devis/route.ts`), Météo-France (Vigilance + token OAuth), Open-Meteo, OTP SMS (postSms + Twilio) — 20 s (LLM), 8 s (météo/SMS).

**13. C6 — dépendances ESLint / npm.** Non traités.

**14. B4 — schéma réel non versionné.** Aucun `supabase db dump` du schéma
réellement en base. L'écart entre les migrations et la PROD ne peut pas être
clôturé. **Bloqué** : pas d'accès à la base depuis cet environnement. Aucune
conclusion n'est affirmée tant que ce n'est pas vérifié.

> L'accès à la base est possible **depuis le SQL Editor de Supabase**, en
> lecture seule. C'est ainsi qu'ont été confirmées les migrations
> `20260929` et `20260930`, et c'est le moyen de fermer B4 : un dump du schéma
> réel reste le seul contrôle qui couvre **toutes** les tables d'un coup, alors
> que les requêtes sur `pg_proc` ne couvrent que les fonctions.

**15. Décalage de distance sur le trajet.** Écart observé entre la distance OSRM
(24,94 km) et celle d'un affichage Google Maps (28 km) sur un même trajet.

---

## 🧭 Historique des décisions

Conservé uniquement parce qu'il explique un choix qu'on ne devinerait pas en
lisant le code.

### `Surface` ne porte pas de padding

Le composant a été extrait pour centraliser l'habillage de carte le plus
homogène du dépôt (95 éléments, 27 fichiers). `HABILLAGE` ne contient que
bordure, fond et arrondi — **délibérément aucun padding**, aucun texte, aucune
largeur. La conséquence est que chaque appelant est responsable de son confort
interne, et qu'un oubli est possible : c'est exactement ce qui est arrivé aux
cartes d'alerte de l'accueil. Les tests de composition couvrent désormais ce
point section par section.

### Le fond est global, le reflet ne l'est pas

Le fond `#121212` est sur le `<body>` depuis toujours. Le **reflet rouge**, lui,
était local et dupliqué deux fois dans `app/page.tsx`. Il a été porté par le
`background-image` du `<main id="main-content-wrapper">` du layout racine, ce qui
le définit une seule fois pour toutes les pages.

### L'adresse de départ se lit dans la page hôte

`app/terrain/chantier/[id]/page.tsx` est un composant client : aucune lecture
serveur n'y est possible. Lire dans `FraisDeplacementTab` aurait imposé de
charger `@/lib/supabase` dans le composant et aurait cassé les assertions qui
comptent les appels `fetch`. La lecture se fait donc dans la page hôte et la
valeur transite en prop — ce qui préserve aussi l'indépendance du composant.

La synchronisation utilise un `useEffect` avec une garde de saisie : `useState`
ne lit sa valeur initiale qu'au premier rendu, or la prop arrive
**asynchronement** — un `useState(adresseDepartDefaut || "")` ne se
préremplirait jamais.

### L'indication d'origine est conditionnée à la valeur

« Adresse de départ récupérée depuis vos paramètres » ne s'affiche que tant que
`adresseDepart === adresseDepartDefaut`. C'est une affirmation d'**origine** : la
laisser affichée sur une saisie manuelle serait factuellement faux, ce qui est
pire que pas d'indication du tout. L'état est dérivé au rendu — aucun état ni
minuterie ajouté.

### Le couplage Notes ↔ Alertes est volontaire

Le test compare les deux paddings entre eux plutôt que d'écrire `p-4` en dur.
L'exigence est que les deux sections conservent **le même confort visuel** ;
une valeur en dur laisserait les deux dériver en silence. Le couplage est donc
voulu et le test doit échouer si l'une évolue sans l'autre.

### `SearchNav` — Rules of Hooks

Le `if (isClientPage) return null;` précédait deux `useEffect` : le nombre de
hooks dépendait de `pathname`. Un retour navigateur depuis `/espace-client` vers
`/bureau` faisait lever « Rendered fewer hooks than expected ». Ni ESLint ni
aucun test ne le voyait. La garde a été déplacée dans les effets, `return null`
après le dernier hook ; aucun élément visuel n'a été modifié.

### Suppression de composants

`BureauNav`, `SubNav` et `PageEnConstruction` ont été retirés : **aucun import
actif ne subsiste**. Il ne reste que des commentaires documentant le retrait et le
test qui le vérifie. Ne pas les réintroduire.

### `PUBLIC_PATHS` a été réduit, pas étendu

Le mécanisme de liste blanche de routes API a été **supprimé** au profit d'une
liste minimale (`/login` + portail client) et d'une exception Bearer pour les
crons. Chaque route API protégée vérifie sa propre session. Toute recette
« ajouter ma route à la liste blanche » est périmée.

### `/api/notifications` et `/api/chat-client` supprimés

`/api/notifications` n'avait plus aucun appelant sur tout l'historique
(`git log --all -S`) et avait été **publique 12 jours** avant reverrouillage,
sans jamais servir. `/api/chat-client` a été remplacé par
`/api/espace-client/[code_acces]/chat` et `.../chat-summary`, dans le
portail. L'entrée de `/api/notifications` reste dans la liste blanche du test
middleware **délibérément**, comme garde-fou anti-remise en liste blanche.

### Les trois routes OTP legacy supprimées

`/api/espace-client/[code_acces]/signer`, `/api/devis/[id]/send-otp` et
`/api/devis/[id]/verify-otp` ont été **supprimées**, pas désactivées. Le
déclencheur n'est pas un nettoyage : c'est que la cartographie des appelants
(`app/`, `components/`, `lib/`, scripts, configuration) n'a trouvé **aucun
appelant** — ni page, ni composant, ni construction d'URL dynamique. Le parcours
réel passe par `components/SignatureModal.tsx` →
`/api/espace-client/[code_acces]/send-otp` puis `/verify-otp`.

Les trois ensemble formaient un **second canal de signature, sans aucune des
garanties du nouveau** :

| Route | Défaut structurel |
|---|---|
| `…/signer` | **Publique** (`/api/espace-client` est un préfixe public). Ni OTP, ni image, ni empreinte, ni `signatureId`. Passait `devis.statut` à `signe` en laissant `devis_signatures` vide — donc un devis « signé » supprimable, alors qu'une preuve rend la suppression impossible (`ON DELETE RESTRICT`). |
| `/api/devis/[id]/send-otp` | `phone` lu dans le **corps** de la requête : le numéro qui reçoit l'avertissement était choisi par l'appelant. OTP stocké **en clair** dans `devis.otp_code`, et **journalisé en clair**, sans garde d'environnement. Cooldown en mémoire, perdu au redémarrage. |
| `/api/devis/[id]/verify-otp` | Comparaison de l'OTP **en clair**. Anti-bruteforce dans un `Map` **en mémoire** : perdu au redémarrage, inefficace en serverless multi-instances. Aucune trace conservée. |

Elles vivaient sous `/api/devis`, donc **derrière session** — ce qui les rendait
non exploitables anonymement, mais laissait un artisan authentifié du tenant A
marquer « signé » un devis du tenant A sans laisser de preuve, et sans passer par
l'OTP. C'était suffisant pour un utilisateur authentifié, insuffisant pour un audit.

Remplacement, et où vit désormais chaque garantie :

| Garantie | Testée dans |
|---|---|
| Cloisonnement par `code_acces` → chantier → devis | `espace-client-signature.test.ts` §B |
| Clé HMAC de l'OTP, jamais l'OTP en clair | `otp-contrats-officiels.test.ts` |
| Anti-bruteforce **persistant** (`tentatives`, `verrouille_jusqua`) | `espace-client-signature.test.ts` §D |
| Preuve, empreinte, `signatureId`, non-rejouabilité | `espace-client-signature.test.ts` §H, `signature-parcours-client.test.tsx` §A |
| Absence **physique** des trois fichiers | `devis-id-tenant.test.ts` §B, `otp-fuite-journaux.test.ts` B4 |

Aucun test n'a été supprimé. Les dix-sept tests de `devis-id-tenant.test.ts` qui
portaient sur les routes OTP avaient déjà été **portés** dans
`espace-client-signature.test.ts` (§A1…§I9, balises `[PORTE …]`) ; la seconde
réduction de ce fichier a simplement réduit `F`/`G` aux deux entrées restantes et
ajouté §B. Le garde `resoudreTenant()` en échec fermé reste testé — il ne
s'applique plus aux routes de signature, qui n'exigent pas de session mais un
`code_acces` (vérifié par `devis-id-tenant.test.ts` G3).

✅ **La migration `20261003_devis_signature_provenance.sql` est appliquée.**
Le verdict de conformité porte **58/58** contrôles SQL en lecture seule, dont
**30/30** sur le périmètre E (OTP/signature) : `devis_signatures` (21 colonnes),
`devis_otp` (10 colonnes) et la RPC `signature_devis_valider_otp` (8 arguments,
`security definer`, `search_path = public, extensions`, retour `jsonb`) sont en
base, ainsi que les colonnes `devis.signature_image`, `devis.telephone_source`,
`devis.devis_empreinte_sha256`, `chantiers.code_acces_*`, `clients.tel_*` (voir
la rubrique « Migrations »). Les objets décrits dans cette section existent donc
réellement en base. Le compteur de routes API a été corrigé en conséquence
(36 → **35**, ligne 20), et les deux routes `send-otp` / `verify-otp` ont été
ajoutées au tableau « Routes API » ci-dessus ;
`__tests__/system/audit-snapshot-routes.test.ts` empêche désormais le snapshot de
diverger de nouveau de l'arbre réel.

### RPC `lier_deplacement_devis` durcie

`public.lier_deplacement_devis(p_deplacement_id, p_devis_id, p_entreprise_id)`
était `SECURITY DEFINER` **et** paramétrée par le tenant fourni par l'appelant.
`CREATE FUNCTION` accorde `EXECUTE` à `PUBLIC` par défaut et PostgREST expose le
schéma `public` : un utilisateur authentifié pouvait appeler la RPC directement
avec un `p_entreprise_id` appartenant à un autre tenant. Les policies RLS de
`frais_deplacement` sont `auth.role() = 'authenticated'` **sans filtre
`entreprise_id`** : rien ne bloquait l'appel.

La correction décompose selon la convention **déjà utilisée par le dépôt**
(`generer_prochain_numero_*`) : une implémentation interne
`lier_deplacement_devis_ctx` à tenant explicite, `EXECUTE` réservé au
`service_role`, et un wrapper public **sans aucun paramètre tenant** qui résout
`entreprise_courante()` et **échoue fermé** si le contexte est absent.

L'ancienne signature à 3 arguments est **`DROP`ée, pas seulement `REVOKE`ée** :
PostgREST résout par (nom, nombre d'arguments), une surcharge restante demeurerait
une surface d'élévation que le moindre `GRANT` futur rouvrirait par accident. Le
corps métier — les deux verrous `FOR UPDATE`, le contrôle de chantier partagé, le
recalcul atomique des totaux — est **inchangé**.

Côté application, la route appelle la RPC en 2 arguments via le client **porté par
la session** (`createClient()`, cookies, clé `anon`) et non via `supabaseAdmin` :
`entreprise_courante()` lit le claim JWT de l'appelant, absent du JWT
`service_role` — en `service_role` la RPC tournerait sans contexte et échouerait
fermée.

`devis_id` n'est plus modifiable par `PATCH` : le corps de mise à jour de
`/api/deplacements/[id]` est une liste blanche (`statut` validé, `updated_at`).
Le rattachement à un devis passe **exclusivement** par
`POST /api/deplacements/[id]/lier`, seule voie qui vérifie que le devis et le
déplacement partagent le même chantier.

### `search_path` des fonctions `SECURITY DEFINER`

Inventaire : 26 fonctions `SECURITY DEFINER` dans les migrations, dont 8 portaient
déjà `set search_path = public`, 7 sont superseded par un `create or replace`
ultérieur, et **11 sont vivantes sans `search_path`** — les seules traitées.

La méthode est `alter function … set search_path = public`, **pas**
`create or replace` : retranscrire un corps serait une source de dérive
silencieuse, alors que l'`ALTER` est une opération de catalogue qui ne lit ni ne
réécrit le corps.

Le traitement est une **boucle de catalogue** alimentée par `pg_proc`, filtrée sur
`prosecdef`, et l'`ALTER` est construit par `format(…, r.oid::regprocedure::text)` :
**aucune signature n'est écrite à la main** et la boucle couvre toutes les
surcharges d'un nom.

> Une première version comparait `pg_get_function_identity_arguments()` à des
> signatures littérales. Cette fonction restituit la signature **avec les noms de
> paramètres** — pour `generer_prochain_numero_ri(p_entreprise_id uuid)` elle
> renvoie `p_entreprise_id uuid`, pas `uuid`. La garde n'était donc satisfaite que
> pour les fonctions **sans** argument, et la migration réussissait en n'ayant
> corrigé qu'une fraction de ses cibles **sans lever la moindre erreur**. La
> sélection par `oid` supprime le risque.

L'idempotence est portée par
`coalesce(p.proconfig, '{}'::text[]) is distinct from array['search_path=public']`
et non par un test d'existence : **aucun `ALTER` nu** n'est exécuté, donc le lot
ne peut pas échouer sur *function does not exist*.

### Contrat local dans `FraisDeplacementTab`

Le composant ne dépend pas du type privé `DevisLie` d'une autre page pour deux
champs. Il déclare un contrat **minimal** `{ id: string; numero: string }[]` :
l'identifiant (clé React + valeur d'option) et le numéro (libellé) suffisent.

Élargir ce contrat aux « devis du client » serait un piège : la RPC rejette alors
avec « Le devis et le déplacement n'appartiennent pas au même chantier », ce
qui est une impasse pour l'utilisateur. **Ne pas élargir.**

### Nettoyage des `any`

Aucun `any` n'a été remplacé par `unknown`, `object` ou un cast arbitraire :
chaque occurrence a été résolue par le type réel du projet.

- `devis.lignes` est un `Json` : le `as any` de `lib/mainOeuvreAnalytique.ts` a
  été remplacé par **`mapperLignesPersistees`** (`lib/devisAnalyse.ts`), mappeur
  sûr déjà utilisé par le projet. Effet de bord favorable : il écarte les entrées
  `null` qui faisaient lever `ligne.catalogue_id` sur `null`.
- `lib/fournisseursAnalytique.ts` : les 4 paramètres `any[]` deviennent des types
  `Tables<…>[]`.
- `RentabiliteMainOeuvreWidget.tsx` : le type d'état annonçait `nom: string`
  alors que la colonne est `string | null` — c'est ce **mensonge de type** qui
  imposait le `as any`. Corrigé ; `{c.nom}` affiche `null` comme nœud vide,
  comportement visible inchangé.
- `catch (err: any)` de `SignatureModal.tsx`, `hooks/useDeplacements.ts` et
  `app/api/deplacements/[id]/lier/route.ts` : passés en `unknown` avec repli
  explicite. Ces branches étaient **muettes** — sur une valeur qui n'est pas une
  `Error`, `err.message` vaut `undefined` et l'UI affichait un message vide.

Le compte `any` d'ESLint en production est aujourd'hui **0**. Les occurrences
restantes sont dans `__tests__/`, où elles servent de cast sur des `vi.fn()` et
des mocks — elles sont idiomatiques et volontaires.

### Conventions de code

- Un `unknown` ou un `Error` se teste avec `instanceof` avant d'accéder à
  `.message` ; ne pas réintroduire un accès direct sur une valeur inconnue.
- Une conversion monétaire passe par `fmtEuro` (`lib/financeCalculs`), qui produit
  la virgule décimale française et une **espace insécable U+00A0** avant le `€`.
  Les assertions correspondantes doivent échapper `\u00A0` explicitement, sinon
  une espace ordinaire ferait passer le test sans rien garantir.
- Un composant client ne doit pas importer `@/lib/supabase` s'il est testé : lire
  par une prop depuis la page hôte.

---

## 📌 Notes d'exploitation

### Reprendre le projet

```bash
npm run dev            # Next 16 — le build tue le serveur de dev, relancer après
npm run build
npx tsc --noEmit       # gate fiable
npx vitest run
npx eslint .
```

Si `tsc` remonte des erreurs de syntaxe dans `.next/dev/types/routes.d.ts`, le
serveur de dev écrit ses types pendant la lecture : arrêter le serveur, puis
`rm -rf .next/dev`.

### Pièges rencontrés

- `pkill -f "next dev"` s'auto-tuer. Éteindre par PID ; un processus
  `next-server (v16.3.5)` n'apparaît pas sous le motif `next dev` et peut rester
  orphelin sur le port 3000.
- `npm run build` tue le serveur `next dev`.
- Un test qui lit des sources doit passer ses assertions par `CODE()` (commentaires
  supprimés), sinon il peut vérifier sa propre documentation.
- Une regex de test qui ne matche plus rien **passe silencieusement** : c'est un
  garde-fou mort, pas une protection.

### Règles de travail

- Ne jamais considérer une migration comme appliquée parce que le fichier SQL est
  dans le dépôt : seul un relevé sur la base l'établit, et il établit l'**état
  observé**, pas la trace d'exécution. L'accès se fait depuis le SQL Editor
  Supabase, en lecture seule — c'est ainsi que les 7 migrations listées
  ci-dessus ont été confirmées.
- Avant de committer : `git diff` complet, recherche de secrets, absence de
  fichier parasite ou temporaire, absence de marqueur de conflit.
- Après une écriture longue, scanner les fichiers modifiés : l'outillage peut
  injecter des caractères CJK dans les commentaires.

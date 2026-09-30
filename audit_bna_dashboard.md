# 📋 Audit Complet — BNA Dashboard
> Rapport mis à jour le 16/09/2026 (Refonte Devis IA, Calepinage, Facturation & Aides MPR) — Toutes les pages, onglets, fonctionnalités et sécurité recensés

---

## 🏗️ Architecture Générale

L'application est un **Next.js 16 App Router** connecté à **Supabase** (PostgreSQL + Storage).
- **UI** : Tailwind CSS (dark mode slate-900 pour le dashboard pro, thème clair blanc `#FFFFFF`/`#111111` pour l'espace client)
- **IA** :
  - `openai/gpt-oss-20b` (Groq) — chat client, résumé conversations, sécurité, reformulation, dictée avancement (modèle unique, unification 10/09)
  - `whisper-large-v3` (Groq) — transcription audio (notes vocales + dictée avancement)
  - `gemini-3.5-flash-lite` (Vercel `@ai-sdk/google`) — génération devis **et** OCR de tickets/BL (vision)
- **PDF** : `window.print()` avec composants React masqués (`hidden print:block`)
- **API Météo** : Météo-France DPVigilance (alertes) + Visual Crossing (détail) + **Open-Meteo** (veille intempéries auto, seuils pluie >10 mm / vent >50 km/h / gel <0 °C)
- **Crons Vercel** (`vercel.json`) : `/api/rapports-client/auto` (lundi 6h) + `/api/cron/meteo` (chaque jour 6h) — **⚠️ les crons ne tournent pas sur l'offre Hobby (réservés au plan Pro / Vercel)**, déclenchement manuel possible avec `Authorization: Bearer <CRON_SECRET>`

---

## 📊 TABLES SUPABASE REQUISES (récapitulatif complet)

| Table | Colonnes principales | Utilisé par |
|---|---|---|
| `profiles` | `id, full_name, role` | Pointages, connexion |
| `entreprise_settings` | `id, raison_sociale, siret, telephone, email, adresse, code_postal, ville, iban, bic, assurance, assurance_nom, assurance_numero_police, assurance_zone_geo, mediateur_nom, mediateur_contact, mentions_legales, logo_url, seuil_ca, taux_cotisations` | Paramètres, tous PDF |
| `clients` | `id, nom, societe, email, tel, adresse_facturation, code_postal, ville` | Bureau, Terrain |
| `chantiers` | `id, nom, client_id, adresse_chantier, date_debut, date_fin, statut, materiau_structurel, moyen_acces, zone_vent, checklist, surface_m2, quantite_coupes_ml, singularites_nb, coef_perte_rendement` | Terrain, Finance, Bureau |
| `equipe` | `id, nom, prenom, role` | Pointages globaux |
| `catalogue_temps` | `id, nom_tache, temps_unitaire_heure` | Temps Heures, Calepinage |
| `pointages_globaux` | `id, chantier_id, equipe_id, date_saisie, volume_heures_declare, commentaire, meteo_relevee, coef_meteo` | Temps Heures (Mode Confiance) |
| `devis` | `id, numero, client_id, chantier_id, objet, adresse_chantier, date_emission, validite_jours, tva_pct, statut, lignes (JSONB), acompte_pct` | Bureau Devis |
| `factures` | `id, numero, client_id, chantier_id, objet, date_emission, echeance, tva_pct, statut, type_facture, lignes (JSONB)` | Bureau Factures |
| `fournisseurs` | `id, nom, contact, telephone, email, statut_relation, notes` | Bureau Fournisseurs |
| `commandes` | `id, fournisseur_id, chantier_id, reference_interne, objet, date_commande, date_livraison_prevue, lignes (JSONB), montant_ht, statut` | Bureau Fournisseurs |
| `pointages` | `id, user_id, chantier_id, date, heures, type_heure, taux_horaire_charge` | Finance Saisie, Terrain |
| `depenses_chantier` | `id, chantier_id, fournisseur_id, date, categorie, description, montant_ht, montant_tva, montant_ttc` | Finance Saisie |
| `avancements_chantier` | `id, chantier_id, date, pourcentage, commentaire, details (JSONB), created_at` | Terrain Avancement Façades, Espace Client |
| `pv_receptions` | `id, numero, chantier_id, client_id, devis_id, date_reception, statut, type_travaux, adresse_chantier, materiaux_utilises, zones_metres (JSONB), photos (JSONB), reserves (JSONB), observations, notice_entretien (JSONB), signature_client, signataire_client_nom, signature_entreprise, signataire_entreprise_nom, checklist_repli (JSONB)` | Bureau Fin de Chantier |
| `rapports_intemperies` | `id, numero (RI-AAAA-NNN), chantier_id, cree_le, cree_par (+'auto'), jour_arrete, ampleur_impact, pluie_continue, pluie_cumul, rafales_max, temp_max, motif, vigilance_officielle, a_valider` | Bureau Intempéries + Veille auto |
| `notes_patron` | `id, titre, contenu, epingle, created_at, updated_at` | Terrain Notes |
| `fiches_techniques` | `id, titre, categorie, reference, resume, contenu, fichier_url` | Terrain Fiches DTU |
| `catalogue_ouvrages` | `id, designation, description, famille_label, unite, pu_ht, dimensions_disponibles` | Bureau Devis & Factures |
| `zones_chantier` | `id, chantier_id, type, nom, largeur, hauteur_mur, hauteur_faite, materiau, ouvertures (JSONB), famille_pose...` | Terrain Métrés |
| `photos_notes_chantier` | `id, chantier_id, url, legende, created_at` | Terrain Photos & Notes |
| `parametres_finance` | `id, cle, valeur` | Finance (taux horaire, salaires...) |
| `tickets_sav` | `id, chantier_id, statut, sous_garantie, type_sinistre, localisation, description, cause_probable, respect_dtu, diagnostic_dtu, materiel_prevu (JSONB), date_intervention, temps_estime, intervenant, moyen_acces, photos (JSONB), signature_technicien (text), signature_client (text)` | Bureau SAV |
| `documents_compta` | `id, type (bl/ticket), date, note, montant_ht, taux_tva, montant_tva, montant_ttc, url_image, created_at` | Bureau Docs Compta |
| `notifications` | `id, type, titre, message, destinataire_id, lien, lu, created_at` | Notifications (GET/POST/PATCH) |
| `rapports_client` | `id, chantier_id, semaine_label, date_debut, date_fin, contenu (JSONB incl. communication.message_patron), statut, envoye_le, created_at` | Rapports Client (auto hebdo + manuel) |
| `photos_chantier` | `id, chantier_id, url_image, titre, date_ajout` | Photos Chantier (upload/liste/suppression) |

### ✅ Migrations SQL appliquées (`supabase/migrations/`)

- `20260821_create_pv_receptions.sql` — PV de réception
- `20260821_add_legal_and_insurance_settings.sql` — mentions légales + assurance décennale
- `20260906_notifications.sql` — table notifications (cloche bureau)
- `20260907_add_missing_columns.sql` — colonnes manquantes (`avancements_chantier.details/commentaire/created_at`, `tickets_sav.signature_technicien`, …)
- `20260909_add_module_dimensions.sql` — dimensions modules (zones)
- `20260910_create_rapports_client.sql` — rapports hebdomadaires client (`statut`, `envoye_le`)
- `20260910_docs_compta_link_depenses.sql` — lien docs compta → dépenses chantier
- `20260910_parametres_entreprise.sql` ⚠️ **À APPLIQUER DANS SUPABASE SQL EDITOR** (mission 07, dashboard tréso patron <-> entreprise_settings) — non confirmé par l'utilisateur

> Note : la table `rapports_intemperies` (justificatifs météo, `numero RI-AAAA-NNN`, `cree_par`, `motif`, `jour_arrete`, etc.) existe en base mais sa création n'est pas tracée en fichier de migration ; créée manuellement côté Supabase.

---

## 🏠 PAGE D'ACCUEIL (`/terrain/meteo`) — Tableau de Bord Central

> **Redirection automatique** : `/` → `/terrain` → `/terrain/meteo`

- **Widget IA Vocal** : enregistrement audio → transcription Whisper → reformulation (gpt-oss-20b) → `notes_patron`
- **Widget Météo du Jour** : temp, vent, rafales, alerte colorée (vert/jaune/orange/rouge)
- **3 Dernières Notes** + lien page complète
- **Chantiers Actifs & Météo** : liste avec alerte météo calculée en temps réel

---

## 🧱 MODULE TERRAIN (`/terrain/*`)

### 1️⃣ Terrain → Chantiers (`/terrain/chantier`)

- Vue Liste + Vue Planning (Gantt 6 mois)
- Créer / Supprimer un chantier (modale responsive `pb-32 max-h-[80vh]`)
- Filtres par recherche + Bouton GPS

---

### 2️⃣ Terrain → Chantier Détail (`/terrain/chantier/[id]`)

**7 onglets** :

#### Onglet 1 — Général
- PPSPS Express IA (sécurité — Groq `openai/gpt-oss-20b`)
- Infos client, adresse, statut, matériau, moyen d'accès, zone de vent
- Checklist fin de chantier

#### Onglet 2 — Avancement ⭐ NOUVEAU (logique métier "Façadier")
- **4 accordéons** : Façade Nord / Sud / Est / Ouest
- **4 cases par façade** : Pose ossature / Pose isolation / Pose bardage / Finitions
- **Calcul automatique** du % global (16 cases = 100%). Aucune saisie manuelle.
- Compteur par façade visible dans l'accordéon fermé (ex: "2 / 4")
- Champ "Observations du jour"
- Sauvegarde dans `avancements_chantier` (colonne `details` JSONB + `pourcentage` calculé)
- Persistance : rechargement des cases lors de la prochaine ouverture
- Enveloppé dans `ErrorBoundary` (affiche message d'erreur propre, ne crash pas la page)

#### Onglet 3 — Temps Heures
- Gaël Logic : Calepinage / Pointage Mode Confiance / Tableau Rentabilité

#### Onglet 4 — Métrés & Technique
- Zones, ZoneCard, VisualiseurDebitPlaques, Calepinage SVG, Commander

#### Onglet 5 — Météo & Intempéries
- Météo temps réel Visual Crossing + Rapports Intempéries

#### Onglet 6 — Photos & Notes
- Galerie photo (compression auto) + Notes texte

#### Onglet 7 — Documents
- Synthèse financière + Devis / Factures / BdC / PV liés

---

### 3️⃣ Terrain → Notes Patron (`/terrain/notes`)
- Dictée vocale IA (Whisper → gpt-oss-20b), épingler, éditer, supprimer

### 4️⃣ Terrain → Boîte à Outils (`/terrain/outils`)
- Hub de navigation vers Météo, Notes, DTU, Intempéries

### 5️⃣ Terrain → Fiches DTU (`/terrain/fiche-technique`)
- Recherche, filtres catégorie, affichage résumé
- Créer une fiche (titre, catégorie, référence, contenu, PDF joint)
- Modale responsive mobile (footer statique)

---

## 🏢 MODULE BUREAU (`/bureau/*`)

### 1️⃣ Bureau → Dashboard (`/bureau`)
- 4 KPIs temps réel + liens rapides

### 2️⃣ Bureau → Clients (`/bureau/clients`)
- Créer / Supprimer client, Fiche 360°
- Modale responsive mobile (`pb-32 max-h-[80vh]`)

### 3️⃣ Bureau → Devis (`/bureau/devis-factures`)
- Créer, changer statut, PDF + signature électronique
- Génération IA Gemini des lignes (Vercel AI SDK)
- **Facturation auto à l'acceptation** : quand un devis passe au statut `accepté` ou `signé`, une facture d'acompte (FACT-YYYY-NNN) est générée automatiquement (`pct = acompte_pct ?? 30%`, tva 20%, `statut = en_attente`, échéance +15 jours) ; dédup facturée si déjà existante pour ce devis
- Devis accepté → Facturation (Globale / Acompte / Situation)
- Modale responsive mobile

### 4️⃣ Bureau → Factures (`/bureau/factures`)
- Créer, changer statut, Relance (pénalités LME 40€)
- Mise en rouge auto si échéance dépassée
- Filtre et card **"En attente de règlement"** (factures `statut='en_attente'`, issues de la facturation auto ou saisie manuelle)
- Modale responsive mobile

### 5️⃣ Bureau → Fournisseurs (`/bureau/fournisseurs`)
- Créer fournisseur, Bons de Commande (PDF + signature double)

### 6️⃣ Bureau → Fin de Chantier / PV Réception (`/bureau/fin-chantier`)
- PV complet (zones, réserves, checklist, photos, notice entretien)
- PDF + double signature électronique

### 7️⃣ Bureau → Rapports d'Intempéries (`/bureau/rapports-intemperies`)
- Génération auto depuis Météo-France + PDF
- Numérotation `RI-AAAA-NNN`, lignes aussi créées automatiquement par la veille météo (`cree_par='auto'`)

### 8️⃣ Bureau → SAV (`/bureau/sav`) ⭐ MIS À JOUR

**Fiche SAV Détaillée (`/bureau/sav/[id]`)** :
- Formulaire complet (chantier, statut, garantie, sinistre, diagnostic, matériel...)
- **Section Photos & Signatures** :
  - Upload photo Avant / Après
  - **2 pads de signature distincts** (grid responsive 1→2 colonnes) :
    - **Visa du Technicien** (obligatoire pour clôturer)
    - **Signature du Client** (obligatoire pour clôturer)
  - Clôture bloquée si l'une des 2 signatures manque
- **Rapport SAV PDF** (responsive mobile) :
  - Layout fluide `w-full max-w-3xl` (plus de largeurs cm fixes)
  - Grille `grid-cols-1 sm:grid-cols-2`
  - Texte adaptatif `text-2xl md:text-4xl break-words`
  - Visa technicien : affiche la vraie signature capturée

### 9️⃣ Bureau → Catalogue (`/bureau/catalogue`)
- Créer / Modifier / Supprimer ouvrages. Utilisé dans Devis & Factures.

### 🔟 Bureau → Portails Clients (`/bureau/portails-clients`)
- Gestion Espaces Clients (code d'accès, URL unique)

### 1️⃣1️⃣ Bureau → Docs Compta (`/bureau/documents-compta`) ⭐ NOUVEAU
- Scan de Bons de Livraison / Tickets (pour la TVA), sans lien chantier pour l'instant (liste à plat)
- Sélection photo via appareil photo **ou** galerie/fichiers (pas de `capture` forcé)
- Saisie type (BL / Ticket), date, montant HT, taux TVA → calcul auto TVA/TTC affiché en direct
- **OCR auto (IA vision Gemini)** : au choix d'une photo, `/api/ia-ocr-ticket` lit le ticket (montant, TVA, date, fournisseur, catégorie) et **pré-remplit le formulaire** — badge "🤖 Rempli auto par IA" ; matching approximatif fournisseur + bouton "+ Créer « … »" (insert fournisseur client-side)
- Upload dans le bucket Storage `tickets`, table `documents_compta`
- Liste des documents enregistrés : clic sur une ligne → ouvre l'image en grand (nouvel onglet), bouton suppression séparé (`stopPropagation`)
- Route API dédiée `app/api/documents-compta/route.ts` (GET/POST/DELETE) via `supabaseAdmin`, POST acceptant aussi `file_url` (cas upload fait pour de l'IA), même pattern que Photos Chantier

### 1️⃣2️⃣ Bureau → Météo Chantiers (`/bureau/meteo`) ⭐ NOUVEAU
- Cartes météo par chantier en cours sur J → J+3 (Open-Meteo, géocodage Nominatim + fallback France)
- Badge rouge "Alerte intempérie aujourd'hui" / vert "Conditions OK"
- Boutons manuels : **"Vérifier intempéries du jour"** (POST `/api/meteo/intemperies`) et **"Notifier client"** (mailto)
- Détecte pluie >10 mm, vent >50 km/h, gel <0 °C ; déduplique par jour ; trace `avancements_chantier` (cases inchangées) + crée un justificatif `rapports_intemperies` visible côté client

---

## 🌐 ESPACE CLIENT (`/espace-client/[code_acces]`) ⭐ MIS À JOUR

- **Carte Avancement** :
  - `{avancement}%` issu de `avancements_chantier` (tri `created_at` DESC)
  - Barre de progression animée
  - **Frise 3 étapes dynamique** :
    - `0–15%` → 🔵 Préparation En cours
    - `16–85%` → ✅ Préparation + 🔵 Pose En cours
    - `86–100%` → ✅ Préparation + ✅ Pose + 🔵 Finitions En cours
- **Rapports hebdomadaires** : liste des rapports `statut='envoye'` (cron lundi + envoi manuel) avec photo couverture, delta d'avancement, aperçu imprimable/PDF (`RapportClientPrint`). **Le brouillon ne sort jamais** (double filtre côté API)
- **Intempéries & justificatifs** ⭐ : section dédiée (badges "Chantier à l'arrêt le … / Reprise prévue dès la fin des intempéries" ou "Intempérie signalée", n° de justificatif, motif Open-Meteo) — envoyables à l'assurance
- **Mes Documents** : Devis + Factures + Signature électronique
- **Chatbot IA** (Groq `openai/gpt-oss-20b`) flottant + résumé en arrière-plan
  - **Prompt sur données réelles** : le système charge l'avancement (%, cases/16), la date de fin, les devis, les factures et les arrêts intempéries des 14 derniers jours ; **plus aucun scénario "plaques HPL" hardcodé** ; règle "ne jamais inventer un retard/livraison" (réponse → le patron rappelle)
  - **Alerte "client mécontent"** : le résumé injecte aussi une notification bureau (type `client_alert`, cloche) quand le sentiment est négatif
  - **Mémoire multi-sessions A+B+C** (mission 13) : messages bruts persistés au fil de l'eau (`espace_client_append`) + `resume_global` multi-sessions (consolidation incrémentale bornée en tokens, `decouperParTokens`) + **note patron unique par chantier** (index unique `notes_patron.espace_client_id`) ; verrou advisory anti-consolidations concurrentes ; idempotence `deja_consolide` — voir section Mission 13
- Photos chantier (galerie bridée aux photos du chantier)

---

## 💰 MODULE FINANCE (`/(dashboard)/finance/*`)

### 1️⃣ Finance → Tableau de Bord
- KPIs, Rentabilité par chantier, Graphique CA, TVA, Trésorerie, URSSAF
- Rapport PDF mensuel + Export CSV

### 2️⃣ Finance → Saisie Pointage
- `pointages` table

### 3️⃣ Finance → Saisie Dépense
- `depenses_chantier` table

> **La Saisie Avancement a été SUPPRIMÉE du module Finance.**
> L'avancement est désormais géré dans l'onglet "Avancement" de chaque chantier (logique façades).

### 4️⃣ Finance → Historique
- 30 derniers pointages + dépenses, suppression possible

---

## ⚙️ PARAMÈTRES (`/parametres`)

- Raison sociale, SIRET, coordonnées, IBAN/BIC, mentions légales
- Assurance décennale, Médiateur, Seuil CA, Taux cotisations
- **Upload Logo** (bucket `photos` Supabase Storage)

---

## 🔌 API ROUTES

| Route | Rôle |
|---|---|
| `/api/meteo` | Météo Visual Crossing (lang=fr) + couvre `/api/meteo/intemperies` (public via startsWith) |
| `/api/meteo/intemperies` | Veille auto (POST : détecte intempéries, trace `avancements_chantier` + crée justificatifs `rapports_intemperies` `cree_par='auto'` ; GET : lecture des relevés) |
| `/api/cron/meteo` | Cron quotidien 6h → relance le POST intempéries (public, Hobby n'exécute pas les crons) |
| `/api/meteo-vigilance` | Alertes DPVigilance |
| `/api/transcrire-note` | Audio → Texte (Groq Whisper Large v3) |
| `/api/reformuler-note` | Reformulation IA (Groq `openai/gpt-oss-20b`) |
| `/api/ia-avancement` | Dictée vocale avancement façades (transcription + déduction des cases cochées) |
| `/api/ia-devis` | Génération lignes devis (Google Gemini `gemini-3.5-flash-lite` via Vercel AI SDK) |
| `/api/ia-securite` | Consignes PPSPS (Groq `openai/gpt-oss-20b`) |
| `/api/ia-ocr-ticket` | OCR tickets/BL (Gemini vision, `generateText` messages image+texte, upload `tickets/ia-ocr/` ou `image_url`) → JSON montant/TVA/date/fournisseur/catégorie |
| `/api/rapports-intemperies/generer` | Génération rapports (try/catch global → JSON 500) |
| `/api/chat-client` | Messagerie Espace Client — **prompt contextuel sur données réelles du chantier** (pas de scénario HPL inventé) |
| `/api/chat-client-summary` | Résumé conversation + **notification `client_alert` côté bureau si sentiment négatif** + note patron |
| `/api/espace-client/[code_acces]` | Données portail client (avancement réel, devis/factures/rapports `envoye` + **intempéries**) |
| `/api/espace-client/[code_acces]/signer` | Signature électronique devis/factures (vérification appartenance chantier) |
| `/api/finance-pin` | Sécurisation module Finance via PIN |
| `/api/documents-compta` | Scan BL/tickets — upload bucket `tickets` + table `documents_compta` (GET/POST/DELETE), POST accepte `file_url` |
| `/api/analyze-chantier` | Analyse santé chantier (logique métier BNA, pas d'IA externe) |
| `/api/scrape` | Scraping produits fournisseurs (Cheerio, extraction prix/dimensions) |
| `/api/search` | Recherche globale (clients, chantiers, devis, fournisseurs) |
| `/api/notifications` | Gestion notifications (GET/POST/PATCH) |
| `/api/photos-chantier` | Upload/Liste/Suppression photos chantier (bucket `chantiers-photos`) |
| `/api/rapports-client/generer` | Génération manuelle rapport hebdomadaire client |
| `/api/rapports-client/auto` | Cron hebdo (lundi 6h) — génère les rapports et les marque **`envoye` + `envoye_le`** (envoi auto, plus de brouillons), message patron rédigé automatiquement |

---

## 🎨 CHARTE GRAPHIQUE "DARK PREMIUM BNA" ⭐ NOUVEAU

- **Fond d'application** : `bg-[#0B0F19]`
- **Cartes et Modales** : `bg-[#1A1D24]` avec bordures `border-white/10`
- **Header Global** : Défile avec la page (position relative, z-index 9999) pour libérer l'espace visuel sur tous les onglets.
- **Onglets (Tabs) - "Pilule Rouge"** :
  - **Actif** : `bg-red-600 text-white font-medium rounded-full px-4 py-2 shadow-md`
  - **Inactif** : `bg-[#1A1D24]/80 text-gray-400 hover:text-white rounded-full border border-white/5`
- **Boutons principaux** : `bg-red-600 text-white hover:bg-red-700`
- *Règle stricte* : Éradication totale du bleu (`sky-500`, `blue-500`) remplacé par le rouge BNA et des gris neutres.

---

## 🔐 SÉCURITÉ — Session 27/08 → 31/08/2026

### 1️⃣ Authentification & Middleware

- **Supabase Auth** activée sur le dashboard interne : email/mot de passe, compte admin unique
- `middleware.ts` (racine) + `lib/supabase/middleware.ts` : bloque l'accès à toutes les routes sauf celles listées dans `PUBLIC_PATHS` :
  `/login`, `/espace-client`, `/api/espace-client`, `/api/chat-client`, `/api/chat-client-summary`, `/api/meteo` (+ `/api/meteo/intemperies` via `startsWith`), `/api/cron/meteo`, `/api/meteo-vigilance`, `/api/search`, `/api/notifications`, `/api/ia-devis`, `/api/reformuler-note`, `/api/transcrire-note`, `/api/ia-securite`, `/api/ia-avancement`, `/api/ia-ocr-ticket`, `/api/rapports-intemperies/generer`, `/api/rapports-client/auto`, `/api/scrape`, `/api/finance-pin`, `/api/photos-chantier`, `/api/analyze-chantier`, `/api/documents-compta`, `/api/chantiers-fournisseurs`, `/api/dashboard-patron`, `/manifest.json`, `/sw.js`
- `lib/supabase/client.ts` (navigateur) + `lib/supabase/server.ts` (serveur) via `@supabase/ssr`
- `lib/supabase.ts` migré de `createClient` (anon basique) vers `createBrowserClient` pour porter la session dans les pages qui font des appels directs Supabase côté navigateur
- Page `/login` avec gestion d'erreur réseau + auto-connexion si autofill (Bitwarden) remplit email+mot de passe d'un coup
- Déconnexion manuelle disponible dans le `Drawer` (menu burger en haut à gauche)
- **⚠️ Piège récurrent identifié** : toute route qui fait un appel serveur-à-serveur interne (`fetch` vers une autre route `/api/...` du même projet) doit être ajoutée à `PUBLIC_PATHS`, sinon le middleware la redirige vers `/login` (HTML au lieu de JSON) faute de cookie de session — déjà rencontré sur `/api/meteo-vigilance`, `manifest.json`, `sw.js`

### 2️⃣ RLS (Row Level Security) Supabase

- RLS verrouillée avec policy unique `acces_authentifie_uniquement` (`auth.uid() IS NOT NULL`) + GRANT `SELECT/INSERT/UPDATE/DELETE` au rôle `authenticated` sur l'ensemble des tables métier (dont `avancements_chantier`, `catalogue_ouvrages`, `chantiers`, `clients`, `commandes`, `depenses_chantier`, `devis`, `entreprise_settings`, `factures`, `frais_interim`, `pointages`, `pointages_globaux`, `rapports_intemperies`, `lignes_commande`, `photos_chantier`, `articles`, `catalogue_temps`, `equipe`, `situations`, `vigilance_captures`, etc.)
- **GRANT `service_role`** ajouté sur toutes les tables du schema public — trou identifié tardivement (`avancements_chantier` notamment causait un `permission denied` silencieux malgré l'usage de `supabaseAdmin`)
- **Buckets Storage** : policies de listing public retirées sur `sav_photos`, `tickets`, `photos` (`getPublicUrl()` continue de fonctionner, seul le listing complet du dossier est bloqué)
- **Suppression en cascade** (`ON DELETE CASCADE`) activée entre `chantiers` et ses 17 tables liées — supprimer un chantier de test nettoie automatiquement tout son historique (⚠️ irréversible, à garder en tête sur un vrai chantier client)
- Tables orphelines identifiées (non référencées dans le code actuel, sécurisées par précaution mais pas branchées) : `articles`, `catalogue_temps`, `situations`, `vigilance_captures`, bucket `tickets`

### 3️⃣ PIN Module Finance

- Écran de verrouillage `FinancePinGate` devant `app/(dashboard)/finance/*` — code à 6 chiffres vérifié côté serveur (`app/api/finance-pin/route.ts`, variable d'env `FINANCE_PIN`)
- Persistance via `sessionStorage`, bouton "Verrouiller" manuel (`FinanceLockButton`)
- **Reverrouillage automatique après 15 min d'inactivité** dans le module Finance

### 4️⃣ Session — Déconnexion automatique globale

- `components/InactivityLogout.tsx` : déconnexion Supabase réelle + retour `/login` après 15 min sans interaction (toucher/clic/scroll/clavier), sur tout le dashboard interne (exclut `/login`, `/espace-client`, `/demo-client`)

### 5️⃣ PWA — Installation mobile

- `public/manifest.json` + `public/sw.js` (service worker minimal, sans cache offline) + `components/RegisterSW.tsx`
- Icônes `icon-192.png` / `icon-512.png` (tailles exactes requises par Chrome, générées via ImageMagick depuis `logo-bna.png`)
- App installable depuis Chrome mobile (menu ⋮ → Installer l'application), icône BNA sur l'écran d'accueil, ouverture plein écran

### 🐛 Bugs majeurs corrigés durant cette session

| Bug | Cause | Fix |
|---|---|---|
| Chat espace client 502 sur Groq | Guillemets littéraux dans `GROQ_MODEL` (env Vercel) | Retrait des guillemets |
| Avancement chantier toujours 0% côté espace client | `service_role` sans GRANT sur `avancements_chantier` | GRANT ajouté sur toutes les tables |
| Frais Agence Intérim invisible côté finance | `hooks/useFinance.ts` ne lit jamais `frais_interim` | Insertion miroir dans `depenses_chantier` |
| Génération rapport intempéries plantait ("Unexpected token '<'") | Appel interne `/api/meteo-vigilance` bloqué par le middleware | Route ajoutée à `PUBLIC_PATHS` |
| PWA non installable (fallback "Créer un raccourci") | `manifest.json`/`sw.js` bloqués par le middleware + icônes en 500×500 (pas 192/512 exact) | Routes exemptées + icônes régénérées aux bonnes tailles |

---

## 🎨 STANDARD MODALES MOBILES

Template unifié appliqué sur toutes les modales (Nouveau Client, Nouvelle Facture, Nouveau Chantier, Nouvelle Fiche Technique) :

```jsx
// Overlay — pt-48 et z-[210] pour s'assurer que la modale passe au-dessus du header
<div className="fixed inset-0 z-[210] pt-48 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
  // Conteneur flex colonne - Charte Dark Premium
  <div className="bg-[#1A1D24] border border-white/10 w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl shadow-2xl">
    // Header statique
    <div className="p-4 border-b border-white/10 shrink-0">...</div>
    // Formulaire scrollable
    <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">...</div>
// Footer statique
    <div className="p-4 border-t border-white/10 flex justify-end gap-3 mt-auto shrink-0 bg-[#1A1D24] rounded-b-xl z-10">...</div>
  </div>
</div>
```

---

## 🤖 FONCTIONNALITÉS IA & OUTILS AVANCÉS — Session 31/08/2026

### 1️⃣ Métré IA (`/terrain/metre-ia`)
- **Outil de photogrammétrie sur mobile** (HTML5 Canvas)
- **3 Modes** :
  - `Étalonnage` : Tracé d'un trait de référence (au doigt/souris) + saisie de la dimension réelle (mètres). Calcule dynamiquement le ratio pixels/mètre.
  - `Façades` (Addition) : Dessin de polygones libres par tapotements (fermeture auto ou manuelle). Calcule la surface brute selon le théorème de Gauss (Shoelace formula).
  - `Vides` (Déduction) : Dessin de polygones libres pour déduire les fenêtres/portes.
- **Résultat temps réel** : Surface Nette à poser calculée instantanément pendant le dessin.
- Accessibilité : "Accès Rapides" depuis le Bureau + Menu Navigation `SubNav` de la section Terrain.

### 2️⃣ Devis IA Vocal (`/bureau/devis-factures`)
- **Reconnaissance Vocale (Web Speech API)** intégrée au champ "Générer avec l'IA" dans les Devis.
- Utilise le micro natif du navigateur (`SpeechRecognition`).
- **Anticipation de bugs mobile** :
  - Bouton désactivé pendant l'écoute (évite le double-tap qui déclenche un plantage `aborted` sur Chrome Android).
  - Gestion claire des erreurs d'autorisation (cadenas URL) via un message explicite `event.error`.
- Traitement de l'audio transcrit envoyé au backend `/api/ia-devis` (Gemini via Vercel AI SDK) pour créer une ligne de devis structurée.

### 3️⃣ Import Bookmarklet (Passe-muraille Sécurité)
- Contournement des sécurités Cloudflare / Datadome de fournisseurs (Leroy Merlin, Point.P, Castorama) par un script exécuté côté client.
- Injection de `?importUrl=...&importTitle=...&importPrice=...` dans `/bureau/catalogue`.
- Le `useEffect` intercepte ces paramètres, parse le titre pour extraire les dimensions L x l x Ep (calcul en mm) et ouvre le formulaire pré-rempli.

---

### Migration & Sécurisation de l'API IA (01 Septembre)
- **Migration vers Anthropic (Claude 3.5 Sonnet)** : Suite à une forte instabilité de l'API Groq (limites TPM trop basses, décommissionnement imprévisible des modèles), le backend d'intelligence artificielle (`app/api/ia-devis/route.ts`) a été entièrement réécrit pour se connecter à l'API d'Anthropic.
- **Résolution du Double-Read de Stream** : Correction d'un bug bloquant (`Body has already been read`) qui faisait planter l'API lors de l'interception d'une erreur (le buffer n'est désormais lu qu'une seule fois).
- **Optimisation du Context Window** : La taille du payload envoyé à l'IA a été drastiquement réduite : les descriptions de produits ne sont plus injectées, et le nombre maximal d'articles de contexte a été plafonné à 15 (sélectionnés par pertinence de mots-clés) pour garantir un chiffrage rapide sans exploser les limites.
- **Pivot vers Vercel AI SDK & Gemini 1.5 Pro (01 Septembre)** : Remplacement définitif de l'API Anthropic et Groq par le SDK officiel de Vercel (`@ai-sdk/google`) couplé à Gemini 1.5 Pro. La logique de parsing strict (Chain of Thought + Tableau final) et les règles de calcul DTU sont préservées, offrant ainsi une architecture d'entreprise robuste, native à Next.js, et insensible aux changements brusques de modèles des petits providers.

### Unification du modèle IA (10 Septembre)
- **Remplacement de `groq/compound-mini` par `openai/gpt-oss-20b`** : Les 2 routes utilisaient encore `compound-mini` ( obsolète) ont été migrées vers `openai/gpt-oss-20b` pour unifier tout le dashboard sur un seul modèle LLM.
  - `app/api/ia-securite/route.ts` : Sécurité chantier (checklist PPSPS)
  - `app/api/reformuler-note/route.ts` : Reformulation notes vocales
- **État actuel de la stack IA** :
  - `openai/gpt-oss-20b` (via Groq) — chat client, résumé conversations, sécurité, reformulation
  - `whisper-large-v3` (via Groq) — transcription audio (notes vocales)
  - `gemini-3.5-flash-lite` (via Google `@ai-sdk/google`) — génération de devis

### Synchronisation Dashboard Pro / Portail Client (01 Septembre)
- **Nettoyage UI Mobile** : Suppression du double "header" noir (`<header>` redondant dans `page.tsx`) et nettoyage des règles CSS forcées qui cassaient la mise en page sous l'enveloppe du Layout principal (`app/layout.tsx`).
- **Date de fin estimée dynamique** : Correction de la date "15 déc. 2024" qui était écrite en dur. Le code lit désormais `date_fin_estimee` dans la table `chantiers` (via API). S'il n'y a pas de date ou si la date est dépassée, un fallback intelligent (`"Date à redéfinir"`) ou recalculé (`created_at + 2 mois`) s'affiche via `toLocaleDateString`.
- **Refonte logique d'Avancement (Tâches & Façades)** :
  - **Unification du calcul** : Le pourcentage global n'est plus une simple donnée copiée (risquant des désynchronisations) mais est désormais calculé dynamiquement *à la volée* côté client (`(Total tâches cochées / Total tâches globales) * 100`) en se basant strictement sur le JSON détaillé de l'avancement.
  - **API enrichie** : Ajout du champ JSON `details` dans la sélection Supabase de l'API `/api/espace-client/[code_acces]/route.ts`.
  - **Badges d'avancement dynamiques** : Le portail client affiche maintenant une grille dynamique (`grid-cols-2`) pour les 4 façades, basculant entre "Terminée" (vert), "En cours" (orange) et "À commencer" (gris) en fonction du nombre précis de sous-tâches validées pour chaque façade.
  - **Correction des Observations** : Résolution du bug qui vidait la zone de texte du commentaire/observation lors de l'enregistrement de l'avancement sur le dashboard pro. Ajout de l'extraction de la colonne `commentaire` depuis la base de données (`fetchAvancement` dans `AvancementFacades.tsx`) afin que la dernière note saisie se recharge correctement au démarrage du composant.

### Nouvelle section Bureau — Docs Compta (02 Septembre)
- **Objectif** : scanner les Bons de Livraison et tickets de caisse pour faciliter le suivi TVA/comptabilité, sans dépendre d'un lien à un chantier ou une commande précise (liste à plat pour l'instant).
- **Nouvelle table** `documents_compta` (RLS + GRANT `authenticated`/`service_role`, même politique `acces_authentifie_uniquement` que le reste du dashboard).
- **Nouvel onglet** dans `BureauNav.tsx` ("Docs Compta", icône `Receipt`), nouvelle page `app/bureau/documents-compta/page.tsx` sur le modèle de Photos Chantier.
- **Calcul TVA en direct** à la saisie (HT → TVA → TTC affichés instantanément avant l'envoi).
- **Sélection photo** : retrait de l'attribut `capture="environment"` pour laisser le sélecteur natif proposer Appareil photo **et** Galerie/Fichiers (utile pour les tickets déjà dématérialisés, ex: reçus par email).
- **Consultation** : clic sur une ligne de la liste ouvre l'image en grand dans un nouvel onglet ; le bouton de suppression utilise `stopPropagation()` pour ne pas déclencher l'ouverture en même temps.

---

## 🚀 MISSIONS LOGICIELLES RÉCENTES (08 → 16/09/2026)

> Chaque mission : validée par l'utilisateur, livrée, `npx tsc --noEmit` à 0 erreur, commit + push Git.

| Mission | Commit | Fonctionnalité |
|---|---|---|
| 08 — Analyse | `f7da883` | `ANALYSE_PROCHAINES_FONCTIONS.md` : 3 propositions retenues par l'utilisateur (facturation auto, veille météo intempéries, OCR BL/tickets) |
| 09 — Facturation auto | `a6dfe14` | Devis accepté/signé → facture d'acompte auto (voir Bureau Devis/Factures) |
| 10 — Veille météo intempéries | `6b5e150` | `/api/meteo/intemperies`, cron `/api/cron/meteo`, page `/bureau/meteo`, nav "Météo Chantiers" |
| 11 — OCR BL/tickets | `46c9cb7` | `/api/ia-ocr-ticket` (Gemini vision) + pré-remplissage auto dans Docs Compta |
| 12 — Espace client | `d0e954b` | Rapports hebdo envoyés auto, justificatifs intempéries visibles, **fix chat HPL** (prompt données réelles), alerte "client mécontent" → notifications |
| 13 — Chat mémoire multi-sessions | `f71cf3f` | Mémoire multi-sessions A+B+C, note unique par chantier, consolidation incrémentale + budget tokens, idempotence, anti-concurrence — détails + validation réelle ci-après |
| 14 — Scraping Web & Catalogue | `da0a6d4` | Ajout des colonnes `designation_devis`, `code_ral`. Scraper URL web auto-extracteur des DTU, normes, ACERMI et mapping RAL. |
| 15 — Calepinage (DTU 41.2/45.4) | `47d80bf` | Module de calcul auto des mètres linéaires (chevrons entraxe 60cm max) et équerres (entraxe 1.20m max) avec ancrages. Connecté au moteur IA. |
| 16 — Fiabilisation Devis IA | `6cd4288` | Option B: Verrouillage strict de l'unité de main-d'œuvre ITE/Bardage en `m²` et injection automatique des textes réglementaires de devis. |
| 17 — Factures d'Acompte (Loi FR) | `d954588` | Respect strict de la loi anti-fraude à la TVA : numérotation propre, calcul TVA immédiat, déduction automatique en ligne négative (qte: -1) sur la facture de solde. |
| 18 — Reste à Charge (Aides Anah) | `de869ae` | Intégration du profil MaPrimeRénov' (Bleu, Jaune, Violet, Rose) + forfait CEE. Calcul du reste à charge net plafonné à l'assiette légale des travaux éligibles (150 €/m²). |

### 🚀 Mission 13 — Chat Espace Client : mémoire multi-sessions (11/09/2026)

> **Commit** : `f71cf3f` (feature) + commits attachés `67bd396`, `4c83db1`, `c252d58`.
> **Migration** : `supabase/migrations/20260912_espace_client_conversations.sql` — **appliquée en production** puis vérifiée en lecture seule (table, colonne `notes_patron.espace_client_id`, fonctions RPC `espace_client_append` / `espace_client_consolider` présentes).

**Design A+B+C (validé)**
- **A — Niveau 1 (mémoire brute)** : les messages de la session sont persistés au fil de l'eau dans `espace_client_conversations.messages_session` via la RPC `espace_client_append()`.
- **B — Niveau 2 (condensation)** : à la clôture, le LLM (Groq) condense en `resume_session` (par session, append-only dans `resumes_sessions`) + `resume_global` (mémoire multi-sessions consolidée).
- **C — Note patron unique** : 1 note « Résumé Espace Web » par chantier (`espace_client_id` = clé de conversation, index unique), fusion de l'historique legacy « Résumé Espace Web », `epingle=true`.

**Points clés de l'implémentation**
- **Budget tokens** : `SEUIL_TOKENS_SESSION` + `decouperParTokens()` dans `lib/espace-chat-utils.ts` — le LLM ne reçoit jamais l'historique complet, seulement `resume_global` + session courante ; découpage séquentiel si dépassement.
- **Consolidations concurrentes** : verrou advisory par clé (md5 de la clé) + `espace_client_consolider()` ne vide `messages_session` **que si** la taille n'a pas grandi pendant le calcul → aucun message perdu si un append arrive pendant la génération.
- **Idempotence** : double clôture d'une même session → `status: deja_consolide` (pas de résumé ni de note en double).
- **Conversation banale** : bonjour/au revoir court sans question → statut `ras`, pas d'appel LLM, mémoire brute purgée.

**Tests**
- Unitaires `__tests__/espace-chat-utils.test.ts` : estimation tokens, découpage par budget, état initial.
- Intégration simulée `__tests__/espace-chat-circuit.test.ts` : circuit complet chat → persistance → clôture → consolidation → note unique, idempotence, RAS, panne Groq, mémoire fusionnée entre sessions.
- Schéma `__tests__/espace-client-migration.test.ts` : table, index unique, colonne, fonctions RPC.

**Validation réelle (Vercel → Groq + Supabase, 11/09/2026)**
- ✅ **Échange Groq réel** en production (HTTP 200, modèle de prod).
- ✅ **Persistance prouvée** : clôture appelée **sans** messages dans le corps de requête → le résumé a été produit depuis `messages_session` en BDD.
- ✅ **Consolidation + mémoire multi-sessions** : `sessions` 1 → 2, résumé de session 2 = mémoire de la session 1 **fusionnée** (avancement s1 + façade s2).
- ✅ **Idempotence** : double clôture s1 et s2 → `deja_consolide`.
- ✅ **Réouverture du même chantier** (même clé, nouvelle session) puis fusion avec la mémoire précédente.
- ✅ **Nettoyage des données de test effectué et vérifié** : suppression de la conversation et de la note `demo:CLIENT_TEST_E2E_JD`, contrôles SQL Editor à **0 ligne** (résultat collé par l'utilisateur), contre-vérification lecture seule cohérente.

**Ce qui a été validé réellement** : chat réel (Groq prod), persistance BDD, consolidation, mémoire multi-sessions + fusion, idempotence, migration appliquée, nettoyage complet.

**Limites connues (assumé, non automatisable en lecture seule)**
- La **note patron** n'est pas lisible par la clé anon (RLS patron) → contenu vérifié **visuellement par l'utilisateur** + contenu déterministe (fonction pure `composerNote`).
- Test réalisé en **mode démo** (clé `demo:*`, sans `chantierId`) — la base prod est encore quasi vide (pre-launch, `chantiers = 0`) ; le circuit via un vrai chantier reste à valider au premier usage réel.
- **Incohérence latente signalée** : la migration `20260906_notifications.sql` contraint `type IN ('devis','facture','sav','chat','chantier','rapport','general')` alors que la prod contient `commande_retard` et que le résumé envoie `client_alert` → **à arbitrer avant tout `supabase db push`**.

### ⚠️ Points d'attention en cours

- **Crons Vercel** (rapports auto lundi 6h + météo quotidienne) : fonctionnent uniquement sur le **plan Pro** de Vercel. En Hobby, boutons de déclenchement manuel (page Météo, `/api/rapports-client/auto`) avec `Authorization: Bearer <CRON_SECRET>`.
- **Migration `parametres_entreprise`** : à appliquer dans l'éditeur SQL Supabase (mission 07) — non confirmée.
- **`lib/supabaseAdmin.ts`** : `NEXT_PUBLIC_SUPABASE_URL` non défini au moment du `next build` (pré-existant) → le build de vérif locale échoue ; on s'appuie sur `npx tsc --noEmit` comme gate. `.env.local` contient bien les clés.
- **Fallbacks esthétiques du portail client** encore présents (si aucune donnée) : "Villa Arcachon", "33380 Arcachon", `BNA-7429`, badge "★ CLIENT PREMIUM", téléphone WhatsApp `33600000000` — à repasser pour supprimer les valeurs d'exemple.

### Mission 16 : Numérotation Sécurisée des Intempéries (RPC SQL)
- **Objectif** : Empêcher les doublons de justificatifs météo lors des exécutions simultanées du Cron Vercel.
- **Réalisation** : Création d'une fonction PostgreSQL PL/pgSQL (`generer_prochain_numero_ri`) utilisant un verrouillage `SHARE ROW EXCLUSIVE MODE`. Suppression de la logique front/API au profit d'un simple appel RPC robuste.

### Mission 17 : Générateur de Bon de Commande Quincaillerie (DTU)
- **Objectif** : Créer automatiquement un bon de commande de fixations depuis le calepinage.
- **Réalisation** : Bouton ajouté dans le métré d'un chantier. Calcule les ml de chevrons, le nombre d'équerres et vis via `calculerBesoinsBardage` et pré-remplit le `CommandeModal` avec affectation dynamique des fournisseurs et des prix.

### Mission 18 : Planning de Gantt Interactif (Terrain)
- **Objectif** : Vue macro des chantiers pour le pilotage.
- **Réalisation** : Création de `PlanningGantt.tsx`. Vue sur 6 mois avec Drag & Drop tactile (Pointer Events) pour décaler les dates d'un chantier. Indicateurs visuels (Aujourd'hui, couleurs de statuts, bordure rouge + icône d'alerte si arrêt météo actif).

## 🔔 Notifications — modèle collectif O3-B6/N1, et correction d'impact (26/09/2026)

**Migration appliquée le 26/09/2026** : `supabase/migrations/20260926_o3b6_notifications_collectif.sql` (O3-B6/N1) — remplace les 4 policies `notifications_ent_*` par un filtrage `entreprise_id = public.entreprise_courante()` seul. Modèle **collectif par tenant** : ni pont `profiles.user_id`, ni table d'état de lecture par utilisateur, ni nouvelle architecture d'identité.

**Contrôle après application** (lecture seule) : les commentaires `O3-B6/N1` sont bien présents en base sur la table et sur `destinataire_id` (le script a donc tourné jusqu'au bout) ; le RLS est actif — le rôle `anon` sans JWT voit **0 des 3** lignes existantes ; les 3 notifications en base sont **toutes collectives** (`destinataire_id = null`), donc l'élargissement du prédicat n'expose aucune donnée supplémentaire et n'introduit aucune régression.

### ⚠️ Correction d'impact — à lire avant de citer le commit `5249fc9`

Le message de ce commit décrit les notifications `client_alert` comme **« écrites puis invisibles de tous »**. Cette formulation est **trop affirmative**. Trois niveaux doivent être distingués :

1. **Défaut structurel — DÉMONTRÉ.** `notifications.destinataire_id` référence `profiles(id)` ; `profiles.id` est un uuid autonome, sans colonne `user_id`, et le schéma ne contient **aucun pont vers `auth.users`** (les 3 autres colonnes nommées `user_id` pointent toutes vers `profiles`). La clause `destinataire_id = auth.uid()` de l'ancienne policy était donc **structurellement invalide** : aucun code applicatif ne pouvait la rendre vraie. C'est une **preuve**, pas une hypothèse.
2. **Risque fonctionnel — THÉORIQUE.** *Si* une `client_alert` ciblée avait été produite, l'ancienne policy `using (entreprise_id = entreprise_courante() and (destinataire_id is null or destinataire_id = auth.uid()))` l'aurait rendue invisible à tout lecteur. La migration supprime cette exposition. L'élargissement reste **borné au tenant** : `entreprise_id` et le RLS sont intacts.
3. **Fait observé — 26/09/2026.** **Aucune ligne `client_alert` n'a jamais été produite en PROD** : comptage exhaustif = 3 lignes au total, de types `general` et `commande_retard` uniquement. Le `CHECK` n'est pas en cause (`20260916_fix_notifications_constraints.sql` autorise bien les 9 types, `client_alert` inclus). Le module a bien tourné — `notes_patron` contient les notes du 07/09 (« C'est bon, tout est bon… ») et du 10/09 — mais `client_alert` n'est produite **que** si le sentiment global est négatif **ou** s'il existe une demande en attente, ce qui n'était le cas ni le 07/09 ni le 10/09. **Aucune perte réelle d'une `client_alert` n'est donc démontrée** : la migration corrige un défaut réel, mais **préventif** — elle n'a pas, à ce jour, rétabli la visibilité d'une notification existante.

### Où la formulation forte subsiste — volontairement

Le commentaire d'en-tête de la migration (l.29-33) et le message du commit `5249fc9` conservent la formulation affirmative. **Ils ne sont pas corrigés ici**, pour deux raisons : le commit est immuable sans *amend* suivi d'un *force-push* (hors méthode retenue), et le fichier de migration est **déjà appliqué en base** — le modifier créerait une divergence entre le dépôt et la PROD. **La présente section fait foi.**

### Autres points O3-B6notifications (26/09/2026)

- **N9 (P1) — l'alerte « Livraison en retard » était morte depuis 4 jours.** Le producteur navigateur insérait sans `entreprise_id` (NOT NULL depuis la migration d'isolation du 22/09) et sans déstructurer `error` : échec `23502` totalement muet. Corrigé via `resoudreContexteEntreprise(null)` (le résolveur **existant**, même source de vérité que `entreprise_courante()`), fail-closed si le claim est absent, déduplication scopée par `.eq("entreprise_id")`, erreurs de lecture et d'insert explicites. Le cast `as TablesInsert<"notifications">` a été supprimé : il masquait l'erreur de compilation, donc `tsc` exige désormais réellement `entreprise_id`.
- **N2/N3 — `/api/notifications` supprimée** : 0 appelant sur tout l'historique (`git log --all -S`, 5 commits, doc et liste blanche middleware uniquement). Elle avait été **publique 12 jours** avant reverrouillage, toujours sans appelant. Son entrée dans la liste blanche de `middleware.test.ts` est **conservée** : garde-fou anti-remise en liste blanche.
- **SearchNav — Rules of Hooks.** Le `if (isClientPage) return null;` précédait les deux `useEffect` : le nombre de hooks dépendait de `pathname`. Un retour navigateur depuis `/espace-client` vers `/bureau` faisait lever « Rendered fewer hooks than expected » et cassait la page. Ni ESLint ni aucun test ne le voyait. Garde déplacée dans les effets, `return null` après le dernier hook ; aucun élément visuel modifié.
- **Impact espace client / chatbot : AUCUN.** `lib/espace-chat-summary.server.ts` intact ; ses écritures passent par `service_role`, donc insensibles au changement de RLS ; `SearchNav` n'est pas rendu sur `/espace-client` (désormais prouvé par test).
- **Réalisation** : Création de `PlanningGantt.tsx`. Vue sur 6 mois avec Drag & Drop tactile (Pointer Events) pour décaler les dates d'un chantier. Indicateurs visuels (Aujourd'hui, couleurs de statuts, bordure rouge + icône d'alerte si arrêt météo actif).

---

## État au 30/09/2026 — Corrections issues de l'audit complet

Cette section ne refait pas l'audit : elle consigne l'état **réel** du dépôt après une passe de corrections portant sur les points **B1, B2, B3, C1, C3, E13, E14**. Elle s'ajoute au contenu fonctionnel ci-dessus, qui décrit l'architecture et les pages et n'a pas été refondu.

### Corrections appliquées

**B1 — RPC `lier_deplacement_devis` durcie.**

*Défaut.* `public.lier_deplacement_devis(p_deplacement_id, p_devis_id, p_entreprise_id)` était `SECURITY DEFINER` **et** paramétrée par le tenant fourni par l'appelant. `CREATE FUNCTION` accorde `EXECUTE` à `PUBLIC` par défaut et PostgREST expose le schéma `public` : un utilisateur authentifié pouvait appeler directement la RPC avec un `p_entreprise_id` appartenant à un autre tenant. Les policies RLS de `frais_deplacement` sont `auth.role() = 'authenticated'` **sans filtre `entreprise_id`** : rien ne bloquait l'appel.

*Correctif.* Décomposition suivant la convention **déjà utilisée par le dépôt** (`generer_prochain_numero_{ri,sav,sit,avenant}`) :

- `lier_deplacement_devis_ctx(p_deplacement_id, p_devis_id, p_entreprise_id)` — implémentation interne, tenant explicite, `EXECUTE` réservé au `service_role` ;
- `lier_deplacement_devis(p_deplacement_id, p_devis_id)` — wrapper public **sans aucun paramètre tenant**, qui résout `public.entreprise_courante()` (GUC `app.entreprise_id`, sinon claim JWT `app_metadata.entreprise_id`) et **échoue fermé** si le contexte est absent.

**L'ancienne signature à 3 arguments est `DROPée`, et pas seulement `REVOKE`ée** : PostgREST résout par (nom, nombre d'arguments), une surcharge restante demeurerait une surface d'élévation que le moindre `GRANT` futur rouvrirait par accident.

Le **corps métier est inchangé** : les deux verrous `FOR UPDATE`, le contrôle de chantier partagé entre le devis et le déplacement, le recalcul atomique des totaux du devis et la mise à jour du déplacement sont conservés à l'identique.

* Côté application, `app/api/deplacements/[id]/lier/route.ts` appelle désormais la RPC **en 2 arguments**, via le client **porté par la session** (`createClient()`, cookies, clé `anon`) et non via `supabaseAdmin`. C'est indispensable : `entreprise_courante()` lit le claim du JWT de l'appelant, absent du JWT `service_role` ; en `service_role` la RPC tournerait sans contexte et échouerait fermée.

*Vérification.* Un seul appel applicatif à la RPC dans tout le dépôt, en 2 arguments ; `p_entreprise_id` n'est plus transmis à cette RPC nulle part ; `lier_deplacement_devis_ctx` n'est appelée par aucun code.

**B2 — `devis_id` n'est plus modifiable par `PATCH`.**

Le bloc `if (body.devis_id !== undefined)` a été retiré de `app/api/deplacements/[id]/route.ts`. Le corps de mise à jour est désormais une **liste blanche** : `statut` (validé contre `prevu | effectue | annule`) et `updated_at`, typé `Database["public"]["Tables"]["frais_deplacement"]["Update"]`.

Le rattachement à un devis passe **exclusivement** par `POST /api/deplacements/[id]/lier` et la RPC : seule voie qui vérifie que le devis et le déplacement partagent le même chantier, verrouille les deux lignes et recalcule atomiquement les totaux. Accepter `devis_id` par `PATCH` aurait permis de lier un devis d'un **autre chantier** sans mettre à jour le devis.

*Vérification.* Aucun client de l'application n'émet de `PATCH` sur cette route.

**C1 — `search_path` des fonctions `SECURITY DEFINER`.**

*Inventaire préalable* (exigence de ne rien modifier sans vérification) : **26 fonctions `SECURITY DEFINER`** dans `supabase/migrations` — dont **8 portaient déjà** `set search_path = public`, **7 sont superseded** par un `create or replace` ultérieur, et **11 sont vivantes sans `search_path`** : ce sont les seules traitées.

*Méthode.* `alter function … set search_path = public`, et **non** `create or replace`. Retranscrire les 11 corps dans une migration serait une source de dérive silencieuse ; l'`ALTER` est une opération de **catalogue** — il ne lit ni ne réécrit le corps de la fonction, le risque de transcription est nul.

*Contrôle de sûreté, fonction par fonction.* Chaque référence du corps a été classée : **0 alerte**. Dans ces 11 corps, toute référence non qualifiée est soit une fonction ou un type de `pg_catalog` (toujours implicitement en tête du `search_path`), soit un objet de `public` (table ou fonction présente dans `types/supabase.ts`). Aucun appel à une extension hors de `public`, aucune table d'un autre schéma écrite sans qualification, aucun type composite d'un autre schéma. Fixer le `search_path` ne peut donc rien faire échouer.

*Robustesse — sélection par `oid`.* Le traitement est une boucle de catalogue alimentée par `select p.oid, n.nspname from pg_proc p join pg_namespace n on n.oid = p.pronamespace`, filtrée par `nspname = 'public'`, `proname = any (array[…])` et `p.prosecdef` (une fonction `SECURITY INVOKER` n'exécute rien avec des droits-CoPI : le `search_path` n'y est pas un vecteur). L'`ALTER` est construit par `format('alter function %I.%s set search_path = public', r.nspname, r.oid::regprocedure::text)`. **Aucune signature n'est écrite à la main** : ce sont les OID qui sont les cibles, et `regprocedure` restitue la signature exacte, correctement échappée — aucune désynchronisation possible entre la cible testée et la cible modifiée. La boucle couvre **toutes les surcharges** d'un nom, donc aucune ne peut être omise par un oubli dans une liste. Chaque fonction traitée émet un `raise notice` : un no-op devient visible dans la sortie du SQL Editor au lieu d'être silencieux.

*Défaut corrigé dans cette migration.* Une première version comparait `pg_get_function_identity_arguments()` à une liste de signatures littérales. Cette fonction restitue la signature **avec les noms de paramètres** — pour `generer_prochain_numero_ri(p_entreprise_id uuid)` elle renvoie `p_entreprise_id uuid`, et non `uuid`. Une garde comparant l'identité à la chaîne `uuid` n'était donc satisfaite que pour les fonctions **sans** argument, et laissait passer silencieusement les autres : la migration réussissait en n'ayant corrigé qu'une fraction de ses cibles, **sans lever la moindre erreur**, puisque « fonction absente » et « cible non retenue » sont indiscernables dans ce code. La sélection par `oid` supprime le risque.

*L'idempotence.* Portée par le filtre `coalesce(p.proconfig, '{}'::text[]) is distinct from array['search_path=public']` — et non par un test d'existence. Une fonction déjà corrigée est simplement sautée ; une fonction absente n'apparaît pas dans le jeu de résultats et son corps de boucle n'est jamais atteint. **Aucun `ALTER` nu n'est exécuté**, donc le lot ne peut pas échouer sur *function does not exist* sur une base où certaines fonctions n'ont jamais été créées — ce qui importait, plusieurs migrations du dépôt portant la mention « NON EXÉCUTÉ ».

**C3 — typage Supabase de `frais_deplacement` et des RPC.**

Ajout dans `types/supabase.ts` du bloc complet `frais_deplacement` (`Row` / `Insert` / `Update` / `Relationships`), inséré entre `fiches_techniques` et `fournisseurs` (rang 22, ordre alphabétique), ainsi que des `Args` / `Returns` de `lier_deplacement_devis` (2 arguments) et `lier_deplacement_devis_ctx` (3 arguments).

**Nettoyage des `any` — 28 → 0 en production.**

Aucun `any` n'a été remplacé par `unknown`, par `object`, par une interface inventée ou par un cast arbitraire : chaque occurrence a été résolue par le type réel du projet (types Supabase générés, types métier existants).

- `devis.lignes` est un `Json`. Le `as any` de `lib/mainOeuvreAnalytique.ts` a été remplacé par **`mapperLignesPersistees`** (`lib/devisAnalyse.ts`), mappeur **sûr déjà utilisé** par le projet vers `LigneDevis`, sans cast. Effet de bord favorable : il écarte les entrées `null` qui faisaient lever `ligne.catalogue_id` sur `null`.
- `lib/fournisseursAnalytique.ts` : les 4 paramètres `any[]` deviennent `Tables<"fournisseurs">[]`, `Tables<"commandes">[]`, `Tables<"devis">[]`, `Tables<"catalogue_ouvrages">[]`.
- `app/(dashboard)/finance/components/RentabiliteMainOeuvreWidget.tsx` : le type d'état annonçait `nom: string` alors que la colonne est `string | null` — c'est ce **mensonge de type** qui imposait le `as any`. L'état est corrigé ; le rendu (`{c.nom}`) affiche `null` comme un nœud vide, **comportement visible inchangé**.
- `app/api/meteo/intemperies/route.ts` : `(p: any)` → `VigilancePhenomene`, type déjà exporté par `lib/meteoVigilance`.
- `catch (err: any)` de `components/SignatureModal.tsx`, `hooks/useDeplacements.ts` et `app/api/deplacements/[id]/lier/route.ts` : passés en `unknown` avec un repli explicite. Ces branches étaient **muettes** — sur une valeur qui n'est pas une `Error`, `err.message` vaut `undefined` et l'UI affichait un message vide au lieu du motif réel.

**Les 19 `any` restants sont tous dans `__tests__/`** et sont **conservés** : ils servent de casting sur des `vi.fn()` et des mocks, où ils sont idiomatiques.

**B3 — conventions UI rétablies dans `components/FraisDeplacementTab.tsx`.**

- **5 monetary conversions** vers `fmtEuro` (`lib/financeCalculs`) : `tarifKm`, `montantHt`, `totalHT`, `tarif_km`, `montant_ht`.
- **2 surfaces littérales** `<div className="bg-[#1A1D24] border border-white/10 rounded-xl …">` converties en `<Surface className="…">`, composant qui émet exactement ces classes.

Aucun élément d'UI n'a été refait. **Effet de bord assumé** : `fmtEuro` produit la virgule décimale française et une **espace insécable U+00A0** avant le `€` — l'affichage passe donc de `12.50 €` à `12,50 €`. C'est le comportement voulu par la charte ; les assertions de `__tests__/FraisDeplacementTab.test.tsx` ont été mises à jour en conséquence (`"30,00\u00A0€"`, `"20,00\u00A0€"`), l'échappement `\u00A0` étant explicite pour qu'une espace ordinaire ne fasse pas passer le test sans rien garantir.

**E14 — code mort supprimé dans `app/bureau/fournisseurs/page.tsx`.**

Suppression de **2 états morts** (`devis`, `catalogue`) **et** de l'import mort associé (`analyserPerformancesFournisseurs`) — 0 usage prouvé sur l'ensemble du dépôt par `grep`. Retirer l'import mort était nécessaire : il aurait laissé un avertissement ESLint et un `any` implicite.

### Migrations créées — NON appliquées

| Fichier | Objet | État |
|---|---|---|
| `supabase/migrations/20260929_harden_lier_deplacement_devis.sql` | B1 | **créée, non appliquée** |
| `supabase/migrations/20260930_c1_search_path_security_definer.sql` | C1 | **créée, non appliquée** |

**Aucune migration n'a été jouée sur aucune base.** Les deux fichiers sont idempotents et rejouables sur n'importe quel état de la base.

- `20260929` : `create or replace` des deux signatures, `revoke`/`grant` explicites, et `drop function if exists` de l'ancienne signature à 3 arguments. Réexécutable sans effet de bord.
- `20260930` : n'exécute **aucun** `ALTER` direct et ne porte **aucune** garde d'existence. Sa boucle est alimentée par `pg_proc` et filtrée par `coalesce(p.proconfig, '{}'::text[]) is distinct from array['search_path=public']` : une fonction déjà corrigée est sautée, une fonction absente n'apparaît pas dans le jeu de résultats et son corps n'est jamais atteint. Une fonction porteuse d'un `search_path` différent de `public` reste, elle, traitée — c'est le seul cas où le filtre ne l'exclut pas.

> ⚠️ **Ordre de mise en ligne.** Tant que `20260929_harden_lier_deplacement_devis.sql` n'est pas jouée, `/api/deplacements/[id]/lier` appellera une signature à 2 arguments qui n'existe pas encore en base et échouera en `400 HTTP_400_CONTEXTE_ENTREPRISE`. La migration doit être jouée **avant** toute mise en ligne du code correspondant, par intervention humaine au SQL Editor.

### Portes de qualité

| Porte | Résultat |
|---|---|
| `tsc --noEmit` | **0 erreur** |
| ESLint — production (`app components hooks lib types`) | **0 erreur / 0 `no-explicit-any`** |
| ESLint — dépôt entier | 0 erreur / **19 warnings**, tous des `no-explicit-any` dans `__tests__/` |
| `vitest run` | **947 réussis / 1 échec** (948 tests, 62 fichiers) |
| `git diff --check` | vide |

**L'unique échec est `__tests__/champs-style-commun.test.ts`** — « aucun autre changement : les 13 champs ne diffèrent que par cette classe ». Il est **préexistant et hors périmètre** : il ne cite que `app/(dashboard)/finance/saisie/depense/page.tsx`, **jamais modifié** par cette passe. Le diff de `RentabiliteMainOeuvreWidget.tsx` qu'il scanne par ailleurs est purement typographique (ajout d'un type de retour, aucun changement de rendu).

### Points laissés ouverts

**B4 — schéma réel Supabase non entièrement versionné.** Un `supabase db dump` du schéma réellement en base est nécessaire pour clore l'écart entre migrations et PROD. **Bloqué** : accès à la base indisponible depuis l'environnement d'audit. Aucune conclusion n'est affirmée sur ce point tant qu'il n'est pas vérifié.

**C4 — validation Zod des routes JSON.** **C5 — timeouts des fetch externes.** **C6 — dépendances ESLint / npm.** Ces trois chantiers sont **volontairement en attente**, hors du périmètre de cette passe.

**E13 — types `DevisLie` / `FactureLiee` non fusionnés — NON RÉSOLU, par choix.**
Les deux `DevisLie` (idem `FactureLiee`) qui coexistent dans le dépôt sont des **homonymes de forme différente**, pas des doublons. Les fusionner serait un **changement fonctionnel**, pas un nettoyage : cela imposerait de choisir une forme canonique et de migrer les appelants, sans analyse fonctionnelle préalable. La passe ne l'a donc **pas forcé**.
Conséquence assumée et à arbitrer : la prop `devisLies` de `FraisDeplacementTab` est typée par un **contrat local minimal** `{ id: string; numero: string }[]` — les seuls champs réellement consommés par la liste de sélection (clé React, valeur d'option, libellé). Ce composant ne dépend ainsi plus d'un type privé d'une autre page.

**Autres dettes techniques non traitées.** L'onglet « 📊 Analyse des Marges » (`tab === "analyse"`) de `app/bureau/fournisseurs/page.tsx` **n'a aucun bloc de rendu** : l'onglet existe dans l'état d'onglet mais affiche un contenu vide. Le contenu manquant reste à concevoir ; ce n'est pas une régression de la passe (E14 a supprimé des états morts, pas l'onglet).

### État du dépôt au 30/09/2026

- `HEAD` : `22b32cc` — **aucun commit créé** par cette passe.
- `origin/main` : `11e892d` — **aucun push**. La branche locale est 2 commits d'avance (`5fd23fd`, `22b32cc`), situation **antérieure** à cette passe.
- **Index vide** : aucun fichier n'est staged.
- Arbre de travail : 17 fichiers applicatifs modifiés + 2 migrations non suivies, **en attente de commit**.
- **P7-B intact** : aucun fichier P7-B dans le diff.
- Aucun secret, `.env`, `package.json` ou `package-lock.json` modifié ; aucun fichier supprimé.


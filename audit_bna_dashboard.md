# 📋 Audit Complet — BNA Dashboard
> Rapport mis à jour le 31/08/2026 — Toutes les pages, onglets, fonctionnalités et sécurité recensés

---

## 🏗️ Architecture Générale

L'application est un **Next.js 15 App Router** connecté à **Supabase** (PostgreSQL + Storage).
- **UI** : Tailwind CSS (dark mode slate-900)
- **IA Vocale** : Groq Whisper (transcription) + Compound Mini (reformulation, devis, sécurité)
- **PDF** : `window.print()` avec composants React masqués (`hidden print:block`)
- **API Météo** : Météo-France DPVigilance

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
| `rapports_intemperies` | `id, chantier_id, date_debut, date_fin, jours_arret...` | Bureau Intempéries |
| `notes_patron` | `id, titre, contenu, epingle, created_at, updated_at` | Terrain Notes |
| `fiches_techniques` | `id, titre, categorie, reference, resume, contenu, fichier_url` | Terrain Fiches DTU |
| `catalogue_ouvrages` | `id, designation, description, famille_label, unite, pu_ht, dimensions_disponibles` | Bureau Devis & Factures |
| `zones_chantier` | `id, chantier_id, type, nom, largeur, hauteur_mur, hauteur_faite, materiau, ouvertures (JSONB), famille_pose...` | Terrain Métrés |
| `photos_notes_chantier` | `id, chantier_id, url, legende, created_at` | Terrain Photos & Notes |
| `parametres_finance` | `id, cle, valeur` | Finance (taux horaire, salaires...) |
| `tickets_sav` | `id, chantier_id, statut, sous_garantie, type_sinistre, localisation, description, cause_probable, respect_dtu, diagnostic_dtu, materiel_prevu (JSONB), date_intervention, temps_estime, intervenant, moyen_acces, photos (JSONB), signature_technicien (text), signature_client (text)` | Bureau SAV |
| `documents_compta` | `id, type (bl/ticket), date, note, montant_ht, taux_tva, montant_tva, montant_ttc, url_image, created_at` | Bureau Docs Compta |

### ⚠️ Migrations SQL requises (nouvelles colonnes)

```sql
-- Avancement Façades : JSONB des cases cochées + timestamp
ALTER TABLE public.avancements_chantier
  ADD COLUMN IF NOT EXISTS details jsonb DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS commentaire text,
  ADD COLUMN IF NOT EXISTS created_at timestamptz DEFAULT now();

-- SAV : Visa du technicien
ALTER TABLE public.tickets_sav
  ADD COLUMN IF NOT EXISTS signature_technicien text;
```

---

## 🏠 PAGE D'ACCUEIL (`/terrain/meteo`) — Tableau de Bord Central

> **Redirection automatique** : `/` → `/terrain` → `/terrain/meteo`

- **Widget IA Vocal Groq** : enregistrement audio → transcription Whisper → reformulation → `notes_patron`
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
- PPSPS Express IA (sécurité Groq)
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
- Dictée vocale IA, épingler, éditer, supprimer

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
- Génération IA Groq des lignes
- Devis accepté → Facturation (Globale / Acompte / Situation)
- Modale responsive mobile

### 4️⃣ Bureau → Factures (`/bureau/factures`)
- Créer, changer statut, Relance (pénalités LME 40€)
- Mise en rouge auto si échéance dépassée
- Modale responsive mobile

### 5️⃣ Bureau → Fournisseurs (`/bureau/fournisseurs`)
- Créer fournisseur, Bons de Commande (PDF + signature double)

### 6️⃣ Bureau → Fin de Chantier / PV Réception (`/bureau/fin-chantier`)
- PV complet (zones, réserves, checklist, photos, notice entretien)
- PDF + double signature électronique

### 7️⃣ Bureau → Rapports d'Intempéries (`/bureau/rapports-intemperies`)
- Génération auto depuis Météo-France + PDF

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
- Upload dans le bucket Storage `tickets`, table `documents_compta`
- Liste des documents enregistrés : clic sur une ligne → ouvre l'image en grand (nouvel onglet), bouton suppression séparé (`stopPropagation`)
- Route API dédiée `app/api/documents-compta/route.ts` (GET/POST/DELETE) via `supabaseAdmin`, même pattern que Photos Chantier

---

## 🌐 ESPACE CLIENT (`/espace-client/[code_acces]`) ⭐ MIS À JOUR

- **Carte Avancement** :
  - `{avancement}%` issu de `avancements_chantier` (tri `created_at` DESC)
  - Barre de progression animée
  - **Frise 3 étapes dynamique** :
    - `0–15%` → 🔵 Préparation En cours
    - `16–85%` → ✅ Préparation + 🔵 Pose En cours
    - `86–100%` → ✅ Préparation + ✅ Pose + 🔵 Finitions En cours
- **Mes Documents** : Devis + Factures + Signature électronique
- **Chatbot IA** (Groq) flottant + résumé en arrière-plan

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
| `/api/meteo` | Météo Visual Crossing (lang=fr) |
| `/api/meteo-vigilance` | Alertes DPVigilance |
| `/api/transcrire-note` | Audio → Texte (Groq Whisper) |
| `/api/reformuler-note` | Reformulation IA (Groq Compound Mini) |
| `/api/ia-devis` | Génération lignes devis (Groq) |
| `/api/ia-securite` | Consignes PPSPS (Groq) |
| `/api/rapports-intemperies/generer` | Génération rapports (try/catch global → JSON 500) |
| `/api/chat-client` | Messagerie Espace Client |
| `/api/chat-client-summary` | Résumé conversation (Groq) |
| `/api/espace-client/[code_acces]` | Données portail client (avancement réel, tri `created_at` DESC) |
| `/api/finance-pin` | Sécurisation module Finance via PIN |
| `/api/documents-compta` | Scan BL/tickets — upload bucket `tickets` + table `documents_compta` (GET/POST/DELETE) |

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
  `/login`, `/espace-client`, `/api/espace-client`, `/api/chat-client`, `/api/chat-client-summary`, `/api/meteo-vigilance`, `/manifest.json`, `/sw.js`
- `lib/supabase/client.ts` (navigateur) + `lib/supabase/server.ts` (serveur) via `@supabase/ssr`
- `lib/supabase.ts` migré de `createClient` (anon basique) vers `createBrowserClient` pour porter la session dans les pages qui font des appels directs Supabase côté navigateur
- Page `/login` avec gestion d'erreur réseau + auto-connexion si autofill (Bitwarden) remplit email+mot de passe d'un coup
- Déconnexion manuelle disponible dans `TopNav`
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
- Traitement de l'audio transcrit envoyé au backend `/api/ia-devis` (Groq) pour créer une ligne de devis structurée.

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

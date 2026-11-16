# Diagnostic complet — Module Fournisseurs, Commandes Matériaux & Analyse des Marges

Date : 2026-11-16  
Périmètre : `bna-dashboard` (`/bureau/fournisseurs` et composants associés)

---

## 1. Inventaire des fichiers & Réparation des liens du menu

### Inventaire des fichiers liés
- **Page principale :** `app/bureau/fournisseurs/page.tsx` (1 168 lignes)
- **Navigation :** `components/MenuNavigationMobile.tsx` (lignes 89–97)
- **Modales & PDF :**
  - `components/CommandeModal.tsx` (modale de commande depuis le calepinage Bardage)
  - `components/BonCommandePDF.tsx`
  - `components/email/EnvoyerCommandeModal.tsx`
- **Librairies & API :**
  - `lib/lignesCommande.ts`
  - `lib/email/documents/bonCommandePdf.ts`
  - `app/api/chantiers-fournisseurs/route.ts`
  - `app/api/commandes/[id]/email/`
- **Déclencheurs depuis les hubs métiers :**
  - Bardage : `components/bardage/hub/BardageCalepinageModule.tsx` (via `CommandeModal`)
  - Terrasse : `components/terrasse/TerrasseQuantitatifTable.tsx` (via `localStorage` `bna_prefill_commande`)
- **Types Supabase :** `types/supabase.ts` (tables `commandes` et `fournisseurs`)

### Diagnostic des 3 liens du menu « Fournisseurs »
Dans `components/MenuNavigationMobile.tsx` (lignes 89–97), le groupe « Fournisseurs » contient :
1. `/bureau/fournisseurs` → *« Fournisseurs & commandes »*
2. `/bureau/fournisseurs?tab=commandes` → *« Suivi des commandes »*
3. `/bureau/fournisseurs?tab=fournisseurs` → *« Contacts fournisseurs »*

**Causes du dysfonctionnement :**
1. **Lecture unique au montage (`useEffect(..., [])`) :** Dans `app/bureau/fournisseurs/page.tsx` (lignes 156–173), les paramètres `?tab=` et `?retard=` sont lus uniquement dans un `useEffect` avec un tableau de dépendances vide `[]` via `window.location.search`. Lors d'une navigation client Next.js (`<Link>`) entre deux sous-liens alors que l'utilisateur est déjà sur `/bureau/fournisseurs`, le composant n'est pas remonté et l'onglet actif (`tab`) ne bascule pas. Il manque l'écoute réactive de `useSearchParams()` (`next/navigation`).
2. **Lien par défaut & onglet « Analyse » absents du menu :** `/bureau/fournisseurs` sans `?tab=` ouvre par défaut `"fournisseurs"` (redondant avec le 3e lien), et aucun lien du menu ne pointe vers `?tab=analyse`.
3. **Bug critique sur l'onglet « Analyse des Marges » :** Bien que `"analyse"` soit déclaré dans le state `tab` (ligne 98), dans le parseur `?tab=` (ligne 160) et dans la barre d'onglets (ligne 594), **aucun bloc `{tab === "analyse" && (...)}` n'existe dans le JSX** de `app/bureau/fournisseurs/page.tsx` (seuls `tab === "fournisseurs"` ligne 609 et `tab === "commandes"` ligne 670 sont rendus). Cliquer sur « Analyse des Marges » affiche une page vide.

---

## 2. Fonctionnalités actuelles & Limites métiers

### Fonctionnement actuel
- **Onglet `fournisseurs` :** Liste des fournisseurs (`fournisseurs`), création via modale (`creerFournisseur` avec `nom`, `specialite`, `contact`, `telephone`, `email`, `conditions_paiement`, `notes`, `statut_relation`), suppression directe, liens `tel:` / `mailto:`.
- **Onglet `commandes` :** Liste des `commandes` avec filtre `Toutes` / `⚠️ En retard`, mise en avant d'une commande via `?retard=`, saisie de `date_commande`, changement de `statut` (`changerStatutCommande`), aperçu PDF (`BonCommandePDF`) et envoi par email (`EnvoyerCommandeModal`).
  - **KPIs calculés** (lignes 323–342) : fournisseurs actifs, commandes en cours, livraisons attendues, achats engagés du mois, achats reçus du mois.
  - **Création de commande** (`creerCommande`) : saisie manuelle d'une ligne unique ou mode multi-lignes pré-rempli via `localStorage` (`bna_prefill_commande`).
- **Onglet `analyse` :** Non implémenté dans le rendu JSX.

### Limites pour les 3 corps d'état (Bardage, Terrasse & Mobile, Clôture)
1. **Spécialités fournisseurs génériques / orientées Bardage :** `SPECIALITES` (ligne 75) ne propose que `["Bois", "Métal / Bac acier", "Composite", "Quincaillerie / Visserie", "Isolation", "Autre"]`, sans tags métiers explicites (`Bardage`, `Terrasse & Mobile`, `Clôture`) ni filtrage par corps d'état.
2. **Absence de dimension métier dans les requêtes & tables :**
   - `fetchTout()` (lignes 177–185) charge `chantiers(id, nom, clients(nom))` sans `chantiers.metier`.
   - `app/api/chantiers-fournisseurs/route.ts` ne sélectionne pas `metier` sur `chantiers` ni `specialite` sur `fournisseurs`.
   - `commandes` dans `types/supabase.ts` n'a pas de colonne `metier`, ni de colonnes dédiées à la réception / BL (`bon_livraison`, quantité reçue, réserves).
3. **Génération automatique de commande depuis les quantitatifs (`Q_appro`) fragmentée :**
   - **Bardage :** Passe par `CommandeModal.tsx` dans `BardageCalepinageModule.tsx` (ou `bna_prefill_commande`).
   - **Terrasse :** `TerrasseQuantitatifTable.tsx` (lignes 61–90) prépare `bna_prefill_commande` en excluant la main-d'œuvre.
   - **Clôture :** `ClotureCalepinageModule.tsx` sauvegarde le quantitatif mais n'a aucune passerelle de création de commande fournisseur.
   - **Sur `/bureau/fournisseurs` :** Aucun sélecteur direct ne permet de charger les quantitatifs calculés (`Q_appro`) d'un chantier Bardage, Terrasse ou Clôture.
4. **Réception de livraison absente en tant que workflow :** Pas de modale ou panneau de réception (contrôle des quantités reçues vs commandées, n° de BL, réserves, gestion structurée des livraisons partielles).
5. **Analyse des marges absente :** Aucun comparatif Devis HT vs Achats engagés/livrés HT par chantier ou par métier.

---

## 3. Plan de refonte proposé (Multi-métiers + Design clair Terracotta `#B85B2B`)

1. **Correction des liens de navigation & synchronisation URL :**
   - Remplacer la lecture unique dans `useEffect(..., [])` par `useSearchParams()` dans `app/bureau/fournisseurs/page.tsx` (avec `<Suspense>`) pour basculer instantanément d'onglet lors des clics dans `MenuNavigationMobile.tsx`.
   - Aligner les 3 liens de `MenuNavigationMobile.tsx` sur les 3 vues (`?tab=commandes`, `?tab=fournisseurs`, `?tab=analyse`).
2. **Réhabillage complet selon la charte claire BNA Dashboard :**
   - Remplacer `<Surface>`, `bg-[#1E1E1E]`, `bg-red-600`, `text-white`, `border-white/10` dans `app/bureau/fournisseurs/page.tsx` (page, cartes, filtres, modales) par le thème clair : fond `#F3F3F1`, en-tête blanc « BNA Pilotage BTP · Fournisseurs & Commandes », cartes blanches `border-[#E5E5E5]`, pilules de filtres claires et boutons principaux Terracotta `#B85B2B`.
   - Nettoyer les entités `&apos;` résiduelles (lignes 614 et 693).
3. **Support multi-métiers (Bardage, Terrasse & Mobile, Clôture) :**
   - Ajouter les filtres métiers (`Tous | Bardage | Terrasse | Clôture`) et badges métiers sur les fournisseurs et les commandes (en chargeant `chantiers.metier`).
   - Enrichir `SPECIALITES` pour couvrir les 3 corps d'état.
4. **Bouton « Créer commande depuis un chiffrage chantier » (Bardage / Terrasse / Clôture) :**
   - Permettre de sélectionner un chantier depuis `/bureau/fournisseurs` et d'importer ses quantitatifs matériaux (`Q_appro` hors main-d'œuvre) pour les 3 métiers.
5. **Workflow de réception de commande & Onglet « Analyse des Marges » :**
   - Ajouter un bouton « Réceptionner » sur les commandes en attente (date réelle, statut partiel/livré, n° BL / notes).
   - Implémenter `{tab === "analyse" && ...}` avec tableau comparatif par chantier et par métier (Montant devisé HT vs Achats engagés/livrés HT, marge brute matériaux en € et %).

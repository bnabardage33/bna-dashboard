# 📋 Audit Complet — BNA Dashboard
> Rapport généré le 23/08/2026 — Toutes les pages, onglets et fonctionnalités recensés

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
| `pointages_globaux` | `id, chantier_id, equipe_id, date_saisie, volume_heures_declare, commentaire` | Temps Heures (Mode Confiance) |
| `devis` | `id, numero, client_id, chantier_id, objet, adresse_chantier, date_emission, validite_jours, tva_pct, statut, lignes (JSONB), acompte_pct` | Bureau Devis |
| `factures` | `id, numero, client_id, chantier_id, objet, date_emission, echeance, tva_pct, statut, type_facture, lignes (JSONB)` | Bureau Factures |
| `fournisseurs` | `id, nom, contact, telephone, email, statut_relation, notes` | Bureau Fournisseurs |
| `commandes` | `id, fournisseur_id, chantier_id, reference_interne, objet, date_commande, date_livraison_prevue, lignes (JSONB), montant_ht, statut` | Bureau Fournisseurs |
| `pointages` | `id, user_id, chantier_id, date, heures, type_heure, taux_horaire_charge` | Finance Saisie, Terrain |
| `depenses_chantier` | `id, chantier_id, fournisseur_id, date, categorie, description, montant_ht, montant_tva, montant_ttc` | Finance Saisie |
| `avancements_chantier` | `id, chantier_id, date, pourcentage, notes` | Finance Saisie |
| `pv_receptions` | `id, numero, chantier_id, client_id, devis_id, date_reception, statut, type_travaux, adresse_chantier, materiaux_utilises, zones_metres (JSONB), photos (JSONB), reserves (JSONB), observations, notice_entretien (JSONB), signature_client, signataire_client_nom, signature_entreprise, signataire_entreprise_nom, checklist_repli (JSONB)` | Bureau Fin de Chantier |
| `rapports_intemperies` | `id, chantier_id, date_debut, date_fin, jours_arret...` | Bureau Intempéries |
| `notes_patron` | `id, titre, contenu, epingle, created_at, updated_at` | Terrain Notes |
| `fiches_techniques` | `id, titre, categorie, reference, resume, contenu, fichier_url` | Terrain Fiches DTU |
| `catalogue_ouvrages` | `id, designation, description, famille_label, unite, pu_ht` | Bureau Devis & Factures |
| `zones_chantier` | `id, chantier_id, type, nom, largeur, hauteur_mur, hauteur_faite, materiau, ouvertures (JSONB), famille_pose...` | Terrain Métrés |
| `photos_notes_chantier` | `id, chantier_id, url, legende, created_at` | Terrain Photos & Notes |
| `parametres_finance` | `id, cle, valeur` | Finance (taux horaire, salaires...) |

---

## 🏠 PAGE D'ACCUEIL (`/terrain/meteo`) — Tableau de Bord Central

> **Redirection automatique** : `/` → `/terrain` → `/terrain/meteo`

### Fonctionnalités :
- **Widget IA Vocal Groq** : Gros bouton micro central. Appui → enregistrement audio → transcription Whisper → reformulation IA → **sauvegarde automatique** dans `notes_patron`
- **Widget Météo du Jour** : Température matin/après-midi, vent, rafales, **niveau d'alerte coloré** (vert/jaune/orange/rouge)
- **3 Dernières Notes** : Affichage des dernières notes du patron avec lien vers la page complète
- **Chantiers Actifs & Météo** : Via composant `ChantiersMeteoCards` — liste des chantiers en cours avec leur alerte météo calculée en temps réel

---

## 🧱 MODULE TERRAIN (`/terrain/*`)

### Navigation : Accueil / Chantiers / Boîte à Outils / Notes Patron / Fiches DTU

---

### 1️⃣ Terrain → Chantiers (`/terrain/chantier`)

#### Vue Liste :
- Affiche toutes les cartes chantier (statut coloré : prévu/en cours/terminé)
- **Filtre par recherche** (nom, client, adresse)
- **Bouton GPS** : lien Google Maps direct depuis l'adresse
- **Créer un chantier** : Bouton FAB `+` flottant → modal avec :
  - Nom du chantier
  - Client (select depuis `clients`)
  - Adresse des travaux
  - Matériau prédominant (Bois/HPL/Fibres-ciment/Métal)
  - Date début & date fin prévues
- **Supprimer** un chantier

#### Vue Planning (Gantt) :
- Basculer entre "Liste" et "Planning" via des boutons en haut
- **Diagramme de Gantt sur 6 mois** : visualisation de tous les chantiers sur une timeline (couleurs : vert=en cours, orange=prévu, gris=terminé)

---

### 2️⃣ Terrain → Chantier Détail (`/terrain/chantier/[id]`)

6 onglets :

#### Onglet 1 — Général :
- **PPSPS Express (IA Groq)** : Bouton "✨ Générer" → l'IA analyse le matériau + le moyen d'accès + la zone de vent et génère **5 règles de sécurité concrètes**
- Informations client, adresse
- **Statut du chantier** (select) : prévu / en_cours / terminé / annulé → maj Supabase immédiate
- **Checklist de fin de chantier** : liste de cases à cocher (JSONB dans `chantiers.checklist`)
- **Matériau** et **Moyen d'accès** (modifiables inline → maj Supabase)
- **Adresse** modifiable inline
- **Zone de vent** (1 à 4) modifiable inline

#### Onglet 2 — Temps Heures (ex-Équipe & Pointages) :
- Application de l'algorithme de chiffrage **Gaël Logic** (`lib/gaelLogic.ts`)
- **Vue Chantiers & Calepinage** : Saisie surface/coupes/singularités et calcul immédiat du "Temps Budget" et "Temps à Planifier".
- **Vue Pointage Équipe (Mode Confiance)** : Saisie simplifiée d'un forfait d'heures (sans heure de début/fin).
- **Vue Tableau de Bord / Rentabilité** : Jauge de progression Budget vs Pointé avec écart positif/négatif et code couleur.

#### Onglet 3 — Métrés & Technique :
- **Récapitulatif des totaux** : Brut façades, brut pignons, ouvertures, total net, total à commander
- **ZoneCard** pour chaque façade/pignon :
  - Type : façade droite ou pignon triangulaire
  - Dimensions : largeur, hauteur mur, hauteur faîte
  - Matériau : lames bois ou plaques
  - **Ouvertures** : ajout de fenêtres/portes avec déduction automatique de surface
  - **Famille de pose** et paramètres (largeur visible, recouvrement, entraxes)
  - **Calcul automatique** : surface nette, lames ou plaques à commander, quantités de fixations
  - **Bouton "Plan de Découpe"** *(uniquement zones "Plaques")* : ouvre le **VisualiseurDebitPlaques** (Nesting/Calepinage SVG optimisé pour réduire les chutes HPL)
  - **Bouton "Commander"** : pré-remplit le formulaire de commande fournisseur
- **Ajouter une zone** : bouton "+" en bas

#### Onglet 4 — Météo & Intempéries :
- **Météo en temps réel** pour le chantier (API Météo-France) : temp matin/après-midi, vent, rafales, alerte colorée
- Détail heure par heure
- **Liste des Rapports d'Intempéries** liés au chantier
- **Créer un nouveau rapport** directement depuis cet onglet

#### Onglet 5 — Photos & Notes :
- **Galerie photo** : upload depuis l'appareil (compression automatique `lib/imageCompress.ts`)
- Légende sur chaque photo
- Visualisation en grille + suppression
- **Notes texte** libres liées au chantier
- Stocké dans `photos_notes_chantier`

#### Onglet 6 — Documents :
- Liste des Devis, Factures, Bons de Commande, PV de Réception liés au chantier
- Liens rapides vers chaque document

---

### 3️⃣ Terrain → Notes Patron (`/terrain/notes`)

- **Bouton Micro (IA Groq Whisper)** : dictée → transcription → reformulation → insertion dans `notes_patron`
- **Filtre par chantier** ou toutes les notes
- **Épingler** une note (remonte en haut de liste)
- **Éditer** une note en inline
- **Supprimer** une note
- Date de dernière modification affichée

---

### 4️⃣ Terrain → Boîte à Outils (`/terrain/outils`)

Page hub avec liens rapides vers :
- Météo & Vigilance Chantier
- Notes Vocales
- Fiches DTU
- Rapports d'Intempéries

---

### 5️⃣ Terrain → Fiches DTU (`/terrain/fiche-technique`)

- **Recherche** par mot-clé
- **Filtres par catégorie** : DTU / pose / ventilation / entraxes / sécurité / matériaux
- Affichage du résumé de chaque fiche
- Stocké dans `fiches_techniques`

---

## 🏢 MODULE BUREAU (`/bureau/*`)

### Navigation : Dashboard / Clients / Devis / Factures / Fournisseurs / Fin de Chantier / Rapports Intempéries / Catalogue

---

### 1️⃣ Bureau → Dashboard (`/bureau`)

- **4 KPIs en temps réel** : Devis en attente, Factures impayées en retard, Chantiers actifs, Fournisseurs principaux
- Liens rapides vers chaque section

---

### 2️⃣ Bureau → Clients (`/bureau/clients`)

- Liste des clients
- **Créer un client** : nom, société, email, téléphone, adresse, CP, ville
- **Fiche 360° Client** : tous ses chantiers + devis + factures avec montants
- **Supprimer** un client

---

### 3️⃣ Bureau → Devis (`/bureau/devis-factures`)

- Liste des devis avec statut coloré
- **Créer un devis** :
  - Numérotation automatique (`DEV-YYYY-XXX`)
  - Client, objet, adresse, date, validité, acompte %, TVA %
  - Lignes : saisie manuelle + import catalogue + **✨ Génération IA** (Groq)
  - Calculs HT/TVA/TTC automatiques
- **Changer statut** : brouillon → envoyé → accepté/refusé
- **Aperçu PDF** :
  - Page 1 : document commercial complet avec zone de signature
  - Page 2 : CGV complètes + formulaire de rétractation 14j
  - **✍️ Signature électronique** client (SignaturePad intégré dans le PDF)
  - **🖨️ Imprimer / PDF** toujours disponible
- **Devis Accepté → Choix de facturation** :
  - Facture Globale (100% des lignes)
  - Facture d'Acompte (une ligne globale calculée)
  - Situation d'Avancement (lignes avec % appliqué)
- **Supprimer** un devis

---

### 4️⃣ Bureau → Factures (`/bureau/factures`)

- Liste des factures, **mise en rouge automatique si échéance dépassée**
- **Créer une facture** (manuelle ou depuis devis accepté)
- **Changer statut** : brouillon / envoyée / payée
- **Aperçu PDF** (complet avec mentions légales, RIB, signature)
- **🖨️ Imprimer / PDF** toujours disponible
- **⚠️ Lettre de Relance** (visible si facture envoyée + échéance dépassée) :
  - Courrier formel avec en-têtes
  - Option "Pénalités de retard 40€ loi LME"
  - **🖨️ Imprimer / PDF**
- **Supprimer** une facture

---

### 5️⃣ Bureau → Fournisseurs (`/bureau/fournisseurs`)

- Liste des fournisseurs avec statut (principal/secondaire/inactif)
- **Créer/Supprimer** un fournisseur
- **Bons de Commande** :
  - Créer (lignes, chantier lié, dates, référence)
  - Génération depuis métré (via localStorage)
  - Changer statut (en_attente/confirmée/livrée/annulée)
  - **Aperçu PDF Bon de Commande** avec double zone de signature
  - **✍️ Signature électronique** acheteur
  - **🖨️ Imprimer / PDF** toujours disponible
  - Supprimer une commande

---

### 6️⃣ Bureau → Fin de Chantier / PV Réception (`/bureau/fin-chantier`)

- Liste des PV (statut : sans_reserve / avec_reserve / refusée)
- **Créer un PV complet** :
  - Chantier, client, devis associé, type de travaux, date
  - Zones métrées (JSONB)
  - Réserves (liste)
  - Checklist de repli (nacelle, nettoyage, déchets...)
  - Photos de fin de chantier
  - Notice d'entretien pour le client
  - Observations libres
- **Aperçu PDF PV de Réception** :
  - Document légal complet
  - Photos intégrées
  - **Double signature électronique** (client + représentant entreprise)
  - **🖨️ Imprimer / PDF**
- **Supprimer** un PV

---

### 7️⃣ Bureau → Rapports d'Intempéries (`/bureau/rapports-intemperies`)

- Liste des rapports par chantier et période
- **Génération automatique** via API Météo-France
- **PDF Rapport d'Intempéries** avec relevés officiels et décompte de jours

---

### 8️⃣ Bureau → Catalogue d'Ouvrages (`/bureau/catalogue`)

- Liste du catalogue interne
- **Créer** : désignation, description, famille, unité, PU HT
- **Modifier** en inline
- **Supprimer**
- Utilisé en select dynamique dans Devis et Factures

---

## 💰 MODULE FINANCE (`/(dashboard)/finance/*`)

---

### 1️⃣ Finance → Tableau de Bord

- **Sélecteur de mois** : filtre global sur tout le dashboard
- **KPIs** : CA Facturé HT, Dépenses, Marge Brute (€ + %), Reste à facturer
- **Rentabilité par chantier** : tableau + barre d'avancement + formulaire d'avancement rapide
- **Graphique Évolution CA** (12 mois, recharts)
- **Camembert Répartition Coûts** (main d'œuvre / matériaux / autres)
- **Widget TVA** : collectée (20%/10%/5.5%), déductible, solde à reverser
- **Widget Trésorerie prévisionnelle** (30 jours)
- **Widget URSSAF** : estimation cotisations du mois
- **📄 Rapport Mensuel PDF** : document A4 complet
- **📊 Export Comptable CSV** : compatible Excel/logiciels comptables
- **Lien vers Historique** des saisies

---

### 2️⃣ Finance → Saisie Pointage

- Formulaire : chantier, ouvrier, date, heures, taux horaire, type (normale/sup/intempérie)
- Sauvegarde dans `pointages`

---

### 3️⃣ Finance → Saisie Dépense

- Formulaire : chantier, fournisseur, date, catégorie, description, montant HT/TVA/TTC
- Sauvegarde dans `depenses_chantier`

---

### 4️⃣ Finance → Saisie Avancement

- Formulaire : chantier, pourcentage (slider), date, notes
- Sauvegarde dans `avancements_chantier`

---

### 5️⃣ Finance → Historique

- 30 derniers pointages + 30 dernières dépenses
- Suppression d'une entrée erronée

---

## ⚙️ PARAMÈTRES (`/parametres`)

- Raison sociale, SIRET, téléphone, email, adresse, CP, ville
- IBAN, BIC
- Mentions légales
- Assurance décennale (nom, n° police, zone géo)
- Médiateur consommation (nom, contact)
- Seuil CA régime simplifié, taux cotisations sociales
- Upload Logo (Supabase Storage)

---

## 🔌 API ROUTES

| Route | Rôle |
|---|---|
| `/api/meteo` | Données météo horaires Météo-France |
| `/api/meteo-vigilance` | Alertes officielles DPVigilance |
| `/api/transcrire-note` | Audio → Texte (Groq Whisper) |
| `/api/reformuler-note` | Reformulation + anonymisation (Groq Compound Mini) |
| `/api/ia-devis` | Génération ligne de devis structurée (Groq) |
| `/api/ia-securite` | Génération consignes PPSPS (Groq) |
| `/api/rapports-intemperies/generer` | Génération rapports depuis Météo-France |

---

## ⚠️ POINTS D'ATTENTION — À VÉRIFIER CÔTÉ SUPABASE

> [!IMPORTANT]
> Ces éléments doivent exister dans ta base Supabase pour que l'application fonctionne complètement.

1. **`profiles` table** : colonne `role` avec valeurs : `admin`, `direction`, `chef`, `ouvrier`
2. **`entreprise_settings` id=1** : une seule ligne avec `id = 1` doit exister (à créer si table vide)
3. **`catalogue_ouvrages`** : créée via `catalogue.sql` → vérifier qu'elle est présente et peuplée
4. **`avancements_chantier`** : colonnes `id, chantier_id, date, pourcentage, notes`
5. **`pv_receptions`** : colonnes JSONB `zones_metres, photos, reserves, notice_entretien, checklist_repli` + colonnes `text` pour les signatures
6. **`fiches_techniques`** : table à alimenter manuellement avec les fiches DTU
7. **`parametres_finance`** : table clé-valeur pour les paramètres (taux horaire moyen, etc.)
8. **Supabase Storage** : bucket pour logos (`entreprise_settings.logo_url`) et photos chantier (`photos_notes_chantier.url`)
9. **Row Level Security (RLS)** : actuellement non configuré — à faire lors de l'étape Sécurité finale

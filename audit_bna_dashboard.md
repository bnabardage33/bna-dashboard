# 📋 Audit Complet — BNA Dashboard
> Rapport mis à jour le 29/08/2026 — Toutes les pages, onglets et fonctionnalités recensés

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
- Météo temps réel Météo-France + Rapports Intempéries

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
| `/api/meteo` | Météo horaires Météo-France |
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

---

## 🎨 STANDARD MODALES MOBILES

Template unifié appliqué sur toutes les modales (Nouveau Client, Nouvelle Facture, Nouveau Chantier, Nouvelle Fiche Technique) :

```jsx
// Overlay — pb-32 pour dégager la barre de navigation
<div className="fixed inset-0 z-50 flex items-center justify-center p-4 pb-32 bg-black/80">
  // Conteneur flex colonne
  <div className="bg-slate-900 w-full max-w-2xl max-h-[80vh] flex flex-col rounded-xl">
    // Header statique
    <div className="p-4 border-b border-gray-700 shrink-0">...</div>
    // Formulaire scrollable
    <div className="p-4 overflow-y-auto flex-1 flex flex-col gap-4">...</div>
    // Footer statique
    <div className="p-4 border-t border-gray-700 flex justify-end gap-3 mt-auto shrink-0 bg-slate-800 rounded-b-xl z-10">...</div>
  </div>
</div>
```

---

## ⚠️ POINTS D'ATTENTION SUPABASE

1. **`profiles`** : colonne `role` → `admin / direction / chef / ouvrier`
2. **`entreprise_settings`** : ligne `id = 1` doit exister
3. **`catalogue_ouvrages`** : créée via `catalogue.sql`
4. **`avancements_chantier`** : ajouter `details (jsonb)`, `commentaire (text)`, `created_at (timestamptz)`
5. **`tickets_sav`** : ajouter `signature_technicien (text)`
6. **`pv_receptions`** : colonnes JSONB + colonnes texte signatures
7. **`fiches_techniques`** : à alimenter manuellement avec les fiches DTU
8. **`parametres_finance`** : table clé-valeur
9. **Storage** : bucket `photos` (logos), bucket `sav_photos` (photos SAV)
10. **RLS** : configuré sur `entreprise_settings` + Storage. À étendre globalement.

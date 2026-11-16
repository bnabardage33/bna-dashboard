# Audit & Plan de refonte — Module Fin de Chantier & Réceptions (`bna-dashboard`)

Date : 2026-11-16  
Périmètre analysé : `app/bureau/fin-chantier/page.tsx`, `components/PVReceptionPDF.tsx`, `components/RetenueGarantieChantier.tsx`, `app/api/chantiers/[id]/retenue-garantie/`

---

## 1. Inventaire des fichiers & Fonctionnalités actuelles

### Fichiers liés aux PV de réception, réserves, notices et retenues 5 %
| Fichier | Rôle |
| :--- | :--- |
| [`app/bureau/fin-chantier/page.tsx`](app/bureau/fin-chantier/page.tsx) (1 695 lignes) | Page principale : onglet **PV de Réception** (liste, filtres, création/édition, levée des réserves, aperçu PDF) + onglet **Retenues de Garantie 5 %**. |
| [`components/PVReceptionPDF.tsx`](components/PVReceptionPDF.tsx) (559 lignes) | Gabarit PDF du PV de réception (Art. 1792-6) : entête, parties, prononciation légale, tableau des métrés (`zones_metres`), réserves, notice d'entretien, annexes photos, checklist de repli, rappels des garanties légales et double signature. |
| [`components/RetenueGarantieChantier.tsx`](components/RetenueGarantieChantier.tsx) (625 lignes) | Suivi du compte séquestre de retenue de garantie 5 % (Loi 1971) par chantier et déclenchement des libérations. |
| [`app/api/chantiers/[id]/retenue-garantie/route.ts`](app/api/chantiers/[id]/retenue-garantie/route.ts) | `GET` synthèse compte séquestre + factures + PV associés. |
| [`app/api/chantiers/[id]/retenue-garantie/liberer/route.ts`](app/api/chantiers/[id]/retenue-garantie/liberer/route.ts) | `POST` libération atomique via RPC `liberer_retenue_garantie_rpc` (vérifie la présence d'un PV purgé `sans_reserve` ou `reserves_levees` si motif = `levee_reserves`). |

### Cycle de vie d'un PV de réception
1. **Création** : sélection d'un chantier dans `app/bureau/fin-chantier/page.tsx`, génération séquentielle du numéro `PV-YYYY-###` via `prochainNumero("PV")`, saisie du statut (`sans_reserve`, `avec_reserves`, `reserves_levees`, `refuse`), des réserves éventuelles, de la notice d'entretien et des photos.
2. **Signature électronique** : double pad `SignaturePad` (`signature_client` + `signataire_client_nom`, `signature_entreprise` + `signataire_entreprise_nom`) stocké en base64 dans `pv_receptions`.
3. **Archivage & effets légaux** :
   - La `date_reception` enregistrée dans `pv_receptions` sert désormais de point de départ au calcul automatique des garanties (**GPA 1 an**, **Biennale 2 ans**, **Décennale 10 ans**) dans le nouveau module SAV (`lib/savGaranties.ts`).
   - Les statuts `sans_reserve` ou `reserves_levees` débloquent la libération de la retenue de garantie 5 % via `/api/chantiers/[id]/retenue-garantie/liberer`.

---

## 2. Points bloqués sur l'ancien design et limités au seul Bardage

1. **Design sombre obsolète dans `app/bureau/fin-chantier/page.tsx`** :
   - Utilisation de `<Surface>`, `bg-[#1E1E1E]`, `bg-red-600`, `text-white`, `border-white/10`, `bg-sky-950/20`, en décalage avec la charte claire unifiée (`#F3F3F1`, cartes blanches `border-[#E5E5E5]`, Terracotta `#B85B2B`).
2. **Contenus 100 % Bardage en dur (`app/bureau/fin-chantier/page.tsx` & `PVReceptionPDF.tsx`)** :
   - **Valeurs par défaut du formulaire** (lignes 155 & 157) :
     - `formTypeTravaux = "Travaux de bardage et isolation extérieure (ITE)"`
     - `formMateriauxUtilises = "Panneaux HPL / Équerres Isolco 3000 P2 / Isolant Laine minérale"`
     - `formSignEntrepriseNom = "BNA BARDAGE"` / `DEFAULT_ENTREPRISE.raison_sociale = "BNA BARDAGE"`.
   - **Notice d'entretien (`DEFAULT_NOTICE`, lignes 109–115)** :
     - `controle_joints_recommande = "Inspection visuelle annuelle des bavettes, grilles anti-rongeurs et joints de dilatation"` — spécifique au bardage ; rien sur le dégrisement / nettoyage terrasse, la sécurité **NF P90-308** / fin de course / rails de **Terrasse Mobile motorisée**, ni le graissage/réglage de **portillon / serrure / gâche de Clôture**.
   - **Métrés automatiques (`chargerZonesPourChantier`, lignes 171–211)** :
     - Interroge **uniquement** `chantier_zones` (zones de façade/pignon Bardage en `m²`).
     - Pour un chantier **Terrasse** (`chantier_terrasses`) ou **Clôture** (`chantier_clotures` + `chantier_cloture_troncons`), `zones_metres` reste vide (`[]`) !
   - **Checklist de repli (`PVReceptionPDF.tsx` ligne 464)** :
     - Case `"Échafaudage démonté"` affichée même pour une terrasse au sol ou une clôture.
   - **Aucun filtre par métier** sur la liste des PV (`tous | bardage | terrasse | cloture`) ni badge métier sur les cartes PV.

---

## 3. Plan de refonte proposé (Multi-métiers + Design clair Terracotta `#B85B2B`)

1. **Charte claire unifiée (`app/bureau/fin-chantier/page.tsx`)** :
   - Fond `#F3F3F1`, en-tête blanc `BNA Pilotage BTP · Fin de Chantier & Réceptions` avec accents Terracotta `#B85B2B`, KPI cards blanches (`border-[#E5E5E5]`), pilules de filtre claires et cartes blanches.
2. **Adaptation 100 % multi-métiers (`Bardage`, `Terrasse & Mobile`, `Clôture`)** :
   - Charger `chantiers.metier` et ajouter un filtre **Tous | Bardage | Terrasse | Clôture** sur la liste des PV et la sélection des retenues 5 %.
   - Lors de la sélection d'un chantier dans le modal de création de PV :
     - Pré-remplir automatiquement `type_travaux`, `materiaux_utilises` et `notice_entretien` selon le métier (`Bardage DTU 41.2`, `Terrasse DTU 51.4 / NF P90-308`, `Clôture & Portillons`).
     - Charger automatiquement les quantitatifs réceptionnés :
       * **Bardage** → `chantier_zones` (façades/pignons en `m²`).
       * **Terrasse** → `chantier_terrasses` (surface platelage, essence, présence terrasse mobile / motorisation).
       * **Clôture** → `chantier_clotures` + `chantier_cloture_troncons` (linéaire `ml`, côtés A/B/C/D, soubassements, portillons).
   - Adapter [`components/PVReceptionPDF.tsx`](components/PVReceptionPDF.tsx) :
     - Afficher le badge métier, un bloc récapitulatif d'ouvrage adapté (surfaces Bardage OU caractéristiques Terrasse/Mobile OU tronçons Clôture), et une checklist de repli / notice d'entretien contextualisée par métier.

# Proposition Technique — Sécurisation du Cloisonnement Métier Bardage / Terrasse (Phase E)

> **Statut :** Proposition d'architecture et de mise en œuvre (Strictement en attente de validation)  
> **Conformité :** Zéro modification de code, zéro migration exécutée, zéro modification de données en base.  
> **Référence d'audit :** Fait suite aux conclusions de la Phase D.1 (`audit_validation_fonctionnelle_hub_bardage.md`).  
> **Auteur :** Antigravity (Google DeepMind)  
> **Date :** 12 Novembre 2026

---

## 1. Diagnostic Réel de la Base de Données

Un audit en lecture seule de la base Supabase a été réalisé pour mesurer l'état exact des données :

```json
{
  "total_chantiers": 1,
  "total_terrasses": 1,
  "total_zones_bardage": 2,
  "chantier_unique": {
    "id": "c206dbfc-72f8-440b-ae04-1025e11762a2",
    "nom": "TEST_P1 Bardage HPL",
    "col_metier": "bardage",
    "checklist_metier": "terrasse",
    "hasTerrasseRow": true,
    "hasBardageZones": true,
    "statut": "en_cours"
  }
}
```

### Enseignements capitaux :
1. **Un seul chantier existe actuellement en base** : `TEST_P1 Bardage HPL`.
2. **Ce chantier est un hybride accidentel** :
   - Il a été créé initialement comme chantier Bardage (avec 2 façades dans `chantier_zones`).
   - La colonne SQL `metier` a pris la valeur `'bardage'` lors du `DEFAULT 'bardage'`.
   - Lors de tests ultérieurs de la terrasse, une configuration de terrasse a été insérée dans `chantier_terrasses`, et `checklist.metier` a été écrasé avec `"terrasse"`.
   - **Conséquence directe :** Ce chantier apparaissait simultanément sur `/terrain/terrasse` (car il a une ligne dans `chantier_terrasses`) et sur `/terrain/chantier` (car cette page n'avait aucun filtre).
3. **Aucun chantier avec `metier IS NULL` n'existe en base** à cet instant (la colonne `metier` ayant été posée avec un default `'bardage'`). Toutefois, le code applicatif doit savoir gérer le cas où un chantier historique aurait `metier = NULL`.

---

## 2. Spécification Détaillée des Modifications Proposées

### 2.1. Correction de `components/terrasse/NouveauChantierTerrasseModal.tsx`

- **Fichier :** `components/terrasse/NouveauChantierTerrasseModal.tsx` (lignes 127-141)
- **Problème actuel :** L'objet envoyé à `supabase.from("chantiers").insert(...)` omet la propriété `metier`. La base PostgreSQL lui assigne donc le défaut `'bardage'`.
- **Modification proposée :**
  Ajouter explicitement `metier: "terrasse"` dans le payload d'insertion :
  ```typescript
  const { data: nouveauChantier, error: errChantier } = await supabase
    .from("chantiers")
    .insert({
      nom: nom.trim() || "Chantier Terrasse",
      client_id: clientId,
      adresse_chantier: adresse.trim() || null,
      date_debut: dateDebut || null,
      date_fin: dateFin || null,
      statut: "prevu",
      code_acces: codeAcces,
      metier: "terrasse", // <--- SOURCE DE VÉRITÉ EXPLICITE
      checklist: phasesInitiales,
      entreprise_id: tenantId,
    })
    .select("id")
    .single();
  ```
- **Résultat :** Tout nouveau chantier créé depuis l'espace Terrasse aura `chantiers.metier = 'terrasse'` dès sa création en base.

---

### 2.2. Correction de la Conversion Devis → Chantier (`app/bureau/devis-factures/page.tsx`)

- **Fichier :** `app/bureau/devis-factures/page.tsx` (lignes 766-779, fonction `transformerEnChantier`)
- **Problème actuel :** L'insertion est aveugle :
  - `metier` est absent (donc devient `'bardage'`).
  - La `checklist` est hardcodée pour le bardage (`{ tasseaux, pare_pluie, pose, finition }`).
  - Si le devis concernait une terrasse, le chantier créé est corrompu dès l'origine.
- **Modification proposée (sans supposition automatique) :**
  1. **Détection préalable indicative :**
     Examiner `d.type_travaux`, `d.objet` ou les intitulés des lignes du devis pour déterminer une suggestion par défaut (`terrasse` si présence de mots-clés "terrasse", "lambourde", "platelage", sinon `bardage`).
  2. **Confirmation explicite requise de l'utilisateur :**
     Avant insertion, afficher une modale légère de qualification métier :
     > **Création du chantier à partir du devis {{numero}}**  
     > Quel est le corps d'état de ce chantier ?  
     > `[🔘 Bardage]` `[⚪ Terrasse]`
  3. **Création conditionnelle selon le choix validé :**
     - Si **Bardage** :
       ```typescript
       metier: "bardage",
       materiau_structurel: MATERIAU_STRUCTUREL_DEFAUT,
       moyen_acces: MOYEN_ACCES_DEFAUT,
       zone_vent: ZONE_VENT_DEFAUT,
       checklist: { tasseaux: false, pare_pluie: false, pose: false, finition: false },
       ```
     - Si **Terrasse** :
       ```typescript
       metier: "terrasse",
       checklist: {
         metier: "terrasse",
         phases_dtu: {
           support: { statut: "a_faire", notes: "Préparation terrain" },
           implantation: { statut: "a_faire", notes: "Piquetage / équerrage" },
           plots: { statut: "a_faire", notes: "Disposition plots" },
           lambourdes: { statut: "a_faire", notes: "Solivage et bandes" },
           platelage: { statut: "a_faire", notes: "Fixation lames" },
           finitions: { statut: "a_faire", notes: "Rives et réceptions" }
         }
       },
       ```
       Suivi de l'appel à `/api/chantiers/${id}/terrasse` pour instancier la fiche technique initiale de la terrasse.
  4. **Liaison bidirectionnelle :**
     Mettre à jour le devis avec `chantier_id = nouveauChantier.id` pour sceller la traçabilité.

---

### 2.3. Filtrage Fiable de la Liste `/terrain/chantier` (Bardage)

- **Fichier :** `app/terrain/chantier/page.tsx` (lignes 82-91, fonction `fetchChantiers`)
- **Problème actuel :**
  ```typescript
  const { data, error } = await supabase
    .from("chantiers")
    .select("*, clients(nom, societe)")
    .order("created_at", { ascending: false });
  ```
- **Modification proposée :**
  1. **Requête Supabase ciblée :**
     Appliquer le filtre strict sur `metier` tout en conservant les chantiers historiques où `metier` serait `NULL` :
     ```typescript
     const { data, error } = await supabase
       .from("chantiers")
       .select("*, clients(nom, societe), chantier_terrasses(id)")
       .or("metier.eq.bardage,metier.is.null")
       .neq("statut", "corbeille")
       .order("created_at", { ascending: false });
     ```
  2. **Garde-fou applicatif (anti-hybrides) :**
     Filtrer en mémoire pour exclure tout chantier qui posséderait une liaison terrasse active :
     ```typescript
     const chantiersBardage = (data || []).filter((c) => {
       // Exclure si explicitement terrasse
       if (c.metier === "terrasse") return false;
       // Exclure si possède une fiche terrasse
       if (Array.isArray(c.chantier_terrasses) && c.chantier_terrasses.length > 0) return false;
       return true;
     });
     ```
- **Résultat :** Étanchéité absolue de la liste Bardage. Aucun chantier terrasse ne pourra jamais s'y afficher.

---

### 2.4. Sécurisation du Routage URL dans le Hub Bardage (`app/terrain/chantier/[id]/page.tsx`)

- **Fichier :** `app/terrain/chantier/[id]/page.tsx` (lignes 85-87)
- **Anomalie D-01 identifiée :** Si l'URL contient `?module=invalide`, l'écran affiche un `<main>` vide (écran blanc).
- **Modification proposée :**
  ```typescript
  const MODULES_BARDAGE_VALIDES: readonly ModuleBardageKey[] = [
    "general",
    "avancement",
    "calepinage",
    "heures",
    "meteo",
    "photos",
    "rapport",
    "documents",
  ];

  function validerCleModule(cle: string | null): ModuleBardageKey | null {
    if (!cle) return null;
    return MODULES_BARDAGE_VALIDES.includes(cle as ModuleBardageKey)
      ? (cle as ModuleBardageKey)
      : null;
  }
  ```
  Et dans le composant :
  ```typescript
  const rawParam = searchParams.get("module");
  const moduleParam = useMemo(() => validerCleModule(rawParam), [rawParam]);
  ```
- **Résultat :** Tout paramètre invalide revient immédiatement et de manière sécurisée à `null` (affichage propre des 8 cartes du Hub), sans écran blanc.

---

## 3. Stratégie de Traitement des Données Historiques & Chantiers Mal Classés

### 3.1. Le cas unique de `TEST_P1 Bardage HPL`
Le chantier `c206dbfc-72f8-440b-ae04-1025e11762a2` est un cas hybride issu des phases de développement antérieures.

#### Option A (Recommandée — Nettoyage propre et scission) :
1. Conserver `c206dbfc-72f8-440b-ae04-1025e11762a2` exclusivement comme **Chantier Bardage** :
   - Supprimer l'enregistrement orphelin dans `chantier_terrasses` associé à ce chantier.
   - Nettoyer `checklist` pour réinitialiser les phases Bardage.
   - `metier` reste fermement `'bardage'`.
2. Si un chantier test de Terrasse est souhaité :
   - Créer un chantier dédié via l'interface `/terrain/terrasse` (ex: `TEST_T1 Terrasse Pin Cl4`) avec son propre ID et `metier = 'terrasse'`.

#### Option B (Suppression via la Corbeille Terrasse) :
- L'utilisateur utilise le nouveau bouton Corbeille présent sur la carte de `/terrain/terrasse` pour déplacer ce chantier dans la corbeille terrasse puis purger.

> ⚠️ **Aucune action SQL ne sera exécutée sur ce chantier sans ton accord explicite préalable.**

---

## 4. Vérification des Routes API et Services

| Route API / Service | Rôle | Action de sécurisation requise |
| :--- | :--- | :--- |
| `POST /api/chantiers/[id]/terrasse` | Sauvegarde configuration terrasse | Vérifier que `chantier.metier === 'terrasse'`. Si le chantier était `bardage`, refuser ou lever une exception explicite. |
| `GET /api/chantiers/[id]/terrasse` | Lecture configuration terrasse | Vérifier l'appartenance métier en plus du tenant. |
| `GET /api/chantiers/[id]/metre-complet` | Métré bardage | Vérifier que `chantier.metier === 'bardage'`. |
| `lib/terrasse/corbeilleService.ts` | Corbeille terrasse | S'assurer que les actions de corbeille ne touchent que les chantiers dont `metier = 'terrasse'`. |

---

## 5. Comportement des Tables Partagées

Les tables partagées sont reliées aux chantiers par clé étrangère (`chantier_id`) :
- **`clients`** : Un client peut posséder à la fois des chantiers Bardage et des chantiers Terrasse. L'étanchéité se fait au niveau du chantier, pas du client.
- **`devis`** : Rattaché à un chantier via `devis.chantier_id`. La conversion devis -> chantier lie fermement le devis au métier choisi.
- **`factures`** : Facturent un devis ou un chantier. Les factures d'avancement et de solde héritent du métier via leur `chantier_id`.
- **`commandes`** : Bons de commande matériaux. Conservent `chantier_id`.
- **`pointages`** : Les heures saisies par les équipes restent rattachées au `chantier_id`.
- **`pv_receptions`** & **`chantier_retenues_garantie`** : Fonctionnent à l'identique pour les deux métiers.

**Garantie :** Aucune modification de schéma sur ces tables. Le cloisonnement applicatif n'altère en rien l'intégrité référentielle existante.

---

## 6. Analyse des Migrations SQL

### Migration existante : `supabase/migrations/20261112_add_metier_to_chantiers.sql`
Cette migration contient déjà :
1. `ALTER TABLE public.chantiers ADD COLUMN IF NOT EXISTS metier text NOT NULL DEFAULT 'bardage' CHECK (metier IN ('bardage', 'terrasse', 'cloture'));`
2. `CREATE INDEX IF NOT EXISTS idx_chantiers_entreprise_metier ON public.chantiers (entreprise_id, metier);`
3. Trigger d'intégrité `tg_set_entreprise_par_chantier_terrasse` empêchant d'associer une terrasse à un chantier qui n'a pas `metier = 'terrasse'`.

> **Conséquence importante :** Dès que ce trigger est actif en base, insérer dans `chantier_terrasses` sans avoir au préalable posé `chantiers.metier = 'terrasse'` échoue avec une exception PostgreSQL. La correction de `NouveauChantierTerrasseModal.tsx` (point 2.1) est donc **urgente et indispensable**.

---

## 7. Plan de Tests de Non-Régression à Ajouter

Pour sceller durablement ce cloisonnement, nous prévoyons d'ajouter une suite de tests unitaires et d'intégration dédiée : `__tests__/metiers/cloisonnement-chantiers.test.ts` comprenant :

1. **Test 1 :** Vérification que `NouveauChantierTerrasseModal` injecte `metier: "terrasse"` dans le payload Supabase.
2. **Test 2 :** Vérification que la liste `/terrain/chantier` n'affiche aucun chantier ayant `metier = 'terrasse'` ou possédant un enregistrement terrasse.
3. **Test 3 :** Vérification que la conversion Devis → Chantier refuse l'insertion sans choix explicite du métier.
4. **Test 4 :** Vérification que le Hub Bardage (`ChantierDetailPage`) redirige vers la grille des 8 cartes si `?module=invalide`.
5. **Test 5 :** Vérification que les chantiers historiques avec `metier = NULL` continuent d'apparaître sur la vue Bardage s'ils n'ont pas de terrasse.

---

## 8. Synthèse des Risques et Dépendances

| Risque potentiel | Niveau | Mesure préventive |
| :--- | :--- | :--- |
| **Blocage de création terrasse par trigger SQL** | Élevé | Poser impérativement `metier: "terrasse"` dans `NouveauChantierTerrasseModal` avant d'activer le trigger. |
| **Disparition d'anciens chantiers** | Moyen | Utiliser le prédicat `.or("metier.eq.bardage,metier.is.null")`. |
| **Régression de tests de style/opacité** | Faible | Conserver strictement la structure DOM existante (`bg-transparent`, Suspense). |

---

## 9. Décisions soumises à Validation Utilisateur

Avant toute intervention sur le code, merci de confirmer :
1. **La validation de la modale de confirmation explicite du métier** lors de la conversion Devis → Chantier.
2. **La validation du traitement du chantier de test hybride `TEST_P1 Bardage HPL`** (Option A : nettoyage de la ligne terrasse orpheline pour le conserver en pur bardage, ou Option B : suppression via la corbeille terrasse).
3. **Le feu vert pour passer à l'implémentation de la Phase E.**

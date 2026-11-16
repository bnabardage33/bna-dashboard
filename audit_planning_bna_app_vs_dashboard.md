# Rapport comparatif — Planning & Calendrier (`Bna-app` vs `bna-dashboard`)

Date : 2026-11-16  
Objectif : Évaluer la reprise et le réhabillage du planning de `Bna-app` pour unifier les 3 piliers métiers (`BARDAGE`, `TERRASSE`, `CLOTURE`) de `bna-dashboard`.

---

## 1. Analyse du planning dans `Bna-app`

### Fichiers localisés dans `/data/data/com.termux/files/home/Bna-app`
| Fichier | Rôle |
| :--- | :--- |
| `src/components/dashboard/BnaPlanningView.tsx` (866 lignes) | Grille temporelle interactive (modes **Semaine** et **Mois**, navigation Précédent / Aujourd'hui / Suivant, auto-scroll vers aujourd'hui). |
| `src/lib/services/planningService.ts` (624 lignes) | Modèle unifié `UnifiedPlanningItem` et palette `NATURES_CONFIG` (7 natures : `technique`, `reception`, `client`, `livraison`, `travaux`, `administratif`, `autre`). |
| `src/components/dashboard/PlanningCard.tsx` (257 lignes) | Carte conteneur qui agrège les chantiers, rendez-vous (`rendezVousService`) et livraisons fournisseurs (`commandesFournisseursService`). |
| `src/components/dashboard/PlanningDetailModal.tsx` | Modale de détail au clic sur un élément du planning. |
| `src/components/chantiers/ChantierPlanningModal.tsx` (510 lignes) | Modale planning dédiée à un chantier (édition `date_debut` / `date_fin` + jalons RDV/livraisons). |
| `src/components/dashboard/bnaPlanningView.test.ts` & `src/lib/services/planning.test.ts` | Suites de tests unitaires associées. |

### Architecture, rendu visuel & données
- **Modes d'affichage** : bascule `Semaine` (7 jours Lun–Dim, numéro de semaine ISO) / `Mois` (tous les jours du mois), avec colonne gauche sticky (`Lignes`).
- **3 swimlanes (couloirs)** dans `BnaPlanningView.tsx` :
  1. **Chantiers** : barres pleines `bg-neutral-900` avec remplissage d'avancement Cuivre (`#D97732` → `#EA580C`), indicateurs `‹` / `›` si le chantier déborde hors de la période visible, et badge `%`.
  2. **Rendez-vous** : pastilles colorées par `natureKey` (`NATURES_CONFIG`).
  3. **Commandes / Livraisons** : pastilles dédiées avec statut fournisseur.
- **Résumé compact en haut** : compteurs dynamiques sur la plage visible (`X chantiers`, `Y RDV`, `Z livraisons`).
- **Interactions** : clic sur une barre/pastille → `onSelectItem` / pop-up de détail / `onSelectChantier`. En revanche, `BnaPlanningView.tsx` **ne fait pas de glisser-déposer (drag & drop)** pour décaler les dates ; l'édition des dates passe par `ChantierPlanningModal.tsx`.
- **Thème** : déjà conçu en **fond blanc clair (`bg-white`)** avec header sombre compact et accents Cuivre `#D97732`.

---

## 2. Comparaison avec `bna-dashboard`

### Composant actuel : `components/PlanningGantt.tsx` (284 lignes)
Utilisé dans `app/terrain/chantier/page.tsx` (lignes 416–431) lorsque `viewMode === "gantt"` (« Planning ») :
- **Rendu visuel** : encapsulé dans `<Surface>` sombre (`bg-[#1E1E1E]` / bordures `border-white/10`), en rupture visuelle avec les nouvelles pages claires (`#F3F3F1`, cartes blanches, accents Terracotta `#B85B2B`).
- **Timeline figée** : fenêtre fixe de `180` jours démarrant à `J - 15` (`DAY_WIDTH_PX = 20`), sans sélecteur Semaine/Mois ni navigation par mois/semaine.
- **Couleurs** : barres colorées par statut (`#42A5F5`, `#4CAF50`, `#9E9E9E`) sans distinction de métier (`bardage`, `terrasse`, `cloture`) ni de nature d'événement.
- **Points forts à conserver** :
  - **Glisser-déposer horizontal** (`onPointerDown` → `onUpdateDates(id, debutStr, finStr)`).
  - **Alertes intempéries** (`rapports_intemperies` avec `jour_arrete = true` → icône `AlertTriangle` + anneau rouge).
  - **Jauge d'avancement** (`avancements_chantier`).

### Stockage des dates et durées dans `chantiers` (`types/supabase.ts`)
La table `public.chantiers` stocke :
- `date_debut: string | null`
- `date_fin: string | null`
- `coef_perte_rendement: number | null`
- `metier: string` (`'bardage' | 'terrasse' | 'cloture'`)
- Il n'existe **pas** de colonne `duree_estimee_jours` en base : les durées prévisionnelles sont calculées dynamiquement côté moteur dans `lib/tempsPoseCalcul.ts` (`calculerTempsPoseBardage`, `calculerTempsPoseTerrasse`, `calculerTempsPoseCloture` → `totalHeures` et `tempsPlanification`).

---

## 3. Proposition d'architecture d'intégration unifiée (`Bardage` + `Terrasse` + `Clôture`)

1. **Nouveau composant unifié `components/PlanningChantiers.tsx`** (inspiré de `BnaPlanningView.tsx` + drag & drop de `PlanningGantt.tsx`) :
   - **Charte claire BNA** : carte blanche `rounded-2xl sm:rounded-3xl border-[#E5E5E5] bg-white`, grille claire, accents Terracotta `#B85B2B`, boutons `Semaine | Mois`, `‹ Aujourd'hui ›`.
   - **Couleurs par métier & statut** : badges/accents distincts pour `Bardage` (`#3B82F6`), `Terrasse` (`#F59E0B`), `Clôture` (`#B85B2B`), tout en conservant la jauge d'avancement (`%`) et l'icône d'alerte intempéries.
   - **Interactions combinées** :
     - Clic sur un chantier → ouverture directe du Hub dédié (`/terrain/chantier/[id]`, `/terrain/terrasse/[id]`, `/terrain/cloture/[id]`) ou modale rapide d'édition des dates.
     - Glisser-déposer conservé pour décaler `date_debut` / `date_fin` (appel `onUpdateDates`) sur la vue Semaine/Mois.
     - Affichage optionnel de la **durée calculée** (`tempsPlanification` issu de `tempsPoseCalcul.ts`) lorsque `date_fin` n'est pas encore renseignée.
2. **Intégration double** :
   - **Par espace métier** : bascule `Liste | Planning` dans `app/terrain/chantier/page.tsx` (Bardage), `app/terrain/terrasse/page.tsx` (Terrasse) et `app/terrain/cloture/page.tsx` (Clôture), filtrée automatiquement sur le métier actif.
   - **Vue globale multi-chantiers** : possibilité d'afficher les 3 métiers réunis sur une même timeline (avec filtre `Tous | Bardage | Terrasse | Clôture`).

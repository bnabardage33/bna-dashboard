# Audit & Plan de refonte — Module SAV & Garantie (`bna-dashboard`)

Date : 2026-11-16  
Périmètre analysé : `app/bureau/sav/`, `components/RapportSAVPDF.tsx`, `types/supabase.ts`, `supabase/migrations/`

---

## 1. Inventaire des fichiers & Base de données

### Fichiers existants liés au SAV & Garanties
| Fichier | Rôle |
| :--- | :--- |
| [`app/bureau/sav/page.tsx`](app/bureau/sav/page.tsx) (173 lignes) | Liste des tickets SAV (`tickets_sav`), recherche texte et filtres (`tous`, `ouvert`, `cloture`, `garantie`, `hors_garantie`). |
| [`app/bureau/sav/[id]/page.tsx`](app/bureau/sav/[id]/page.tsx) (624 lignes) | Fiche création / édition d'un ticket SAV, upload photos (`sav_photos`), signatures technicien/client, génération de devis SAV (`generer_prochain_numero_sav`) et aperçu PDF. |
| [`components/RapportSAVPDF.tsx`](components/RapportSAVPDF.tsx) (156 lignes) | Gabarit imprimable du rapport d'intervention SAV. |
| `supabase/migrations/20260917_secure_sav_sit_number.sql` | RPC atomique `generer_prochain_numero_sav` (numérotation `SAV-YYYY-###`). |
| `supabase/migrations/20260922_isolation_multi_entreprise_phase1_part1/2/4.sql` | Politiques RLS multi-entreprise sur `tickets_sav`. |

*(Note : `app/api/chantiers/[id]/retenue-garantie/` et `RetenueGarantieChantier.tsx` concernent la retenue financière de garantie 5 % Loi 1971, distincte du SAV).*

### Structure actuelle en base (`types/supabase.ts`)
- **`public.tickets_sav`** :
  - Relations : `chantier_id -> chantiers(id)`, `entreprise_id -> entreprises(id)`.
  - Champs métier : `statut`, `sous_garantie (boolean | null)`, `type_sinistre`, `localisation`, `description`, `cause_probable`, `respect_dtu (boolean | null)`, `diagnostic_dtu`, `materiel_prevu (jsonb)`, `date_intervention`, `temps_estime`, `intervenant`, `moyen_acces`, `photos (jsonb)`, `signature_technicien`, `signature_client`.
  - **Absents** : pas de colonne `metier`, pas de `type_garantie` (`gpa` / `biennale` / `decennale`), ni de lien direct `pv_reception_id`.
- **Lien avec les PV de réception (`public.pv_receptions`)** :
  - `pv_receptions` stocke `chantier_id`, `date_reception`, `statut`, `signature_client`, `signature_entreprise`, `reserves`.
  - Aujourd'hui, **aucune requête** dans `app/bureau/sav/` ne lit `pv_receptions`.

---

## 2. Diagnostic : pourquoi le module actuel est bloqué sur l'ancien design et limité au Bardage

1. **Verrouillage 100 % Bardage dans `app/bureau/sav/[id]/page.tsx`** :
   - **Liste des sinistres figée** (lignes 349–354) : `"Lame voilée / fendue"`, `"Infiltration d'eau"`, `"Problème encadrement"`, `"Grille anti-rongeur"`, `"Fixation / Tasseau"`, `"Autre"`. Aucun item pour **Terrasse / Terrasse Mobile** (plots, lambourdes, moteur/rails/fin de course, lames) ni **Clôture** (poteau, soubassement, portillon/serrure/gâche).
   - **Référentiel normatif figé** (lignes 375, 390) : titre `"2. Diagnostic DTU 41.2"` et interrupteur `"Respect des normes DTU 41.2"`, inadaptés à la Terrasse (NF DTU 51.4) et à la Clôture.
   - **Libellés & exemples Bardage** : `"Localisation (Façade, Pignon...)"` (ligne 359), `"Ex: 3x lames Red Cedar 3600..."` (ligne 416), bouton mort `"Ajouter au débit atelier (Prochainement)"` (ligne 422).
   - **Liste SAV (`app/bureau/sav/page.tsx`)** : la requête `select("*, chantiers(nom, clients(nom))")` (ligne 20) ne récupère pas `chantiers.metier` et n'offre aucun filtre par corps d'état.

2. **Aucun calcul de garantie légale** :
   - `sous_garantie` est un **simple booléen manuel** (`!ticket.sous_garantie` au clic, ligne 318).
   - Aucune distinction entre :
     - **GPA (1 an)** : parfait achèvement sur tous désordres signalés après réception.
     - **Garantie Biennale (2 ans)** : éléments d'équipement dissociables (motorisation / capteurs / rails de terrasse mobile, serrures / gâches de portillon).
     - **Garantie Décennale (10 ans)** : structure, solidité, étanchéité, scellements, ossature.
   - Sans lecture de `pv_receptions.date_reception` (ou repli `chantiers.date_fin`), l'application ne sait pas calculer automatiquement si un ticket est **Sous Garantie** ou **Hors Garantie**.

3. **Dissonance visuelle (ancien thème sombre)** :
   - `app/bureau/sav/page.tsx` et `app/bureau/sav/[id]/page.tsx` utilisent encore l'ancien thème sombre (`Surface`, `bg-[#1E1E1E]`, `bg-red-600`, `text-white`, `border-white/10`), en rupture avec la charte claire unifiée (`#F3F3F1`, cartes blanches `border-[#E5E5E5]`, accents Terracotta `#B85B2B`).

---

## 3. Architecture d'amélioration proposée

### A. Base de données & Moteur de calcul des garanties (`lib/savGaranties.ts`)
1. **Migration SQL légère** (`tickets_sav`) :
   - Ajouter `type_garantie text CHECK (type_garantie IN ('gpa_1an', 'biennale_2ans', 'decennale_10ans')) DEFAULT 'decennale_10ans'` et `pv_reception_id uuid REFERENCES pv_receptions(id) ON DELETE SET NULL`.
2. **Moteur pur `lib/savGaranties.ts`** :
   - Catalogue de types de sinistres typés par métier (`BARDAGE`, `TERRASSE`, `CLOTURE`) associant chaque catégorie à son régime légal par défaut :
     - *Bardage* : Infiltration / Étanchéité (`decennale_10ans`), Ossature / Fixations (`decennale_10ans`), Lame fissurée / voilée (`gpa_1an` / `decennale_10ans`), Encadrement / Grille anti-rongeur (`gpa_1an`).
     - *Terrasse & Terrasse Mobile* : Affaissement plots / structure (`decennale_10ans`), Lame fendue / clip (`gpa_1an`), Motorisation / Solaire / Fin de course / Rails terrasse mobile (`biennale_2ans`).
     - *Clôture* : Poteau descellé / muret (`decennale_10ans`), Portillon / Serrure / Gâche (`biennale_2ans`), Lame / Soubassement (`gpa_1an`).
   - Fonction `calculerStatutGarantie({ dateReception, dateSinistre, typeGarantie })` :
     - Calcule `dateExpiration` (+1 an, +2 ans, +10 ans depuis `pv_receptions.date_reception`, avec repli `chantiers.date_fin`), retourne `{ sousGarantie: boolean, joursRestants: number, dateExpiration: string, libelleRegime: string }` (tout en laissant une possibilité de dérogation manuelle tracée).

### B. Refonte UI claire (`#F3F3F1` / Cartes blanches / Terracotta `#B85B2B`)
1. **Liste `app/bureau/sav/page.tsx`** :
   - Bannière claire `BNA Pilotage BTP · SAV & Garanties` (`#F3F3F1` + carte blanche `rounded-2xl sm:rounded-3xl border-[#E5E5E5]`).
   - Filtre par métier (**Tous | Bardage | Terrasse | Clôture**) + filtres de statut (**Ouverts | Clôturés | Sous Garantie | Hors Garantie**).
   - Cartes blanches affichant le badge métier, le régime de garantie (`GPA 1 an` / `Biennale 2 ans` / `Décennale 10 ans`) et le badge vert `Sous garantie` ou rouge doux `Hors garantie`.
2. **Fiche `app/bureau/sav/[id]/page.tsx`** :
   - Sélection du chantier affichant son métier (`Bardage`, `Terrasse`, `Clôture`) et récupérant automatiquement son dernier `pv_receptions` signé (`date_reception`).
   - Formulaire dynamique selon le métier du chantier sélectionné :
     - Catégories de sinistres adaptées au métier.
     - Libellé normatif dynamique (`DTU 41.2 / 45.4` pour Bardage, `NF DTU 51.4` pour Terrasse, `DTU 26.2 / Fabricant` pour Clôture).
     - Calcul et affichage en direct de l'échéance de garantie (`Réceptionnée le ... → Couverte jusqu'au ...`).
3. **PDF [`components/RapportSAVPDF.tsx`](components/RapportSAVPDF.tsx)** :
   - Ajout du métier du chantier, de la date du PV de réception de référence et du régime de garantie applicable (GPA / Biennale / Décennale).

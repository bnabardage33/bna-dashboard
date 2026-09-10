# Analyse — Prochaines fonctions à coder

Date : 10/09/2026
Contexte : artisan solo façadier/bardage. Le dashboard automatise déjà : devis vocal Gemini, photo IA, dictée avancement (Whisper + gpt-oss-20b), dashboard tréso patron, docs compta, alertes fournisseurs, rapports client auto (cron hebdo), moteur intempéries.

Audit des tâches encore manuelles après lecture complète de app/bureau/*, app/terrain/*, finance, composants et APIs.

---

## Propositions classées par ROI (gain de temps / complexité)

### 🥇 1. Facturation automatique à l'acceptation d'un devis

- **Nom** : Facturation auto (Acompte à l'acceptation)
- **Problème résolu** : Quand un devis passe à « Accepté », le patron doit aller créer à la main la facture d'acompte (30%) dans l'onglet Factures — et il oublie parfois de le faire, encaissant l'acompte en retard.
- **Gain estimé** : ~10 min par devis accepté + encaissement de l'acompte en avance (cash-flow direct).
- **Tables concernées** : `devis`, `factures`
- **Complexité** : **Facile** — le générateur existe déjà.
- **Détail important** : Le code `genererFactureAcompte()` et `handleGenererFacture()` dans `app/bureau/devis-factures/page.tsx` (l.274-371) est **déjà écrit mais mort** : à l'acceptation d'un devis, `changerStatut()` ne fait que `setDevisToBill(d)` (l.267) sans aucun modal ni appel de génération. Il suffit de le brancher (idéalement côté serveur dans une API déclenchée sur le changement de statut pour éviter toute dépendance au navigateur).

---

### 🥈 2. Rapport intempéries en automatique (cron quotidien)

- **Nom** : Veille météo intempéries automatique
- **Problème résolu** : Par jour de pluie, le patron doit penser à cliquer « ⚡ Vérifier & Générer » pour tracer l'intempérie (protection vis-à-vis client et assurance décennale). S'il l'oublie, plus de preuve.
- **Gain estimé** : ~15 min/jour de pluie + traçabilité juridique automatique.
- **Tables concernées** : `rapports_intemperies`, `rapports_intemperies_jours_arretes`, `chantiers` (+ API météo existante)
- **Complexité** : **Facile à moyen** — le moteur complet existe (`app/api/rapports-intemperies/generer/route.ts`, dedup par jour, `cree_par: "auto"`), mais n'est déclenché qu'au clic. `vercel.json` n'a qu'**un seul cron** (rapports client, lundi 6h) : il suffit d'en ajouter un quotidien (~6h) + une notification.
- **Risque** : budget des crons Vercel (les crons ne tournent pas sur l'offre gratuite) → à confirmer avant.

---

### 🥉 3. OCR des BL / tickets (auto-remplissage du montant)

- **Nom** : Scan intelligent BL / Ticket
- **Problème résolu** : Aujourd'hui le patron photographie le BL/ticket puis **tape à la main** le montant HT et la TVA (`app/bureau/documents-compta/page.tsx`) — répétitif et source d'erreurs.
- **Gain estimé** : ~2 min par document.
- **Tables concernées** : `documents_compta`, `fournisseurs`, `depenses_chantier` (association auto + dépense auto déjà en place)
- **Complexité** : **Difficile** — OCR multimodal (image → montants/date/fournisseur) avec fiabilité variable sur tickets abîmés, TVA multi-taux, montants barrés. Nécessite un modèle vision (Gemini Vision gpt-oss ne suffit pas) et une étape de validation humaine.

---

## ✅ Recommandation : coder en priorité la **Facturation automatique (proposition 1)**

**Pourquoi :**
1. **ROI maximal** : quasi zéro effort (code déjà présent, il est simplement débranché), impact immédiat.
2. **Impact cash-flow direct** : l'acompte 30% est encaissé le jour de la signature au lieu de jours/semaines plus tard.
3. **Zéro risque fonctionnel** : la logique de calcul des lignes (acompte/situation/totale) est déjà testée en place.
4. **Cohérent avec les missions déjà livrées** : l'automatisation du passage devis → chantier (`transformerEnChantier`) existe déjà ; la facturation est le maillon qui manque.
5. Contrairement à la veille intempéries (dépend du budget crons Vercel) et à l'OCR (fiabilité moyenne), elle ne dépend ni d'un coût récurrent ni d'une qualité incertaine.

**Plan d'implémentation (mission suivante)** :
- Créer `app/api/facture-acompte/route.ts` (POST : devis_id) qui génère l'acompte si absent (numéro auto via `prochainNumero`, montant = `acompte_pct` du devis, statut `envoyee`).
- Branchage : à l'acceptation d'un devis (page devis-factures), appeler l'API via une action serveur ou un remplacement de `changerStatut()`.
- Optionnel : bouton « + Générer facture' » sur la liste des devis signés pour regénération manuelle.
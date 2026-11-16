# Documentation Technique — Module Devis, Factures & Règlements

---

## 1. Arborescence et périmètre fonctionnel

### Interfaces Bureau & Espace Client
* **Devis & conversion en facture/chantier :** `app/bureau/devis-factures/page.tsx`
* **Factures, acomptes, soldes & relances :** `app/bureau/factures/page.tsx`
* **Documents comptables (BL / tickets OCR) :** `app/bureau/documents-compta/page.tsx`
* **Fin de chantier & PV de réception :** `app/bureau/fin-chantier/page.tsx`
* **Portail client public (consultation & signature OTP) :** `app/espace-client/[code_acces]/page.tsx`

### Moteurs métier & librairies (`lib/`)
* **Calcul devis (HT, coûts, marge) :** `lib/devisCalcul.ts`
* **Calcul factures multi-TVA, retenue de garantie (5 %) & situations :** `lib/retenueCalculs.ts`
* **Normalisation TVA :** `lib/tauxTva.ts`
* **Numérotation sécurisée (RPC) :** `lib/numerotationDocuments.ts`
* **Passerelle métré → devis :** `lib/servirMetreComplet.ts`, `lib/metreVersPostes.ts`, `lib/iaDevisMetre.ts`, `lib/iaDevisTexteRepli.ts`
* **Analyse & historique devis :** `lib/devisAnalyse.ts`, `lib/devisHistorique.ts`, `lib/devisPreselection.ts`
* **Signature électronique (OTP & intégrité PNG) :** `lib/codeVerificationClient.ts`, `lib/signature/encreSignature.ts`, `lib/signature/gardeSignature.ts`
* **Export comptable CSV :** `lib/csvExport.ts`

### Routes API (`app/api/`)
* **Devis :** `app/api/devis/route.ts`, `app/api/devis/[id]/analyse/route.ts`, `app/api/ia-devis/route.ts`
* **Factures :** `app/api/factures/route.ts`, `app/api/factures/[id]/route.ts`, `app/api/factures/calculer/route.ts`
* **Retenue de garantie :** `app/api/chantiers/[id]/retenue-garantie/route.ts`, `app/api/chantiers/[id]/retenue-garantie/liberer/route.ts`
* **Espace client & OTP :** `app/api/espace-client/[code_acces]/route.ts`, `app/api/espace-client/[code_acces]/send-otp/route.ts`, `app/api/espace-client/[code_acces]/verify-otp/route.ts`

### Composants PDF & Signature (`components/`)
* `components/DocumentPDF.tsx`, `components/LettreRelancePDF.tsx`, `components/RetenueGarantieChantier.tsx`, `components/SignatureModal.tsx`, `components/SignaturePad.tsx`

### Tables & RPC Supabase (`types/supabase.ts` & `supabase/migrations/`)
* **Tables :** `devis`, `factures`, `situations`, `retenues_liberations` (migrations `20261008_*`), `chantiers`, `clients`.
* **RPC :** `generer_prochain_numero_dev` (`DEV-YYYY-###`), `generer_prochain_numero_fac` (`FAC-YYYY-###`), `generer_prochain_numero_sit` (`SIT-YYYY-###`), et RPC de libération de retenue (`20261008_liberer_retenue_rpc.sql`).

> **Périmètre couvert :** Devis, factures d'acompte (`type_facture = 'acompte'`), factures de situation (`type_facture = 'situation'`), factures de solde/totales (`'solde' | 'totale'`). **Les avoirs (`avoir`) et une table dédiée de règlements partiels n'existent pas** : un règlement est représenté par le changement de `factures.statut` vers `'payee'`.

---

## 2. Moteur de calcul financier (`lib/devisCalcul.ts` & `lib/retenueCalculs.ts`)

* **Devis (`lib/devisCalcul.ts`) :**
  * Les lignes marquées `a_chiffrer: true` (ou sans `qte > 0` / `pu_ht > 0`) sont exclues des totaux (`nb_a_chiffrer` incrémenté).
  * `total_ht = Σ arrondir(qte * pu_ht)`.
  * **Séparation Matière vs Main-d'œuvre :** `coutLigne(l) = arrondir(qte * pu_revient)` ; ventilé dans `cout_main_oeuvre_ht` si `type_cout === "main_oeuvre"`, sinon dans `cout_matiere_ht`.
  * **Marge :** `marge_ht = total_ht - cout_matiere_ht - cout_main_oeuvre_ht` et `marge_pct = (marge_ht / total_ht) * 100`.
  * **Remises :** Aucun champ `remise_pct` ou `remise_ht` dédié n'existe dans `devisCalcul.ts` ni dans `POST /api/devis` (seule une ligne manuelle à prix/quantité négative ou ajustement de `pu_ht` le permet).
* **TVA multi-taux & Retenue de garantie (`lib/retenueCalculs.ts` & `lib/tauxTva.ts`) :**
  * `normaliserTauxTva()` accepte `[0, 100]` (défaut `20`, `0` préservé explicitement pour éviter le piège `0 || 20`).
  * `calculerRetenueFacture()` regroupe les lignes par taux `taux_tva` (`0 %`, `5.5 %`, `10 %`, `20 %`) sans arrondi intermédiaire, puis calcule par tranche :
    * `base_ht = arrondirCentimes(Σ qte * pu_ht)`
    * `montant_tva = arrondirCentimes(base_ht * τ / 100)`
    * `montant_ttc = base_ht + montant_tva`
    * `retenue_ht = arrondirCentimes(base_ht * retenue_pct / 100)` et `retenue_ttc = arrondirCentimes(montant_ttc * retenue_pct / 100)` (plafonné strictement à **5,00 %** par `validerTauxRetenue()`, Loi n° 71-584).
    * `net_a_payer_ttc = max(0, total_ttc - montant_retenue_ttc)`.
  * **Auto-liquidation sous-traitance :** Non modélisée en tant que régime fiscal dédié (`0 %` est supporté mathématiquement par `tauxTva.ts`, sans mention légale automatique « Autoliquidation — Art. 283-2 nonies du CGI »).
* **Situations & Déductions d'acomptes :**
  * `calculerSituationAvancement(lignes, avancementPct, retenuePct, tvaDefaut)` proratise chaque `pu_ht` par `avancementPct / 100`.
  * Dans `app/bureau/devis-factures/page.tsx`, lors d'une facture `totale` (`solde`), les factures d'`acompte` liées au devis sont récupérées et injectées comme lignes de déduction négatives (`qte: -1`, `pu_ht: mntAcompteHT`).

---

## 3. Flux de création et passerelles métiers

1. **Création d'un devis (`POST /api/devis`) :**
   * **Saisie manuelle :** lignes libres (`catalogue_id: null`).
   * **Catalogue :** l'insertion depuis `catalogue_ouvrages` pré-remplit les quantités d'ossature via `calculerBesoinsBardage(surface_m2)` ; côté serveur, `POST /api/devis` réécrase `designation`, `unite`, `pu_ht` et `pu_revient` depuis `catalogue_ouvrages` + `catalogue_ouvrages_prix` (surcharges entreprise).
   * **IA vocale / texte & Métré Bardage (`POST /api/ia-devis`) :**
     * Si `chantier_id` est fourni : chemin déterministe `servirPayloadMetreComplet` → `mapperQuantitesPersistees` → `construireLignesDepuisPostes` (et option `inclure_main_oeuvre` ajoutant les heures `× taux_horaire_vente_ht` depuis `tempsPoseCalcul.ts`).
     * Sans `chantier_id` : chemin LLM (`Gemini`) + appariement catalogue (`iaDevisTexteRepli.ts`).
   * **Terrasse :** le calculateur `calculerTerrasse()` produit un quantitatif/chiffrage fournitures (+ option `inclureMainOeuvre`), sans bouton d'import automatique direct vers un devis dans `devis-factures/page.tsx`.
2. **Transformation Devis → Facture ou Chantier :**
   * **Vers Facture :** via `handleGenererFacture` ou `genererFactureAcompte` dans `devis-factures/page.tsx` → numérotation RPC (`FAC-YYYY-###` ou `SIT-YYYY-###`) → `POST /api/factures` (calcul serveur via `calculerRetenueFacture`). Après émission, les champs financiers de la facture sont verrouillés contre toute modification dans `PATCH /api/factures/[id]`.
   * **Vers Chantier :** `transformerEnChantier` dans `devis-factures/page.tsx` crée le chantier (`bardage` ou `terrasse` + ligne `chantier_terrasses` par défaut), génère un `code_acces` portail client, et passe le devis au statut `'accepte'`.

---

## 4. Génération PDF, Signature électronique et Espace Client

* **Rendu PDF (`components/DocumentPDF.tsx`) :**
  * Impression navigateur (`window.print()`), page 1 = Devis/Facture (entête entreprise, RC Pro/Décennale, tableau lignes, TVA, retenue de garantie, bloc signature), page 2 (devis uniquement) = **CGV BTP en 9 articles + Bordereau de rétractation Loi Hamon**.
* **Envoi & Espace Client (`app/espace-client/[code_acces]/page.tsx`) :**
  * Accès par `code_acces` unique du chantier (RPC sécurisée `get_espace_client_data` / route `/api/espace-client/[code_acces]`).
* **Signature électronique (`SignatureModal.tsx`, `send-otp`, `verify-otp`, `encreSignature.ts`, `gardeSignature.ts`) :**
  * Envoi d'un code OTP SMS/téléphone (`send-otp`) hashé et vérifié côté serveur (`codeVerificationClient.ts`).
  * Contrôle anti-signature vide côté client et côté serveur (`encreSignature.ts` : décompression PNG sécurisée anti-bombe + seuil minimal de `50` pixels non transparents).
  * Passage du devis à `statut = 'signe'` avec horodatage, nom du signataire et provenance.
* **Suivi des paiements & relances :**
  * Dans `app/bureau/factures/page.tsx`, détection des factures échues (`statut === "envoyee"` et `echeance < today`), génération de courrier de relance via `components/LettreRelancePDF.tsx`, et acquittement manuel (`statut = "payee"`, éventuellement avec signature Pad).

---

## 5. Limites actuelles, risques légaux/comptables et pistes d'évolution

1. **Absence d'avoirs d'annulation / rectificatifs :**
   * *Risque :* Le statut `'annulee'` existe côté `PATCH /api/factures/[id]` (pour exclure de la retenue de garantie), mais aucune numérotation ni pièce comptable d'**avoir** (`AVO-YYYY-###`) n'est générée, ce qui ne respecte pas l'inaltérabilité comptable française pour une facture déjà émise/envoyée.
2. **Facturation électronique (Factur-X / e-invoicing) & mentions légales :**
   * *Constat :* Le PDF est un rendu HTML imprimé (`window.print()`), sans XML structuré **Factur-X** (EN 16931), sans numéro de bon de commande / SIREN client obligatoire sur B2B, ni mention automatique d'**auto-liquidation de TVA** (Art. 283-2 nonies CGI) ou de **TVA non applicable / éco-contribution**.
   * *Attention sur `DocumentPDF.tsx` :* Le calcul affiché dans `DocumentPDF.tsx` (lignes 65-68) reste mono-taux (`tva = totalHT * (doc.tva_pct / 100)`), alors que `lib/retenueCalculs.ts` calcule déjà en multi-TVA côté API.
3. **Situations de travaux en cumul vs tranche :**
   * *Constat :* `calculerSituationAvancement` et `devis-factures/page.tsx` appliquent un pourcentage simple sur `pu_ht`, sans suivi structuré du **cumul antérieur vs avancement N / N-1** ni déduction automatique des situations précédentes sur le solde (seuls les `acompte` sont déduits automatiquement dans `handleGenererFacture`).
4. **Règlements partiels & Export comptable (FEC / journal des ventes) :**
   * *Constat :* Pas de table `reglements` (paiements partiels, mode de paiement, date d'encaissement, rapprochement bancaire). L'export CSV (`lib/csvExport.ts`) reste un export tableur simplifié, pas un **FEC** normé ni un journal de ventes ventilé par compte comptable (`704`, `44571`, `411`, `4117` retenue de garantie).
5. **Passerelle Terrasse → Devis :**
   * *Piste :* Ajouter dans `devis-factures/page.tsx` (ou dans `TerrasseQuantitatifTable.tsx`) un import direct du chiffrage `ResultatCalculTerrasse` (fournitures + option `inclureMainOeuvre`) vers un devis structuré, comme cela existe pour le métré Bardage.

# Audit des fonctionnalités — BNA Dashboard

**Périmètre :** fonctionnalités visibles ou accessibles dans le dépôt, relevées le 29 octobre 2026. Cet inventaire décrit ce que le dashboard propose ; il ne constitue pas un contrôle de qualité ni une vérification de bon fonctionnement en production.

## Accueil et navigation

- Accueil professionnel avec accès aux activités et raccourcis vers chantiers, clients, devis, catalogues et finance.
- Menu principal organisé par sections, recherche et notifications.
- Connexion utilisateur et paramètres de l’entreprise : identité, coordonnées, logo, informations d’assurance, médiateur et mentions légales utilisées dans les documents.

## Chantiers et suivi terrain

- Création, consultation et suivi des chantiers, avec fiche détaillée et données de suivi.
- Notes de chantier, dont saisie vocale avec transcription et aide à la synthèse.
- Photos de chantier et consultation des photos partagées.
- Avancement des travaux et informations de préparation chantier.
- Suivi météo général et par chantier : conditions actuelles, prévisions horaires et plusieurs jours, vigilance, pluie et vent.
- Rapports d’intempéries : création et consultation de rapports d’arrêt avec données météo associées.
- Fin de chantier, procès-verbaux de réception, réserves et suivi SAV / garantie.
- Retenue de garantie associée au chantier.
- Espace technique pour consulter et gérer les fiches techniques et documents métier.

## Études, devis et facturation

- Répertoire clients : création et consultation des fiches clients.
- Devis : création, lignes d’ouvrages, sélection dans le catalogue, analyse assistée, suivi de statut et génération de documents.
- Factures et encaissements : création de factures, notamment depuis un devis accepté, et suivi des statuts.
- Catalogue d’ouvrages pour le bardage et catalogue dédié aux terrasses.
- Métré sur photo : étalonnage à partir d’une longueur connue, tracé des façades et déductions (fenêtres / vides), puis calcul de surface nette. L’outil est nommé « Métré IA » dans le menu, mais le tracé visible dans la page est réalisé manuellement.
- Calepinage : zones, calculs, plans et bordereaux de débit, avec exports PDF et Excel.
- Outils de calcul et de préparation métier pour les façades, bardages et terrasses, y compris vues et quantitatifs terrasse.

## Fournisseurs et achats

- Gestion des contacts fournisseurs et de leurs spécialités.
- Création et suivi des commandes fournisseurs, avec affectation à un chantier, lignes d’articles et statut.
- Génération et envoi de bons de commande.

## Finance et pilotage

- Tableau financier avec indicateurs de chiffre d’affaires, dépenses, marge, reste à facturer et analyses par période.
- Suivi de rentabilité des chantiers et de la main-d’œuvre, ventilation des coûts, tendances de chiffre d’affaires et projections de trésorerie.
- Indicateurs de TVA et estimations de charges sociales.
- Saisie des dépenses, pointage, feuilles d’heures et frais d’intérim.
- Historique des opérations avec fonctions de correction.
- Vue patronale de trésorerie : encaissements, sommes en attente, dépenses à payer, projections à 15 et 30 jours, alertes et chantiers rentables ou déficitaires.
- Documents comptables et exports de synthèse financière / rapports pour la comptabilité.

## Espaces clients

- Gestion des portails clients associés aux chantiers et partage d’un lien d’accès.
- Portail de suivi de chantier pour le client, avec consultation des informations et échanges par chat.
- Signature électronique de documents et consultation des documents partagés selon le parcours client.

## Fonctionnalités d’intelligence artificielle

- **Génération de lignes de devis** : à partir d’une consigne texte et éventuellement d’un chantier ou d’une surface, propose des postes et quantités pour alimenter le devis.
- **Analyse d’un devis existant** : examine les lignes, le métré disponible et le catalogue de l’entreprise ; fournit un résumé, des lignes proposées, des alertes (par exemple doublons, quantités suspectes ou prix manquants) et des recommandations. Les propositions restent distinctes des lignes déjà enregistrées.
- **Notes vocales de chantier** : enregistre une dictée, la transcrit en français, puis reformule le texte pour corriger la syntaxe et la ponctuation. La note peut aussi être écrite directement.
- **Saisie vocale de l’avancement** : transcrit la dictée et extrait les pourcentages annoncés pour les façades nord, sud, est et ouest, ainsi que les observations reformulées.
- **Consignes de sécurité chantier** : génère une liste de cinq consignes à partir du contexte fourni, notamment le matériau, le moyen d’accès et la zone de vent.
- **Lecture de tickets et bons de livraison** : extrait d’une photo les montants HT/TTC, le taux de TVA, le fournisseur, la date, le numéro et une catégorie de dépense pour préremplir la saisie comptable.
- **Assistant IA du portail client** : permet au client de poser des questions dans le chat du portail ; le dashboard peut aussi consolider les échanges en résumés de session et de suivi.

## Comptes et autres accès

- Boîte à outils regroupant météo et vigilance, notes vocales, fiches techniques et rapports d’intempéries.
- Accès avec authentification ; la section Finance dispose en plus d’un verrouillage par code PIN.
- Fonctions de recherche dans les clients, chantiers, devis et fournisseurs.

## Sources principales consultées

- Navigation : `components/Drawer.tsx`
- Accueil : `app/page.tsx`, `components/AccueilProfessionnel.tsx`, `app/terrain/accueil/page.tsx`
- Chantiers et outils terrain : `app/terrain/`, `app/bureau/fin-chantier/page.tsx`, `app/bureau/sav/`, `app/bureau/rapports-intemperies/`
- Commerce et achats : `app/bureau/clients/page.tsx`, `app/bureau/devis-factures/page.tsx`, `app/bureau/factures/page.tsx`, `app/bureau/fournisseurs/page.tsx`, `app/bureau/catalogue/`, `app/bureau/catalogue-terrasse/`, `app/(dashboard)/calepinage/`
- Finance : `app/(dashboard)/finance/`, `app/bureau/dashboard-patron/page.tsx`, `app/bureau/documents-compta/page.tsx`
- Espaces client : `app/bureau/portails-clients/page.tsx`, `app/espace-client/`

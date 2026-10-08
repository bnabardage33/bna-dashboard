/**
 * lib/cgvContrat.ts
 *
 * Source de vérité commune des Conditions Générales de Vente (CGV BTP).
 * Utilisée pour assurer la stricte identité juridique entre le document
 * contractuel (DocumentPDF.tsx) et la consultation avant signature électronique (SignatureModal.tsx).
 *
 * Conforme aux exigences du Code de la consommation, de la loi Hamon et
 * de la loi n° 71-584 du 16 juillet 1971 (Retenue de garantie BTP).
 */

export interface ArticleCGVDefinition {
  numero: number;
  titre: string;
  contenu: string;
}

export const ARTICLES_CGV_CONTRAT: readonly ArticleCGVDefinition[] = [
  {
    numero: 1,
    titre: "Article 1 — Objet & Champ d'application",
    contenu:
      "Les présentes Conditions Générales de Vente (CGV) régissent l'ensemble des travaux de fourniture, pose de bardage rapporté, vêtures, isolation thermique par l'extérieur (ITE) et finitions réalisés par l'entreprise. Les travaux sont exécutés conformément aux règles de l'art et aux prescriptions des DTU 41.2 (bardages bois) et DTU 31.2 / CSTB en vigueur.",
  },
  {
    numero: 2,
    titre: "Article 2 — Devis, Validité & Engagement",
    contenu:
      "Le présent devis est valable pendant la durée mentionnée à compter de sa date d'émission (90 jours par défaut). L'acceptation du devis par le Client, manifestée par sa signature manuscrite ou électronique précédée de la mention « Bon pour accord », vaut conclusion définitive du contrat d'entreprise et acceptation sans réserve des présentes CGV.",
  },
  {
    numero: 3,
    titre: "Article 3 — Droit de rétractation (Particuliers)",
    contenu:
      "Conformément aux articles L.221-18 et suivants du Code de la consommation, le Client particulier (consommateur) dispose d'un délai légal de 14 jours calendaires pour exercer son droit de rétractation à compter de la signature du devis sans avoir à motiver sa décision, au moyen du formulaire détachable ou d'une déclaration dénuée d'ambiguïté.",
  },
  {
    numero: 4,
    titre: "Article 4 — Modalités de paiement & Pénalités",
    contenu:
      "Sauf accord écrit contraire, le règlement s'effectue selon les modalités suivantes : versement d'un acompte à la commande pour validation des approvisionnements, situations intermédiaires éventuelles et solde intégral à la signature du Procès-Verbal de Réception des travaux. En cas de retard de paiement, des pénalités au taux légal majoré de 3 fois le taux d'intérêt légal ainsi qu'une indemnité forfaitaire de 40 € pour frais de recouvrement (clients professionnels) seront appliquées de plein droit.",
  },
  {
    numero: 5,
    titre: "Article 5 — Délais d'exécution & Intempéries",
    contenu:
      "Les délais d'intervention et d'exécution sont donnés à titre indicatif. Ils sont suspendus et prolongés de plein droit en cas de force majeure, retards d'accès au site non imputables à l'entreprise, ou conditions météorologiques défavorables à la sécurité et à la qualité des ouvrages (vents supérieurs à 50 km/h, gel, fortes pluies certifiés par les relevés officiels Météo-France).",
  },
  {
    numero: 6,
    titre: "Article 6 — Réception des travaux & Transfert de garde",
    contenu:
      "À l'achèvement des travaux, les parties procèdent contradictoirement à la réception des ouvrages matérialisée par l'établissement d'un Procès-Verbal de Réception (avec ou sans réserves). La réception constitue le point de départ des garanties légales et opère le transfert de garde des ouvrages au Client (Maître d'Ouvrage).",
  },
  {
    numero: 7,
    titre: "Article 7 — Retenue de garantie légale & Consignation (Loi n° 71-584)",
    contenu:
      "Conformément aux dispositions de la loi n° 71-584 du 16 juillet 1971, une retenue de garantie égale au plus à 5 % du montant des travaux peut être appliquée sur les situations et acomptes, sous réserve d'avoir été expressément convenue entre les parties dans le devis accepté. Cette retenue a pour objet exclusif de garantir contractuellement la bonne exécution des travaux et de répondre, le cas échéant, aux réserves formulées lors de la réception contradictoire des ouvrages. En application de l'article 2 de ladite loi, les sommes retenues doivent être impérativement consignées entre les mains d'un tiers consignataire accepté des deux parties ou désigné judiciairement. L'entreprise conserve la faculté légale de substituer à cette retenue une caution personnelle et solidaire équivalente. La retenue (ou caution) est libérée dès la levée formelle des réserves constatée contradictoirement. À défaut de mainlevée amiable, elle est libérée de plein droit à l'expiration d'un délai d'un an à compter de la date de réception des travaux, sauf opposition motivée notifiée par LRAR pour inexécution contractuelle.",
  },
  {
    numero: 8,
    titre: "Article 8 — Assurances & Garantie Décennale",
    contenu:
      "L'entreprise est couverte par une assurance Responsabilité Civile Professionnelle et Garantie Décennale obligatoire (Art. 1792 du Code Civil) souscrite auprès d'une compagnie notoirement solvable, valable pour les travaux exécutés.",
  },
  {
    numero: 9,
    titre: "Article 9 — Médiation de la consommation & Litiges",
    contenu:
      "Conformément aux articles L.616-1 et R.616-1 du Code de la consommation, le Client consommateur a le droit de recourir gratuitement au médiateur de la consommation compétent pour le règlement amiable de tout litige. À défaut d'accord amiable, les tribunaux compétents seront ceux du siège social de l'entreprise.",
  },
];

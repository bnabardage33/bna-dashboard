import { PDFDocument, StandardFonts, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import type { Entreprise } from "@/types/entreprise";
import { fmtEuro } from "@/lib/financeCalculs";

export interface LigneBonCommande {
  designation: string;
  quantite: number;
  unite: string;
  montant_ht?: number | null;
}

export interface DonneesBonCommandePdf {
  commande: {
    id: string;
    created_at?: string | null;
    date_commande?: string | null;
    date_livraison_prevue?: string | null;
    designation: string;
    quantite?: number | null;
    unite?: string | null;
    montant_ht?: number | null;
    lignes?: LigneBonCommande[];
  };
  fournisseur: {
    nom: string;
    contact?: string | null;
    telephone?: string | null;
    email?: string | null;
    conditions_paiement?: string | null;
  };
  chantier?: {
    nom?: string | null;
    adresse?: string | null;
    clientNom?: string | null;
  } | null;
  entreprise?: Entreprise | null;
}

/**
 * Nettoie les caractères non compatibles avec la police WinAnsi standard de pdf-lib.
 */
function assainirTexte(str: string | null | undefined): string {
  if (!str) return "";
  return str
    .replace(/[’‘`]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[—–]/g, "-")
    .replace(/…/g, "...")
    .replace(/[^\x00-\xFF]/g, " "); // Conserve ASCII étendu / Latin-1 pour les accents français
}

export async function genererBonCommandePdf(donnees: DonneesBonCommandePdf): Promise<Uint8Array> {
  const { commande, fournisseur, chantier, entreprise } = donnees;

  const doc = await PDFDocument.create();
  const fontRegular = await doc.embedFont(StandardFonts.Helvetica);
  const fontBold = await doc.embedFont(StandardFonts.HelveticaBold);

  const page = doc.addPage([595.28, 841.89]); // A4 portrait
  const { width, height } = page.getSize();

  // Palette BNA
  const rougeBna = rgb(0.85, 0.15, 0.15); // #D92626
  const couleurTexteSombre = rgb(0.12, 0.14, 0.18);
  const couleurGrisMoyen = rgb(0.42, 0.46, 0.52);
  const couleurBordure = rgb(0.85, 0.88, 0.92);
  const couleurFondCarte = rgb(0.97, 0.98, 0.99);

  let y = height - 30;

  // 1. Bandeau supérieur rouge
  page.drawRectangle({
    x: 40,
    y: y - 4,
    width: width - 80,
    height: 4,
    color: rougeBna,
  });

  y -= 25;

  // 2. En-tête émetteur & Bon de Commande
  const raisonSociale = assainirTexte(entreprise?.raison_sociale || "BNA BARDAGE");
  page.drawText(raisonSociale, {
    x: 40,
    y,
    size: 16,
    font: fontBold,
    color: couleurTexteSombre,
  });

  const refCommande = `BC-${commande.id.slice(0, 8).toUpperCase()}`;
  page.drawText("BON DE COMMANDE", {
    x: width - 230,
    y,
    size: 16,
    font: fontBold,
    color: rougeBna,
  });

  y -= 14;

  page.drawText(assainirTexte("Spécialiste Bardage Rapporté · Isolation Extérieure"), {
    x: 40,
    y,
    size: 8.5,
    font: fontRegular,
    color: couleurGrisMoyen,
  });

  page.drawText(assainirTexte(`RÉF : ${refCommande}`), {
    x: width - 230,
    y,
    size: 10,
    font: fontBold,
    color: couleurTexteSombre,
  });

  y -= 12;

  const dateEmission = commande.date_commande || commande.created_at || new Date().toISOString();
  const dateFormatee = new Date(dateEmission).toLocaleDateString("fr-FR");
  page.drawText(assainirTexte(`Date d'émission : ${dateFormatee}`), {
    x: width - 230,
    y,
    size: 8.5,
    font: fontRegular,
    color: couleurGrisMoyen,
  });

  // Coordonnées émetteur
  if (entreprise?.adresse) {
    y -= 12;
    page.drawText(assainirTexte(entreprise.adresse), {
      x: 40,
      y,
      size: 8,
      font: fontRegular,
      color: couleurGrisMoyen,
    });
  }
  if (entreprise?.code_postal || entreprise?.ville) {
    y -= 10;
    page.drawText(assainirTexte(`${entreprise?.code_postal || ""} ${entreprise?.ville || ""}`.trim()), {
      x: 40,
      y,
      size: 8,
      font: fontRegular,
      color: couleurGrisMoyen,
    });
  }
  if (entreprise?.siret) {
    y -= 10;
    page.drawText(assainirTexte(`SIRET : ${entreprise.siret}`), {
      x: 40,
      y,
      size: 8,
      font: fontRegular,
      color: couleurGrisMoyen,
    });
  }

  y -= 30;

  // 3. Cartes d'adresses (Fournisseur à gauche, Livraison à droite)
  const largeurCarte = (width - 80 - 15) / 2;
  const hauteurCarte = 85;

  // Carte Fournisseur
  page.drawRectangle({
    x: 40,
    y: y - hauteurCarte,
    width: largeurCarte,
    height: hauteurCarte,
    color: couleurFondCarte,
    borderColor: couleurBordure,
    borderWidth: 1,
  });

  page.drawText(assainirTexte("FOURNISSEUR DESTINATAIRE"), {
    x: 52,
    y: y - 18,
    size: 8.5,
    font: fontBold,
    color: rougeBna,
  });
  page.drawText(assainirTexte(fournisseur.nom), {
    x: 52,
    y: y - 32,
    size: 10,
    font: fontBold,
    color: couleurTexteSombre,
  });
  if (fournisseur.contact) {
    page.drawText(assainirTexte(`Attn : ${fournisseur.contact}`), {
      x: 52,
      y: y - 46,
      size: 8,
      font: fontRegular,
      color: couleurTexteSombre,
    });
  }
  if (fournisseur.email) {
    page.drawText(assainirTexte(`Email : ${fournisseur.email}`), {
      x: 52,
      y: y - 58,
      size: 8,
      font: fontRegular,
      color: couleurGrisMoyen,
    });
  }
  if (fournisseur.conditions_paiement) {
    page.drawText(assainirTexte(`Conditions : ${fournisseur.conditions_paiement}`), {
      x: 52,
      y: y - 70,
      size: 8,
      font: fontRegular,
      color: couleurGrisMoyen,
    });
  }

  // Carte Livraison & Chantier
  const carteDroiteX = 40 + largeurCarte + 15;
  page.drawRectangle({
    x: carteDroiteX,
    y: y - hauteurCarte,
    width: largeurCarte,
    height: hauteurCarte,
    color: couleurFondCarte,
    borderColor: couleurBordure,
    borderWidth: 1,
  });

  page.drawText(assainirTexte("LIEU DE LIVRAISON"), {
    x: carteDroiteX + 12,
    y: y - 18,
    size: 8.5,
    font: fontBold,
    color: rougeBna,
  });
  const chantierNom = chantier?.nom || "Chantier BNA";
  page.drawText(assainirTexte(`Chantier : ${chantierNom}`), {
    x: carteDroiteX + 12,
    y: y - 32,
    size: 9.5,
    font: fontBold,
    color: couleurTexteSombre,
  });
  if (chantier?.clientNom) {
    page.drawText(assainirTexte(`Client : ${chantier.clientNom}`), {
      x: carteDroiteX + 12,
      y: y - 46,
      size: 8,
      font: fontRegular,
      color: couleurTexteSombre,
    });
  }
  if (chantier?.adresse) {
    page.drawText(assainirTexte(`Adresse : ${chantier.adresse}`), {
      x: carteDroiteX + 12,
      y: y - 58,
      size: 8,
      font: fontRegular,
      color: couleurGrisMoyen,
    });
  }
  const dateLivr = commande.date_livraison_prevue
    ? new Date(commande.date_livraison_prevue).toLocaleDateString("fr-FR")
    : "Dès que possible";
  page.drawText(assainirTexte(`Livraison souhaitée : ${dateLivr}`), {
    x: carteDroiteX + 12,
    y: y - 70,
    size: 8,
    font: fontBold,
    color: rougeBna,
  });

  y -= hauteurCarte + 30;

  // 4. Tableau des articles
  page.drawText(assainirTexte("ARTICLES COMMANDÉS"), {
    x: 40,
    y,
    size: 10,
    font: fontBold,
    color: couleurTexteSombre,
  });

  y -= 16;

  // Entête tableau
  const largeurTableau = width - 80;
  const hauteurEnteteTableau = 22;
  page.drawRectangle({
    x: 40,
    y: y - hauteurEnteteTableau,
    width: largeurTableau,
    height: hauteurEnteteTableau,
    color: rgb(0.92, 0.94, 0.97),
  });

  const colDesigX = 50;
  const colQteX = 360;
  const colUniteX = 420;
  const colMontantX = 490;

  page.drawText(assainirTexte("Désignation"), {
    x: colDesigX,
    y: y - 15,
    size: 9,
    font: fontBold,
    color: couleurTexteSombre,
  });
  page.drawText(assainirTexte("Qté"), {
    x: colQteX,
    y: y - 15,
    size: 9,
    font: fontBold,
    color: couleurTexteSombre,
  });
  page.drawText(assainirTexte("Unité"), {
    x: colUniteX,
    y: y - 15,
    size: 9,
    font: fontBold,
    color: couleurTexteSombre,
  });
  page.drawText(assainirTexte("Total HT"), {
    x: colMontantX,
    y: y - 15,
    size: 9,
    font: fontBold,
    color: couleurTexteSombre,
  });

  y -= hauteurEnteteTableau;

  // Lignes
  const lignes: LigneBonCommande[] =
    commande.lignes && commande.lignes.length > 0
      ? commande.lignes
      : [
          {
            designation: commande.designation,
            quantite: commande.quantite || 1,
            unite: commande.unite || "u",
            montant_ht: commande.montant_ht,
          },
        ];

  let totalHt = 0;

  for (let i = 0; i < lignes.length; i++) {
    const ligne = lignes[i];
    const hauteurLigne = 24;
    const estPaire = i % 2 === 0;

    page.drawRectangle({
      x: 40,
      y: y - hauteurLigne,
      width: largeurTableau,
      height: hauteurLigne,
      color: estPaire ? rgb(1, 1, 1) : rgb(0.98, 0.99, 1),
      borderColor: couleurBordure,
      borderWidth: 0.5,
    });

    const desigTronquee = ligne.designation.length > 55
      ? `${ligne.designation.slice(0, 52)}...`
      : ligne.designation;

    page.drawText(assainirTexte(desigTronquee), {
      x: colDesigX,
      y: y - 16,
      size: 8.5,
      font: fontRegular,
      color: couleurTexteSombre,
    });

    page.drawText(assainirTexte(String(ligne.quantite)), {
      x: colQteX,
      y: y - 16,
      size: 8.5,
      font: fontRegular,
      color: couleurTexteSombre,
    });

    page.drawText(assainirTexte(ligne.unite || "u"), {
      x: colUniteX,
      y: y - 16,
      size: 8.5,
      font: fontRegular,
      color: couleurGrisMoyen,
    });

    const mht = ligne.montant_ht != null ? ligne.montant_ht : null;
    if (mht != null) {
      totalHt += mht;
      page.drawText(assainirTexte(fmtEuro(mht)), {
        x: colMontantX,
        y: y - 16,
        size: 8.5,
        font: fontBold,
        color: couleurTexteSombre,
      });
    } else {
      page.drawText(assainirTexte("-"), {
        x: colMontantX,
        y: y - 16,
        size: 8.5,
        font: fontRegular,
        color: couleurGrisMoyen,
      });
    }

    y -= hauteurLigne;
  }

  // Totaux
  y -= 15;
  if (totalHt > 0) {
    const largeurBlocTotaux = 190;
    const xBlocTotaux = width - 40 - largeurBlocTotaux;
    const hauteurBlocTotaux = 35;

    page.drawRectangle({
      x: xBlocTotaux,
      y: y - hauteurBlocTotaux,
      width: largeurBlocTotaux,
      height: hauteurBlocTotaux,
      color: couleurFondCarte,
      borderColor: couleurBordure,
      borderWidth: 1,
    });

    page.drawText(assainirTexte("TOTAL COMMANDE HT :"), {
      x: xBlocTotaux + 10,
      y: y - 22,
      size: 9,
      font: fontBold,
      color: couleurTexteSombre,
    });

    page.drawText(assainirTexte(fmtEuro(totalHt)), {
      x: xBlocTotaux + 120,
      y: y - 22,
      size: 10,
      font: fontBold,
      color: rougeBna,
    });

    y -= hauteurBlocTotaux + 20;
  } else {
    y -= 20;
  }

  // Instructions & Cadre Signature
  const hauteurCadreValidation = 70;
  page.drawRectangle({
    x: 40,
    y: y - hauteurCadreValidation,
    width: largeurTableau,
    height: hauteurCadreValidation,
    color: rgb(0.99, 0.99, 0.99),
    borderColor: couleurBordure,
    borderWidth: 1,
  });

  page.drawText(assainirTexte("INSTRUCTIONS & ACCUSÉ DE RÉCEPTION"), {
    x: 52,
    y: y - 18,
    size: 8,
    font: fontBold,
    color: couleurGrisMoyen,
  });

  page.drawText(
    assainirTexte("Merci de nous confirmer la prise en compte de cette commande et la date de livraison prévue par retour d'email."),
    {
      x: 52,
      y: y - 32,
      size: 7.5,
      font: fontRegular,
      color: couleurTexteSombre,
    }
  );

  page.drawText(assainirTexte("Bon pour accord et commande ferme."), {
    x: 52,
    y: y - 46,
    size: 7.5,
    font: fontRegular,
    color: couleurGrisMoyen,
  });

  page.drawText(assainirTexte("Visa acheteur BNA : [VALIDÉ PAR SYSTÈME]"), {
    x: width - 240,
    y: y - 56,
    size: 7.5,
    font: fontBold,
    color: rougeBna,
  });

  // Pied de page
  page.drawText(
    assainirTexte("Document officiel généré par BNA Dashboard · Système sécurisé multi-tenant"),
    {
      x: 40,
      y: 30,
      size: 7.5,
      font: fontRegular,
      color: couleurGrisMoyen,
    }
  );

  page.drawText(assainirTexte("Page 1 / 1"), {
    x: width - 85,
    y: 30,
    size: 7.5,
    font: fontRegular,
    color: couleurGrisMoyen,
  });

  return await doc.save();
}

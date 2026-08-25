const fs = require('fs');
const path = 'app/bureau/sav/[id]/page.tsx';
let content = fs.readFileSync(path, 'utf8');

const oldCode = `    // Matériel + 37% de marge (indicatif)
    const lignes = [
      {
        designation: "Intervention SAV Hors Garantie (" + (ticket.type_sinistre || "Divers") + ")",
        description: ticket.description || "Travaux de reprise et main d'oeuvre",
        qte: 1,
        unite: "Forfait",
        pu_ht: 0 // Le tarif exact avec la marge sera à saisir par l'utilisateur
      }
    ];`;

const newCode = `    const prixStr = window.prompt("Quel est le montant HT à facturer pour cette intervention SAV ?\\n(La marge de 37% doit être incluse dans votre prix)");
    if (prixStr === null) return; // Annulation
    const prix = parseFloat(prixStr.replace(',', '.'));
    if (isNaN(prix)) return alert("Montant invalide, veuillez entrer un nombre (ex: 150.50).");

    setSaving(true);
    const numero = "SAV-" + Math.floor(1000 + Math.random() * 9000);
    
    const lignes = [
      {
        designation: "Intervention SAV Hors Garantie (" + (ticket.type_sinistre || "Divers") + ")",
        description: ticket.description || "Travaux de reprise et main d'oeuvre",
        qte: 1,
        unite: "Forfait",
        pu_ht: prix
      }
    ];`;

content = content.replace(oldCode, newCode);
// Also remove the extra setSaving(true) that was before since I moved it after the prompt
content = content.replace('setSaving(true);\n    const numero = "SAV-"', '// setSaving moved down');

fs.writeFileSync(path, content);

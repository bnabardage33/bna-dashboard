// lib/departement.ts
// Convertit un code postal (ou une adresse qui en contient un) en numéro de
// département INSEE à 2 chiffres (3 pour les DROM), format attendu par
// l'API Vigilance de Météo-France.

// Cas particuliers : Corse (2A/2B) et quelques départements dont le code
// postal ne commence pas exactement comme le numéro de département.
const CORSE_2A = ["20000", "20090", "20100", "20110", "20140", "20150", "20160", "20167", "20169", "20170", "20190", "20200"];

export function codePostalVersDepartement(codePostal: string): string | null {
  const cp = codePostal.trim().slice(0, 5);
  if (!/^\d{5}$/.test(cp)) return null;

  // DROM : 971 Guadeloupe, 972 Martinique, 973 Guyane, 974 Réunion, 976 Mayotte
  if (cp.startsWith("97")) {
    return cp.slice(0, 3);
  }

  // Corse : 2A (sud) / 2B (nord) selon la commune. On distingue par préfixe
  // usuel (20000-201xx = Ajaccio/2A, 202xx+ = Bastia/2B) — approximatif mais
  // suffisant pour la vigilance, qui est de toute façon la même zone Corse.
  if (cp.startsWith("20")) {
    const prefix3 = cp.slice(0, 3);
    return ["200", "201"].includes(prefix3) ? "2A" : "2B";
  }

  return cp.slice(0, 2);
}

// Extrait un code postal depuis une adresse en texte libre
// (ex: "14 rue des Peupliers, 33600 Pessac" -> "33600").
export function extraireCodePostal(adresse: string): string | null {
  const match = adresse.match(/\b\d{5}\b/);
  return match ? match[0] : null;
}

export function adresseVersDepartement(adresse: string): string | null {
  const cp = extraireCodePostal(adresse);
  if (!cp) return null;
  return codePostalVersDepartement(cp);
}

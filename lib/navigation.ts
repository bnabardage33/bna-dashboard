import type { EntreeNav } from "@/components/MenuNavigationMobile";
export { NAV_ITEMS, type SousEntree, type EntreeNav } from "@/components/MenuNavigationMobile";

export const cheminDe = (href: string) => href.split("?")[0];

/**
 * Une entrée est active si le chemin correspond ET, lorsqu'elle porte une
 * requête, si cette requête correspond à celle de l'URL.
 *
 * Le cas inverse compte autant : l'entrée SANS requête
 * (`/bureau/fournisseurs`) doit devenir inerte dès que l'URL porte un
 * `?tab=`, sinon elle reste allumée en même temps que sa spécialisation.
 */
export const estLienActif = (
  href: string,
  pathname: string | null,
  ongletUrl: string | null
): boolean => {
  const cible = cheminDe(href);
  // Pour /finance strict : ne pas allumer sur /finance/saisie/...
  if (cible === "/finance" && pathname !== "/finance") {
    return false;
  }
  // Comparaison bornée au séparateur : `/bureau/catalogue-terrasse` ne doit
  // PAS allumer `/bureau/catalogue`. Les pages détail restent couvertes
  // (`/bureau/clients/123` commence bien par `/bureau/clients/`).
  if (
    !(cible === "/"
      ? pathname === "/"
      : pathname === cible || pathname?.startsWith(`${cible}/`))
  ) {
    return false;
  }

  const requeteHref = href.includes("?") ? href.slice(href.indexOf("?")) : "";
  if (!requeteHref) return ongletUrl === null;
  return ongletUrl === new URLSearchParams(requeteHref).get("tab");
};

export const groupeEstActif = (
  entree: EntreeNav,
  pathname: string | null,
  ongletUrl: string | null
): boolean =>
  entree.children?.some((e) => estLienActif(e.href, pathname, ongletUrl)) ??
  (entree.href ? estLienActif(entree.href, pathname, ongletUrl) : false);

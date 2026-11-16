/**
 * Layout du groupe `/terrain/**`.
 *
 * PHASE 2 : la barre `SubNav` de six entrées (« Accueil », « Chantiers »,
 * « Boîte à Outils », « Métré IA », « Notes Patron », « Fiches DTU ») a été
 * retirée. Elle faisait doublon avec le hamburger, qui expose désormais les
 * mêmes fonctions sous « Chantiers » et « Boîte à outils ».
 *
 * Aucun onglet métier n'est perdu : les six pages restent accessibles par leur
 * URL, désormais listées dans le Drawer. `/terrain` lui-même redirige vers
 * `/terrain/chantier`.
 *
 * Le conteneur adopte une largeur fluide adaptée aux écrans desktop
 * tout en préservant le padding de gouttière et l'espacement vertical d'origine.
 */
export default function TerrainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="w-full mx-auto px-4 py-6">{children}</div>;
}
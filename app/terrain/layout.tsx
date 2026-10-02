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
 * Le conteneur `max-w-5xl` est conservé à l'identique.
 */
export default function TerrainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>;
}
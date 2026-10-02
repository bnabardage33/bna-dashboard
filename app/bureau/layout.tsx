/**
 * Layout du groupe `/bureau/**`.
 *
 * PHASE 2 : `<BureauNav />` a été retiré. Le hamburger (`components/Drawer.tsx`)
 * est désormais la navigation globale unique, et il porte lui-même les groupes
 * « Études / Commercial », « Finance & Pilotage », « Fournisseurs » et
 * « Espace client ». Garder une barre d'onglets ici aurait réintroduit la
 * navigation parallèle que la refonte supprime.
 *
 * Le conteneur `max-w-5xl` est conservé à l'identique : il fait partie de la
 * mise en page existante, pas de la navigation.
 *
 * Les URL de ce groupe n'ont pas bougé ; le groupe reste donc accessible par
 * Favoris, notifications (`notifications.lien`) et liens Espace Client.
 */
export default function BureauLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>;
}
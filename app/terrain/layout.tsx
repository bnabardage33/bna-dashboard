import { Suspense } from "react";
import SubNav from "@/components/SubNav";

const items = [
  { label: "Accueil", href: "/terrain/meteo" },
  { label: "Chantiers", href: "/terrain/chantier" },
  { label: "Boîte à Outils", href: "/terrain/outils" },

  { label: "Notes Patron", href: "/terrain/notes" },
  { label: "Fiches DTU", href: "/terrain/fiche-technique" },
];

export default function TerrainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <Suspense fallback={null}>
        <SubNav items={items} />
      </Suspense>
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}

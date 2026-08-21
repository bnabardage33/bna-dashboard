import SubNav from "@/components/SubNav";

const items = [
  { label: "Chantiers", href: "/terrain/chantier" },
  { label: "Boîte à Outils", href: "/terrain/outils" },
  { label: "Météo & Vigilance", href: "/terrain/meteo" },
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
      <SubNav items={items} />
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}

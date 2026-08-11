import SubNav from "@/components/SubNav";

const items = [
  { label: "Météo & Alertes", href: "/terrain/meteo" },
  { label: "Chantier", href: "/terrain/chantier" },
  { label: "Notes du Patron", href: "/terrain/notes" },
  { label: "Fiche technique", href: "/terrain/fiche-technique" },
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

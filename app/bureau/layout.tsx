import { Suspense } from "react";
import SubNav from "@/components/SubNav";

const items = [
  { label: "Clients", href: "/bureau/clients" },
  { label: "Devis", href: "/bureau/devis-factures" },
  { label: "Factures", href: "/bureau/factures" },
  { label: "Fournisseurs & Achats", href: "/bureau/fournisseurs" },
  { label: "Rapports Intempéries", href: "/bureau/rapports-intemperies" },
  { label: "Fin de chantier", href: "/bureau/fin-chantier" },
  { label: "SAV & Garantie", href: "/bureau/sav" },
];

export default function BureauLayout({
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

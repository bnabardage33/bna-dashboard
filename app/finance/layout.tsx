import SubNav from "@/components/SubNav";

const items = [
  { label: "Tableau de Bord", href: "/finance/tableau-de-bord" },
  { label: "Taxes & URSSAF", href: "/finance/urssaf" },
  { label: "Déclaration de TVA", href: "/finance/tva" },
];

export default function FinanceLayout({
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

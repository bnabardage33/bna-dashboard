import FinancePinGate from "@/components/FinancePinGate";
import FinanceLockButton from "@/components/FinanceLockButton";

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <FinancePinGate>
      <div className="flex justify-end px-4 pt-3 max-w-5xl mx-auto">
        <FinanceLockButton />
      </div>
      {children}
    </FinancePinGate>
  );
}

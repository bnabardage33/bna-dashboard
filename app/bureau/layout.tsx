import { Suspense } from "react";
import BureauNav from "@/components/BureauNav";

export default function BureauLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <div>
      <Suspense fallback={null}>
        <BureauNav />
      </Suspense>
      <div className="mx-auto max-w-5xl px-4 py-6">{children}</div>
    </div>
  );
}

"use client";

import { Lock } from "lucide-react";

export default function FinanceLockButton() {
  const handleLock = () => {
    sessionStorage.removeItem("finance_unlocked");
    window.location.reload();
  };

  return (
    <button
      onClick={handleLock}
      className="flex items-center gap-1.5 text-xs text-[#8E7F74] hover:text-[#B8A99E] transition"
      title="Verrouiller le module Finance"
    >
      <Lock size={14} />
      Verrouiller
    </button>
  );
}

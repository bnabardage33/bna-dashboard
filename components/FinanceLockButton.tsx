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
      className="flex items-center gap-1.5 text-xs text-slate-400 hover:text-slate-600 transition"
      title="Verrouiller le module Finance"
    >
      <Lock size={14} />
      Verrouiller
    </button>
  );
}

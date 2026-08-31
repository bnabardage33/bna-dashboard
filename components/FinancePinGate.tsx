"use client";

import { useState, useEffect, useRef, useCallback } from "react";
import { Lock } from "lucide-react";

const DUREE_INACTIVITE_MS = 15 * 60 * 1000; // 15 minutes

export default function FinancePinGate({ children }: { children: React.ReactNode }) {
  const [unlocked, setUnlocked] = useState(false);
  const [checking, setChecking] = useState(true);
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const verrouiller = useCallback(() => {
    sessionStorage.removeItem("finance_unlocked");
    setUnlocked(false);
  }, []);

  const reinitialiserTimer = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(verrouiller, DUREE_INACTIVITE_MS);
  }, [verrouiller]);

  useEffect(() => {
    if (sessionStorage.getItem("finance_unlocked") === "true") {
      setUnlocked(true);
    }
    setChecking(false);
  }, []);

  useEffect(() => {
    if (!unlocked) {
      if (timerRef.current) clearTimeout(timerRef.current);
      return;
    }

    reinitialiserTimer();

    const evenements = ["mousedown", "touchstart", "keydown", "scroll"];
    evenements.forEach((evt) => window.addEventListener(evt, reinitialiserTimer));

    return () => {
      evenements.forEach((evt) => window.removeEventListener(evt, reinitialiserTimer));
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [unlocked, reinitialiserTimer]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await fetch("/api/finance-pin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ pin }),
    });
    const data = await res.json();
    setLoading(false);
    if (data.ok) {
      sessionStorage.setItem("finance_unlocked", "true");
      setUnlocked(true);
      setPin("");
    } else {
      setError("Code incorrect.");
      setPin("");
    }
  };

  if (checking) return null;

  if (!unlocked) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <form onSubmit={handleSubmit} className="w-full max-w-xs bg-white p-6 rounded-2xl shadow-sm border border-slate-100 space-y-4 text-center">
          <Lock className="mx-auto text-slate-400" size={28} />
          <h2 className="font-bold text-slate-800">Module Finance verrouillé</h2>
          <input
            type="password"
            inputMode="numeric"
            placeholder="Code PIN"
            value={pin}
            onChange={(e) => setPin(e.target.value)}
            className="w-full text-center text-lg tracking-widest px-3 py-2 text-slate-900 border border-slate-200 rounded-xl outline-none focus:border-blue-500"
            autoFocus
            required
          />
          {error && <p className="text-red-500 text-sm">{error}</p>}
          <button type="submit" disabled={loading}
            className="w-full py-2.5 bg-slate-900 text-white rounded-xl font-bold disabled:opacity-50">
            {loading ? "Vérification..." : "Déverrouiller"}
          </button>
        </form>
      </div>
    );
  }

  return <>{children}</>;
}

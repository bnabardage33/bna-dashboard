"use client";

import { useState, useEffect } from "react";
import { X, Smartphone, CheckCircle, Loader2 } from "lucide-react";

// `catch (err: any)` laissait passer une branche d'erreur muette : sur une valeur
// qui n'est pas une Error, `err.message` vaut undefined et l'UI affichait un
// message vide au lieu du motif réel.
const messageErreur = (err: unknown, repli: string): string =>
  err instanceof Error ? err.message : repli;

export default function SignatureModal({
  devisId,
  numero,
  onClose,
  onSuccess,
  initialPhone,
}: {
  devisId: string;
  numero: string;
  onClose: () => void;
  onSuccess: () => void;
  initialPhone?: string;
}) {
  const [step, setStep] = useState<"PHONE" | "OTP" | "SUCCESS">("PHONE");
  const [phone, setPhone] = useState(initialPhone || "");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(600); // 10 minutes

  useEffect(() => {
    let timer: NodeJS.Timeout;
    if (step === "OTP" && timeLeft > 0) {
      timer = setTimeout(() => setTimeLeft(timeLeft - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [step, timeLeft]);

  const sendOtp = async () => {
    if (!phone || phone.length < 10) {
      setError("Veuillez saisir un numéro valide (ex: 0612345678)");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/devis/${devisId}/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'envoi");
      setStep("OTP");
      setTimeLeft(600);
    } catch (err: unknown) {
      setError(messageErreur(err, "Erreur lors de l'envoi"));
    } finally {
      setLoading(false);
    }
  };

  const verifyOtp = async () => {
    if (!otp || otp.length !== 6) {
      setError("Le code doit contenir 6 chiffres");
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch(`/api/devis/${devisId}/verify-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: otp }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Code invalide");
      setStep("SUCCESS");
      setTimeout(() => {
        onSuccess();
      }, 2000);
    } catch (err: unknown) {
      setError(messageErreur(err, "Code invalide"));
    } finally {
      setLoading(false);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#121212] shadow-2xl overflow-hidden">
        
        {/* HEADER */}
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h3 className="text-sm font-semibold text-white">Signer {numero}</h3>
          <button onClick={onClose} className="rounded-lg p-1 text-gray-400 hover:bg-white/10" aria-label="Fermer">
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* BODY */}
        <div className="p-6">
          {error && (
            <div className="mb-4 rounded-lg bg-red-900/30 p-3 text-xs text-red-400 border border-red-900/50">
              {error}
            </div>
          )}

          {step === "PHONE" && (
            <div className="space-y-4">
              <div className="flex justify-center mb-2">
                <div className="bg-[#1E1E1E] p-4 rounded-full border border-white/5">
                  <Smartphone className="h-8 w-8 text-sky-400" />
                </div>
              </div>
              <p className="text-xs text-center text-gray-400">
                Saisissez le numéro de mobile du client présent sur le chantier pour lui envoyer le code de signature.
              </p>
              <input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="Ex: 06 12 34 56 78"
                className="w-full rounded-xl border border-slate-600 bg-transparent px-4 py-3 text-sm text-white focus:border-sky-500 focus:outline-none text-center font-mono tracking-wider"
              />
              <button
                onClick={sendOtp}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-bold text-white transition hover:bg-sky-500 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Envoyer le code OTP"}
              </button>
            </div>
          )}

          {step === "OTP" && (
            <div className="space-y-4">
              <p className="text-xs text-center text-gray-400">
                Code envoyé au <strong className="text-white">{phone}</strong>
              </p>
              <div className="text-center text-xs font-mono text-sky-400 mb-2">
                Expire dans : {formatTime(timeLeft)}
              </div>
              <input
                type="text"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                className="w-full rounded-xl border border-slate-600 bg-transparent px-4 py-3 text-2xl text-white focus:border-sky-500 focus:outline-none text-center tracking-[0.5em] font-mono"
              />
              <button
                onClick={verifyOtp}
                disabled={loading || timeLeft <= 0}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-bold text-white transition hover:bg-green-500 disabled:opacity-50"
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Valider la signature"}
              </button>
            </div>
          )}

          {step === "SUCCESS" && (
            <div className="space-y-4 py-6 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-sm font-bold text-white">Document signé !</p>
              <p className="text-xs text-gray-400">Le statut du devis a été mis à jour.</p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

"use client";

// components/SignatureModal.tsx
//
// PARCOURS DE SIGNATURE CLIENT — OTP + CANVAS + PREUVE
// =====================================================
//
// Ce composant est l'unique surface de signature du portail client. Il remplace
// le parcours précédent, qui signait sans OTP et sans preuve.
//
// L'ORDRE DES ÉTAPES EST DÉLIBÉRÉ : OTP d'abord, geste de signature ensuite.
//
//   ENVOI -> OTP -> CANVAS -> TERMINE
//                        ^^^^^^^^
//
// L'OTP prouve QUI signe ; le geste de signature prouve QUE la personne a
// trace. L'ordre inverse serait le piege : si le canvas etait trace AVANT la
// saisie du code, une signature collectee en amont pourrait etre rejouee plus
// tard sur un code obtenu par ailleurs. Trace DANS le parcours, elle est liee a
// la session qui vient de valider l'OTP.

import { useCallback, useEffect, useRef, useState } from "react";
import { X, Smartphone, CheckCircle, Loader2, ShieldCheck, PenLine, RefreshCw } from "lucide-react";

// `catch (err: any)` laissait passer une branche d'erreur muette : sur une valeur
// qui n'est pas une Error, `err.message` vaut undefined et l'UI affichait un
// message vide au lieu du motif réel.
const messageErreur = (err: unknown, repli: string): string =>
  err instanceof Error ? err.message : repli;

/** Ce que la route renvoie en cas de succès. Utilisé pour l'accusé de réception. */
export type PreuveSignature = {
  signatureId: string | null;
  signedAt: string | null;
  devisEmpreinteSha256: string | null;
};

// Bornes IDENTIQUES a celles de la route ET de la RPC, dupliquees ici pour ne
// pas faire l'aller-retour sur une soumission qui sera refusee de toute façon,
// et -- plus important -- pour ne pas laisser croire que le client est le juge.
const PREFIXE_PNG = "data:image/png;base64,";
const TAILLE_MIN = 21;
const TAILLE_MAX = 262144;

/**
 * Nombre minimal de pixels opaques pour qu'un canvas soit consideré signe.
 *
 * Un `mousedown` suivi d'un `mouseup` au MEME point ne dessine rien : la
 * `lineTo` est un segment de longueur nulle. Sans ce seuil, un clic accidentel
 * produirait une image valide et l'OTP serait consommé pour une signature vide.
 *
 * ATTENTION — ce n'est PAS une frontière de sécurité, et le commentaire est
 * volontaire sur ce point. La route et la RPC ne savent pas distinguer une image
 * vierge d'une signature : toutes deux sont des PNG de taille plausible. Un client
 * DÉTERMINÉ peut envoyer un canvas vide et consommer son OTP. Ce qui reste
 * garanti, c'est l'essentiel : l'OTP est consommé, la mention est écrite, la
 * preuve existe et le devis change de statut. Ce contrôle est un garde-fou de
 * QUALITÉ, pas une garantie d'authenticité du tracé. Le durcir côté serveur
 * supposerait de décoder le PNG en base — arbitrage à faire plus tard, et c'est
 * signalé dans le rapport de phase.
 */
const SEUIL_ENCRE = 120;

/** Durée d'affichage annoncée après succès. Le serveur reste l'autorité. */
const DUREE_OTP_AFFICHEE = 600;

type Etape = "ENVOI" | "OTP" | "CANVAS" | "TERMINE";

/**
 * Le canvas porte-t-il réellement de l'encre ?
 *
 * Fail-closed : si le contexte 2D ou `getImageData` est indisponible, on répond
 * `false`. Le pire cas est un client bloque avec un message d'erreur ; le
 * contraire -- declarer « signe » sans avoir lu -- produirait une preuve
 * muette, c'est-a-dire un dossier d'audit affirmatif et vide.
 */
function canvasPorteEncre(canvas: HTMLCanvasElement): boolean {
  try {
    const ctx = canvas.getContext("2d");
    if (!ctx) return false;
    const { data } = ctx.getImageData(0, 0, canvas.width, canvas.height);
    let opaques = 0;
    // Canal alpha seul : une page blanche « peinte » en noir compte comme encre,
    // un clic qui n'a rien tracé ne compte rien.
    for (let i = 3; i < data.length; i += 4) {
      if (data[i] > 0 && ++opaques >= SEUIL_ENCRE) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export default function SignatureModal({
  codeAcces,
  devisId,
  numero,
  onClose,
  onSuccess,
}: {
  codeAcces: string;
  devisId: string;
  numero: string;
  onClose: () => void;
  onSuccess: (preuve: PreuveSignature) => void;
}) {
  const [etape, setEtape] = useState<Etape>("ENVOI");
  const [otp, setOtp] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [timeLeft, setTimeLeft] = useState(DUREE_OTP_AFFICHEE);
  const [preuve, setPreuve] = useState<PreuveSignature | null>(null);

  /**
   * Case « bon pour accord ».
   *
   * Elle est VRAIE par défaut, et ce n'est pas un détail d'ergonomie : la case
   * sert à enregistrer une VOLONTE, or la portée d'un consentement enregistré
   * doit être explicite. La laisser décochée par défaut ferait qu'un simple
   * client valide sa signature en passant devant, et la preuve porterait alors
   * un accord qu'il n'a pas formulé. Le serveur exige de toute façon
   * `mentionBonPourAccord === true` (motif `mention_absente`) : sans case, la
   * soumission serait refusée AVANT de consommer l'OTP.
   *
   * Ce que le composant ne peut PAS faire, et ne tente pas : décider à la place
   * du client. La case est une déclaration de sa part, transmise telle quelle.
   */
  const [mention, setMention] = useState(true);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const dessineRef = useRef(false);

  // Le compte à rebours est une commodité d'affichage, PAS une autorité : c'est
  // `expires_at` en base qui décide. Un client qui le fige ne gagne rien.
  useEffect(() => {
    if (etape !== "OTP" && etape !== "CANVAS") return;
    if (timeLeft <= 0) return;
    const minuteur = setTimeout(() => setTimeLeft((t) => t - 1), 1000);
    return () => clearTimeout(minuteur);
  }, [etape, timeLeft]);

  const envoyerOtp = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Corps minimal : `devisId` seul. Ni téléphone, ni nom, ni statut.
      const res = await fetch(`/api/espace-client/${codeAcces}/send-otp`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ devisId }),
      });
      const data = (await res.json().catch(() => ({}))) as {
        error?: string;
        expiresInSecondes?: number;
      };
      if (!res.ok) throw new Error(data.error || "Erreur lors de l'envoi");
      setTimeLeft(data.expiresInSecondes ?? DUREE_OTP_AFFICHEE);
      setOtp("");
      setEtape("OTP");
    } catch (err: unknown) {
      setError(messageErreur(err, "Erreur lors de l'envoi"));
    } finally {
      setLoading(false);
    }
  }, [codeAcces, devisId]);

  // Passer au canvas ne valide rien : c'est un simple changement d'étape. Le code
  // n'est consommé qu'à la confirmation, avec l'image.
  const continuerVersCanvas = useCallback(() => {
    if (otp.length !== 6) {
      setError("Le code doit contenir 6 chiffres");
      return;
    }
    setError(null);
    setEtape("CANVAS");
  }, [otp]);

  const coords = (e: React.MouseEvent<HTMLCanvasElement>): { x: number; y: number } => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const ratioX = canvas.width / (rect.width || canvas.width);
    const ratioY = canvas.height / (rect.height || canvas.height);
    return {
      x: (e.clientX - rect.left) * ratioX,
      y: (e.clientY - rect.top) * ratioY,
    };
  };

  const commencerTrace = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { x, y } = coords(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    dessineRef.current = true;
  };

  const tracer = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!dessineRef.current) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = coords(e);
    ctx.lineTo(x, y);
    ctx.strokeStyle = "#0f172a";
    ctx.lineWidth = 3;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.stroke();
  };

  const terminerTrace = () => {
    dessineRef.current = false;
  };

  const effacer = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) ctx.clearRect(0, 0, canvas.width, canvas.height);
    dessineRef.current = false;
  };

  const validerSignature = useCallback(async () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (!mention) {
      setError("Vous devez donner votre bon pour accord pour signer.");
      return;
    }
      if (!canvasPorteEncre(canvas)) {
        setError("Dessinez votre signature avant de valider.");
        return;
      }

      const signatureImage = canvas.toDataURL("image/png");
      if (
        !signatureImage.startsWith(PREFIXE_PNG) ||
        signatureImage.length < TAILLE_MIN ||
        signatureImage.length > TAILLE_MAX
      ) {
        setError("Signature illisible. Effacez et redessinez plus simplement.");
        return;
      }

      setLoading(true);
      setError(null);
      try {
        // Les quatre seuls champs acceptés. `mentionBonPourAccord` est la
        // volonté du client, pas une donnée de confiance : c'est le seul booléen
        // que ce composant décide, et la RPC exige qu'il soit vrai.
        const res = await fetch(`/api/espace-client/${codeAcces}/verify-otp`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            devisId,
            code: otp,
            signatureImage,
            mentionBonPourAccord: mention,
          }),
        });
        const data = (await res.json().catch(() => ({}))) as {
          error?: string;
          signatureId?: string;
          signedAt?: string;
          devisEmpreinteSha256?: string;
        };
        if (!res.ok) throw new Error(data.error || "Code invalide");

        const recu: PreuveSignature = {
          signatureId: data.signatureId ?? null,
          signedAt: data.signedAt ?? null,
          devisEmpreinteSha256: data.devisEmpreinteSha256 ?? null,
        };
        setPreuve(recu);
        setEtape("TERMINE");
        onSuccess(recu);
      } catch (err: unknown) {
        setError(messageErreur(err, "Code invalide"));
      } finally {
        setLoading(false);
      }
    },
    [codeAcces, devisId, otp, mention, onSuccess]
  );

  const formatTime = (secondes: number) => {
    const m = Math.floor(secondes / 60);
    const s = secondes % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className="fixed inset-0 z-[10002] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-label={`Signature du devis ${numero}`}
    >
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-[#121212] shadow-2xl overflow-hidden max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between border-b border-white/10 p-4">
          <h3 className="text-sm font-semibold text-white">Signer {numero}</h3>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-gray-400 hover:bg-white/10"
            aria-label="Fermer"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-6">
          {error && (
            <div
              className="mb-4 rounded-lg bg-red-900/30 p-3 text-xs text-red-400 border border-red-900/50"
              role="alert"
            >
              {error}
            </div>
          )}

          {/* ── ENVOI ─────────────────────────────────────────────────────── */}
          {etape === "ENVOI" && (
            <div className="space-y-4">
              <div className="flex justify-center">
                <div className="bg-[#1E1E1E] p-4 rounded-full border border-white/5">
                  <Smartphone className="h-8 w-8 text-sky-400" />
                </div>
              </div>
              <p className="text-xs text-center text-gray-400">
                Un code de signature va être envoyé par SMS au numéro vérifié inscrit
                au dossier de ce chantier.
              </p>
              <p className="text-[11px] text-center text-gray-500">
                Ce numéro vous a été communiqué par votre artisan. BNA ne vous
                demande pas de le saisir.
              </p>
              <button
                onClick={() => void envoyerOtp()}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-bold text-white transition hover:bg-sky-500 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  "Recevoir le code par SMS"
                )}
              </button>
            </div>
          )}

          {/* ── OTP ───────────────────────────────────────────────────────── */}
          {etape === "OTP" && (
            <div className="space-y-4">
              <p className="text-xs text-center text-gray-400">
                Saisissez le code reçu par SMS.
              </p>
              <div className="text-center text-xs font-mono text-sky-400">
                Expire dans : {formatTime(timeLeft)}
              </div>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                placeholder="000000"
                aria-label="Code de signature"
                className="w-full rounded-xl border border-slate-600 bg-transparent px-4 py-3 text-2xl text-white focus:border-sky-500 focus:outline-none text-center tracking-[0.5em] font-mono"
              />
              <button
                onClick={continuerVersCanvas}
                disabled={loading || timeLeft <= 0}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-sky-600 py-3 text-sm font-bold text-white transition hover:bg-sky-500 disabled:opacity-50"
              >
                <PenLine className="h-4 w-4" />
                Tracer ma signature
              </button>
              <button
                onClick={() => void envoyerOtp()}
                disabled={loading || timeLeft > 0}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-white/10 py-2 text-xs text-gray-400 hover:bg-white/5 disabled:opacity-40"
              >
                <RefreshCw className="h-3 w-3" />
                Renvoyer un code
              </button>
            </div>
          )}

          {/* ── CANVAS ────────────────────────────────────────────────────── */}
          {etape === "CANVAS" && (
            <div className="space-y-4">
              <p className="text-xs text-center text-gray-400">
                Tracez votre signature ci-dessous, puis validez.
              </p>
              <div className="flex justify-between items-center">
                <span className="text-xs font-bold text-slate-800" />
                <button
                  onClick={effacer}
                  className="text-xs text-gray-400 hover:text-slate-200 underline"
                >
                  Effacer
                </button>
              </div>
              <div className="w-full h-40 border-2 border-dashed border-slate-600 rounded-xl bg-white overflow-hidden relative touch-none">
                <canvas
                  ref={canvasRef}
                  width={400}
                  height={160}
                  data-testid="canvas-signature"
                  aria-label="Zone de signature"
                  className="w-full h-full cursor-crosshair touch-none absolute inset-0"
                  onMouseDown={commencerTrace}
                  onMouseMove={tracer}
                  onMouseUp={terminerTrace}
                  onMouseLeave={terminerTrace}
                  onTouchStart={(e) => {
                    const t = e.touches[0];
                    if (t) {
                      commencerTrace({
                        clientX: t.clientX,
                        clientY: t.clientY,
                      } as React.MouseEvent<HTMLCanvasElement>);
                    }
                  }}
                  onTouchMove={(e) => {
                    const t = e.touches[0];
                    if (t) {
                      tracer({
                        clientX: t.clientX,
                        clientY: t.clientY,
                      } as React.MouseEvent<HTMLCanvasElement>);
                    }
                  }}
                  onTouchEnd={terminerTrace}
                />
              </div>

              <label className="flex items-start gap-2 rounded-lg border border-white/10 p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={mention}
                  onChange={(e) => setMention(e.target.checked)}
                  className="mt-0.5"
                />
                <span className="text-[11px] text-gray-300">
                  Je soussigné(e), donne mon bon pour accord au devis {numero} et à
                  ses conditions.
                </span>
              </label>

              <button
                onClick={() => void validerSignature()}
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-xl bg-green-600 py-3 text-sm font-bold text-white transition hover:bg-green-500 disabled:opacity-50"
              >
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="h-4 w-4" />
                    Valider ma signature
                  </>
                )}
              </button>
            </div>
          )}

          {/* ── TERMINE ───────────────────────────────────────────────────── */}
          {etape === "TERMINE" && (
            <div className="space-y-4 py-6 text-center">
              <CheckCircle className="h-12 w-12 text-green-500 mx-auto" />
              <p className="text-sm font-bold text-white">Document signé</p>
              <p className="text-xs text-gray-400">
                Votre accord est enregistré et daté.
              </p>
              {preuve?.signatureId && (
                <div className="rounded-lg border border-white/10 p-3 text-left">
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">
                    Référence de la signature
                  </p>
                  <p className="mt-1 break-all font-mono text-[10px] text-gray-400">
                    {preuve.signatureId}
                  </p>
                  <p className="mt-2 text-[10px] text-gray-500">
                    Identifiant de la preuve dans le registre BNA. À conserver :
                    il permet de retrouver cette signature précisément, en cas de
                    litige.
                  </p>
                </div>
              )}
              {preuve?.devisEmpreinteSha256 && (
                <div className="rounded-lg border border-white/10 p-3 text-left">
                  <p className="text-[10px] uppercase tracking-wide text-gray-500">
                    Empreinte du document
                  </p>
                  <p className="mt-1 break-all font-mono text-[10px] text-gray-400">
                    {preuve.devisEmpreinteSha256}
                  </p>
                  <p className="mt-2 text-[10px] text-gray-500">
                    Cette empreinte identifie le contenu exact du devis au moment
                    de la signature. Toute modification ultérieure la rendra
                    différente.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
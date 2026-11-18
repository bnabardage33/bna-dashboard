"use client";

import { useRef, useState, useEffect } from "react";
import { Eraser, PenTool } from "lucide-react";

/**
 * Composant léger de signature tactile (HTML5 Canvas) compatible mobile et desktop.
 * Exporte un data URL PNG base64 à chaque tracé.
 */
export default function SignatureTactileCanvas({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (dataUrl: string | null) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [enTrainDeDessiner, setEnTrainDeDessiner] = useState(false);
  const [aSigne, setASigne] = useState(Boolean(value));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.lineWidth = 2.2;
    ctx.strokeStyle = "#F5EFEA";
  }, []);

  function obtenirPosition(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = obtenirPosition(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setEnTrainDeDessiner(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!enTrainDeDessiner) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const { x, y } = obtenirPosition(e);
    ctx.lineTo(x, y);
    ctx.stroke();
    setASigne(true);
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!enTrainDeDessiner) return;
    setEnTrainDeDessiner(false);
    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // ignore si déjà relâché
    }
    if (aSigne) {
      onChange(canvas.toDataURL("image/png"));
    }
  }

  function effacer() {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    setASigne(false);
    onChange(null);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-gray-300">
          <PenTool className="h-3.5 w-3.5 text-[#D96B27]" />
          Signature tactile (chef d&apos;entreprise / chef de chantier)
        </span>
        <button
          type="button"
          onClick={effacer}
          className="inline-flex items-center gap-1 rounded-lg border border-white/10 bg-[#120F0D] px-2 py-1 text-[11px] text-gray-400 hover:border-[#D96B27]/40 hover:text-white"
        >
          <Eraser className="h-3 w-3" />
          Effacer
        </button>
      </div>
      <div className="relative overflow-hidden rounded-xl border border-dashed border-[#D96B27]/40 bg-[#120F0D]">
        <canvas
          ref={canvasRef}
          width={520}
          height={140}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerCancel={handlePointerUp}
          className="h-28 w-full touch-none cursor-crosshair"
        />
        {!aSigne && (
          <span className="pointer-events-none absolute inset-0 flex items-center justify-center text-xs text-gray-500">
            Signez ici avec le doigt ou la souris
          </span>
        )}
      </div>
    </div>
  );
}

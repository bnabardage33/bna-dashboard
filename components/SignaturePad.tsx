// components/SignaturePad.tsx
"use client";

import { useEffect, useRef, useState } from "react";

interface SignaturePadProps {
  label: string;
  signerName?: string;
  value?: string | null;
  onChange: (dataUrl: string | null) => void;
  width?: number;
  height?: number;
}

export default function SignaturePad({
  label,
  signerName,
  value,
  onChange,
  width = 380,
  height = 140,
}: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [hasDrawn, setHasDrawn] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    // Configuration DPI haute résolution
    const dpr = window.devicePixelRatio || 1;
    canvas.width = width * dpr;
    canvas.height = height * dpr;
    ctx.scale(dpr, dpr);

    ctx.strokeStyle = "#0F172A"; // Encre bleu-nuit / noir
    ctx.lineWidth = 2.5;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    // Si une signature existe déjà, la dessiner sur le canvas
    if (value) {
      const img = new Image();
      img.src = value;
      img.onload = () => {
        ctx.clearRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        setHasDrawn(true);
      };
    } else {
      ctx.clearRect(0, 0, width, height);
      setHasDrawn(false);
    }
  }, [value, width, height]);

  function getCoordinates(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return {
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    };
  }

  function handlePointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.setPointerCapture(e.pointerId);

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
    setIsDrawing(true);
    setHasDrawn(true);
  }

  function handlePointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function handlePointerUp(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!isDrawing) return;
    setIsDrawing(false);

    const canvas = canvasRef.current;
    if (!canvas) return;
    try {
      canvas.releasePointerCapture(e.pointerId);
    } catch {
      // Ignorer si déjà relâché
    }

    const dataUrl = canvas.toDataURL("image/png");
    onChange(dataUrl);
  }

  function handleClear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);
    setHasDrawn(false);
    onChange(null);
  }

  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between">
        <label className="text-xs font-semibold text-slate-300">
          {label} {signerName ? <span className="text-slate-400 font-normal">({signerName})</span> : null}
        </label>
        {hasDrawn && (
          <button
            type="button"
            onClick={handleClear}
            className="text-3xs font-medium text-red-400 hover:text-red-300"
          >
            Effacer 🗑️
          </button>
        )}
      </div>

      <div className="relative rounded-lg border border-slate-600 bg-white p-1 shadow-inner">
        <canvas
          ref={canvasRef}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          onPointerLeave={handlePointerUp}
          style={{ width: "100%", height: `${height}px`, touchAction: "none" }}
          className="cursor-crosshair rounded bg-white"
        />
        {!hasDrawn && (
          <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
            <p className="text-xs text-slate-400 italic">
              ✍️ Signer au doigt, au stylet ou à la souris
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

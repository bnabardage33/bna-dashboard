"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, Image as ImageIcon, Ruler, Square, Scissors, Wand2, Undo, Trash2, Check } from "lucide-react";
import { Surface } from '@/components/ui/Surface';

type Point = { x: number; y: number };
type Mode = "etalonnage" | "facade" | "deduction" | null;

export default function MetreIAPage() {
  const [image, setImage] = useState<string | null>(null);
  const [imgObj, setImgObj] = useState<HTMLImageElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // État du dessin
  const [mode, setMode] = useState<Mode>("etalonnage");
  const [etalonnage, setEtalonnage] = useState<{ p1: Point; p2: Point; realMeters: number } | null>(null);
  const [facades, setFacades] = useState<Point[][]>([]);
  const [deductions, setDeductions] = useState<Point[][]>([]);
  
  // En cours de tracé
  const [currentLine, setCurrentLine] = useState<[Point, Point] | null>(null); // Pour l'étalonnage
  const [currentPoly, setCurrentPoly] = useState<Point[]>([]); // Pour les façades/déductions
  
  const [isDrawing, setIsDrawing] = useState(false);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        const dataUrl = event.target?.result as string;
        setImage(dataUrl);
        const img = new Image();
        img.onload = () => setImgObj(img);
        img.src = dataUrl;
      };
      reader.readAsDataURL(file);
    }
  };

  // ---------------- REDESSINER LE CANVAS ----------------
  const redraw = () => {
    const canvas = canvasRef.current;
    if (!canvas || !imgObj) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(imgObj, 0, 0, canvas.width, canvas.height);

    // Dessiner l'étalonnage (Règle)
    if (etalonnage) {
      drawLine(ctx, etalonnage.p1, etalonnage.p2, "#06b6d4", 3); // Cyan
      drawText(ctx, `${etalonnage.realMeters} m`, etalonnage.p1, etalonnage.p2, "#06b6d4");
    }
    if (currentLine) {
      drawLine(ctx, currentLine[0], currentLine[1], "#06b6d4", 3, true);
    }

    // Dessiner les façades (Polygones verts)
    facades.forEach(poly => drawPolygon(ctx, poly, "rgba(74, 222, 128, 0.4)", "#4ade80"));
    // Dessiner les déductions (Polygones rouges)
    deductions.forEach(poly => drawPolygon(ctx, poly, "rgba(244, 63, 94, 0.4)", "#f43f5e"));

    // Dessiner le polygone en cours
    if (currentPoly.length > 0) {
      const color = mode === "facade" ? "#4ade80" : "#f43f5e";
      drawPolygon(ctx, currentPoly, "transparent", color, true);
    }
  };

  useEffect(() => {
    if (imgObj && canvasRef.current) {
      const canvas = canvasRef.current;
      const maxWidth = window.innerWidth - 32;
      const scale = maxWidth / imgObj.width;
      canvas.width = maxWidth;
      canvas.height = imgObj.height * scale;
      redraw();
    }
  }, [imgObj]);

  useEffect(() => { redraw(); }, [mode, etalonnage, facades, deductions, currentLine, currentPoly]);

  // ---------------- HELPERS DE DESSIN ----------------
  const drawLine = (ctx: CanvasRenderingContext2D, p1: Point, p2: Point, color: string, width: number, dashed = false) => {
    ctx.beginPath();
    ctx.moveTo(p1.x, p1.y);
    ctx.lineTo(p2.x, p2.y);
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    if (dashed) ctx.setLineDash([5, 5]);
    else ctx.setLineDash([]);
    ctx.stroke();
    
    // Points aux extrémités
    ctx.fillStyle = "white";
    ctx.beginPath(); ctx.arc(p1.x, p1.y, 4, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(p2.x, p2.y, 4, 0, Math.PI * 2); ctx.fill();
  };

  const drawPolygon = (ctx: CanvasRenderingContext2D, points: Point[], fillColor: string, strokeColor: string, isOpen = false) => {
    if (points.length === 0) return;
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) ctx.lineTo(points[i].x, points[i].y);
    if (!isOpen) ctx.closePath();
    
    ctx.fillStyle = fillColor;
    ctx.fill();
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 2;
    ctx.setLineDash([]);
    ctx.stroke();

    // Dessiner les sommets
    ctx.fillStyle = "white";
    points.forEach(p => {
      ctx.beginPath(); ctx.arc(p.x, p.y, 4, 0, Math.PI * 2); ctx.fill();
    });
  };

  const drawText = (ctx: CanvasRenderingContext2D, text: string, p1: Point, p2: Point, color: string) => {
    const mx = (p1.x + p2.x) / 2;
    const my = (p1.y + p2.y) / 2 - 10;
    ctx.fillStyle = "rgba(0,0,0,0.7)";
    ctx.fillRect(mx - 20, my - 15, 40, 20);
    ctx.fillStyle = color;
    ctx.font = "bold 14px sans-serif";
    ctx.textAlign = "center";
    ctx.fillText(text, mx, my);
  };

  // ---------------- INTERACTIONS SOURIS/TOUCH ----------------
  const getCoords = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    let clientX, clientY;
    if ("touches" in e) {
      clientX = e.touches[0].clientX;
      clientY = e.touches[0].clientY;
    } else {
      clientX = (e as React.MouseEvent).clientX;
      clientY = (e as React.MouseEvent).clientY;
    }
    return { x: clientX - rect.left, y: clientY - rect.top };
  };

  const handlePointerDown = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault(); // Empêcher le scroll sur mobile en dessinant
    const p = getCoords(e);
    
    if (mode === "etalonnage") {
      setIsDrawing(true);
      setCurrentLine([p, p]);
    } else if (mode === "facade" || mode === "deduction") {
      setCurrentPoly([...currentPoly, p]);
    }
  };

  const handlePointerMove = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (mode === "etalonnage" && isDrawing && currentLine) {
      const p = getCoords(e);
      setCurrentLine([currentLine[0], p]);
    }
  };

  const handlePointerUp = () => {
    if (mode === "etalonnage" && isDrawing && currentLine) {
      setIsDrawing(false);
      const val = prompt("Quelle est la vraie longueur de ce trait en mètres ? (ex: 2.10)");
      if (val && !isNaN(parseFloat(val.replace(',', '.')))) {
        setEtalonnage({ p1: currentLine[0], p2: currentLine[1], realMeters: parseFloat(val.replace(',', '.')) });
        setMode("facade");
      }
      setCurrentLine(null);
    }
  };

  const handleClosePoly = () => {
    if (currentPoly.length > 2) {
      if (mode === "facade") setFacades([...facades, currentPoly]);
      if (mode === "deduction") setDeductions([...deductions, currentPoly]);
    }
    setCurrentPoly([]);
  };

  // ---------------- CALCUL DES SURFACES ----------------
  // Calcule l'aire d'un polygone (formule classique de Gauss) en pixels carrés
  const getPolyAreaPx = (poly: Point[]) => {
    if (poly.length < 3) return 0;
    let area = 0;
    for (let i = 0; i < poly.length; i++) {
      let j = (i + 1) % poly.length;
      area += poly[i].x * poly[j].y - poly[j].x * poly[i].y;
    }
    return Math.abs(area / 2);
  };

  // Convertit l'aire en pixels en mètres carrés grâce à l'étalonnage
  const getAreaM2 = (poly: Point[]) => {
    if (!etalonnage) return 0;
    const dx = etalonnage.p2.x - etalonnage.p1.x;
    const dy = etalonnage.p2.y - etalonnage.p1.y;
    const distPx = Math.sqrt(dx * dx + dy * dy);
    if (distPx === 0) return 0;
    
    const pixelsPerMeter = distPx / etalonnage.realMeters;
    const areaPx = getPolyAreaPx(poly);
    return areaPx / (pixelsPerMeter * pixelsPerMeter);
  };

  let currentFacade = mode === "facade" ? getAreaM2(currentPoly) : 0;
  let currentDeduction = mode === "deduction" ? getAreaM2(currentPoly) : 0;

  const totalFacade = facades.reduce((sum, p) => sum + getAreaM2(p), 0) + currentFacade;
  const totalDeduction = deductions.reduce((sum, p) => sum + getAreaM2(p), 0) + currentDeduction;
  const surfaceNette = Math.max(0, totalFacade - totalDeduction);

  return (
    <div className="min-h-screen bg-transparent p-4 text-white">
      <div className="mx-auto max-w-3xl space-y-6 pb-20">
        <header className="flex flex-col gap-2">
          <Link href="/terrain/chantier" className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors">
            <ArrowLeft className="h-4 w-4" /> Retour aux Chantiers
          </Link>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-cyan-500/20 p-2">
              <Wand2 className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Métré sur Photo</h1>
            </div>
          </div>
        </header>

        {!image ? (
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-900/20 p-6 text-center">
            <p className="text-sm text-cyan-200 mb-6">Importez une photo d'une façade bien de face pour commencer.</p>
            <div className="flex flex-col sm:flex-row gap-4">
              <input type="file" accept="image/*" capture="environment" ref={fileInputRef} className="hidden" onChange={handleImageUpload} />
              <button onClick={() => fileInputRef.current?.click()} className="flex-1 flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-4 rounded-xl">
                <Camera className="h-5 w-5" /> Appareil Photo
              </button>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Barre d'outils */}
            <Surface className="flex flex-wrap gap-2 p-2">
              <button 
                onClick={() => { setMode("etalonnage"); setCurrentPoly([]); }}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-bold transition-all ${mode === "etalonnage" ? "bg-cyan-600 text-white" : "bg-transparent text-gray-400 hover:bg-white/5"}`}
              >
                <Ruler className="h-4 w-4" /> 1. Étalonner
              </button>
              <button 
                onClick={() => { setMode("facade"); setCurrentPoly([]); }}
                disabled={!etalonnage}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-bold transition-all ${mode === "facade" ? "bg-green-600 text-white" : "bg-transparent text-gray-400 hover:bg-white/5"} disabled:opacity-30`}
              >
                <Square className="h-4 w-4" /> 2. Façades
              </button>
              <button 
                onClick={() => { setMode("deduction"); setCurrentPoly([]); }}
                disabled={!etalonnage}
                className={`flex-1 flex items-center justify-center gap-2 py-2 px-3 rounded-lg text-sm font-bold transition-all ${mode === "deduction" ? "bg-rose-600 text-white" : "bg-transparent text-gray-400 hover:bg-white/5"} disabled:opacity-30`}
              >
                <Scissors className="h-4 w-4" /> 3. Vides
              </button>
            </Surface>

            {/* Consignes */}
            <div className="text-center text-xs text-gray-400">
              {mode === "etalonnage" && "Glissez le doigt pour tracer une ligne sur un repère (ex: hauteur porte)."}
              {mode === "facade" && "Tapotez les coins de la façade. Cliquez sur OK pour fermer la forme."}
              {mode === "deduction" && "Tapotez les coins des fenêtres à déduire. Cliquez sur OK pour fermer."}
            </div>

            {/* Canvas Area */}
            <div className="relative rounded-xl overflow-hidden border-2 border-gray-700 bg-black touch-none shadow-2xl">
              <canvas 
                ref={canvasRef} 
                className="w-full h-auto"
                onMouseDown={handlePointerDown}
                onMouseMove={handlePointerMove}
                onMouseUp={handlePointerUp}
                onTouchStart={handlePointerDown}
                onTouchMove={handlePointerMove}
                onTouchEnd={handlePointerUp}
              />
            </div>

            {/* Boutons d'action du tracé en cours */}
            {currentPoly.length > 0 && (
              <div className="flex gap-2">
                <button onClick={() => setCurrentPoly(currentPoly.slice(0, -1))} className="flex-1 py-3 bg-gray-700 rounded-xl text-white font-bold flex items-center justify-center gap-2">
                  <Undo className="h-5 w-5" /> Annuler point
                </button>
                {currentPoly.length >= 3 && (
                  <button onClick={handleClosePoly} className="flex-1 py-3 bg-green-600 rounded-xl text-white font-bold flex items-center justify-center gap-2">
                    <Check className="h-5 w-5" /> Fermer Forme
                  </button>
                )}
              </div>
            )}

            {/* Résultats */}
            {etalonnage && (
              <div className="bg-[#1E1E1E] border border-cyan-500/30 p-4 rounded-xl mt-4">
                <h3 className="font-bold text-white mb-3 text-lg">Résultat du métré</h3>
                <div className="flex justify-between items-center text-sm mb-1 text-gray-300">
                  <span>Surface brute (Façades) :</span>
                  <span className="font-bold">{totalFacade.toFixed(2)} m²</span>
                </div>
                <div className="flex justify-between items-center text-sm mb-3 text-rose-400">
                  <span>À déduire (Vides) :</span>
                  <span className="font-bold">- {totalDeduction.toFixed(2)} m²</span>
                </div>
                <div className="flex justify-between items-center border-t border-gray-700 pt-3">
                  <span className="text-cyan-400 font-bold">Surface Nette à poser :</span>
                  <span className="text-2xl font-black text-cyan-400">{surfaceNette.toFixed(2)} m²</span>
                </div>
              </div>
            )}

            <div className="flex gap-2 pt-4">
               <button onClick={() => { setEtalonnage(null); setFacades([]); setDeductions([]); setMode("etalonnage"); }} className="flex items-center gap-2 text-sm text-gray-500 hover:text-white">
                 <Trash2 className="h-4 w-4" /> Tout effacer
               </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

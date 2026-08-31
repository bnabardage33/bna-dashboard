"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, Camera, Image as ImageIcon, Ruler, Wand2, Info } from "lucide-react";

export default function MetreIAPage() {
  const [image, setImage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  const handleImageUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (event) => {
        setImage(event.target?.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  useEffect(() => {
    if (image && canvasRef.current) {
      const canvas = canvasRef.current;
      const ctx = canvas.getContext("2d");
      const img = new Image();
      img.onload = () => {
        // Redimensionner le canvas pour s'adapter à l'image tout en gardant l'aspect ratio
        const maxWidth = window.innerWidth - 32; // padding
        const scale = maxWidth / img.width;
        canvas.width = maxWidth;
        canvas.height = img.height * scale;
        
        ctx?.drawImage(img, 0, 0, canvas.width, canvas.height);
        
        // Petit texte temporaire pour montrer que ça marche
        if (ctx) {
          ctx.fillStyle = "rgba(0, 0, 0, 0.5)";
          ctx.fillRect(0, 0, canvas.width, 40);
          ctx.fillStyle = "white";
          ctx.font = "14px sans-serif";
          ctx.fillText("📸 Photo chargée avec succès. Prête pour l'étalonnage !", 10, 25);
        }
      };
      img.src = image;
    }
  }, [image]);

  return (
    <div className="min-h-screen bg-transparent p-4 text-white">
      <div className="mx-auto max-w-3xl space-y-6">
        <header className="flex flex-col gap-2">
          <Link
            href="/bureau"
            className="inline-flex items-center gap-2 text-sm text-gray-400 hover:text-white transition-colors"
          >
            <ArrowLeft className="h-4 w-4" />
            Retour au Bureau
          </Link>
          <div className="flex items-center gap-3">
            <div className="rounded-full bg-cyan-500/20 p-2">
              <Wand2 className="h-6 w-6 text-cyan-400" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-white">Métré IA</h1>
              <p className="text-sm text-cyan-400">
                Calcul des surfaces de façade par intelligence artificielle
              </p>
            </div>
          </div>
        </header>

        {/* Panneau d'explication */}
        {!image && (
          <div className="rounded-xl border border-cyan-500/30 bg-cyan-900/20 p-6">
            <h2 className="text-lg font-bold text-cyan-400 flex items-center gap-2 mb-4">
              <Info className="h-5 w-5" /> Comment fonctionne votre nouveau super pouvoir ?
            </h2>
            <ol className="list-decimal list-inside space-y-3 text-sm text-cyan-100/80">
              <li>Prenez une photo de la façade (essayez d'être le plus de face possible).</li>
              <li>Tracez un seul trait sur la photo pour indiquer une mesure que vous connaissez (ex: largeur d'une porte = 0.90m).</li>
              <li>L'outil calculera toutes les autres surfaces automatiquement !</li>
            </ol>
            
            <div className="mt-8 flex flex-col sm:flex-row gap-4">
              <input
                type="file"
                accept="image/*"
                capture="environment"
                ref={fileInputRef}
                className="hidden"
                onChange={handleImageUpload}
              />
              <button 
                onClick={() => fileInputRef.current?.click()}
                className="flex-1 flex items-center justify-center gap-2 bg-cyan-600 hover:bg-cyan-500 text-white font-bold py-4 rounded-xl transition-all"
              >
                <Camera className="h-5 w-5" />
                Prendre une photo
              </button>
              <button 
                onClick={() => {
                  if(fileInputRef.current) {
                    fileInputRef.current.removeAttribute('capture');
                    fileInputRef.current.click();
                  }
                }}
                className="flex-1 flex items-center justify-center gap-2 bg-[#1A1D24] border border-white/10 hover:border-cyan-500/50 text-white font-bold py-4 rounded-xl transition-all"
              >
                <ImageIcon className="h-5 w-5" />
                Choisir depuis la galerie
              </button>
            </div>
          </div>
        )}

        {/* Zone de dessin (Canvas) */}
        {image && (
          <div className="space-y-4">
            <div className="flex justify-between items-center bg-[#1A1D24]/80 p-3 rounded-lg border border-white/10">
              <span className="text-sm font-semibold text-gray-300 flex items-center gap-2">
                <Ruler className="h-4 w-4 text-cyan-400" /> 
                Étape 1 : Étalonnage (à venir)
              </span>
              <button 
                onClick={() => setImage(null)}
                className="text-xs text-rose-400 hover:text-rose-300 font-bold"
              >
                Changer de photo
              </button>
            </div>
            
            <div className="relative rounded-xl overflow-hidden border-2 border-cyan-500/50 bg-black">
              <canvas 
                ref={canvasRef} 
                className="w-full touch-none"
                style={{ cursor: 'crosshair' }}
              />
            </div>
            
            <p className="text-center text-xs text-gray-500">
              * La fonctionnalité de dessin et de calcul arrive dans la prochaine mise à jour !
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

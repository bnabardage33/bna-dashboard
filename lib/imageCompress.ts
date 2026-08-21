// lib/imageCompress.ts
// Compresse et redimensionne une image côté client via HTML5 Canvas
// Permet de réduire le poids des photos de smartphone (10 Mo -> ~350 Ko)
// sans perte de lisibilité pour le terrain.

export async function compresserImage(
  file: File,
  maxDimension = 1920,
  qualite = 0.82
): Promise<File> {
  // Si ce n'est pas une image traitable (ou SVG/GIF animé), on renvoie le fichier original
  if (!file.type.startsWith("image/") || file.type.includes("svg") || file.type.includes("gif")) {
    return file;
  }

  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);

    reader.onload = (event) => {
      const img = new Image();
      img.src = event.target?.result as string;

      img.onload = () => {
        let width = img.width;
        let height = img.height;

        // Calcul des nouvelles dimensions proportionnelles
        if (width > maxDimension || height > maxDimension) {
          if (width > height) {
            height = Math.round((height * maxDimension) / width);
            width = maxDimension;
          } else {
            width = Math.round((width * maxDimension) / height);
            height = maxDimension;
          }
        }

        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;

        const ctx = canvas.getContext("2d");
        if (!ctx) {
          resolve(file);
          return;
        }

        // Rendu lissé
        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(img, 0, 0, width, height);

        const outputMime = "image/jpeg";

        canvas.toBlob(
          (blob) => {
            if (!blob) {
              resolve(file);
              return;
            }

            // Conserver le nom d'origine avec extension ajustée
            const fileName = file.name.replace(/\.[^/.]+$/, "") + ".jpg";
            const compressedFile = new File([blob], fileName, {
              type: outputMime,
              lastModified: Date.now(),
            });

            resolve(compressedFile);
          },
          outputMime,
          qualite
        );
      };

      img.onerror = () => resolve(file);
    };

    reader.onerror = () => resolve(file);
  });
}

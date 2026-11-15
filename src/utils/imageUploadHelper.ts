/**
 * Helper to process and convert uploaded images (from mobile gallery, camera, or desktop)
 * to high-quality base64 Data URLs.
 * Optimizes dimensions to ensure Firestore document size limit (1MB) is respected.
 */

export interface ProcessImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0
  maxBytes?: number; // target max UTF-8 character/byte length for Data URL (default 450KB)
}

export function estimateDocByteSize(obj: unknown): number {
  try {
    const serialized = JSON.stringify(obj);
    return new TextEncoder().encode(serialized).length;
  } catch {
    return 0;
  }
}

export function fileToBase64(file: File, options?: ProcessImageOptions): Promise<string> {
  const {
    maxWidth = 1080,
    maxHeight = 1080,
    quality = 0.84,
    maxBytes = 450 * 1024,
  } = options || {};

  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'));
      return;
    }

    if (!file.type.startsWith('image/')) {
      reject(new Error('Selected file is not an image'));
      return;
    }

    const reader = new FileReader();

    reader.onerror = () => {
      reject(new Error('Failed to read image file'));
    };

    reader.onload = (event) => {
      const dataUrl = event.target?.result as string;
      if (!dataUrl) {
        reject(new Error('Failed to parse file data'));
        return;
      }

      const img = new Image();
      img.onerror = () => {
        if (dataUrl.length <= maxBytes) {
          resolve(dataUrl);
        } else {
          reject(new Error('Image is too large and could not be compressed. Please choose a smaller photo.'));
        }
      };

      img.onload = () => {
        try {
          let width = img.naturalWidth || img.width;
          let height = img.naturalHeight || img.height;

          // Only skip re-encoding if already small enough on both dimensions and byte budget
          if (width <= maxWidth && height <= maxHeight && dataUrl.length <= maxBytes) {
            resolve(dataUrl);
            return;
          }

          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);
            width = Math.max(1, Math.round(width * ratio));
            height = Math.max(1, Math.round(height * ratio));
          }

          const renderToDataUrl = (w: number, h: number, mime: string, q: number): string => {
            const canvas = document.createElement('canvas');
            canvas.width = w;
            canvas.height = h;
            const ctx = canvas.getContext('2d');
            if (!ctx) return dataUrl;
            ctx.imageSmoothingEnabled = true;
            ctx.imageSmoothingQuality = 'high';
            // Paint white/dark base before JPEG draw if source has transparency
            if (mime === 'image/jpeg') {
              ctx.fillStyle = '#0B0B0B';
              ctx.fillRect(0, 0, w, h);
            }
            ctx.drawImage(img, 0, 0, w, h);
            return canvas.toDataURL(mime, q);
          };

          // Try PNG first only if source is PNG; otherwise use JPEG
          let resultUrl =
            file.type === 'image/png'
              ? renderToDataUrl(width, height, 'image/png', quality)
              : renderToDataUrl(width, height, 'image/jpeg', quality);

          // Step down JPEG quality and dimensions until safely under maxBytes
          const qualities = [quality, 0.72, 0.6, 0.48, 0.36];
          for (const q of qualities) {
            if (resultUrl.length <= maxBytes) break;
            resultUrl = renderToDataUrl(width, height, 'image/jpeg', q);
          }

          let scale = 0.75;
          while (resultUrl.length > maxBytes && scale >= 0.35) {
            const scaledW = Math.max(160, Math.round(width * scale));
            const scaledH = Math.max(160, Math.round(height * scale));
            resultUrl = renderToDataUrl(scaledW, scaledH, 'image/jpeg', 0.55);
            if (resultUrl.length > maxBytes) {
              resultUrl = renderToDataUrl(scaledW, scaledH, 'image/jpeg', 0.38);
            }
            scale -= 0.15;
          }

          if (resultUrl.length > maxBytes) {
            reject(
              new Error(
                'Poster image is still too large after compression. Please choose a smaller image or use an image URL.'
              )
            );
            return;
          }

          resolve(resultUrl);
        } catch (err) {
          console.warn('Canvas optimization error:', err);
          if (dataUrl.length <= maxBytes) {
            resolve(dataUrl);
          } else {
            reject(new Error('Could not compress image for upload. Please try a smaller photo.'));
          }
        }
      };

      img.src = dataUrl;
    };

    reader.readAsDataURL(file);
  });
}

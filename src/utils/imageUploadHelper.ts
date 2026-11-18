/**
 * Helper to compress and resize all uploaded images (from mobile gallery, camera, or desktop)
 * before uploading to Firebase Storage or storing as Data URLs.
 * Enforces: max 800px width, JPG 70% quality, max 200KB per image.
 */

export interface ProcessImageOptions {
  maxWidth?: number;
  maxHeight?: number;
  quality?: number; // 0.1 to 1.0 (default 0.7)
  maxBytes?: number; // target max byte size (default 200KB)
}

export const MAX_IMAGE_WIDTH = 800;
export const DEFAULT_JPEG_QUALITY = 0.7;
export const MAX_IMAGE_BYTES = 200 * 1024; // 200KB

export function estimateDocByteSize(obj: unknown): number {
  try {
    const serialized = JSON.stringify(obj);
    return new TextEncoder().encode(serialized).length;
  } catch {
    return 0;
  }
}

function loadImageFromFile(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    if (!file) {
      reject(new Error('No file provided'));
      return;
    }
    if (!file.type.startsWith('image/')) {
      reject(new Error('Selected file is not an image'));
      return;
    }

    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error('Failed to decode image file. Please choose a valid photo.'));
    };

    img.src = objectUrl;
  });
}

function drawToCanvas(img: HTMLImageElement, width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    throw new Error('Canvas 2D context unavailable for image compression.');
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  // Paint solid background before JPEG draw so transparent PNGs don't turn black unexpectedly
  ctx.fillStyle = '#0B0B0B';
  ctx.fillRect(0, 0, width, height);
  ctx.drawImage(img, 0, 0, width, height);
  return canvas;
}

function canvasToJpegBlob(canvas: HTMLCanvasElement, quality: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to compress image to JPEG.'));
        }
      },
      'image/jpeg',
      quality
    );
  });
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      if (typeof reader.result === 'string') {
        resolve(reader.result);
      } else {
        reject(new Error('Failed to read compressed image data.'));
      }
    };
    reader.onerror = () => reject(new Error('Failed to read compressed image data.'));
    reader.readAsDataURL(blob);
  });
}

/**
 * Compresses any image File to a JPEG Blob:
 * - Resized to max 800px width (preserving aspect ratio)
 * - Encoded as JPEG at 70% quality
 * - Guaranteed <= 200KB (steps down quality/dimensions if needed)
 * Never returns the original full-size photo.
 */
export async function compressImageForUpload(
  file: File,
  options?: ProcessImageOptions
): Promise<Blob> {
  const maxWidth = Math.min(options?.maxWidth ?? MAX_IMAGE_WIDTH, MAX_IMAGE_WIDTH);
  const maxHeight = options?.maxHeight ?? MAX_IMAGE_WIDTH * 2;
  const initialQuality = Math.min(options?.quality ?? DEFAULT_JPEG_QUALITY, DEFAULT_JPEG_QUALITY);
  const maxBytes = Math.min(options?.maxBytes ?? MAX_IMAGE_BYTES, MAX_IMAGE_BYTES);

  const img = await loadImageFromFile(file);

  let width = img.naturalWidth || img.width;
  let height = img.naturalHeight || img.height;

  if (width > maxWidth || height > maxHeight) {
    const ratio = Math.min(maxWidth / width, maxHeight / height);
    width = Math.max(1, Math.round(width * ratio));
    height = Math.max(1, Math.round(height * ratio));
  }

  let canvas = drawToCanvas(img, width, height);
  let blob = await canvasToJpegBlob(canvas, initialQuality);

  // Step down JPEG quality if still above 200KB
  const qualitySteps = [0.6, 0.5, 0.4, 0.3];
  for (const q of qualitySteps) {
    if (blob.size <= maxBytes) break;
    if (q < initialQuality) {
      blob = await canvasToJpegBlob(canvas, q);
    }
  }

  // Step down dimensions if still above 200KB
  let scale = 0.75;
  while (blob.size > maxBytes && scale >= 0.3) {
    const scaledW = Math.max(160, Math.round(width * scale));
    const scaledH = Math.max(160, Math.round(height * scale));
    canvas = drawToCanvas(img, scaledW, scaledH);
    blob = await canvasToJpegBlob(canvas, 0.55);
    if (blob.size > maxBytes) {
      blob = await canvasToJpegBlob(canvas, 0.38);
    }
    scale -= 0.15;
  }

  if (blob.size > maxBytes) {
    throw new Error('Image is still over 200KB after compression. Please choose a smaller photo.');
  }

  return blob;
}

/**
 * Compresses any image File (max 800px width, JPG 70%, max 200KB) and returns a Data URL.
 */
export async function fileToBase64(file: File, options?: ProcessImageOptions): Promise<string> {
  const compressedBlob = await compressImageForUpload(file, options);
  return blobToDataUrl(compressedBlob);
}

/**
 * Utility to automatically edit a building image by rendering a modern 3D realistic
 * architectural signboard on top of the building with:
 * - Store Name in bold WHITE capital letters
 * - RED background with glossy 3D depth
 * - BLUE glowing LED/neon border
 * - 4K crisp rendering while keeping the original building intact
 */

export interface SignboardOptions {
  storeName: string;
  category?: string;
  signWidthRatio?: number; // width relative to image, default 0.65
  yPositionRatio?: number; // vertical position (0 = top, 1 = bottom), default 0.18
}

export async function generateStoreSignboard(
  imageSource: string | File | Blob,
  options: SignboardOptions
): Promise<string> {
  const { storeName, signWidthRatio = 0.68, yPositionRatio = 0.18 } = options;

  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';

    const handleLoad = () => {
      try {
        // Create canvas with high fidelity
        const canvas = document.createElement('canvas');
        const width = img.naturalWidth || img.width || 1200;
        const height = img.naturalHeight || img.height || 800;

        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');

        if (!ctx) {
          reject(new Error('Could not get 2D canvas context'));
          return;
        }

        // 1. Draw the original building image perfectly intact
        ctx.drawImage(img, 0, 0, width, height);

        const cleanName = (storeName || 'STORE NAME').trim().toUpperCase();

        // Signboard Dimensions
        const signW = Math.max(width * signWidthRatio, 320);
        // Height proportional to width and text length
        const signH = Math.max(signW * 0.28, 90);
        const signX = (width - signW) / 2;
        const signY = Math.max(height * yPositionRatio, 30);
        const cornerRadius = Math.min(signH * 0.12, 16);

        ctx.save();

        // 2. Draw 3D Mounting Struts / Rooftop Brackets to anchor to the building
        const bracketCount = 4;
        const strutWidth = Math.max(signW * 0.022, 6);
        const strutDrop = signH * 0.55;

        for (let i = 0; i < bracketCount; i++) {
          const strutX = signX + (signW / (bracketCount + 1)) * (i + 1) - strutWidth / 2;
          const strutTop = signY + signH - 4;
          const strutBottom = strutTop + strutDrop;

          // Metal strut shadow
          ctx.fillStyle = 'rgba(0, 0, 0, 0.55)';
          ctx.fillRect(strutX + 3, strutTop + 3, strutWidth, strutDrop);

          // Metal strut body (dark steel / industrial gray gradient)
          const metalGrad = ctx.createLinearGradient(strutX, 0, strutX + strutWidth, 0);
          metalGrad.addColorStop(0, '#1f242d');
          metalGrad.addColorStop(0.4, '#475569');
          metalGrad.addColorStop(0.7, '#64748b');
          metalGrad.addColorStop(1, '#1e293b');
          ctx.fillStyle = metalGrad;
          ctx.fillRect(strutX, strutTop, strutWidth, strutDrop);

          // Bracket bolts / rivets
          ctx.fillStyle = '#94a3b8';
          ctx.beginPath();
          ctx.arc(strutX + strutWidth / 2, strutBottom - 6, strutWidth * 0.35, 0, Math.PI * 2);
          ctx.fill();
        }

        // 3. Deep Drop Shadow cast by the 3D signboard onto the building
        ctx.save();
        ctx.shadowColor = 'rgba(0, 0, 0, 0.75)';
        ctx.shadowBlur = 35;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 24;
        drawRoundedRect(ctx, signX, signY, signW, signH, cornerRadius);
        ctx.fillStyle = 'rgba(0,0,0,0.85)';
        ctx.fill();
        ctx.restore();

        // 4. 3D Extrusion Bevel (Deep metallic housing underneath)
        const depthLayers = 8;
        for (let d = depthLayers; d > 0; d--) {
          const depthY = signY + d * 1.5;
          ctx.save();
          drawRoundedRect(ctx, signX, depthY, signW, signH, cornerRadius);
          const bezelShade = 18 + d * 2;
          ctx.fillStyle = `rgb(${bezelShade}, ${bezelShade + 2}, ${bezelShade + 6})`;
          ctx.fill();
          ctx.restore();
        }

        // 5. Electric BLUE Glowing Halo / Neon Bloom behind & around the border
        ctx.save();
        // Wide outer ambient glow (Cyan / Neon Blue)
        ctx.shadowColor = '#00e5ff';
        ctx.shadowBlur = 45;
        drawRoundedRect(ctx, signX, signY, signW, signH, cornerRadius);
        ctx.strokeStyle = 'rgba(0, 229, 255, 0.65)';
        ctx.lineWidth = 6;
        ctx.stroke();

        // Intense core neon blue glow
        ctx.shadowColor = '#2563eb';
        ctx.shadowBlur = 22;
        drawRoundedRect(ctx, signX, signY, signW, signH, cornerRadius);
        ctx.strokeStyle = '#3b82f6';
        ctx.lineWidth = 4;
        ctx.stroke();
        ctx.restore();

        // 6. Signboard Face: Rich RED Background with 3D Gloss / Acrylic Depth
        ctx.save();
        drawRoundedRect(ctx, signX, signY, signW, signH, cornerRadius);
        ctx.clip();

        // Red Gradient base (deep ruby to vibrant crimson)
        const redGrad = ctx.createLinearGradient(signX, signY, signX, signY + signH);
        redGrad.addColorStop(0, '#ef4444'); // Top bright light catch
        redGrad.addColorStop(0.15, '#dc2626');
        redGrad.addColorStop(0.65, '#b91c1c');
        redGrad.addColorStop(1, '#7f1d1d'); // Bottom shaded depth
        ctx.fillStyle = redGrad;
        ctx.fill();

        // Subtle 3D glossy diagonal reflection across the red acrylic panel
        const sheenGrad = ctx.createLinearGradient(signX, signY, signX + signW, signY + signH);
        sheenGrad.addColorStop(0, 'rgba(255, 255, 255, 0.35)');
        sheenGrad.addColorStop(0.35, 'rgba(255, 255, 255, 0.08)');
        sheenGrad.addColorStop(0.5, 'rgba(255, 255, 255, 0.0)');
        sheenGrad.addColorStop(0.75, 'rgba(255, 255, 255, 0.15)');
        sheenGrad.addColorStop(1, 'rgba(255, 255, 255, 0.0)');
        ctx.fillStyle = sheenGrad;
        ctx.fillRect(signX, signY, signW, signH);

        // Subtle inner dark vignette for 3D depth
        const innerVignette = ctx.createRadialGradient(
          signX + signW / 2,
          signY + signH / 2,
          signW * 0.1,
          signX + signW / 2,
          signY + signH / 2,
          signW * 0.65
        );
        innerVignette.addColorStop(0, 'rgba(0, 0, 0, 0)');
        innerVignette.addColorStop(1, 'rgba(0, 0, 0, 0.45)');
        ctx.fillStyle = innerVignette;
        ctx.fillRect(signX, signY, signW, signH);

        ctx.restore(); // end clip

        // 7. BLUE Glowing Border Neon Strip (Sharp, glowing contour)
        ctx.save();
        ctx.shadowColor = '#00f0ff';
        ctx.shadowBlur = 18;
        drawRoundedRect(ctx, signX, signY, signW, signH, cornerRadius);
        ctx.strokeStyle = '#60a5fa';
        ctx.lineWidth = 5;
        ctx.stroke();

        // Bright inner core highlight stroke
        ctx.shadowColor = '#ffffff';
        ctx.shadowBlur = 6;
        drawRoundedRect(ctx, signX, signY, signW, signH, cornerRadius);
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.75)';
        ctx.lineWidth = 1.5;
        ctx.stroke();
        ctx.restore();

        // 8. Bold WHITE Capital Letters for the Store Name
        ctx.save();
        // Dynamic font sizing
        let fontSize = Math.floor(signH * 0.46);
        ctx.font = `900 ${fontSize}px "Inter", "Arial Black", system-ui, sans-serif`;

        // Measure text and scale down if needed so it always fits with margin
        const maxTextW = signW * 0.88;
        let textMetrics = ctx.measureText(cleanName);
        if (textMetrics.width > maxTextW) {
          fontSize = Math.floor(fontSize * (maxTextW / textMetrics.width));
          ctx.font = `900 ${fontSize}px "Inter", "Arial Black", system-ui, sans-serif`;
        }

        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';

        const textX = signX + signW / 2;
        const textY = signY + signH / 2 + (options.category ? -signH * 0.08 : 0);

        // 3D Letter Shadow (cast onto red background)
        ctx.shadowColor = 'rgba(0, 0, 0, 0.85)';
        ctx.shadowBlur = 12;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 6;
        ctx.fillStyle = '#000000';
        ctx.fillText(cleanName, textX, textY + 3);

        // 3D Letter Bevel & Lighting
        ctx.shadowColor = 'rgba(255, 255, 255, 0.9)';
        ctx.shadowBlur = 8;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        // Pure white crisp face
        ctx.fillStyle = '#FFFFFF';
        ctx.fillText(cleanName, textX, textY);

        // Thin top highlight stroke for 3D embossed letter edges
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.lineWidth = 1.2;
        ctx.strokeText(cleanName, textX, textY);

        // Category Tag below name if provided
        if (options.category) {
          const catSize = Math.max(Math.floor(fontSize * 0.32), 11);
          ctx.font = `800 ${catSize}px "Inter", system-ui, sans-serif`;
          ctx.fillStyle = 'rgba(255, 255, 255, 0.92)';
          ctx.shadowColor = '#000';
          ctx.shadowBlur = 6;
          ctx.shadowOffsetY = 2;
          ctx.fillText(`• ${options.category.toUpperCase()} •`, textX, textY + fontSize * 0.65);
        }

        ctx.restore();

        ctx.restore(); // end main save

        // Export high quality image data URL
        const editedDataUrl = canvas.toDataURL('image/jpeg', 0.94);
        resolve(editedDataUrl);
      } catch (err) {
        reject(err);
      }
    };

    img.onerror = () => {
      reject(new Error('Failed to load base image for signboard editing'));
    };

    if (typeof imageSource === 'string') {
      img.src = imageSource;
    } else {
      const reader = new FileReader();
      reader.onload = (e) => {
        img.src = e.target?.result as string;
      };
      reader.onerror = () => reject(new Error('Failed to read image file'));
      reader.readAsDataURL(imageSource);
    }
  });
}

// Helper to draw rounded rectangles
function drawRoundedRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number
) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

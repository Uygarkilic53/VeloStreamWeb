import { DEFAULT_TALKING_THRESHOLD } from "./audio-meter";

export interface CanvasBannerOptions {
  canvas: HTMLCanvasElement;
  displayName: string;
  username: string;
  title: string;
  category: string;
  avatarUrl?: string | null;
  avatarAccent?: string;
  avatarInitials?: string;
  avatarImage?: HTMLImageElement | null;
  micActive: boolean;
  micLevel: number; // 0.0 to 1.0
  isTalking?: boolean;
  isLive: boolean;
  timeMs?: number;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function getBannerInitials(
  avatarInitials?: string,
  displayName?: string,
  username?: string,
): string {
  if (avatarInitials && avatarInitials.trim().length > 0) {
    return avatarInitials.trim().slice(0, 3).toUpperCase();
  }
  const source = (displayName || username || "VS").trim();
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length >= 2 && parts[0] && parts[1]) {
    return `${parts[0][0]}${parts[1][0]}`.toUpperCase();
  }
  return source.slice(0, 2).toUpperCase();
}

/**
 * Draws the high-fidelity broadcast banner onto a 1280x720 canvas.
 * Renders the circular avatar with a dynamic voice-reactive glowing pulse halo
 * when microphone is active, scaling with mic volume.
 */
export function drawBannerToCanvas(options: CanvasBannerOptions): void {
  const {
    canvas,
    displayName,
    username,
    title,
    category,
    avatarAccent = "#2563EB",
    avatarInitials,
    avatarImage,
    micActive,
    micLevel,
    isLive,
    timeMs = Date.now(),
  } = options;

  let ctx: CanvasRenderingContext2D | null = null;
  try {
    ctx = canvas.getContext("2d");
  } catch {
    return;
  }
  if (!ctx) return;

  const width = canvas.width || 1280;
  const height = canvas.height || 720;
  const cx = width / 2;
  const cy = height * 0.4;
  const avatarRadius = 76;

  // 1. Stage Background - Deep dark cinematic gradient
  const bgGrad = ctx.createRadialGradient(cx, cy, 60, cx, cy, width * 0.7);
  bgGrad.addColorStop(0, "#131C2E");
  bgGrad.addColorStop(0.5, "#0B101B");
  bgGrad.addColorStop(1, "#05080E");
  ctx.fillStyle = bgGrad;
  ctx.fillRect(0, 0, width, height);

  // Subtle ambient grid pattern
  ctx.save();
  ctx.strokeStyle = "rgba(255, 255, 255, 0.025)";
  ctx.lineWidth = 1;
  const gridSize = 48;
  for (let x = 0; x < width; x += gridSize) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
    ctx.stroke();
  }
  for (let y = 0; y < height; y += gridSize) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
    ctx.stroke();
  }
  ctx.restore();

  // 2. Glowing pulse halo around avatar circle
  const clampedMic = Math.min(1, Math.max(0, micLevel));
  const isTalking =
    typeof options.isTalking === "boolean"
      ? options.isTalking && micActive
      : micActive && clampedMic >= DEFAULT_TALKING_THRESHOLD;

  if (micActive) {
    if (isTalking) {
      // Dynamic expanding halo when talking (higher mic level -> larger & brighter glow)
      const pulseOsc = 0.5 + 0.5 * Math.sin(timeMs / 180);
      const haloRadius = avatarRadius + 10 + clampedMic * 42 + pulseOsc * (4 + clampedMic * 8);
      const glowAlpha = Math.min(1, 0.45 + clampedMic * 0.5);

      // Outer diffused radiant aura
      const auraGrad = ctx.createRadialGradient(
        cx,
        cy,
        avatarRadius,
        cx,
        cy,
        haloRadius + 35,
      );
      auraGrad.addColorStop(0, `rgba(59, 130, 246, ${glowAlpha * 0.75})`);
      auraGrad.addColorStop(0.5, `rgba(96, 165, 250, ${glowAlpha * 0.4})`);
      auraGrad.addColorStop(1, "rgba(59, 130, 246, 0)");

      ctx.fillStyle = auraGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, haloRadius + 35, 0, Math.PI * 2);
      ctx.fill();

      // Outer radiant ring with glow
      ctx.save();
      ctx.shadowColor = "#60A5FA";
      ctx.shadowBlur = 16 + clampedMic * 32 + pulseOsc * (4 + clampedMic * 6);
      ctx.strokeStyle = `rgba(147, 197, 253, ${0.6 + clampedMic * 0.4})`;
      ctx.lineWidth = 3 + clampedMic * 4;
      ctx.beginPath();
      ctx.arc(cx, cy, haloRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // Secondary inner reactive ring
      ctx.save();
      ctx.strokeStyle = `rgba(59, 130, 246, ${0.7 + clampedMic * 0.3})`;
      ctx.lineWidth = 2 + clampedMic * 2;
      ctx.beginPath();
      ctx.arc(cx, cy, avatarRadius + 6 + clampedMic * 16 + pulseOsc * 3, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    } else {
      // Subtle idle breathing pulse when microphone is on but streamer is silent
      const idleOsc = 0.5 + 0.5 * Math.sin(timeMs / 450);
      const idleRadius = avatarRadius + 6 + idleOsc * 7;
      const idleAlpha = 0.22 + idleOsc * 0.16;

      const idleAura = ctx.createRadialGradient(
        cx,
        cy,
        avatarRadius,
        cx,
        cy,
        idleRadius + 16,
      );
      idleAura.addColorStop(0, `rgba(59, 130, 246, ${idleAlpha})`);
      idleAura.addColorStop(1, "rgba(59, 130, 246, 0)");

      ctx.fillStyle = idleAura;
      ctx.beginPath();
      ctx.arc(cx, cy, idleRadius + 16, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.shadowColor = "#3B82F6";
      ctx.shadowBlur = 10;
      ctx.strokeStyle = `rgba(96, 165, 250, ${0.35 + idleOsc * 0.25})`;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.arc(cx, cy, idleRadius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }
  } else {
    // Microphone is muted: neutral subtle ring with zero glow
    ctx.save();
    ctx.strokeStyle = "rgba(100, 116, 139, 0.4)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(cx, cy, avatarRadius + 4, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  // 3. Circular Avatar
  ctx.save();
  ctx.beginPath();
  ctx.arc(cx, cy, avatarRadius, 0, Math.PI * 2);
  ctx.clip();

  if (avatarImage && avatarImage.complete && avatarImage.naturalWidth > 0) {
    ctx.drawImage(
      avatarImage,
      cx - avatarRadius,
      cy - avatarRadius,
      avatarRadius * 2,
      avatarRadius * 2,
    );
  } else {
    ctx.fillStyle = avatarAccent;
    ctx.fill();

    const initials = getBannerInitials(avatarInitials, displayName, username);
    ctx.font = "bold 46px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(initials, cx, cy);
  }
  ctx.restore();

  // Avatar circular border stroke
  ctx.save();
  ctx.strokeStyle = micActive
    ? isTalking
      ? "#93C5FD"
      : "#3B82F6"
    : "rgba(148, 163, 184, 0.5)";
  ctx.lineWidth = 3.5;
  ctx.beginPath();
  ctx.arc(cx, cy, avatarRadius, 0, Math.PI * 2);
  ctx.stroke();
  ctx.restore();

  // 4. Talking Badge
  if (micActive && isTalking) {
    const badgeW = 90;
    const badgeH = 22;
    const badgeY = cy + avatarRadius - 10;
    ctx.save();
    ctx.fillStyle = "#2563EB";
    roundRect(ctx, cx - badgeW / 2, badgeY, badgeW, badgeH, 11);
    ctx.fill();
    ctx.strokeStyle = "#93C5FD";
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.font = "bold 11px system-ui, sans-serif";
    ctx.fillStyle = "#FFFFFF";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText("SPEAKING", cx, badgeY + badgeH / 2);
    ctx.restore();
  }

  // 5. Broadcaster Display Name
  const nameY = cy + avatarRadius + 44;
  ctx.font = "bold 32px system-ui, -apple-system, BlinkMacSystemFont, sans-serif";
  ctx.fillStyle = "#F8FAFC";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(displayName || username || "Broadcaster", cx, nameY);

  // Broadcaster Handle (@username)
  const handleY = nameY + 28;
  ctx.font = "16px monospace";
  ctx.fillStyle = "#94A3B8";
  ctx.fillText(`@${username || "broadcaster"}`, cx, handleY);

  // 6. Stream Title
  const cleanTitle = (title || "Live VeloStream Broadcast").trim();
  const truncatedTitle =
    cleanTitle.length > 56 ? cleanTitle.slice(0, 54) + "…" : cleanTitle;
  const titleY = handleY + 36;
  ctx.font = "600 20px system-ui, sans-serif";
  ctx.fillStyle = "#E2E8F0";
  ctx.fillText(truncatedTitle, cx, titleY);

  // 7. Category Pill
  if (category) {
    const catY = titleY + 30;
    ctx.font = "13px system-ui, sans-serif";
    const textWidth = ctx.measureText(category).width;
    const pillW = textWidth + 24;
    const pillH = 26;

    ctx.save();
    ctx.fillStyle = "rgba(37, 99, 235, 0.22)";
    roundRect(ctx, cx - pillW / 2, catY - pillH / 2, pillW, pillH, 13);
    ctx.fill();

    ctx.strokeStyle = "rgba(96, 165, 250, 0.4)";
    ctx.lineWidth = 1;
    ctx.stroke();

    ctx.fillStyle = "#93C5FD";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillText(category, cx, catY);
    ctx.restore();
  }

  // 8. Top Header Badges (LIVE / STANDBY)
  ctx.save();
  const badgeX = 36;
  const badgeTopY = 36;
  const livePillW = isLive ? 86 : 142;
  const livePillH = 28;

  ctx.fillStyle = isLive ? "rgba(220, 38, 38, 0.9)" : "rgba(15, 23, 42, 0.8)";
  roundRect(ctx, badgeX, badgeTopY, livePillW, livePillH, 6);
  ctx.fill();
  ctx.strokeStyle = isLive ? "rgba(248, 113, 113, 0.5)" : "rgba(255, 255, 255, 0.15)";
  ctx.lineWidth = 1;
  ctx.stroke();

  // Status dot
  ctx.beginPath();
  ctx.arc(badgeX + 14, badgeTopY + 14, 4, 0, Math.PI * 2);
  ctx.fillStyle = isLive ? "#4ADE80" : "#94A3B8";
  ctx.fill();

  ctx.font = "bold 11px system-ui, sans-serif";
  ctx.fillStyle = "#FFFFFF";
  ctx.textAlign = "left";
  ctx.textBaseline = "middle";
  ctx.fillText(isLive ? "ON AIR" : "STUDIO STANDBY", badgeX + 26, badgeTopY + 14);

  // Top Right Resolution
  ctx.font = "12px monospace";
  ctx.fillStyle = "#94A3B8";
  ctx.textAlign = "right";
  ctx.fillText("1280x720 · Banner Feed", width - 36, badgeTopY + 14);

  // 9. Bottom Footer Audio Status
  const footerY = height - 32;
  ctx.font = "12px system-ui, sans-serif";
  ctx.fillStyle = micActive ? (isTalking ? "#60A5FA" : "#94A3B8") : "#64748B";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(
    micActive
      ? isTalking
        ? "Microphone live · Speaking"
        : "Microphone live · Idle"
      : "Microphone muted",
    cx,
    footerY,
  );
  ctx.restore();
}

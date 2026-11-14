export type ResolutionTierId = "auto" | "1080p" | "720p" | "480p" | "360p";

export interface ResolutionTier {
  id: "1080p" | "720p" | "480p" | "360p";
  label: string;
  height: number;
  width: number;
  minBandwidthMbps: number;
}

export const RESOLUTION_TIERS: readonly ResolutionTier[] = [
  { id: "1080p", label: "1080p", height: 1080, width: 1920, minBandwidthMbps: 5.0 },
  { id: "720p", label: "720p", height: 720, width: 1280, minBandwidthMbps: 2.5 },
  { id: "480p", label: "480p", height: 480, width: 854, minBandwidthMbps: 1.0 },
  { id: "360p", label: "360p", height: 360, width: 640, minBandwidthMbps: 0.5 },
] as const;

export interface AvailableResolutionTier {
  id: "1080p" | "720p" | "480p" | "360p";
  label: string;
  height: number;
  width: number;
  isSource: boolean;
}

export interface NetworkCapacity {
  downlinkMbps?: number | null | undefined;
  effectiveType?: string | null | undefined;
  rttMs?: number | null | undefined;
  saveData?: boolean | null | undefined;
}

export interface PlaybackHealth {
  dropRate?: number | null | undefined;
  stallCount?: number | null | undefined;
  totalFrames?: number | null | undefined;
  droppedFrames?: number | null | undefined;
}

export interface DiagnosisInput {
  network?: NetworkCapacity | null | undefined;
  playbackHealth?: PlaybackHealth | null | undefined;
  sourceHeight?: number | null | undefined;
  fallbackQuality?: string | null | undefined;
}

export interface DiagnosisResult {
  recommendedTierId: "1080p" | "720p" | "480p" | "360p";
  networkSummary: string;
  reason: string;
  isConstrained: boolean;
}

/**
 * Parses height from a quality string (e.g. "1080p60", "720p", "1280x720", "1280x720 · Banner Feed")
 */
export function parseHeightFromQualityString(qualityStr?: string | null): number | null {
  if (!qualityStr || typeof qualityStr !== "string") return null;
  const matchDimension = qualityStr.match(/\b\d+x(\d+)\b/);
  if (matchDimension && matchDimension[1]) {
    const val = parseInt(matchDimension[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }
  const matchP = qualityStr.match(/\b(\d{3,4})p/i);
  if (matchP && matchP[1]) {
    const val = parseInt(matchP[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }
  return null;
}

/**
 * Parses nominal frame rate (FPS) from a quality string (e.g. "1080p60", "1080p30", "1280x720 @ 30fps")
 */
export function parseFpsFromQualityString(qualityStr?: string | null): number | null {
  if (!qualityStr || typeof qualityStr !== "string") return null;
  const matchAt = qualityStr.match(/@\s*(\d{2,3})fps/i);
  if (matchAt && matchAt[1]) {
    const val = parseInt(matchAt[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }
  const matchP = qualityStr.match(/\b\d{3,4}p(\d{2,3})\b/i);
  if (matchP && matchP[1]) {
    const val = parseInt(matchP[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }
  const matchFpsWord = qualityStr.match(/\b(\d{2,3})\s*fps\b/i);
  if (matchFpsWord && matchFpsWord[1]) {
    const val = parseInt(matchFpsWord[1], 10);
    if (!isNaN(val) && val > 0) return val;
  }
  return null;
}

/**
 * Returns available resolution options ladder starting from the current stream's
 * source quality down to lower qualities.
 */
export function getAvailableResolutionTiers(
  sourceHeight?: number | null,
  fallbackQuality?: string | null,
): AvailableResolutionTier[] {
  let effectiveCeiling = sourceHeight ?? null;
  if (!effectiveCeiling && fallbackQuality) {
    effectiveCeiling = parseHeightFromQualityString(fallbackQuality);
  }

  // If undetermined, assume 1080 ceiling
  const ceiling =
    typeof effectiveCeiling === "number" && effectiveCeiling > 0
      ? effectiveCeiling
      : 1080;

  // Filter tiers that are <= ceiling (+ 30 margin for minor odd resolutions like 718-720)
  const filtered = RESOLUTION_TIERS.filter((tier) => tier.height <= ceiling + 30);
  const tiersToUse =
    filtered.length > 0 ? filtered : [RESOLUTION_TIERS[RESOLUTION_TIERS.length - 1]!];

  return tiersToUse.map((tier, index) => ({
    id: tier.id,
    label: index === 0 ? `${tier.label} (Source)` : tier.label,
    height: tier.height,
    width: tier.width,
    isSource: index === 0,
  }));
}

/**
 * Safely inspects the browser Network Information API
 */
export function readNetworkCapacity(): NetworkCapacity {
  if (typeof navigator === "undefined") {
    return {};
  }

  const conn =
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).connection ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).mozConnection ||
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (navigator as any).webkitConnection;

  if (!conn) {
    return {};
  }

  return {
    downlinkMbps: typeof conn.downlink === "number" ? conn.downlink : null,
    effectiveType: typeof conn.effectiveType === "string" ? conn.effectiveType : null,
    rttMs: typeof conn.rtt === "number" ? conn.rtt : null,
    saveData: typeof conn.saveData === "boolean" ? conn.saveData : null,
  };
}

/**
 * Diagnoses the viewer's network and device capacity concurrently,
 * choosing the optimal resolution tier capped by the source resolution.
 */
export function evaluateCapacityAndPickResolution(
  input: DiagnosisInput,
): DiagnosisResult {
  const { network, playbackHealth, sourceHeight, fallbackQuality } = input;
  const available = getAvailableResolutionTiers(sourceHeight, fallbackQuality);
  const availableIds = new Set(available.map((t) => t.id));

  // Build network summary string
  let summary = "";
  if (network?.effectiveType && network?.downlinkMbps != null) {
    summary = `${network.effectiveType.toUpperCase()} · ${network.downlinkMbps.toFixed(1)} Mbps`;
  } else if (network?.downlinkMbps != null) {
    summary = `${network.downlinkMbps.toFixed(1)} Mbps`;
  } else if (network?.effectiveType) {
    summary = `${network.effectiveType.toUpperCase()} Network`;
  } else {
    summary = "Concurrent Diagnostic";
  }

  // 1. Data Saver mode forces lowest bandwidth
  if (network?.saveData) {
    const lowest = available[available.length - 1]!;
    return {
      recommendedTierId: lowest.id,
      networkSummary: "Data Saver Active",
      reason: "User requested data saver mode",
      isConstrained: true,
    };
  }

  // 2. Base recommendation from network downlink & effectiveType
  let candidateId: "1080p" | "720p" | "480p" | "360p" = "1080p";
  let reason = "Optimal connection throughput";
  let isConstrained = false;

  const dl = network?.downlinkMbps;
  const eff = network?.effectiveType?.toLowerCase();

  if (dl != null) {
    if (dl >= 5.0 && eff !== "3g" && eff !== "2g") {
      candidateId = "1080p";
      reason = "High-speed connection (≥ 5 Mbps)";
    } else if (dl >= 2.5 && eff !== "2g") {
      candidateId = "720p";
      reason = "Moderate bandwidth (2.5 - 5 Mbps)";
    } else if (dl >= 1.0) {
      candidateId = "480p";
      reason = "Constrained bandwidth (1 - 2.5 Mbps)";
      isConstrained = true;
    } else {
      candidateId = "360p";
      reason = "Low bandwidth (< 1 Mbps)";
      isConstrained = true;
    }
  } else if (eff) {
    if (eff === "4g") {
      candidateId = "1080p";
      reason = "4G mobile/broadband network";
    } else if (eff === "3g") {
      candidateId = "480p";
      reason = "3G network constraint";
      isConstrained = true;
    } else {
      candidateId = "360p";
      reason = "2G / slow network constraint";
      isConstrained = true;
    }
  }

  // 3. Playback health degradation (frame drops or buffer stalls)
  const dropRate = playbackHealth?.dropRate ?? 0;
  const stalls = playbackHealth?.stallCount ?? 0;

  let stepDown = 0;
  if (dropRate > 0.40 || stalls >= 6) {
    stepDown = 3;
    reason = stalls >= 6 ? "Critical stall recovery" : "Critical frame-drop recovery";
    isConstrained = true;
  } else if (dropRate > 0.25 || stalls >= 4) {
    stepDown = 2;
    reason = stalls >= 4 ? "Heavy buffering downgrade" : "Heavy frame-drop compensation";
    isConstrained = true;
  } else if (dropRate > 0.08 || stalls >= 2) {
    stepDown = 1;
    reason = stalls >= 2 ? "Buffering recovery downgrade" : "High frame-drop compensation";
    isConstrained = true;
  }

  if (stepDown > 0) {
    const tierOrder: readonly ("1080p" | "720p" | "480p" | "360p")[] = [
      "1080p",
      "720p",
      "480p",
      "360p",
    ];
    const currentIndex = tierOrder.indexOf(candidateId);
    if (currentIndex !== -1) {
      const targetIndex = Math.min(tierOrder.length - 1, currentIndex + stepDown);
      candidateId = tierOrder[targetIndex]!;
    }
  }

  // 4. Cap at source resolution: cannot pick a tier higher than source stream!
  if (!availableIds.has(candidateId)) {
    // Pick the highest available tier
    candidateId = available[0]!.id;
  }

  return {
    recommendedTierId: candidateId,
    networkSummary: summary,
    reason,
    isConstrained,
  };
}

/**
 * Formats the real mirrored resolution string displayed in the top-right overlay badge
 */
export function formatMirroredResolution(params: {
  videoWidth?: number | null | undefined;
  videoHeight?: number | null | undefined;
  fps?: number | null | undefined;
  selectedTierId: ResolutionTierId;
  diagnosedTierId?: "1080p" | "720p" | "480p" | "360p" | null | undefined;
  fallbackQuality?: string | null | undefined;
}): string {
  const { videoWidth, videoHeight, fps, selectedTierId, diagnosedTierId, fallbackQuality } = params;

  const effectiveFps =
    typeof fps === "number" && fps > 0
      ? fps
      : parseFpsFromQualityString(fallbackQuality);

  const activeTierId =
    selectedTierId === "auto" ? diagnosedTierId || "1080p" : selectedTierId;
  const activeTier = RESOLUTION_TIERS.find((t) => t.id === activeTierId);

  // If a downscaled tier was chosen (manual or auto-adapted):
  if (activeTier && activeTier.height < 1080) {
    if (videoHeight && videoHeight > activeTier.height) {
      return effectiveFps
        ? `${activeTier.width}x${activeTier.height} @ ${effectiveFps}fps`
        : `${activeTier.width}x${activeTier.height}`;
    }
  }

  // If real decoded video element or stream dimensions are available:
  if (videoWidth && videoHeight && videoWidth > 0 && videoHeight > 0) {
    // If user explicitly selected a lower tier than source:
    if (activeTier && activeTier.height < videoHeight) {
      return effectiveFps
        ? `${activeTier.width}x${activeTier.height} @ ${effectiveFps}fps`
        : `${activeTier.width}x${activeTier.height}`;
    }
    return effectiveFps
      ? `${videoWidth}x${videoHeight} @ ${effectiveFps}fps`
      : `${videoWidth}x${videoHeight}`;
  }

  // If downscaled active tier is selected without video dimensions yet:
  if (activeTier && activeTierId !== "1080p") {
    return effectiveFps
      ? `${activeTier.width}x${activeTier.height} @ ${effectiveFps}fps`
      : `${activeTier.width}x${activeTier.height}`;
  }

  // Initial fallback before frames decode:
  return fallbackQuality && fallbackQuality.trim().length > 0
    ? fallbackQuality
    : "1080p60";
}

import { describe, expect, it } from "vitest";
import {
  evaluateCapacityAndPickResolution,
  formatMirroredResolution,
  getAvailableResolutionTiers,
  parseFpsFromQualityString,
  parseHeightFromQualityString,
  readNetworkCapacity,
} from "./resolution-diagnostics";

describe("resolution-diagnostics utility", () => {
  describe("parseFpsFromQualityString", () => {
    it("parses fps from @ format (e.g. 1280x720 @ 30fps, 1920x1080 @ 60fps)", () => {
      expect(parseFpsFromQualityString("1280x720 @ 30fps")).toBe(30);
      expect(parseFpsFromQualityString("1920x1080 @ 60fps")).toBe(60);
    });

    it("parses fps from shorthand (e.g. 1080p60, 1080p30, 720p60)", () => {
      expect(parseFpsFromQualityString("1080p60")).toBe(60);
      expect(parseFpsFromQualityString("1080p30")).toBe(30);
      expect(parseFpsFromQualityString("1080p60 · AV1")).toBe(60);
      expect(parseFpsFromQualityString("720p60")).toBe(60);
    });

    it("parses fps from spaced text (e.g. 60 fps)", () => {
      expect(parseFpsFromQualityString("60 FPS GLSL")).toBe(60);
    });

    it("returns null when no fps is specified", () => {
      expect(parseFpsFromQualityString("720p")).toBeNull();
      expect(parseFpsFromQualityString("1280x720 · Banner Feed")).toBeNull();
      expect(parseFpsFromQualityString(null)).toBeNull();
      expect(parseFpsFromQualityString(undefined)).toBeNull();
    });
  });

  describe("parseHeightFromQualityString", () => {
    it("parses height from dimension string (e.g. 1280x720 · Banner Feed)", () => {
      expect(parseHeightFromQualityString("1280x720 · Banner Feed")).toBe(720);
      expect(parseHeightFromQualityString("1920x1080")).toBe(1080);
      expect(parseHeightFromQualityString("640x360")).toBe(360);
    });

    it("parses height from standard shorthand (e.g. 1080p60, 720p)", () => {
      expect(parseHeightFromQualityString("1080p60")).toBe(1080);
      expect(parseHeightFromQualityString("720p")).toBe(720);
      expect(parseHeightFromQualityString("480p30")).toBe(480);
    });

    it("returns null for null, undefined, or unparseable quality strings", () => {
      expect(parseHeightFromQualityString(null)).toBeNull();
      expect(parseHeightFromQualityString(undefined)).toBeNull();
      expect(parseHeightFromQualityString("custom-audio")).toBeNull();
    });
  });

  describe("getAvailableResolutionTiers", () => {
    it("returns full ladder starting from 1080p Source down to 360p when stream is 1080p", () => {
      const tiers = getAvailableResolutionTiers(1080);
      expect(tiers.map((t) => t.id)).toEqual(["1080p", "720p", "480p", "360p"]);
      expect(tiers[0]?.label).toBe("1080p (Source)");
      expect(tiers[0]?.isSource).toBe(true);
      expect(tiers[1]?.label).toBe("720p");
      expect(tiers[1]?.isSource).toBe(false);
    });

    it("starts from 720p Source down to 360p when stream is 720p (excludes 1080p)", () => {
      const tiers = getAvailableResolutionTiers(720);
      expect(tiers.map((t) => t.id)).toEqual(["720p", "480p", "360p"]);
      expect(tiers[0]?.label).toBe("720p (Source)");
      expect(tiers[0]?.isSource).toBe(true);
      expect(tiers.some((t) => t.id === "1080p")).toBe(false);
    });

    it("extracts 720p ceiling from fallback quality string when sourceHeight is null", () => {
      const tiers = getAvailableResolutionTiers(null, "1280x720 · Banner Feed");
      expect(tiers.map((t) => t.id)).toEqual(["720p", "480p", "360p"]);
      expect(tiers[0]?.label).toBe("720p (Source)");
    });

    it("starts from 480p Source when stream is 480p", () => {
      const tiers = getAvailableResolutionTiers(480);
      expect(tiers.map((t) => t.id)).toEqual(["480p", "360p"]);
      expect(tiers[0]?.label).toBe("480p (Source)");
    });

    it("handles low resolution streams (e.g. 240p) gracefully without offering 1080p", () => {
      const tiers = getAvailableResolutionTiers(240);
      expect(tiers.map((t) => t.id)).toEqual(["360p"]);
      expect(tiers.some((t) => t.id === "1080p")).toBe(false);
      expect(tiers.some((t) => t.id === "720p")).toBe(false);
    });
  });

  describe("readNetworkCapacity", () => {
    it("returns an object safely without throwing regardless of environment", () => {
      const capacity = readNetworkCapacity();
      expect(typeof capacity).toBe("object");
    });
  });

  describe("evaluateCapacityAndPickResolution", () => {
    it("picks 1080p when network downlink is high (≥ 5 Mbps) and connection is healthy", () => {
      const result = evaluateCapacityAndPickResolution({
        network: { downlinkMbps: 12.0, effectiveType: "4g" },
        playbackHealth: { dropRate: 0.01, stallCount: 0 },
        sourceHeight: 1080,
      });

      expect(result.recommendedTierId).toBe("1080p");
      expect(result.networkSummary).toBe("4G · 12.0 Mbps");
      expect(result.isConstrained).toBe(false);
    });

    it("caps recommendation to 720p when source stream is 720p even on high-bandwidth network", () => {
      const result = evaluateCapacityAndPickResolution({
        network: { downlinkMbps: 20.0, effectiveType: "4g" },
        sourceHeight: 720,
      });

      expect(result.recommendedTierId).toBe("720p");
    });

    it("picks 720p for moderate bandwidth (2.5 - 5 Mbps)", () => {
      const result = evaluateCapacityAndPickResolution({
        network: { downlinkMbps: 3.5, effectiveType: "4g" },
        sourceHeight: 1080,
      });

      expect(result.recommendedTierId).toBe("720p");
    });

    it("picks 480p for constrained bandwidth (1 - 2.5 Mbps) or 3G", () => {
      const result = evaluateCapacityAndPickResolution({
        network: { downlinkMbps: 1.8, effectiveType: "3g" },
        sourceHeight: 1080,
      });

      expect(result.recommendedTierId).toBe("480p");
      expect(result.isConstrained).toBe(true);
    });

    it("picks 360p for low bandwidth (< 1 Mbps) or 2G", () => {
      const result = evaluateCapacityAndPickResolution({
        network: { downlinkMbps: 0.6, effectiveType: "2g" },
        sourceHeight: 1080,
      });

      expect(result.recommendedTierId).toBe("360p");
      expect(result.isConstrained).toBe(true);
    });

    it("forces lowest available tier when Data Saver is enabled", () => {
      const result = evaluateCapacityAndPickResolution({
        network: { downlinkMbps: 15.0, saveData: true },
        sourceHeight: 1080,
      });

      expect(result.recommendedTierId).toBe("360p");
      expect(result.networkSummary).toBe("Data Saver Active");
      expect(result.isConstrained).toBe(true);
    });

    it("adapts down by a tier when playback detects buffer stalls or excessive frame drops", () => {
      const healthyResult = evaluateCapacityAndPickResolution({
        network: { downlinkMbps: 10.0, effectiveType: "4g" },
        playbackHealth: { dropRate: 0.0, stallCount: 0 },
        sourceHeight: 1080,
      });
      expect(healthyResult.recommendedTierId).toBe("1080p");

      const degradedResult = evaluateCapacityAndPickResolution({
        network: { downlinkMbps: 10.0, effectiveType: "4g" },
        playbackHealth: { dropRate: 0.12, stallCount: 3 },
        sourceHeight: 1080,
      });
      expect(degradedResult.recommendedTierId).toBe("720p");
      expect(degradedResult.isConstrained).toBe(true);
    });

    it("steps down multiple tiers when severe stalls or critical frame drops occur", () => {
      // 4 stalls on 10 Mbps connection drops 2 tiers (1080p -> 480p)
      const heavyStallResult = evaluateCapacityAndPickResolution({
        network: { downlinkMbps: 10.0, effectiveType: "4g" },
        playbackHealth: { dropRate: 0.05, stallCount: 4 },
        sourceHeight: 1080,
      });
      expect(heavyStallResult.recommendedTierId).toBe("480p");
      expect(heavyStallResult.isConstrained).toBe(true);

      // 6 stalls drops 3 tiers to 360p
      const criticalStallResult = evaluateCapacityAndPickResolution({
        network: { downlinkMbps: 10.0, effectiveType: "4g" },
        playbackHealth: { dropRate: 0.0, stallCount: 6 },
        sourceHeight: 1080,
      });
      expect(criticalStallResult.recommendedTierId).toBe("360p");

      // Critical frame drops (> 40%) drops to 360p
      const criticalDropsResult = evaluateCapacityAndPickResolution({
        network: { downlinkMbps: 10.0, effectiveType: "4g" },
        playbackHealth: { dropRate: 0.45, stallCount: 0 },
        sourceHeight: 1080,
      });
      expect(criticalDropsResult.recommendedTierId).toBe("360p");
    });
  });

  describe("formatMirroredResolution", () => {
    it("mirrors real decoded video dimensions (e.g. 1280x720 @ 30fps) instead of static 1080p", () => {
      const res = formatMirroredResolution({
        videoWidth: 1280,
        videoHeight: 720,
        fps: 30,
        selectedTierId: "auto",
        diagnosedTierId: "720p",
      });

      expect(res).toBe("1280x720 @ 30fps");
    });

    it("mirrors 1920x1080 @ 60fps for full HD WHIP stream", () => {
      const res = formatMirroredResolution({
        videoWidth: 1920,
        videoHeight: 1080,
        fps: 60,
        selectedTierId: "auto",
        diagnosedTierId: "1080p",
      });

      expect(res).toBe("1920x1080 @ 60fps");
    });

    it("mirrors downscaled resolution when user manually selects lower quality (e.g. 480p)", () => {
      const res = formatMirroredResolution({
        videoWidth: 1920,
        videoHeight: 1080,
        fps: 60,
        selectedTierId: "480p",
      });

      expect(res).toBe("854x480 @ 60fps");
    });

    it("mirrors 720p when user manually selects 720p", () => {
      const res = formatMirroredResolution({
        videoWidth: 1920,
        videoHeight: 1080,
        selectedTierId: "720p",
      });

      expect(res).toBe("1280x720");
    });

    it("mirrors downscaled resolution when Auto diagnostic adapts to 720p on 1080p stream", () => {
      const res = formatMirroredResolution({
        videoWidth: 1920,
        videoHeight: 1080,
        fps: 60,
        selectedTierId: "auto",
        diagnosedTierId: "720p",
      });

      expect(res).toBe("1280x720 @ 60fps");
    });

    it("falls back to initial fallbackQuality before video frames decode", () => {
      const res = formatMirroredResolution({
        videoWidth: 0,
        videoHeight: 0,
        selectedTierId: "auto",
        fallbackQuality: "1080p60 · AV1",
      });

      expect(res).toBe("1080p60 · AV1");
    });

    it("uses nominal FPS from fallbackQuality when video frames don't expose explicit fps", () => {
      const res = formatMirroredResolution({
        videoWidth: 1280,
        videoHeight: 720,
        selectedTierId: "auto",
        diagnosedTierId: "720p",
        fallbackQuality: "720p60",
      });

      expect(res).toBe("1280x720 @ 60fps");
    });
  });
});

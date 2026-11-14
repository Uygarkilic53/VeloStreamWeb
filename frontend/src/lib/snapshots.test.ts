import { renderHook, act } from "@testing-library/react";
import { beforeEach, describe, expect, it } from "vitest";
import {
  captureLiveStreamSnapshot,
  captureVideoFrame,
  getStreamSnapshot,
  saveStreamSnapshot,
  useStreamSnapshot,
} from "./snapshots";

describe("snapshots utility", () => {
  beforeEach(() => {
    if (typeof window !== "undefined") {
      window.localStorage?.clear();
      window.sessionStorage?.clear();
    }
  });

  it("saves and retrieves snapshots case-insensitively and persists to storage", () => {
    saveStreamSnapshot("Alpha_Gamer", "data:image/jpeg;base64,abc123mock");
    expect(getStreamSnapshot("alpha_gamer")).toBe("data:image/jpeg;base64,abc123mock");
    expect(getStreamSnapshot("ALPHA_GAMER")).toBe("data:image/jpeg;base64,abc123mock");
    expect(window.localStorage.getItem("velostream_snapshot_alpha_gamer")).toBe(
      "data:image/jpeg;base64,abc123mock",
    );
    expect(getStreamSnapshot("non_existent")).toBeNull();
  });

  it("retrieves stored snapshot from storage if memory cache was bypassed", () => {
    window.localStorage.setItem(
      "velostream_snapshot_stored_stream",
      "data:image/jpeg;base64,session_persisted_frame",
    );
    expect(getStreamSnapshot("stored_stream")).toBe(
      "data:image/jpeg;base64,session_persisted_frame",
    );
  });

  it("handles null or zero-dimension video elements gracefully in captureVideoFrame", () => {
    const video = document.createElement("video");
    // Default videoWidth and videoHeight are 0 in jsdom
    const result = captureVideoFrame(video);
    expect(result).toBeNull();
  });

  it("updates useStreamSnapshot hook dynamically when saveStreamSnapshot is called", () => {
    const { result } = renderHook(() => useStreamSnapshot("streamer_beta"));
    expect(result.current).toBeNull();

    act(() => {
      saveStreamSnapshot("streamer_beta", "data:image/jpeg;base64,beta_frame_data");
    });

    expect(result.current).toBe("data:image/jpeg;base64,beta_frame_data");
  });

  it("handles captureLiveStreamSnapshot gracefully when endpoints are offline", async () => {
    const result = await captureLiveStreamSnapshot("offline_channel", {
      hlsBaseUrl: "http://localhost:8888",
      whepBaseUrl: "http://localhost:8889",
    });
    expect(result).toBeNull();
  });
});

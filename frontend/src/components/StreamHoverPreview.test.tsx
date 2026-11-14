import { render, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import * as snapshotsModule from "../lib/snapshots";
import { StreamHoverPreview } from "./StreamHoverPreview";

describe("StreamHoverPreview component", () => {
  it("renders a muted, autoplaying playsinline video with accessible label", () => {
    const { container } = render(
      <StreamHoverPreview slug="mira_codes" hlsBaseUrl="http://localhost:8888" />,
    );

    const video = container.querySelector("video");
    expect(video).toBeInTheDocument();
    expect(video).toHaveAttribute("autoplay");
    expect(video).toHaveAttribute("playsinline");
    expect(video).toHaveAttribute("aria-label", "Live stream preview for mira_codes");
    expect(video?.muted).toBe(true);
  });

  it("attempts WHEP playback as primary real-time transport with derived URL", async () => {
    const originalRTCPeerConnection = globalThis.RTCPeerConnection;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.RTCPeerConnection = vi.fn() as any;

    const whepModule = await import("../lib/whep");
    const mockStop = vi.fn().mockResolvedValue(undefined);
    const mockTrack = { kind: "video", stop: vi.fn() } as unknown as MediaStreamTrack;
    const mockStream = {
      getTracks: () => [mockTrack],
      getVideoTracks: () => [mockTrack],
      getAudioTracks: () => [],
    } as unknown as MediaStream;

    const whepSpy = vi.spyOn(whepModule, "playWhepStream").mockResolvedValue({
      sessionUrl: "http://localhost:8889/mira_codes/whep/session1",
      peerConnection: {} as RTCPeerConnection,
      stream: mockStream,
      stop: mockStop,
    });

    const onStreamActive = vi.fn();
    const { container, unmount } = render(
      <StreamHoverPreview
        slug="mira_codes"
        hlsBaseUrl="http://localhost:8888"
        whepBaseUrl="http://localhost:8889"
        onStreamActive={onStreamActive}
      />,
    );

    await waitFor(() => {
      expect(whepSpy).toHaveBeenCalledWith(
        "http://localhost:8889/mira_codes/whep",
        expect.any(Function),
      );
    });

    const video = container.querySelector("video");
    expect(video).toBeInTheDocument();

    // Verify stream was attached and onStreamActive called
    await waitFor(() => {
      expect(video?.srcObject).toBe(mockStream);
      expect(onStreamActive).toHaveBeenCalled();
    });

    // Unmount and verify full cleanup: whepSession stopped, srcObject cleared
    unmount();
    expect(mockStop).toHaveBeenCalled();
    expect(video?.srcObject).toBeNull();

    whepSpy.mockRestore();
    globalThis.RTCPeerConnection = originalRTCPeerConnection;
  });

  it("sanitizes trailing slashes on whepBaseUrl without double slashes", async () => {
    const originalRTCPeerConnection = globalThis.RTCPeerConnection;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.RTCPeerConnection = vi.fn() as any;

    const whepModule = await import("../lib/whep");
    const mockStop = vi.fn().mockResolvedValue(undefined);
    const whepSpy = vi.spyOn(whepModule, "playWhepStream").mockResolvedValue({
      sessionUrl: null,
      peerConnection: {} as RTCPeerConnection,
      stream: {} as MediaStream,
      stop: mockStop,
    });

    render(
      <StreamHoverPreview
        slug="channel_slash"
        hlsBaseUrl="http://localhost:8888/"
        whepBaseUrl="http://localhost:8889///"
      />,
    );

    await waitFor(() => {
      expect(whepSpy).toHaveBeenCalledWith(
        "http://localhost:8889/channel_slash/whep",
        expect.any(Function),
      );
    });

    whepSpy.mockRestore();
    globalThis.RTCPeerConnection = originalRTCPeerConnection;
  });

  it("mutes incoming audio tracks on the preview stream so no sound plays", async () => {
    const originalRTCPeerConnection = globalThis.RTCPeerConnection;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.RTCPeerConnection = vi.fn() as any;

    const whepModule = await import("../lib/whep");
    const audioTrack = { kind: "audio", enabled: true, stop: vi.fn() };
    const videoTrack = { kind: "video", enabled: true, stop: vi.fn() };

    let trackCallback: ((track: MediaStreamTrack, stream: MediaStream) => void) | undefined;
    const whepSpy = vi.spyOn(whepModule, "playWhepStream").mockImplementation(async (_url, onTrack) => {
      trackCallback = onTrack;
      return {
        sessionUrl: null,
        peerConnection: {} as RTCPeerConnection,
        stream: {
          getTracks: () => [audioTrack, videoTrack],
          getAudioTracks: () => [audioTrack],
          getVideoTracks: () => [videoTrack],
        } as unknown as MediaStream,
        stop: vi.fn().mockResolvedValue(undefined),
      };
    });

    render(
      <StreamHoverPreview slug="audio_stream" hlsBaseUrl="http://localhost:8888" />,
    );

    await waitFor(() => {
      expect(trackCallback).toBeDefined();
    });

    trackCallback!(audioTrack as unknown as MediaStreamTrack, {
      getTracks: () => [audioTrack],
    } as unknown as MediaStream);

    expect(audioTrack.enabled).toBe(false);

    whepSpy.mockRestore();
    globalThis.RTCPeerConnection = originalRTCPeerConnection;
  });

  it("cleans up resources cleanly on rapid unmount without throwing errors", async () => {
    const originalRTCPeerConnection = globalThis.RTCPeerConnection;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.RTCPeerConnection = vi.fn() as any;

    const whepModule = await import("../lib/whep");
    const mockStop = vi.fn().mockResolvedValue(undefined);

    // Simulate slow WHEP response
    let resolveWhep: (val: unknown) => void = () => {};
    const whepPromise = new Promise((resolve) => {
      resolveWhep = resolve;
    });

    const whepSpy = vi.spyOn(whepModule, "playWhepStream").mockImplementation(() =>
      whepPromise as unknown as Promise<{
        sessionUrl: string;
        peerConnection: RTCPeerConnection;
        stream: MediaStream;
        stop: () => Promise<void>;
      }>,
    );

    const { unmount } = render(
      <StreamHoverPreview slug="fast_hover" hlsBaseUrl="http://localhost:8888" />,
    );

    // Immediately unmount before WHEP resolves (user quickly whipped mouse away)
    unmount();

    // Now resolve WHEP
    resolveWhep({
      sessionUrl: "http://localhost:8889/fast_hover/whep/session2",
      peerConnection: {} as RTCPeerConnection,
      stream: {} as MediaStream,
      stop: mockStop,
    });

    // Give microtasks time to run
    await new Promise((r) => setTimeout(r, 10));

    // Cleanup should have called stop on the session because isCancelled was true
    expect(mockStop).toHaveBeenCalled();

    whepSpy.mockRestore();
    globalThis.RTCPeerConnection = originalRTCPeerConnection;
  });

  it("captures snapshot on unmount when stream was active", async () => {
    const captureSpy = vi.spyOn(snapshotsModule, "captureVideoFrame").mockReturnValue("data:image/jpeg;base64,captured_frame");
    const saveSpy = vi.spyOn(snapshotsModule, "saveStreamSnapshot");

    const { container, unmount } = render(
      <StreamHoverPreview slug="snapshot_capture_tester" hlsBaseUrl="http://localhost:8888" />,
    );

    const video = container.querySelector("video")!;
    Object.defineProperty(video, "videoWidth", { value: 640, configurable: true });
    Object.defineProperty(video, "videoHeight", { value: 360, configurable: true });
    Object.defineProperty(video, "readyState", { value: 4, configurable: true });

    // Fire playing event
    video.dispatchEvent(new Event("playing"));

    unmount();

    expect(captureSpy).toHaveBeenCalledWith(video);
    expect(saveSpy).toHaveBeenCalledWith("snapshot_capture_tester", "data:image/jpeg;base64,captured_frame");

    captureSpy.mockRestore();
    saveSpy.mockRestore();
  });
});

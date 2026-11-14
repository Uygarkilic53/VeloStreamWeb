import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAudioMonitor } from "./audio-meter";

describe("audio-meter utility", () => {
  let mockTrack: { kind: string; enabled: boolean };
  let mockStream: MediaStream;

  beforeEach(() => {
    mockTrack = { kind: "audio", enabled: true };
    mockStream = {
      getAudioTracks: () => [mockTrack],
      getTracks: () => [mockTrack],
    } as unknown as MediaStream;
  });

  it("handles environment without Web Audio API gracefully", () => {
    const originalAudioContext = window.AudioContext;
    // @ts-expect-error mutating window for test
    delete window.AudioContext;

    const monitor = createAudioMonitor(mockStream);
    expect(monitor.getLevel()).toBe(0);
    expect(monitor.isTalking()).toBe(false);

    monitor.stop();
    window.AudioContext = originalAudioContext;
  });

  it("returns zero volume when all audio tracks are muted/disabled", () => {
    mockTrack.enabled = false;
    const monitor = createAudioMonitor(mockStream);

    expect(monitor.getLevel()).toBe(0);
    expect(monitor.isTalking()).toBe(false);
    monitor.stop();
  });

  it("returns zero volume when stream is null", () => {
    const monitor = createAudioMonitor(null);
    expect(monitor.getLevel()).toBe(0);
    expect(monitor.isTalking()).toBe(false);
    monitor.stop();
  });

  it("measures volume and identifies talking state using Web Audio AnalyserNode", () => {
    let mockData = 0;
    const fakeAnalyser = {
      fftSize: 256,
      smoothingTimeConstant: 0.5,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn((arr: Uint8Array) => {
        arr.fill(mockData);
      }),
      disconnect: vi.fn(),
    };

    const fakeSource = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };

    class FakeAudioContext {
      state = "running";
      createMediaStreamSource = vi.fn().mockReturnValue(fakeSource);
      createAnalyser = vi.fn().mockReturnValue(fakeAnalyser);
      close = vi.fn().mockResolvedValue(undefined);
      resume = vi.fn().mockResolvedValue(undefined);
    }

    const origAudioContext = window.AudioContext;
    // @ts-expect-error mock AudioContext
    window.AudioContext = FakeAudioContext;

    const monitor = createAudioMonitor(mockStream, {
      noiseFloor: 0.02,
      talkingThreshold: 0.05,
    });

    // 1. Silent
    mockData = 0;
    expect(monitor.getLevel()).toBe(0);
    expect(monitor.isTalking()).toBe(false);

    // 2. High audio level (speaking loud)
    mockData = 180;
    const levelHigh = monitor.getLevel();
    expect(levelHigh).toBeGreaterThan(0.2);
    expect(monitor.isTalking()).toBe(true);

    // 3. Track disabled
    mockTrack.enabled = false;
    expect(monitor.getLevel()).toBe(0);
    expect(monitor.isTalking()).toBe(false);

    monitor.stop();
    expect(fakeSource.disconnect).toHaveBeenCalled();
    expect(fakeAnalyser.disconnect).toHaveBeenCalled();

    window.AudioContext = origAudioContext;
  });

  it("resumes suspended AudioContext on getLevel() and exposes resume() method", async () => {
    const fakeAnalyser = {
      fftSize: 256,
      smoothingTimeConstant: 0.5,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn(),
      disconnect: vi.fn(),
    };
    const fakeSource = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    class FakeAudioContext {
      state = "suspended";
      createMediaStreamSource = vi.fn().mockReturnValue(fakeSource);
      createAnalyser = vi.fn().mockReturnValue(fakeAnalyser);
      close = vi.fn().mockResolvedValue(undefined);
      resume = vi.fn().mockImplementation(() => {
        this.state = "running";
        return Promise.resolve();
      });
    }

    const origAudioContext = window.AudioContext;
    // @ts-expect-error mock AudioContext
    window.AudioContext = FakeAudioContext;

    const monitor = createAudioMonitor(mockStream);
    await monitor.resume();
    expect(monitor.getLevel()).toBe(0);

    monitor.stop();
    window.AudioContext = origAudioContext;
  });

  it("updates and reconnects nodes when tracks are dynamically added to the same MediaStream", () => {
    let streamTracks: typeof mockTrack[] = [];
    const dynamicStream = {
      getAudioTracks: () => streamTracks,
      getTracks: () => streamTracks,
    } as unknown as MediaStream;

    const fakeAnalyser = {
      fftSize: 256,
      smoothingTimeConstant: 0.5,
      frequencyBinCount: 128,
      getByteFrequencyData: vi.fn((arr: Uint8Array) => arr.fill(150)),
      disconnect: vi.fn(),
    };
    const fakeSource = {
      connect: vi.fn(),
      disconnect: vi.fn(),
    };
    class FakeAudioContext {
      state = "running";
      createMediaStreamSource = vi.fn().mockReturnValue(fakeSource);
      createAnalyser = vi.fn().mockReturnValue(fakeAnalyser);
      close = vi.fn().mockResolvedValue(undefined);
      resume = vi.fn().mockResolvedValue(undefined);
    }

    const origAudioContext = window.AudioContext;
    // @ts-expect-error mock AudioContext
    window.AudioContext = FakeAudioContext;

    const monitor = createAudioMonitor(dynamicStream);
    // Initially empty
    expect(monitor.getLevel()).toBe(0);

    // Track dynamically added to the same stream reference
    streamTracks = [{ kind: "audio", enabled: true }];
    monitor.updateStream(dynamicStream);

    expect(monitor.getLevel()).toBeGreaterThan(0);
    expect(monitor.isTalking()).toBe(true);

    monitor.stop();
    window.AudioContext = origAudioContext;
  });
});

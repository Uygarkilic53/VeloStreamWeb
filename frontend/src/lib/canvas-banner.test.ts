import { describe, expect, it, vi } from "vitest";
import { drawBannerToCanvas } from "./canvas-banner";

describe("canvas-banner renderer", () => {
  it("renders banner to canvas and handles high volume mic pulse vs idle pulse vs muted", () => {
    const mockCtx = {
      createRadialGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn(),
      }),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn(),
      arcTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      clip: vi.fn(),
      drawImage: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 80 }),
    };

    const mockCanvas = {
      width: 1280,
      height: 720,
      getContext: vi.fn().mockReturnValue(mockCtx),
    } as unknown as HTMLCanvasElement;

    // 1. Render when talking loudly (micLevel = 0.85)
    drawBannerToCanvas({
      canvas: mockCanvas,
      displayName: "Alex Dev",
      username: "alex_dev",
      title: "Distributed Systems & WebRTC",
      category: "Programming",
      micActive: true,
      micLevel: 0.85,
      isLive: true,
    });

    expect(mockCtx.fillRect).toHaveBeenCalled();
    expect(mockCtx.fillText).toHaveBeenCalledWith("Alex Dev", expect.any(Number), expect.any(Number));
    expect(mockCtx.fillText).toHaveBeenCalledWith("AD", expect.any(Number), expect.any(Number));
    expect(mockCtx.fillText).toHaveBeenCalledWith("SPEAKING", expect.any(Number), expect.any(Number));
    expect(mockCtx.fillText).toHaveBeenCalledWith("ON AIR", expect.any(Number), expect.any(Number));

    // 2. Render when mic is on but silent (micLevel = 0)
    mockCtx.fillText.mockClear();
    drawBannerToCanvas({
      canvas: mockCanvas,
      displayName: "Alex Dev",
      username: "alex_dev",
      title: "Distributed Systems & WebRTC",
      category: "Programming",
      micActive: true,
      micLevel: 0,
      isLive: false,
    });
    expect(mockCtx.fillText).toHaveBeenCalledWith("STUDIO STANDBY", expect.any(Number), expect.any(Number));
    expect(mockCtx.fillText).not.toHaveBeenCalledWith("SPEAKING", expect.any(Number), expect.any(Number));

    // 3. Render when mic is muted (micActive = false)
    mockCtx.fillText.mockClear();
    drawBannerToCanvas({
      canvas: mockCanvas,
      displayName: "Alex Dev",
      username: "alex_dev",
      title: "Distributed Systems & WebRTC",
      category: "Programming",
      micActive: false,
      micLevel: 0,
      isLive: false,
    });
    expect(mockCtx.fillText).toHaveBeenCalledWith("Microphone muted", expect.any(Number), expect.any(Number));
  });

  it("scales glowing halo radius and shadowBlur dynamically with microphone volume level", () => {
    let capturedShadowBlur = 0;
    const capturedArcs: Array<{ r: number }> = [];

    const mockCtx = {
      createRadialGradient: vi.fn().mockReturnValue({
        addColorStop: vi.fn(),
      }),
      fillRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      arc: vi.fn((_x: number, _y: number, r: number) => {
        capturedArcs.push({ r });
      }),
      arcTo: vi.fn(),
      closePath: vi.fn(),
      fill: vi.fn(),
      stroke: vi.fn(),
      clip: vi.fn(),
      drawImage: vi.fn(),
      fillText: vi.fn(),
      measureText: vi.fn().mockReturnValue({ width: 80 }),
      get shadowBlur() {
        return capturedShadowBlur;
      },
      set shadowBlur(v: number) {
        capturedShadowBlur = v;
      },
    };

    const mockCanvas = {
      width: 1280,
      height: 720,
      getContext: vi.fn().mockReturnValue(mockCtx),
    } as unknown as HTMLCanvasElement;

    // Render with low volume (0.1)
    capturedArcs.length = 0;
    drawBannerToCanvas({
      canvas: mockCanvas,
      displayName: "Alex Dev",
      username: "alex_dev",
      title: "Title",
      category: "Programming",
      micActive: true,
      micLevel: 0.1,
      isLive: true,
      timeMs: 1000,
    });
    const lowBlur = capturedShadowBlur;
    const lowArcRadius = capturedArcs[0]?.r ?? 0;

    // Render with loud volume (0.95)
    capturedArcs.length = 0;
    drawBannerToCanvas({
      canvas: mockCanvas,
      displayName: "Alex Dev",
      username: "alex_dev",
      title: "Title",
      category: "Programming",
      micActive: true,
      micLevel: 0.95,
      isLive: true,
      timeMs: 1000,
    });
    const loudBlur = capturedShadowBlur;
    const loudArcRadius = capturedArcs[0]?.r ?? 0;

    expect(loudBlur).toBeGreaterThan(lowBlur);
    expect(loudArcRadius).toBeGreaterThan(lowArcRadius);
  });
});

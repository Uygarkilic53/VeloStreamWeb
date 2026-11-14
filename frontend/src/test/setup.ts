import "@testing-library/jest-dom/vitest";

// Mock HTMLCanvasElement 2D context and captureStream for JSDOM
if (typeof HTMLCanvasElement !== "undefined") {
  const dummyContext = {
    fillRect: () => {},
    clearRect: () => {},
    getImageData: () => ({ data: new Array(4) }),
    putImageData: () => {},
    createImageData: () => [],
    setTransform: () => {},
    drawImage: () => {},
    save: () => {},
    fillText: () => {},
    restore: () => {},
    beginPath: () => {},
    moveTo: () => {},
    lineTo: () => {},
    closePath: () => {},
    stroke: () => {},
    translate: () => {},
    scale: () => {},
    rotate: () => {},
    arc: () => {},
    arcTo: () => {},
    fill: () => {},
    measureText: () => ({ width: 0 }),
    transform: () => {},
    rect: () => {},
    clip: () => {},
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createLinearGradient: () => ({ addColorStop: () => {} }),
  };

  // @ts-expect-error Mocking overloaded getContext signature for JSDOM
  HTMLCanvasElement.prototype.getContext = function (contextId: string) {
    if (contextId === "2d") {
      return dummyContext as unknown as RenderingContext;
    }
    return null;
  };

  HTMLCanvasElement.prototype.toDataURL = function () {
    return "data:image/jpeg;base64,mockdata";
  };

  if (!HTMLCanvasElement.prototype.captureStream) {
    HTMLCanvasElement.prototype.captureStream = function () {
      const track = {
        id: "mock-canvas-video-track",
        kind: "video",
        enabled: true,
        readyState: "live",
        stop: () => {},
        addEventListener: () => {},
        removeEventListener: () => {},
      } as unknown as MediaStreamTrack;

      try {
        if (typeof MediaStream !== "undefined") {
          return new MediaStream([track]);
        }
      } catch {
        // quiet fallback
      }

      return {
        getTracks: () => [track],
        getVideoTracks: () => [track],
        getAudioTracks: () => [],
      } as unknown as MediaStream;
    };
  }
}

if (typeof HTMLMediaElement !== "undefined") {
  HTMLMediaElement.prototype.play = function () {
    return Promise.resolve();
  };
  HTMLMediaElement.prototype.pause = function () {};
  HTMLMediaElement.prototype.load = function () {};
}

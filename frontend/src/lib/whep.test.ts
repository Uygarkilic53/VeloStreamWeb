import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { playWhepStream, WhepClient, WhepError } from "./whep";

describe("WhepClient & playWhepStream", () => {
  let mockTrack: MediaStreamTrack;
  let mockPc: {
    iceServers?: RTCIceServer[] | undefined;
    iceGatheringState: RTCIceGatheringState;
    localDescription: { sdp: string; type: string } | null;
    remoteDescription: { sdp: string; type: string } | null;
    addTransceiver: ReturnType<typeof vi.fn>;
    createOffer: ReturnType<typeof vi.fn>;
    setLocalDescription: ReturnType<typeof vi.fn>;
    setRemoteDescription: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    addEventListener: ReturnType<typeof vi.fn>;
    removeEventListener: ReturnType<typeof vi.fn>;
    ontrack: ((event: unknown) => void) | null;
  };

  const originalFetch = globalThis.fetch;
  const originalRTCPeerConnection = globalThis.RTCPeerConnection;
  const originalRTCSessionDescription = globalThis.RTCSessionDescription;
  const originalMediaStream = globalThis.MediaStream;

  beforeEach(() => {
    class MockMediaStream {
      tracks: MediaStreamTrack[] = [];
      getTracks() {
        return this.tracks;
      }
      addTrack(track: MediaStreamTrack) {
        this.tracks.push(track);
      }
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    globalThis.MediaStream = MockMediaStream as any;
    mockTrack = {
      id: "remote-video-track",
      kind: "video",
      stop: vi.fn(),
    } as unknown as MediaStreamTrack;

    mockPc = {
      iceGatheringState: "complete",
      localDescription: { sdp: "v=0\r\ns=WhepOffer", type: "offer" },
      remoteDescription: null,
      addTransceiver: vi.fn(),
      createOffer: vi.fn().mockResolvedValue({ sdp: "v=0\r\ns=WhepOffer", type: "offer" }),
      setLocalDescription: vi.fn().mockResolvedValue(undefined),
      setRemoteDescription: vi.fn().mockImplementation((desc) => {
        mockPc.remoteDescription = desc;
        return Promise.resolve();
      }),
      close: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      ontrack: null,
    };

    globalThis.RTCPeerConnection = vi.fn().mockImplementation(function (config?: RTCConfiguration) {
      mockPc.iceServers = config?.iceServers;
      return mockPc;
    }) as unknown as typeof RTCPeerConnection;

    globalThis.RTCSessionDescription = vi.fn().mockImplementation(function (init: RTCSessionDescriptionInit) {
      return init;
    }) as unknown as typeof RTCSessionDescription;
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    globalThis.RTCPeerConnection = originalRTCPeerConnection;
    globalThis.RTCSessionDescription = originalRTCSessionDescription;
    globalThis.MediaStream = originalMediaStream;
    vi.restoreAllMocks();
  });

  it("successfully negotiates WHEP SDP offer/answer and extracts session URL", async () => {
    const mockEndpoint = "http://localhost:8889/tester/whep";
    const mockAnswerSdp = "v=0\r\ns=WhepAnswer";

    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 201,
      headers: {
        get: (header: string) => {
          if (header.toLowerCase() === "location") return "/tester/whep/session_xyz";
          return null;
        },
      },
      text: vi.fn().mockResolvedValue(mockAnswerSdp),
    } as unknown as Response);

    const onTrack = vi.fn();
    const session = await playWhepStream(mockEndpoint, onTrack);

    // Verify receive transceivers added
    expect(mockPc.addTransceiver).toHaveBeenCalledWith("video", { direction: "recvonly" });
    expect(mockPc.addTransceiver).toHaveBeenCalledWith("audio", { direction: "recvonly" });

    // Verify SDP offer created and set
    expect(mockPc.createOffer).toHaveBeenCalled();
    expect(mockPc.setLocalDescription).toHaveBeenCalled();

    // Verify fetch called with correct URL and application/sdp
    expect(globalThis.fetch).toHaveBeenCalledWith(mockEndpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/sdp",
      },
      body: mockPc.localDescription?.sdp,
    });

    // Verify remote description set with answer
    expect(mockPc.setRemoteDescription).toHaveBeenCalledWith({
      type: "answer",
      sdp: mockAnswerSdp,
    });

    // Verify sessionUrl resolved properly against endpoint
    expect(session.sessionUrl).toBe("http://localhost:8889/tester/whep/session_xyz");
    expect(session.peerConnection).toBe(mockPc);

    // Test ontrack event handler
    if (mockPc.ontrack) {
      mockPc.ontrack({ track: mockTrack, streams: [] });
      expect(onTrack).toHaveBeenCalledWith(mockTrack, expect.any(Object));
    }

    // Verify session.stop() performs HTTP DELETE and closes peer connection
    await session.stop();
    expect(globalThis.fetch).toHaveBeenCalledWith("http://localhost:8889/tester/whep/session_xyz", {
      method: "DELETE",
    });
    expect(mockPc.close).toHaveBeenCalled();
  });

  it("throws WhepError with 404 when stream is offline or not found", async () => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 404,
      text: vi.fn().mockResolvedValue("no stream is available on path"),
    } as unknown as Response);

    const client = new WhepClient({ endpoint: "http://localhost:8889/tester/whep" });
    await expect(client.play()).rejects.toThrow(WhepError);
    await expect(client.play()).rejects.toMatchObject({
      statusCode: 404,
      message: /live stream not found or offline/i,
    });
  });

  it("throws WhepError on network failure when connecting to WHEP endpoint", async () => {
    globalThis.fetch = vi.fn().mockRejectedValue(new Error("Network connection error"));

    const client = new WhepClient({ endpoint: "http://localhost:8889/tester/whep" });
    await expect(client.play()).rejects.toThrow(WhepError);
    await expect(client.play()).rejects.toMatchObject({
      message: /unable to connect to whep endpoint/i,
    });
  });
});

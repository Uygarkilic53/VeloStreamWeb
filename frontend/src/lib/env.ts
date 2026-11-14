export interface FrontendEnv {
  coreApiUrl: string;
  realtimeHttpUrl: string;
  realtimeWsUrl: string;
  hlsBaseUrl: string;
  whipBaseUrl: string;
  whepBaseUrl: string;
}

export function getFrontendEnv(): FrontendEnv {
  return {
    coreApiUrl: import.meta.env.VITE_CORE_API_URL || "http://localhost:3001",
    realtimeHttpUrl: import.meta.env.VITE_REALTIME_HTTP_URL || "http://localhost:3002",
    realtimeWsUrl: import.meta.env.VITE_REALTIME_WS_URL || "ws://localhost:3002",
    hlsBaseUrl: import.meta.env.VITE_HLS_BASE_URL || "http://localhost:8888",
    whipBaseUrl: import.meta.env.VITE_WHIP_BASE_URL || "http://localhost:8889",
    whepBaseUrl:
      import.meta.env.VITE_WHEP_BASE_URL ||
      import.meta.env.VITE_WHIP_BASE_URL ||
      "http://localhost:8889",
  };
}


import { formatViewerCount, type ThumbnailScene } from "../lib/streams";

interface StreamThumbnailProps {
  scene: ThumbnailScene;
  viewerCount: number;
  quality: string;
  isLive?: boolean;
  compact?: boolean;
}

const SCENE_THEMES: Record<
  ThumbnailScene,
  { bg: string; accent: string; accentSoft: string; tag: string }
> = {
  rust: { bg: "#0F1624", accent: "#3B82F6", accentSoft: "#60A5FA", tag: "fn raymarch()" },
  fps: { bg: "#101826", accent: "#0EA5E9", accentSoft: "#38BDF8", tag: "MATCH 11-10" },
  speedrun: { bg: "#181424", accent: "#F59E0B", accentSoft: "#FBBF24", tag: "PB -0:14.2" },
  strategy: { bg: "#0F1D1B", accent: "#10B981", accentSoft: "#34D399", tag: "SECTOR 04" },
  talk: { bg: "#171825", accent: "#6366F1", accentSoft: "#818CF8", tag: "OPEN MIC" },
  hardware: { bg: "#1D151B", accent: "#F43F5E", accentSoft: "#FB7185", tag: "PCB REV 3" },
  roundtable: { bg: "#121B24", accent: "#0284C7", accentSoft: "#38BDF8", tag: "3 SPEAKERS" },
  compiler: { bg: "#101622", accent: "#3B82F6", accentSoft: "#93C5FD", tag: "zig build" },
  raft: { bg: "#0F1C1E", accent: "#14B8A6", accentSoft: "#2DD4BF", tag: "TERM 42" },
  shader: { bg: "#161428", accent: "#8B5CF6", accentSoft: "#A78BFA", tag: "60 FPS GLSL" },
  synth: { bg: "#1D1322", accent: "#EC4899", accentSoft: "#F472B6", tag: "124 BPM" },
  design: { bg: "#1C1612", accent: "#F97316", accentSoft: "#FB923C", tag: "GRID 8PX" },
};

export function StreamThumbnail({
  scene,
  viewerCount,
  quality,
  isLive = true,
  compact = false,
}: StreamThumbnailProps) {
  const palette = SCENE_THEMES[scene];

  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-lg border border-[var(--vs-border)]"
      style={{ backgroundColor: palette.bg }}
    >
      <svg
        viewBox="0 0 640 360"
        className="h-full w-full"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        aria-hidden="true"
      >
        <defs>
          <pattern id={`grid-${scene}`} width="32" height="32" patternUnits="userSpaceOnUse">
            <path d="M 32 0 L 0 0 0 32" stroke="rgba(255,255,255,0.06)" strokeWidth="1" />
          </pattern>
        </defs>
        <rect width="640" height="360" fill={`url(#grid-${scene})`} />

        {(scene === "rust" || scene === "compiler") && (
          <g>
            <rect x="44" y="56" width="356" height="248" rx="10" fill="rgba(15,23,42,0.85)" stroke="rgba(255,255,255,0.12)" />
            <rect x="64" y="84" width="140" height="10" rx="4" fill={palette.accent} opacity="0.9" />
            <rect x="64" y="108" width="220" height="8" rx="4" fill="#94A3B8" opacity="0.55" />
            <rect x="84" y="128" width="180" height="8" rx="4" fill={palette.accentSoft} opacity="0.7" />
            <rect x="84" y="148" width="248" height="8" rx="4" fill="#CBD5E1" opacity="0.45" />
            <rect x="84" y="168" width="196" height="8" rx="4" fill="#CBD5E1" opacity="0.35" />
            <rect x="64" y="198" width="268" height="78" rx="6" fill="rgba(2,6,23,0.75)" stroke="rgba(255,255,255,0.08)" />
            <path d="M84 252 L134 236 L184 244 L234 220 L284 226 L314 212" stroke="#10B981" strokeWidth="3" strokeLinecap="round" />
            <rect x="424" y="56" width="172" height="118" rx="10" fill="rgba(30,41,59,0.9)" stroke={palette.accent} strokeOpacity="0.4" />
            <circle cx="510" cy="106" r="24" fill={palette.accent} opacity="0.25" />
            <circle cx="510" cy="100" r="11" fill="#E2E8F0" opacity="0.8" />
            <path d="M484 146c4-14 14-20 26-20s22 6 26 20" fill="#E2E8F0" opacity="0.65" />
            <rect x="424" y="192" width="172" height="112" rx="10" fill="rgba(15,23,42,0.85)" stroke="rgba(255,255,255,0.1)" />
            <text x="442" y="226" fill={palette.accentSoft} fontSize="14" fontFamily="monospace">THROUGHPUT</text>
            <text x="442" y="256" fill="#F8FAFC" fontSize="26" fontWeight="700" fontFamily="sans-serif">60 FPS</text>
            <text x="442" y="282" fill="#10B981" fontSize="13" fontFamily="monospace">0 dropped</text>
          </g>
        )}

        {(scene === "fps" || scene === "speedrun" || scene === "strategy") && (
          <g>
            <polygon points="320,76 500,268 140,268" stroke={palette.accent} strokeWidth="2.5" fill="rgba(255,255,255,0.03)" />
            <circle cx="320" cy="186" r="56" stroke={palette.accentSoft} strokeWidth="2" strokeDasharray="8 6" />
            <circle cx="320" cy="186" r="8" fill={palette.accent} />
            <line x1="236" y1="186" x2="294" y2="186" stroke="#F8FAFC" strokeWidth="2" opacity="0.7" />
            <line x1="346" y1="186" x2="404" y2="186" stroke="#F8FAFC" strokeWidth="2" opacity="0.7" />
            <rect x="44" y="278" width="150" height="34" rx="6" fill="rgba(15,23,42,0.8)" stroke="rgba(255,255,255,0.14)" />
            <rect x="60" y="291" width="96" height="8" rx="4" fill={palette.accentSoft} />
          </g>
        )}

        {(scene === "talk" || scene === "roundtable" || scene === "hardware") && (
          <g>
            <rect x="52" y="68" width="254" height="224" rx="12" fill="rgba(30,41,59,0.75)" stroke="rgba(255,255,255,0.12)" />
            <rect x="334" y="68" width="254" height="224" rx="12" fill="rgba(30,41,59,0.75)" stroke="rgba(255,255,255,0.12)" />
            <circle cx="179" cy="158" r="36" fill={palette.accent} opacity="0.3" />
            <circle cx="179" cy="158" r="18" fill="#E2E8F0" opacity="0.85" />
            <circle cx="461" cy="158" r="36" fill={palette.accentSoft} opacity="0.25" />
            <rect x="410" y="216" width="102" height="12" rx="6" fill={palette.accentSoft} opacity="0.8" />
            <path d="M100 242 H140 L152 224 L166 258 L182 216 L198 250 L212 242 H258" stroke={palette.accentSoft} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
          </g>
        )}

        {(scene === "raft" || scene === "shader" || scene === "synth" || scene === "design") && (
          <g>
            <circle cx="192" cy="180" r="62" stroke={palette.accent} strokeWidth="2.5" fill="rgba(255,255,255,0.03)" />
            <circle cx="320" cy="126" r="44" stroke={palette.accentSoft} strokeWidth="2.5" fill="rgba(255,255,255,0.03)" />
            <circle cx="448" cy="196" r="54" stroke="#10B981" strokeWidth="2.5" fill="rgba(255,255,255,0.03)" />
            <line x1="246" y1="154" x2="280" y2="140" stroke="#94A3B8" strokeWidth="2" />
            <line x1="360" y1="146" x2="400" y2="174" stroke="#94A3B8" strokeWidth="2" />
            <line x1="252" y1="190" x2="394" y2="196" stroke="#94A3B8" strokeWidth="2" strokeDasharray="6 6" />
          </g>
        )}
      </svg>

      {!compact && (
        <>
          <div className="absolute top-2.5 left-2.5 flex items-center gap-1.5">
            {isLive ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-[var(--vs-live)] px-2 py-0.5 text-[11px] font-semibold tracking-wide text-white">
                <span className="h-1.5 w-1.5 rounded-full bg-white" aria-hidden="true" />
                LIVE
              </span>
            ) : (
              <span className="inline-flex items-center rounded-md bg-black/75 px-2 py-0.5 text-[11px] font-semibold text-white">
                OFFLINE
              </span>
            )}
            <span className="rounded-md bg-black/70 px-2 py-0.5 font-mono text-[11px] font-medium text-white/90">
              {palette.tag}
            </span>
          </div>

          <div className="absolute bottom-2.5 left-2.5 rounded-md bg-black/75 px-2 py-0.5 text-xs font-medium text-white tabular-nums">
            {formatViewerCount(viewerCount)} viewers
          </div>

          <div className="absolute right-2.5 bottom-2.5 rounded-md bg-black/75 px-2 py-0.5 font-mono text-[11px] text-white/90">
            {quality}
          </div>
        </>
      )}
    </div>
  );
}


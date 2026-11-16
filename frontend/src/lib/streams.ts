import type { StreamCategory } from "./auth";

export interface ChannelSummary {
  id: string;
  slug: string;
  title: string;
  isLive: boolean;
  viewerCount: number;
}

export type ThumbnailScene =
  | "rust"
  | "fps"
  | "speedrun"
  | "strategy"
  | "talk"
  | "hardware"
  | "roundtable"
  | "compiler"
  | "raft"
  | "shader"
  | "synth"
  | "design";

export interface StreamDirectoryItem extends ChannelSummary {
  displayName: string;
  category: StreamCategory;
  subCategory: string;
  tags: string[];
  uptime: string;
  quality: string;
  ingestProtocol: string;
  followersLabel: string;
  bio: string;
  schedule: string[];
  scene: ThumbnailScene;
  avatarInitials: string;
  avatarAccent: string;
  avatarUrl?: string | null | undefined;
  featured?: boolean | undefined;
}

export interface ChatFeedItem {
  id: string;
  author: string;
  userId?: string | undefined;
  avatarUrl?: string | null | undefined;
  role?: "Creator" | "Moderator" | "User" | "Mod" | undefined;
  colorClass: string;
  content: string;
  messageType?: "text" | "gif" | undefined;
  gifUrl?: string | null | undefined;
  isDeleted?: boolean | undefined;
  deletedBy?: string | undefined;
  timestamp: string;
}

export const STREAM_CATEGORIES: readonly ("All Live" | StreamCategory)[] = [
  "All Live",
  "Gaming",
  "Just Chatting",
  "Programming",
  "Music & Audio",
  "Creative",
];

export const INITIAL_LIVE_STREAMS: readonly StreamDirectoryItem[] = [
  {
    id: "ch_mira_codes",
    slug: "mira_codes",
    displayName: "Mira Vance",
    title: "Building a custom 2D lighting engine in Rust from scratch",
    isLive: true,
    viewerCount: 2418,
    category: "Programming",
    subCategory: "Rust & Systems",
    tags: ["rust-lang", "vulkan", "graphics"],
    uptime: "01:42:15",
    quality: "1080p60 · AV1",
    ingestProtocol: "WHIP · 0.3s",
    followersLabel: "42.8K followers",
    bio: "Systems engineer building low-latency network infrastructure, real-time shaders, and custom game engine renderers. Plain live streams with Q&A in chat.",
    schedule: ["Tue · 18:00 UTC — Go & Rust Systems", "Thu · 18:00 UTC — Graphics Programming", "Sun · 16:00 UTC — Open Source Reviews"],
    scene: "rust",
    avatarInitials: "MV",
    avatarAccent: "#2563EB",
    featured: true,
  },
  {
    id: "ch_kaelen_fps",
    slug: "kaelen_fps",
    displayName: "Kaelen Park",
    title: "High-tier ranked scrims — Grandmaster tactical review & comms",
    isLive: true,
    viewerCount: 1430,
    category: "Gaming",
    subCategory: "Tactical FPS",
    tags: ["scrims", "competitive", "1080p60"],
    uptime: "02:18:40",
    quality: "1080p60",
    ingestProtocol: "WHIP Ingest",
    followersLabel: "19.4K followers",
    bio: "Daily competitive FPS scrims and VOD breakdown with direct viewer Q&A.",
    schedule: ["Mon–Fri · 19:00 UTC — Ranked Scrims"],
    scene: "fps",
    avatarInitials: "KP",
    avatarAccent: "#0EA5E9",
  },
  {
    id: "ch_apex_runner",
    slug: "apex_runner",
    displayName: "Sora Tanaka",
    title: "Sub-25m Any% world record pace attempts (no resets)",
    isLive: true,
    viewerCount: 982,
    category: "Gaming",
    subCategory: "Speedrunning",
    tags: ["speedrun", "any%", "pb-grind"],
    uptime: "03:05:11",
    quality: "1080p60",
    ingestProtocol: "WHIP Ingest",
    followersLabel: "12.1K followers",
    bio: "Chasing clean movement tech and world-record pace runs with live splits.",
    schedule: ["Wed / Sat · 20:00 UTC — PB Attempts"],
    scene: "speedrun",
    avatarInitials: "ST",
    avatarAccent: "#D97706",
  },
  {
    id: "ch_grand_tactician",
    slug: "grand_tactician",
    displayName: "Lukas Meyer",
    title: "Ironman conquest run: Day 4 economic & fleet expansion",
    isLive: true,
    viewerCount: 740,
    category: "Gaming",
    subCategory: "4X Strategy",
    tags: ["strategy", "ironman", "chill"],
    uptime: "01:12:09",
    quality: "1080p60",
    ingestProtocol: "OBS RTMP",
    followersLabel: "8.7K followers",
    bio: "Long-form strategy campaigns with chat voting on diplomacy and fleet tech.",
    schedule: ["Tue / Thu · 17:00 UTC — Grand Strategy"],
    scene: "strategy",
    avatarInitials: "LM",
    avatarAccent: "#059669",
  },
  {
    id: "ch_alex_talks",
    slug: "alex_talks_infra",
    displayName: "Alex Rivera",
    title: "Late night tech AMA: self-hosting video & edge routing",
    isLive: true,
    viewerCount: 1810,
    category: "Just Chatting",
    subCategory: "Tech AMA",
    tags: ["q-and-a", "infrastructure", "podcast"],
    uptime: "01:28:54",
    quality: "1080p60",
    ingestProtocol: "WHIP Ingest",
    followersLabel: "31.2K followers",
    bio: "Open mic engineering Q&A, architecture discussions, and live diagramming.",
    schedule: ["Mon / Wed · 21:00 UTC — Late Night AMA"],
    scene: "talk",
    avatarInitials: "AR",
    avatarAccent: "#4F46E5",
  },
  {
    id: "ch_switchlab",
    slug: "switchlab",
    displayName: "Hana Cho",
    title: "Soldering 65% custom PCB & lubing tactile switches",
    isLive: true,
    viewerCount: 2105,
    category: "Just Chatting",
    subCategory: "Hardware Bench",
    tags: ["keyboards", "soldering", "desk-build"],
    uptime: "02:44:02",
    quality: "1080p60",
    ingestProtocol: "WHIP Ingest",
    followersLabel: "27.5K followers",
    bio: "Mechanical keyboard builds, acoustic tests, and microcontroller firmware.",
    schedule: ["Fri / Sun · 19:30 UTC — Build Bench"],
    scene: "hardware",
    avatarInitials: "HC",
    avatarAccent: "#E11D48",
  },
  {
    id: "ch_dev_roundtable",
    slug: "dev_roundtable",
    displayName: "Open Roundtable",
    title: "Open source maintainers chat: testing, releases & burnout",
    isLive: true,
    viewerCount: 620,
    category: "Just Chatting",
    subCategory: "Discussion",
    tags: ["open-source", "community", "panel"],
    uptime: "00:54:18",
    quality: "1080p30",
    ingestProtocol: "WHIP Ingest",
    followersLabel: "9.8K followers",
    bio: "Weekly panel with indie tool authors and library maintainers.",
    schedule: ["Thu · 19:00 UTC — Maintainer Roundtable"],
    scene: "roundtable",
    avatarInitials: "OR",
    avatarAccent: "#0284C7",
  },
  {
    id: "ch_dan_lowlevel",
    slug: "dan_lowlevel",
    displayName: "Dan Okafor",
    title: "Writing an optimizing C compiler backend in Zig",
    isLive: true,
    viewerCount: 845,
    category: "Programming",
    subCategory: "Compilers",
    tags: ["zig", "compilers", "ssa"],
    uptime: "02:02:33",
    quality: "1080p60",
    ingestProtocol: "WHIP Ingest",
    followersLabel: "15.6K followers",
    bio: "Bytecode VMs, register allocators, and zero-dependency native tooling.",
    schedule: ["Tue / Sat · 18:30 UTC — Compiler Lab"],
    scene: "compiler",
    avatarInitials: "DO",
    avatarAccent: "#2563EB",
  },
  {
    id: "ch_cloud_raft",
    slug: "cloud_raft",
    displayName: "Nils Lindqvist",
    title: "Distributed consensus Raft protocol & fault injection in Go",
    isLive: true,
    viewerCount: 512,
    category: "Programming",
    subCategory: "Go / Distributed",
    tags: ["golang", "raft", "consensus"],
    uptime: "01:09:47",
    quality: "1080p60",
    ingestProtocol: "WHIP Ingest",
    followersLabel: "11.3K followers",
    bio: "Building deterministic simulation tests for Go distributed clusters.",
    schedule: ["Mon / Thu · 17:30 UTC — Distributed Go"],
    scene: "raft",
    avatarInitials: "NL",
    avatarAccent: "#0D9488",
  },
  {
    id: "ch_pixel_craft",
    slug: "pixel_craft",
    displayName: "Claire Moreau",
    title: "Procedural terrain generation in GLSL compute shaders",
    isLive: true,
    viewerCount: 690,
    category: "Programming",
    subCategory: "Graphics / GLSL",
    tags: ["glsl", "shaders", "webgl"],
    uptime: "01:51:22",
    quality: "1080p60",
    ingestProtocol: "WHIP Ingest",
    followersLabel: "14.2K followers",
    bio: "Real-time procedural noise, erosion passes, and WebGPU demos.",
    schedule: ["Wed / Sun · 18:00 UTC — Shader Craft"],
    scene: "shader",
    avatarInitials: "CM",
    avatarAccent: "#7C3AED",
  },
  {
    id: "ch_sarah_j",
    slug: "sarah_j",
    displayName: "Sarah Jenkins",
    title: "Hardware modular synth patch session — ambient & breaks",
    isLive: true,
    viewerCount: 890,
    category: "Music & Audio",
    subCategory: "Live Modular",
    tags: ["eurorack", "synth", "live-audio"],
    uptime: "01:36:05",
    quality: "1080p60 · 320kbps",
    ingestProtocol: "WHIP Ingest",
    followersLabel: "18.9K followers",
    bio: "Unscripted modular synthesizer sets and sound design walkthroughs.",
    schedule: ["Fri · 21:00 UTC — Late Night Patch"],
    scene: "synth",
    avatarInitials: "SJ",
    avatarAccent: "#DB2777",
  },
  {
    id: "ch_kuro_sketch",
    slug: "kuro_sketch",
    displayName: "Ren Sato",
    title: "Industrial UI & hardware dial sketching in vector",
    isLive: true,
    viewerCount: 415,
    category: "Creative",
    subCategory: "Industrial Design",
    tags: ["svg", "vector", "product-design"],
    uptime: "00:48:12",
    quality: "1080p60",
    ingestProtocol: "OBS RTMP",
    followersLabel: "7.4K followers",
    bio: "Designing tactile hardware controls, crisp icon grids, and typography.",
    schedule: ["Tue / Fri · 15:00 UTC — Design Desk"],
    scene: "design",
    avatarInitials: "RS",
    avatarAccent: "#EA580C",
  },
];

export function formatViewerCount(count: number): string {
  if (count >= 1000) {
    return `${(count / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  }
  return String(count);
}


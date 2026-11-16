export interface ModerationBanEvent {
  channelId: string;
  userId: string;
  reason: string;
  bannedAt: string;
}

export interface ModerationUnbanEvent {
  channelId: string;
  channelSlug?: string | undefined;
  userId: string;
  username?: string | undefined;
}

export interface ModerationWarningEvent {
  channelId: string;
  channelSlug: string;
  moderatorUsername: string;
  targetUserId: string;
  reason: string;
  warnedAt: string;
}

export interface ModerationSilenceEvent {
  channelId: string;
  userId: string;
  username: string;
  expiresAt: string | null;
  reason: string;
}

export interface ModerationUnsilenceEvent {
  channelId: string;
  userId: string;
  username: string;
}

export interface ModerationRoleEvent {
  channelId: string;
  userId: string;
  username: string;
  newRole: "Moderator" | "User";
}

export interface StreamStatusEvent {
  channelId: string;
  status: "live" | "offline";
  updatedAt: string;
}

export interface ChatResetEvent {
  channelId: string;
}

export interface ChatFreezeEvent {
  channelId: string;
  isFrozen: boolean;
  frozenBy?: string;
}

export interface ChatSlowModeEvent {
  channelId: string;
  enabled: boolean;
  cooldownSeconds: number;
  initial?: boolean;
}

export interface StreamSnapshotEvent {
  channelId: string;
  snapshotUrl: string;
  updatedAt: string;
}

export interface ViewerCountEvent {
  channelId: string;
  viewerCount: number;
  updatedAt: string;
}

export interface WsFrame<T = unknown> {
  type: string;
  payload: T;
}

export interface EventPublisher {
  publishModerationBan(event: ModerationBanEvent): Promise<void>;
  publishModerationUnban?(event: ModerationUnbanEvent): Promise<void>;
  publishModerationWarning?(event: ModerationWarningEvent): Promise<void>;
  publishModerationSilence?(event: ModerationSilenceEvent): Promise<void>;
  publishModerationUnsilence?(event: ModerationUnsilenceEvent): Promise<void>;
  publishModerationRoleUpdated?(event: ModerationRoleEvent): Promise<void>;
}

export class NoopEventPublisher implements EventPublisher {
  async publishModerationBan(_event: ModerationBanEvent): Promise<void> {}
  async publishModerationUnban(_event: ModerationUnbanEvent): Promise<void> {}
  async publishModerationWarning(_event: ModerationWarningEvent): Promise<void> {}
  async publishModerationSilence(_event: ModerationSilenceEvent): Promise<void> {}
  async publishModerationUnsilence(_event: ModerationUnsilenceEvent): Promise<void> {}
  async publishModerationRoleUpdated(_event: ModerationRoleEvent): Promise<void> {}
}


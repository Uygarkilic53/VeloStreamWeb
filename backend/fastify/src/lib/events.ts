export interface ModerationBanEvent {
  channelId: string;
  userId: string;
  reason: string;
  bannedAt: string;
}

export interface StreamStatusEvent {
  channelId: string;
  status: "live" | "offline";
  updatedAt: string;
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
}

export class NoopEventPublisher implements EventPublisher {
  async publishModerationBan(_event: ModerationBanEvent): Promise<void> {}
}


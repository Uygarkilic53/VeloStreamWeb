export interface ModerationBanEvent {
  channelId: string;
  userId: string;
  reason: string;
  bannedAt: string;
}

export interface EventPublisher {
  publishModerationBan(event: ModerationBanEvent): Promise<void>;
}

export class NoopEventPublisher implements EventPublisher {
  async publishModerationBan(_event: ModerationBanEvent): Promise<void> {}
}


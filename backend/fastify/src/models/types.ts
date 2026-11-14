export const STREAM_CATEGORIES = [
  "Gaming",
  "Just Chatting",
  "Programming",
  "Music & Audio",
  "Creative",
] as const;

export type StreamCategory = (typeof STREAM_CATEGORIES)[number];

export type UserRole = "USER" | "CREATOR" | "MODERATOR" | "ADMIN";

export interface UserRecord {
  id: string;
  username: string;
  displayName: string;
  email: string;
  bio: string;
  avatarUrl: string | null;
  passwordHash: string;
  role: UserRole;
  theme: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface ChannelRecord {
  id: string;
  ownerId: string;
  slug: string;
  title: string;
  category: StreamCategory;
  streamKey: string;
  slowMode: boolean;
  isLive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface RefreshTokenRecord {
  id: string;
  userId: string;
  tokenHash: string;
  rememberMe: boolean;
  expiresAt: Date;
  revokedAt: Date | null;
  createdAt: Date;
}

export interface ChannelBanView {
  id: string;
  userId: string;
  username: string;
  reason: string;
  bannedAt: string;
  expiresAt: string | null;
}

export interface ChannelView {
  id: string;
  slug: string;
  title: string;
  category: StreamCategory;
  streamKey: string;
  slowMode: boolean;
  isLive: boolean;
}

export interface PublicUserSummary {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  bio: string;
  isLive: boolean;
  channelTitle: string | null;
  channelCategory: StreamCategory | null;
}

export interface SearchUsersResult {
  users: PublicUserSummary[];
  relatedLiveUsers: PublicUserSummary[];
}

export interface AccountProfileView {
  id: string;
  username: string;
  displayName: string;
  email: string;
  bio: string;
  avatarUrl: string | null;
  role: UserRole;
  theme: "light" | "dark";
  createdAt: string;
  channel: ChannelView | null;
  bannedUsers: ChannelBanView[];
  bannedFromSlugs: string[];
  followedSlugs: string[];
}

export interface CreateUserWithChannelInput {
  username: string;
  displayName: string;
  email: string;
  passwordHash: string;
  streamKey: string;
  channelTitle: string;
  channelCategory?: StreamCategory;
  role?: UserRole;
  theme?: "light" | "dark";
}

export interface UpdateUserProfileInput {
  userId: string;
  displayName: string;
  username: string;
  email: string;
  bio: string;
  avatarUrl?: string | null;
  theme?: "light" | "dark";
}

export interface UpdateChannelSettingsInput {
  ownerId: string;
  title: string;
  category: StreamCategory;
  slowMode?: boolean;
}

export interface CreateRefreshTokenInput {
  userId: string;
  tokenHash: string;
  rememberMe: boolean;
  expiresAt: Date;
}

export interface UpsertChannelBanInput {
  ownerId: string;
  targetUsername: string;
  reason: string;
}

export interface UpsertChannelBanResult {
  ban: ChannelBanView;
  channelId: string;
  targetUserId: string;
}

export class UniqueConstraintError extends Error {
  readonly field: "username" | "email" | "slug" | "streamKey";

  constructor(field: "username" | "email" | "slug" | "streamKey", message: string) {
    super(message);
    this.name = "UniqueConstraintError";
    this.field = field;
  }
}

export class RecordNotFoundError extends Error {
  readonly entity: string;

  constructor(entity: string, message: string) {
    super(message);
    this.name = "RecordNotFoundError";
    this.entity = entity;
  }
}

export interface UserModelContract {
  createWithChannel(input: CreateUserWithChannelInput): Promise<AccountProfileView>;
  findByIdentifier(identifier: string): Promise<UserRecord | null>;
  findById(userId: string): Promise<UserRecord | null>;
  findProfileById(userId: string): Promise<AccountProfileView | null>;
  findPublicByUsername(username: string): Promise<PublicUserSummary | null>;
  searchUsers(query: string, limit?: number, excludeUserId?: string): Promise<SearchUsersResult>;
  getFollowedUsers(userId: string): Promise<PublicUserSummary[]>;
  updateProfile(input: UpdateUserProfileInput): Promise<AccountProfileView>;
  updateTheme(userId: string, theme: "light" | "dark"): Promise<AccountProfileView>;
  updateAvatarUrl(userId: string, avatarUrl: string | null): Promise<AccountProfileView>;
  updatePasswordHash(userId: string, passwordHash: string): Promise<void>;
}

export interface ChannelModelContract {
  updateSettings(input: UpdateChannelSettingsInput): Promise<ChannelView>;
  rotateStreamKey(ownerId: string, nextStreamKey: string): Promise<string>;
  banUserByUsername(input: UpsertChannelBanInput): Promise<UpsertChannelBanResult>;
  unbanUserByUsername(ownerId: string, targetUsername: string): Promise<boolean>;
  isUserBanned(channelSlugOrUsername: string, userId: string): Promise<{ isBanned: boolean; reason?: string }>;
  setFollowState(userId: string, channelSlug: string, follow: boolean): Promise<string[]>;
  getLiveChannels(excludeUserId?: string): Promise<PublicUserSummary[]>;
  setLiveStatus(ownerId: string, isLive: boolean): Promise<ChannelView>;
}

export interface RefreshTokenModelContract {
  create(input: CreateRefreshTokenInput): Promise<RefreshTokenRecord>;
  findByHash(tokenHash: string): Promise<RefreshTokenRecord | null>;
  revokeById(id: string): Promise<void>;
  revokeByHash(tokenHash: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

export interface CoreModels {
  readonly users: UserModelContract;
  readonly channels: ChannelModelContract;
  readonly refreshTokens: RefreshTokenModelContract;
  ping(): Promise<boolean>;
  close(): Promise<void>;
}

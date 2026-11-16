package models

// Keep shared event shapes aligned with backend/fastify/src/lib/events.ts.
const (
	FrameTypeChatMessage           = "chat.message"
	FrameTypeChatDeleteMessage     = "chat.delete_message"
	FrameTypeChatMessageDeleted    = "chat.message_deleted"
	FrameTypeChatHistory           = "chat.history"
	FrameTypeChatError             = "chat.error"
	FrameTypeChatReset             = "chat.reset"
	FrameTypeChatFreeze            = "chat.freeze"
	FrameTypeChatSlowMode          = "chat.slowmode"
	FrameTypeModerationAction      = "moderation.action"
	FrameTypeModerationWarning     = "moderation.warning"
	FrameTypeModerationBanned      = "moderation.banned"
	FrameTypeModerationUnbanned    = "moderation.unbanned"
	FrameTypeModerationSilenced    = "moderation.silenced"
	FrameTypeModerationUnsilenced  = "moderation.unsilenced"
	FrameTypeModerationRoleUpdated = "moderation.role_updated"
	FrameTypeStreamStatus          = "stream.status"
	FrameTypeStreamSnapshot        = "stream.snapshot"
	FrameTypeViewerCount           = "viewer.count"
	FrameTypeError                 = "error"
)

// AuthClaims holds verified identity claims extracted from an access JWT.
type AuthClaims struct {
	UserID   string
	Username string
	Role     string
}

type StreamSnapshotEvent struct {
	ChannelID   string `json:"channelId"`
	SnapshotURL string `json:"snapshotUrl"`
	UpdatedAt   string `json:"updatedAt"`
}

type ModerationBanEvent struct {
	ChannelID string `json:"channelId"`
	UserID    string `json:"userId"`
	Username  string `json:"username,omitempty"`
	Reason    string `json:"reason"`
	BannedAt  string `json:"bannedAt"`
}

type ModerationUnbanPayload struct {
	ChannelID   string `json:"channelId"`
	ChannelSlug string `json:"channelSlug,omitempty"`
	UserID      string `json:"userId"`
	Username    string `json:"username,omitempty"`
}

type ModerationWarningPayload struct {
	ChannelID         string `json:"channelId"`
	ChannelSlug       string `json:"channelSlug"`
	ModeratorUsername string `json:"moderatorUsername"`
	Reason            string `json:"reason"`
	WarnedAt          string `json:"warnedAt"`
}

type ModerationSilencePayload struct {
	ChannelID string  `json:"channelId"`
	UserID    string  `json:"userId"`
	Username  string  `json:"username"`
	ExpiresAt *string `json:"expiresAt,omitempty"`
	Reason    string  `json:"reason"`
}

type ModerationUnsilencePayload struct {
	ChannelID string `json:"channelId"`
	UserID    string `json:"userId"`
	Username  string `json:"username"`
}

type ModerationRolePayload struct {
	ChannelID string `json:"channelId"`
	UserID    string `json:"userId"`
	Username  string `json:"username"`
	NewRole   string `json:"newRole"` // "Moderator" | "User"
}

type ChatDeleteMessagePayload struct {
	MessageID string `json:"messageId"`
}

type ChatMessageDeletedPayload struct {
	MessageID string `json:"messageId"`
	ChannelID string `json:"channelId"`
	DeletedBy string `json:"deletedBy"`
}

type ChatResetPayload struct {
	ChannelID string `json:"channelId"`
}

type ChatFreezePayload struct {
	ChannelID string `json:"channelId"`
	IsFrozen  bool   `json:"isFrozen"`
	FrozenBy  string `json:"frozenBy,omitempty"`
}

type ChatSlowModePayload struct {
	ChannelID       string `json:"channelId"`
	Enabled         bool   `json:"enabled"`
	CooldownSeconds int    `json:"cooldownSeconds"`
	Initial         bool   `json:"initial,omitempty"`
}

type ChatErrorPayload struct {
	Code      string  `json:"code"` // "SILENCED" | "SLOW_MODE" | "FORBIDDEN" | "CHAT_FROZEN"
	Message   string  `json:"message"`
	ExpiresAt *string `json:"expiresAt,omitempty"`
}

type ModerationActionPayload struct {
	Action         string  `json:"action"` // "silence" | "unsilence" | "ban" | "unban" | "warn" | "add_mod" | "remove_mod"
	TargetUserID   string  `json:"targetUserId"`
	TargetUsername string  `json:"targetUsername"`
	Duration       *string `json:"duration,omitempty"` // "1h" | "5h" | "1d" | "1w" | "1m" | "permanent"
	Reason         *string `json:"reason,omitempty"`
}

type StreamStatusEvent struct {
	ChannelID string `json:"channelId"`
	Status    string `json:"status"`
	UpdatedAt string `json:"updatedAt"`
}

type ChatMessage struct {
	ID          string  `json:"id"`
	ChannelID   string  `json:"channelId"`
	UserID      string  `json:"userId"`
	Username    string  `json:"username"`
	AvatarURL   *string `json:"avatarUrl,omitempty"`
	Role        string  `json:"role"` // "Creator" | "Moderator" | "User"
	Content     string  `json:"content"`
	MessageType string  `json:"messageType"` // "text" | "gif"
	GifURL      *string `json:"gifUrl,omitempty"`
	IsDeleted   bool    `json:"isDeleted"`
	CreatedAt   string  `json:"createdAt"`
}

type ViewerCountEvent struct {
	ChannelID   string `json:"channelId"`
	ViewerCount int    `json:"viewerCount"`
	UpdatedAt   string `json:"updatedAt"`
}

type WsFrame struct {
	Type    string `json:"type"`
	Payload any    `json:"payload"`
}

type MediaMTXAuthPayload struct {
	Action   string `json:"action"`
	Path     string `json:"path"`
	Protocol string `json:"protocol"`
	User     string `json:"user"`
	Password string `json:"password"`
	Token    string `json:"token"`
	JWT      string `json:"jwt"`
	Query    string `json:"query"`
}

type MediaMTXEventPayload struct {
	Event      string `json:"event"`
	Path       string `json:"path"`
	SourceType string `json:"sourceType"`
}

type GiphyGifItem struct {
	ID          string `json:"id"`
	Title       string `json:"title"`
	PreviewURL  string `json:"previewUrl"`
	OriginalURL string `json:"originalUrl"`
	Width       int    `json:"width"`
	Height      int    `json:"height"`
}

type GiphyPagination struct {
	TotalCount int `json:"totalCount"`
	Count      int `json:"count"`
	Offset     int `json:"offset"`
}

type GiphyResponse struct {
	Gifs       []GiphyGifItem  `json:"gifs"`
	Pagination GiphyPagination `json:"pagination"`
}

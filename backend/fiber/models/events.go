package models

// Keep shared event shapes aligned with backend/fastify/src/lib/events.ts.
const (
	FrameTypeChatMessage      = "chat.message"
	FrameTypeStreamStatus     = "stream.status"
	FrameTypeStreamSnapshot   = "stream.snapshot"
	FrameTypeViewerCount      = "viewer.count"
	FrameTypeModerationBanned = "moderation.banned"
	FrameTypeError            = "error"
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
	Reason    string `json:"reason"`
	BannedAt  string `json:"bannedAt"`
}

type StreamStatusEvent struct {
	ChannelID string `json:"channelId"`
	Status    string `json:"status"`
	UpdatedAt string `json:"updatedAt"`
}

type ChatMessage struct {
	ID        string `json:"id"`
	ChannelID string `json:"channelId"`
	UserID    string `json:"userId"`
	Username  string `json:"username"`
	Content   string `json:"content"`
	CreatedAt string `json:"createdAt"`
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

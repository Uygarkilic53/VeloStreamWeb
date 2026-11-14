package controllers

import (
	"encoding/json"
	"strings"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/velostream/fiber/middlewares"
	"github.com/velostream/fiber/models"
	"github.com/velostream/fiber/services"
)

type ChatController struct {
	hub *services.HubService
}

func NewChatController(hub *services.HubService) *ChatController {
	return &ChatController{hub: hub}
}

func (ctrl *ChatController) HandleSocket(conn *websocket.Conn) {
	if ctrl.hub == nil {
		_ = conn.Close()
		return
	}

	// Support rich WebSocket frames including thumbnail snapshots without dropping connection
	conn.SetReadLimit(4 * 1024 * 1024)

	channelID := conn.Params("channelId")
	claims, _ := conn.Locals(middlewares.ClaimsLocalKey).(models.AuthClaims)

	client := services.NewClient(channelID, claims.UserID, claims.Username)
	ctrl.hub.Register(client)

	doneWriter := make(chan struct{})
	go func() {
		defer close(doneWriter)
		for msg := range client.Send {
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		}
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var incoming struct {
			Content string `json:"content"`
		}
		if unmarshalErr := json.Unmarshal(raw, &incoming); unmarshalErr != nil {
			continue
		}
		content := strings.TrimSpace(incoming.Content)
		if content == "" {
			continue
		}

		now := time.Now().UTC()
		frameBytes, marshalErr := json.Marshal(models.WsFrame{
			Type: models.FrameTypeChatMessage,
			Payload: models.ChatMessage{
				ID:        now.Format("20060102150405.000000000"),
				ChannelID: channelID,
				UserID:    claims.UserID,
				Username:  claims.Username,
				Content:   content,
				CreatedAt: now.Format(time.RFC3339),
			},
		})
		if marshalErr == nil {
			ctrl.hub.Broadcast(channelID, frameBytes)
		}
	}

	_ = conn.Close()
	// Unregister closes client.Send so the writer goroutine exits cleanly before returning.
	ctrl.hub.Unregister(client)
	<-doneWriter
}

// HandleLiveSocket serves a lightweight real-time subscription for live stream status changes without requiring user authentication.
func (ctrl *ChatController) HandleLiveSocket(conn *websocket.Conn) {
	if ctrl.hub == nil {
		_ = conn.Close()
		return
	}

	// Support rich WebSocket frames including thumbnail snapshots without dropping connection
	conn.SetReadLimit(4 * 1024 * 1024)

	client := services.NewClient("__live__", "viewer", "viewer")
	ctrl.hub.Register(client)

	// Send current cached snapshots to newly connected live subscriber immediately
	for _, snapBytes := range ctrl.hub.GetAllSnapshots() {
		select {
		case client.Send <- snapBytes:
		default:
		}
	}

	doneWriter := make(chan struct{})
	go func() {
		defer close(doneWriter)
		for msg := range client.Send {
			if err := conn.WriteMessage(websocket.TextMessage, msg); err != nil {
				return
			}
		}
	}()

	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}
		var incoming struct {
			Type    string          `json:"type"`
			Payload json.RawMessage `json:"payload"`
		}
		if unmarshalErr := json.Unmarshal(raw, &incoming); unmarshalErr == nil {
			if incoming.Type == models.FrameTypeStreamSnapshot {
				var snap models.StreamSnapshotEvent
				if snapErr := json.Unmarshal(incoming.Payload, &snap); snapErr == nil && snap.ChannelID != "" && snap.SnapshotURL != "" {
					if snap.UpdatedAt == "" {
						snap.UpdatedAt = time.Now().UTC().Format(time.RFC3339)
					}
					frameBytes, marshalErr := json.Marshal(models.WsFrame{
						Type:    models.FrameTypeStreamSnapshot,
						Payload: snap,
					})
					if marshalErr == nil {
						ctrl.hub.SaveSnapshot(snap.ChannelID, frameBytes)
						ctrl.hub.Broadcast(snap.ChannelID, frameBytes)
						ctrl.hub.Broadcast("__live__", frameBytes)
					}
				}
			}
		}
	}

	_ = conn.Close()
	ctrl.hub.Unregister(client)
	<-doneWriter
}

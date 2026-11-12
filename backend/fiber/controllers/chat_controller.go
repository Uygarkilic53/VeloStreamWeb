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

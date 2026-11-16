package controllers

import (
	"context"
	"encoding/json"
	"net/url"
	"strings"
	"time"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/google/uuid"
	"github.com/velostream/fiber/middlewares"
	"github.com/velostream/fiber/models"
	"github.com/velostream/fiber/services"
)

type ChatController struct {
	hub       *services.HubService
	chatModel *models.ChatModel
}

func NewChatController(hub *services.HubService, chatModel *models.ChatModel) *ChatController {
	return &ChatController{
		hub:       hub,
		chatModel: chatModel,
	}
}

// GetMessages handles GET /api/chat/:channelId/messages
func (ctrl *ChatController) GetMessages(c *fiber.Ctx) error {
	raw := strings.TrimSpace(c.Params("channelId"))
	if unescaped, err := url.PathUnescape(raw); err == nil && unescaped != "" {
		raw = unescaped
	}
	channelID := strings.TrimPrefix(strings.TrimSpace(raw), "@")
	limit := c.QueryInt("limit", 50)
	if limit < 1 || limit > 100 {
		limit = 50
	}

	if ctrl.chatModel == nil {
		return c.JSON(fiber.Map{
			"messages": []models.ChatMessage{},
		})
	}

	messages, err := ctrl.chatModel.GetRecentMessages(c.Context(), channelID, limit)
	if err != nil {
		return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
			"error":   "DATABASE_ERROR",
			"message": "Unable to fetch channel messages.",
		})
	}

	if messages == nil {
		messages = []models.ChatMessage{}
	}

	return c.JSON(fiber.Map{
		"messages": messages,
	})
}

func parseDuration(duration string) *time.Time {
	now := time.Now().UTC()
	switch duration {
	case "1h":
		t := now.Add(1 * time.Hour)
		return &t
	case "5h":
		t := now.Add(5 * time.Hour)
		return &t
	case "1d":
		t := now.Add(24 * time.Hour)
		return &t
	case "1w":
		t := now.Add(7 * 24 * time.Hour)
		return &t
	case "1m":
		t := now.Add(30 * 24 * time.Hour)
		return &t
	case "permanent":
		return nil
	default:
		t := now.Add(1 * time.Hour)
		return &t
	}
}

func (ctrl *ChatController) HandleSocket(conn *websocket.Conn) {
	if ctrl.hub == nil {
		_ = conn.Close()
		return
	}

	conn.SetReadLimit(4 * 1024 * 1024)

	rawChannelID := strings.TrimSpace(conn.Params("channelId"))
	if unescaped, err := url.PathUnescape(rawChannelID); err == nil && unescaped != "" {
		rawChannelID = unescaped
	}
	rawChannelID = strings.TrimPrefix(strings.TrimSpace(rawChannelID), "@")
	claims, _ := conn.Locals(middlewares.ClaimsLocalKey).(models.AuthClaims)

	connectCtx, cancelConnect := context.WithTimeout(context.Background(), 5*time.Second)
	defer cancelConnect()

	var chID, chSlug string
	if ctrl.chatModel != nil {
		chID, chSlug, _, _ = ctrl.chatModel.ResolveChannel(connectCtx, rawChannelID)
	}
	if chID == "" {
		chID = rawChannelID
	}
	if chSlug == "" {
		chSlug = rawChannelID
	}

	canonicalRoomID := strings.ToLower(chSlug)
	if canonicalRoomID == "" {
		canonicalRoomID = strings.ToLower(rawChannelID)
	}
	if canonicalRoomID == "" {
		canonicalRoomID = "general"
	}

	client := services.NewClient(canonicalRoomID, claims.UserID, claims.Username)
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

	// On connect: check if banned
	var isBanned bool
	var banReason string
	if ctrl.chatModel != nil {
		isBanned, banReason, _ = ctrl.chatModel.IsUserBanned(connectCtx, chID, claims.UserID)
		if !isBanned && chSlug != "" && chSlug != chID {
			isBanned, banReason, _ = ctrl.chatModel.IsUserBanned(connectCtx, chSlug, claims.UserID)
		}
		if !isBanned && claims.Username != "" {
			isBanned, banReason, _ = ctrl.chatModel.IsUserBanned(connectCtx, chID, claims.Username)
			if !isBanned && chSlug != "" && chSlug != chID {
				isBanned, banReason, _ = ctrl.chatModel.IsUserBanned(connectCtx, chSlug, claims.Username)
			}
		}
	}
	if isBanned {
		banFrame, _ := json.Marshal(models.WsFrame{
			Type: models.FrameTypeModerationBanned,
			Payload: map[string]string{
				"channelId":   canonicalRoomID,
				"channelSlug": chSlug,
				"userId":      claims.UserID,
				"username":    claims.Username,
				"reason":      banReason,
			},
		})
		select {
		case client.Send <- banFrame:
		default:
		}
		_ = conn.Close()
		ctrl.hub.Unregister(client)
		<-doneWriter
		return
	}

	// On connect: check if muted
	var isMuted bool
	var expiresAt *time.Time
	var muteReason string
	if ctrl.chatModel != nil {
		isMuted, expiresAt, muteReason, _ = ctrl.chatModel.IsUserMuted(connectCtx, chID, claims.UserID)
		if !isMuted && chSlug != "" && chSlug != chID {
			isMuted, expiresAt, muteReason, _ = ctrl.chatModel.IsUserMuted(connectCtx, chSlug, claims.UserID)
		}
		if !isMuted && claims.Username != "" {
			isMuted, expiresAt, muteReason, _ = ctrl.chatModel.IsUserMuted(connectCtx, chID, claims.Username)
			if !isMuted && chSlug != "" && chSlug != chID {
				isMuted, expiresAt, muteReason, _ = ctrl.chatModel.IsUserMuted(connectCtx, chSlug, claims.Username)
			}
		}
	}
	if isMuted {
		var expStr *string
		if expiresAt != nil {
			s := expiresAt.UTC().Format(time.RFC3339)
			expStr = &s
		}

		// Requirement 1: Send moderation.silenced frame on connect so silence immediately re-applies on refresh
		silenceFrame, _ := json.Marshal(models.WsFrame{
			Type: models.FrameTypeModerationSilenced,
			Payload: models.ModerationSilencePayload{
				ChannelID: canonicalRoomID,
				UserID:    claims.UserID,
				Username:  claims.Username,
				ExpiresAt: expStr,
				Reason:    muteReason,
			},
		})
		select {
		case client.Send <- silenceFrame:
		default:
		}
	}

	// On connect: send current room freeze status if frozen
	if ctrl.hub != nil && ctrl.hub.IsRoomFrozen(canonicalRoomID) {
		freezeInitFrame, _ := json.Marshal(models.WsFrame{
			Type: models.FrameTypeChatFreeze,
			Payload: models.ChatFreezePayload{
				ChannelID: canonicalRoomID,
				IsFrozen:  true,
				FrozenBy:  "",
			},
		})
		select {
		case client.Send <- freezeInitFrame:
		default:
		}
	}

	// On connect: send current room slow mode status if enabled
	isSlow := false
	if ctrl.hub != nil && (ctrl.hub.IsRoomSlowMode(canonicalRoomID) || (chID != "" && ctrl.hub.IsRoomSlowMode(strings.ToLower(chID)))) {
		isSlow = true
	} else if ctrl.chatModel != nil {
		if dbSlow, err := ctrl.chatModel.GetChannelSlowMode(connectCtx, chID); err == nil && dbSlow {
			isSlow = true
			if ctrl.hub != nil {
				ctrl.hub.SetRoomSlowMode(canonicalRoomID, true, 3)
				if chID != "" && strings.ToLower(chID) != canonicalRoomID {
					ctrl.hub.SetRoomSlowMode(strings.ToLower(chID), true, 3)
				}
			}
		}
	}
	if isSlow {
		cooldown := 3
		if ctrl.hub != nil {
			cooldown = ctrl.hub.GetRoomSlowModeCooldown(canonicalRoomID)
		}
		slowInitFrame, _ := json.Marshal(models.WsFrame{
			Type: models.FrameTypeChatSlowMode,
			Payload: models.ChatSlowModePayload{
				ChannelID:       canonicalRoomID,
				Enabled:         true,
				CooldownSeconds: cooldown,
				Initial:         true,
			},
		})
		select {
		case client.Send <- slowInitFrame:
		default:
		}
	}

	// On connect: send current user channel role
	userRole := "User"
	if ctrl.chatModel != nil {
		userRole, _ = ctrl.chatModel.GetUserRole(connectCtx, chID, claims.UserID)
	}
	roleInitFrame, _ := json.Marshal(models.WsFrame{
		Type: models.FrameTypeModerationRoleUpdated,
		Payload: models.ModerationRolePayload{
			ChannelID: canonicalRoomID,
			UserID:    claims.UserID,
			Username:  claims.Username,
			NewRole:   userRole,
		},
	})
	select {
	case client.Send <- roleInitFrame:
	default:
	}

	// On connect: send recent message history (always sends empty array if none)
	var history []models.ChatMessage
	if ctrl.chatModel != nil {
		if h, err := ctrl.chatModel.GetRecentMessages(connectCtx, chID, 50); err == nil {
			history = h
		}
	}
	if history == nil {
		history = []models.ChatMessage{}
	}
	histFrame, _ := json.Marshal(models.WsFrame{
		Type:    models.FrameTypeChatHistory,
		Payload: history,
	})
	select {
	case client.Send <- histFrame:
	default:
	}

	ctx := context.Background()
	for {
		_, raw, err := conn.ReadMessage()
		if err != nil {
			break
		}

		var genericFrame struct {
			Type    string          `json:"type"`
			Payload json.RawMessage `json:"payload"`
			// Fallback for legacy simple { "content": "..." }
			Content     string  `json:"content"`
			MessageType string  `json:"messageType"`
			GifURL      *string `json:"gifUrl"`
		}

		if unmarshalErr := json.Unmarshal(raw, &genericFrame); unmarshalErr != nil {
			continue
		}

		// Handle explicit frame types or fallback
		frameType := genericFrame.Type
		if frameType == "" && genericFrame.Content != "" {
			frameType = models.FrameTypeChatMessage
		}

		switch frameType {
		case models.FrameTypeChatMessage:
			var msgPayload struct {
				Content     string  `json:"content"`
				MessageType string  `json:"messageType"`
				GifURL      *string `json:"gifUrl"`
			}
			if len(genericFrame.Payload) > 0 {
				_ = json.Unmarshal(genericFrame.Payload, &msgPayload)
			}
			if msgPayload.Content == "" && genericFrame.Content != "" {
				msgPayload.Content = genericFrame.Content
				msgPayload.MessageType = genericFrame.MessageType
				msgPayload.GifURL = genericFrame.GifURL
			}

			content := strings.TrimSpace(msgPayload.Content)
			msgType := msgPayload.MessageType
			if msgType == "" {
				if msgPayload.GifURL != nil && *msgPayload.GifURL != "" {
					msgType = "gif"
				} else {
					msgType = "text"
				}
			}

			if content == "" && msgType != "gif" {
				continue
			}

			// Determine actor role
			role := "User"
			if ctrl.chatModel != nil {
				role, _ = ctrl.chatModel.GetUserRole(ctx, chID, claims.UserID)
			}
			cleanUser := strings.TrimPrefix(strings.TrimSpace(claims.Username), "@")
			cleanChannel := strings.TrimPrefix(strings.TrimSpace(chSlug), "@")
			if role != "Creator" && (strings.EqualFold(cleanUser, cleanChannel) || strings.EqualFold(claims.Role, "Creator")) {
				role = "Creator"
			}

			// Reject non-creators if chat is frozen
			if ctrl.hub != nil && ctrl.hub.IsRoomFrozen(canonicalRoomID) && role != "Creator" {
				errFrame, _ := json.Marshal(models.WsFrame{
					Type: models.FrameTypeChatError,
					Payload: models.ChatErrorPayload{
						Code:    "CHAT_FROZEN",
						Message: "Chat is paused by the creator.",
					},
				})
				select {
				case client.Send <- errFrame:
				default:
				}
				continue
			}

			// Check mute before sending
			var userMuted bool
			var muteExp *time.Time
			var mReason string
			if ctrl.chatModel != nil {
				userMuted, muteExp, mReason, _ = ctrl.chatModel.IsUserMuted(ctx, chID, claims.UserID)
				if !userMuted && chSlug != "" && chSlug != chID {
					userMuted, muteExp, mReason, _ = ctrl.chatModel.IsUserMuted(ctx, chSlug, claims.UserID)
				}
				if !userMuted && claims.Username != "" {
					userMuted, muteExp, mReason, _ = ctrl.chatModel.IsUserMuted(ctx, chID, claims.Username)
					if !userMuted && chSlug != "" && chSlug != chID {
						userMuted, muteExp, mReason, _ = ctrl.chatModel.IsUserMuted(ctx, chSlug, claims.Username)
					}
				}
			}
			if userMuted {
				var expStr *string
				if muteExp != nil {
					s := muteExp.UTC().Format(time.RFC3339)
					expStr = &s
				}
				reasonMsg := "You are silenced in this channel."
				if mReason != "" {
					reasonMsg = "You are silenced in this channel: " + mReason
				}
				errFrame, _ := json.Marshal(models.WsFrame{
					Type: models.FrameTypeChatError,
					Payload: models.ChatErrorPayload{
						Code:      "SILENCED",
						Message:   reasonMsg,
						ExpiresAt: expStr,
					},
				})
				select {
				case client.Send <- errFrame:
				default:
				}
				continue
			}

			// Reject non-creators if slow mode is active and cooldown has not expired
			if ctrl.hub != nil && ctrl.hub.IsRoomSlowMode(canonicalRoomID) && role != "Creator" {
				cooldownSec := ctrl.hub.GetRoomSlowModeCooldown(canonicalRoomID)
				cooldownDur := time.Duration(cooldownSec) * time.Second
				userKey := claims.UserID
				if userKey == "" {
					userKey = claims.Username
				}
				if !ctrl.hub.CheckAndRecordUserMessage(canonicalRoomID, userKey, cooldownDur) {
					errFrame, _ := json.Marshal(models.WsFrame{
						Type: models.FrameTypeChatError,
						Payload: models.ChatErrorPayload{
							Code:    "SLOW_MODE",
							Message: "Slow mode is enabled. Wait 3s between messages.",
						},
					})
					select {
					case client.Send <- errFrame:
					default:
					}
					continue
				}
			}

			now := time.Now().UTC()

			chatMsg := models.ChatMessage{
				ID:          "msg_" + uuid.NewString(),
				ChannelID:   chID,
				UserID:      claims.UserID,
				Username:    claims.Username,
				Role:        role,
				Content:     content,
				MessageType: msgType,
				GifURL:      msgPayload.GifURL,
				IsDeleted:   false,
				CreatedAt:   now.Format(time.RFC3339),
			}

			if ctrl.chatModel != nil {
				_ = ctrl.chatModel.SaveMessage(ctx, &chatMsg)
			}

			frameBytes, marshalErr := json.Marshal(models.WsFrame{
				Type:    models.FrameTypeChatMessage,
				Payload: chatMsg,
			})
			if marshalErr == nil {
				ctrl.hub.Broadcast(canonicalRoomID, frameBytes)
			}

		case models.FrameTypeChatDeleteMessage:
			var delPayload models.ChatDeleteMessagePayload
			if err := json.Unmarshal(genericFrame.Payload, &delPayload); err != nil || delPayload.MessageID == "" {
				continue
			}

			var msgChanID, authorID, authorRole string
			var isDeleted bool
			if ctrl.chatModel != nil {
				var err error
				msgChanID, authorID, authorRole, isDeleted, err = ctrl.chatModel.GetMessageAuthorAndRole(ctx, delPayload.MessageID)
				if err != nil || isDeleted {
					continue
				}
			}

			actorRole := "User"
			if ctrl.chatModel != nil {
				actorRole, _ = ctrl.chatModel.GetUserRole(ctx, chID, claims.UserID)
			}

			// Permission check:
			// 1. Own message: allowed
			// 2. Creator: can delete anyone's message
			// 3. Moderator: can delete User's message (cannot delete creator or peer moderator)
			canDelete := false
			if claims.UserID == authorID {
				canDelete = true
			} else if actorRole == "Creator" {
				canDelete = true
			} else if actorRole == "Moderator" && authorRole == "User" {
				canDelete = true
			}

			if !canDelete {
				errFrame, _ := json.Marshal(models.WsFrame{
					Type: models.FrameTypeChatError,
					Payload: models.ChatErrorPayload{
						Code:    "FORBIDDEN",
						Message: "You do not have permission to delete this message.",
					},
				})
				select {
				case client.Send <- errFrame:
				default:
				}
				continue
			}

			if ctrl.chatModel != nil {
				_, _ = ctrl.chatModel.DeleteMessage(ctx, delPayload.MessageID, claims.Username)
			}

			delFrame, marshalErr := json.Marshal(models.WsFrame{
				Type: models.FrameTypeChatMessageDeleted,
				Payload: models.ChatMessageDeletedPayload{
					MessageID: delPayload.MessageID,
					ChannelID: msgChanID,
					DeletedBy: claims.Username,
				},
			})
			if marshalErr == nil {
				ctrl.hub.Broadcast(canonicalRoomID, delFrame)
			}

		case models.FrameTypeChatFreeze:
			var freezePayload struct {
				ChannelID string `json:"channelId"`
				IsFrozen  bool   `json:"isFrozen"`
			}
			if len(genericFrame.Payload) > 0 {
				_ = json.Unmarshal(genericFrame.Payload, &freezePayload)
			}

			actorRole := "User"
			if ctrl.chatModel != nil {
				actorRole, _ = ctrl.chatModel.GetUserRole(ctx, chID, claims.UserID)
			}
			cleanUser := strings.TrimPrefix(strings.TrimSpace(claims.Username), "@")
			cleanChannel := strings.TrimPrefix(strings.TrimSpace(chSlug), "@")
			if actorRole != "Creator" && (strings.EqualFold(cleanUser, cleanChannel) || strings.EqualFold(claims.Role, "Creator")) {
				actorRole = "Creator"
			}

			// Only creator can freeze/unfreeze chat
			if actorRole != "Creator" {
				errFrame, _ := json.Marshal(models.WsFrame{
					Type: models.FrameTypeChatError,
					Payload: models.ChatErrorPayload{
						Code:    "FORBIDDEN",
						Message: "Only channel creators can freeze or unfreeze chat.",
					},
				})
				select {
				case client.Send <- errFrame:
				default:
				}
				continue
			}

			if ctrl.hub != nil {
				ctrl.hub.SetRoomFrozen(canonicalRoomID, freezePayload.IsFrozen)
				freezeBroadcast, marshalErr := json.Marshal(models.WsFrame{
					Type: models.FrameTypeChatFreeze,
					Payload: models.ChatFreezePayload{
						ChannelID: canonicalRoomID,
						IsFrozen:  freezePayload.IsFrozen,
						FrozenBy:  claims.Username,
					},
				})
				if marshalErr == nil {
					ctrl.hub.Broadcast(canonicalRoomID, freezeBroadcast)
					if canonicalRoomID != strings.ToLower(chSlug) {
						ctrl.hub.Broadcast(strings.ToLower(chSlug), freezeBroadcast)
					}
				}
			}

		case models.FrameTypeChatSlowMode:
			var slowPayload models.ChatSlowModePayload
			if err := json.Unmarshal(genericFrame.Payload, &slowPayload); err != nil {
				continue
			}

			actorRole := "User"
			if ctrl.chatModel != nil {
				actorRole, _ = ctrl.chatModel.GetUserRole(ctx, chID, claims.UserID)
			}
			cleanUser := strings.TrimPrefix(strings.TrimSpace(claims.Username), "@")
			cleanChannel := strings.TrimPrefix(strings.TrimSpace(chSlug), "@")
			if actorRole != "Creator" && (strings.EqualFold(cleanUser, cleanChannel) || strings.EqualFold(claims.Role, "Creator")) {
				actorRole = "Creator"
			}

			// Only creator can enable/disable slow mode
			if actorRole != "Creator" {
				errFrame, _ := json.Marshal(models.WsFrame{
					Type: models.FrameTypeChatError,
					Payload: models.ChatErrorPayload{
						Code:    "FORBIDDEN",
						Message: "Only channel creators can toggle slow mode.",
					},
				})
				select {
				case client.Send <- errFrame:
				default:
				}
				continue
			}

			cooldown := slowPayload.CooldownSeconds
			if cooldown <= 0 {
				cooldown = 3
			}

			if ctrl.hub != nil {
				ctrl.hub.SetRoomSlowMode(canonicalRoomID, slowPayload.Enabled, cooldown)
				if chID != "" && strings.ToLower(chID) != canonicalRoomID {
					ctrl.hub.SetRoomSlowMode(strings.ToLower(chID), slowPayload.Enabled, cooldown)
				}
			}
			if ctrl.chatModel != nil {
				_ = ctrl.chatModel.UpdateChannelSlowMode(ctx, chID, slowPayload.Enabled)
			}

			slowBroadcast, marshalErr := json.Marshal(models.WsFrame{
				Type: models.FrameTypeChatSlowMode,
				Payload: models.ChatSlowModePayload{
					ChannelID:       canonicalRoomID,
					Enabled:         slowPayload.Enabled,
					CooldownSeconds: cooldown,
				},
			})
			if marshalErr == nil && ctrl.hub != nil {
				ctrl.hub.Broadcast(canonicalRoomID, slowBroadcast)
				if canonicalRoomID != strings.ToLower(chSlug) {
					ctrl.hub.Broadcast(strings.ToLower(chSlug), slowBroadcast)
				}
			}

		case models.FrameTypeModerationAction:
			var actPayload models.ModerationActionPayload
			if err := json.Unmarshal(genericFrame.Payload, &actPayload); err != nil {
				continue
			}

			actorRole := "User"
			if ctrl.chatModel != nil {
				actorRole, _ = ctrl.chatModel.GetUserRole(ctx, chID, claims.UserID)
			}
			cleanUser := strings.ToLower(strings.TrimPrefix(claims.Username, "@"))
			cleanChannel := strings.ToLower(strings.TrimPrefix(chSlug, "@"))
			if actorRole != "Creator" && (strings.EqualFold(cleanUser, cleanChannel) || strings.EqualFold(claims.Role, "Creator")) {
				actorRole = "Creator"
			}
			if actorRole != "Creator" && actorRole != "Moderator" {
				errFrame, _ := json.Marshal(models.WsFrame{
					Type: models.FrameTypeChatError,
					Payload: models.ChatErrorPayload{
						Code:    "FORBIDDEN",
						Message: "You do not have moderation privileges in this channel.",
					},
				})
				select {
				case client.Send <- errFrame:
				default:
				}
				continue
			}

			targetUserID := strings.TrimSpace(actPayload.TargetUserID)
			targetUsername := strings.TrimSpace(strings.TrimPrefix(actPayload.TargetUsername, "@"))
			if ctrl.chatModel != nil {
				if targetUsername != "" {
					uID, cleanU, _, err := ctrl.chatModel.FindUserByUsername(ctx, targetUsername)
					if err == nil && uID != "" {
						targetUserID = uID
						targetUsername = cleanU
					}
				}
				if targetUserID != "" && targetUsername == "" {
					uID, cleanU, err := ctrl.chatModel.ResolveUser(ctx, targetUserID)
					if err == nil && uID != "" {
						targetUserID = uID
						targetUsername = cleanU
					}
				}
			}

			if targetUserID == "" && targetUsername == "" {
				continue
			}

			// Self moderation forbidden
			if targetUserID == claims.UserID {
				errFrame, _ := json.Marshal(models.WsFrame{
					Type: models.FrameTypeChatError,
					Payload: models.ChatErrorPayload{
						Code:    "FORBIDDEN",
						Message: "You cannot perform moderation actions on yourself.",
					},
				})
				select {
				case client.Send <- errFrame:
				default:
				}
				continue
			}

			targetRole := "User"
			if ctrl.chatModel != nil {
				targetRole, _ = ctrl.chatModel.GetUserRole(ctx, chID, targetUserID)
			}

			// Moderator hierarchy guards
			if actorRole == "Moderator" {
				if targetRole == "Creator" || targetRole == "Moderator" {
					errFrame, _ := json.Marshal(models.WsFrame{
						Type: models.FrameTypeChatError,
						Payload: models.ChatErrorPayload{
							Code:    "FORBIDDEN",
							Message: "Moderators cannot moderate channel creators or peer moderators.",
						},
					})
					select {
					case client.Send <- errFrame:
					default:
					}
					continue
				}
			}

			reason := "Moderation action"
			if actPayload.Reason != nil && strings.TrimSpace(*actPayload.Reason) != "" {
				reason = strings.TrimSpace(*actPayload.Reason)
			}

			switch actPayload.Action {
			case "warn":
				if ctrl.chatModel != nil {
					_ = ctrl.chatModel.CreateWarning(ctx, chID, targetUserID, claims.UserID, reason)
				}
				warnFrame, _ := json.Marshal(models.WsFrame{
					Type: models.FrameTypeModerationWarning,
					Payload: models.ModerationWarningPayload{
						ChannelID:         canonicalRoomID,
						ChannelSlug:       chSlug,
						ModeratorUsername: claims.Username,
						Reason:            reason,
						WarnedAt:          time.Now().UTC().Format(time.RFC3339),
					},
				})
				ctrl.hub.SendToUser(canonicalRoomID, targetUserID, warnFrame)

			case "silence":
				dur := "1h"
				if actPayload.Duration != nil && *actPayload.Duration != "" {
					dur = *actPayload.Duration
				}
				expiresAt := parseDuration(dur)
				if ctrl.chatModel != nil {
					_ = ctrl.chatModel.MuteUser(ctx, chID, targetUserID, claims.UserID, reason, expiresAt)
				}

				var expStr *string
				if expiresAt != nil {
					s := expiresAt.UTC().Format(time.RFC3339)
					expStr = &s
				}
				silenceFrame, _ := json.Marshal(models.WsFrame{
					Type: models.FrameTypeModerationSilenced,
					Payload: models.ModerationSilencePayload{
						ChannelID: canonicalRoomID,
						UserID:    targetUserID,
						Username:  targetUsername,
						ExpiresAt: expStr,
						Reason:    reason,
					},
				})
				ctrl.hub.Broadcast(canonicalRoomID, silenceFrame)

			case "unsilence":
				if ctrl.chatModel != nil {
					_ = ctrl.chatModel.UnmuteUser(ctx, chID, targetUserID)
				}
				unsilenceFrame, _ := json.Marshal(models.WsFrame{
					Type: models.FrameTypeModerationUnsilenced,
					Payload: models.ModerationUnsilencePayload{
						ChannelID: canonicalRoomID,
						UserID:    targetUserID,
						Username:  targetUsername,
					},
				})
				ctrl.hub.Broadcast(canonicalRoomID, unsilenceFrame)

			case "ban":
				if ctrl.chatModel != nil {
					_ = ctrl.chatModel.BanUser(ctx, chID, targetUserID, claims.UserID, reason)
				}
				ctrl.hub.EvictUser(canonicalRoomID, targetUserID, reason)
				banLiveFrame, _ := json.Marshal(models.WsFrame{
					Type: models.FrameTypeModerationBanned,
					Payload: map[string]string{
						"channelId":   canonicalRoomID,
						"channelSlug": chSlug,
						"userId":      targetUserID,
						"username":    targetUsername,
						"reason":      reason,
					},
				})
				ctrl.hub.Broadcast("__live__", banLiveFrame)

			case "unban":
				if ctrl.chatModel != nil {
					_ = ctrl.chatModel.UnbanUser(ctx, chID, targetUserID)
				}
				unbanFrame, _ := json.Marshal(models.WsFrame{
					Type: models.FrameTypeModerationUnbanned,
					Payload: models.ModerationUnbanPayload{
						ChannelID:   canonicalRoomID,
						ChannelSlug: chSlug,
						UserID:      targetUserID,
						Username:    targetUsername,
					},
				})
				ctrl.hub.Broadcast(canonicalRoomID, unbanFrame)
				ctrl.hub.Broadcast("__live__", unbanFrame)

			case "add_mod":
				if actorRole != "Creator" {
					errFrame, _ := json.Marshal(models.WsFrame{
						Type: models.FrameTypeChatError,
						Payload: models.ChatErrorPayload{
							Code:    "FORBIDDEN",
							Message: "Only the channel creator can assign moderators.",
						},
					})
					select {
					case client.Send <- errFrame:
					default:
					}
					continue
				}
				if ctrl.chatModel != nil && targetUserID != "" {
					_ = ctrl.chatModel.AddModerator(ctx, chID, targetUserID, claims.UserID)
				}
				roleFrame, _ := json.Marshal(models.WsFrame{
					Type: models.FrameTypeModerationRoleUpdated,
					Payload: models.ModerationRolePayload{
						ChannelID: canonicalRoomID,
						UserID:    targetUserID,
						Username:  targetUsername,
						NewRole:   "Moderator",
					},
				})
				ctrl.hub.Broadcast(canonicalRoomID, roleFrame)

			case "remove_mod":
				if actorRole != "Creator" {
					errFrame, _ := json.Marshal(models.WsFrame{
						Type: models.FrameTypeChatError,
						Payload: models.ChatErrorPayload{
							Code:    "FORBIDDEN",
							Message: "Only the channel creator can dismiss moderators.",
						},
					})
					select {
					case client.Send <- errFrame:
					default:
					}
					continue
				}
				if ctrl.chatModel != nil && targetUserID != "" {
					_ = ctrl.chatModel.RemoveModerator(ctx, chID, targetUserID)
				}
				roleFrame, _ := json.Marshal(models.WsFrame{
					Type: models.FrameTypeModerationRoleUpdated,
					Payload: models.ModerationRolePayload{
						ChannelID: canonicalRoomID,
						UserID:    targetUserID,
						Username:  targetUsername,
						NewRole:   "User",
					},
				})
				ctrl.hub.Broadcast(canonicalRoomID, roleFrame)
			}
		}
	}

	_ = conn.Close()
	ctrl.hub.Unregister(client)
	<-doneWriter
}

// HandleLiveSocket serves a lightweight real-time subscription for live stream status changes without requiring user authentication.
func (ctrl *ChatController) HandleLiveSocket(conn *websocket.Conn) {
	if ctrl.hub == nil {
		_ = conn.Close()
		return
	}

	conn.SetReadLimit(4 * 1024 * 1024)

	client := services.NewClient("__live__", "viewer", "viewer")
	ctrl.hub.Register(client)

	for _, snapBytes := range ctrl.hub.GetAllSnapshots() {
		if len(snapBytes) > 0 {
			select {
			case client.Send <- snapBytes:
			default:
			}
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

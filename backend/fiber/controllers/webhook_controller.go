package controllers

import (
	"crypto/subtle"
	"encoding/json"
	"errors"
	"log"
	"net/url"
	"strings"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/velostream/fiber/models"
	"github.com/velostream/fiber/services"
)

const WebhookSecretHeader = "X-VeloStream-Webhook-Secret"

type WebhookController struct {
	secret     string
	hub        *services.HubService
	streamRepo models.StreamRepository
}

func NewWebhookController(secret string, hub *services.HubService, streamRepo models.StreamRepository) *WebhookController {
	return &WebhookController{
		secret:     secret,
		hub:        hub,
		streamRepo: streamRepo,
	}
}

func (ctrl *WebhookController) MediaMTXAuth(c *fiber.Ctx) error {
	var payload models.MediaMTXAuthPayload
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "INVALID_PAYLOAD",
		})
	}
	if payload.Path == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "MISSING_PATH",
		})
	}

	// Bypass authentication for public playback, read, or metrics requests.
	if payload.Action == "read" || payload.Action == "playback" || payload.Action == "metrics" || payload.Action == "api" {
		return c.SendStatus(fiber.StatusOK)
	}

	cleanPath := strings.Trim(strings.TrimPrefix(payload.Path, "/"), "/")
	parts := strings.Split(cleanPath, "/")
	channelSlug := parts[0]
	if channelSlug == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "MISSING_PATH",
		})
	}

	// Resolve the stream key from password, token, jwt, user, RTMP subpath, query params, or headers.
	streamKey := strings.TrimSpace(payload.Password)
	if streamKey == "" {
		streamKey = strings.TrimSpace(payload.Token)
	}
	if streamKey == "" {
		streamKey = strings.TrimSpace(payload.JWT)
	}
	if streamKey == "" {
		streamKey = strings.TrimSpace(payload.User)
	}
	if streamKey == "" && len(parts) > 1 {
		streamKey = strings.TrimSpace(parts[1])
	}
	if streamKey == "" && payload.Query != "" {
		queryStr := strings.TrimPrefix(payload.Query, "?")
		if vals, err := url.ParseQuery(queryStr); err == nil {
			for _, key := range []string{"jwt", "key", "streamKey", "token", "pass", "password", "auth", "secret"} {
				if v := strings.TrimSpace(vals.Get(key)); v != "" {
					streamKey = v
					break
				}
			}
		}
	}
	if streamKey == "" {
		authHdr := strings.TrimSpace(c.Get("Authorization"))
		if strings.HasPrefix(strings.ToLower(authHdr), "bearer ") {
			streamKey = strings.TrimSpace(authHdr[7:])
		}
	}
	if streamKey == "" {
		if v := strings.TrimSpace(c.Get("X-Stream-Key")); v != "" {
			streamKey = v
		} else if v := strings.TrimSpace(c.Get("X-Token")); v != "" {
			streamKey = v
		}
	}

	if streamKey == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "MISSING_STREAM_CREDENTIALS",
		})
	}

	if ctrl.streamRepo != nil {
		valid, err := ctrl.streamRepo.ValidateStreamKey(c.UserContext(), channelSlug, streamKey)
		if err != nil {
			log.Printf("[MediaMTXAuth] database error validating stream key for slug %q: %v", channelSlug, err)
			return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
				"error": "DATABASE_ERROR",
			})
		}
		if !valid {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "INVALID_STREAM_CREDENTIALS",
			})
		}
	}

	return c.SendStatus(fiber.StatusOK)
}

func (ctrl *WebhookController) MediaMTXEvent(c *fiber.Ctx) error {
	provided := c.Get(WebhookSecretHeader)
	if ctrl.secret == "" || subtle.ConstantTimeCompare([]byte(provided), []byte(ctrl.secret)) != 1 {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "UNAUTHORIZED_WEBHOOK",
		})
	}

	var payload models.MediaMTXEventPayload
	if err := c.BodyParser(&payload); err != nil {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "INVALID_EVENT_PAYLOAD",
		})
	}
	if payload.Path == "" || (payload.Event != "stream.ready" && payload.Event != "stream.not_ready") {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "UNSUPPORTED_EVENT",
		})
	}

	cleanPath := strings.Trim(strings.TrimPrefix(payload.Path, "/"), "/")
	parts := strings.Split(cleanPath, "/")
	channelSlug := parts[0]
	if channelSlug == "" {
		return c.Status(fiber.StatusBadRequest).JSON(fiber.Map{
			"error": "UNSUPPORTED_EVENT",
		})
	}

	status := "offline"
	if payload.Event == "stream.ready" {
		status = "live"
		if ctrl.streamRepo != nil {
			channelID, err := ctrl.streamRepo.SetChannelLive(c.UserContext(), channelSlug, true)
			if err != nil {
				if errors.Is(err, models.ErrChannelNotFound) {
					log.Printf("[MediaMTXEvent] channel %q not found setting live: %v", channelSlug, err)
					return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
						"error": "CHANNEL_NOT_FOUND",
					})
				}
				log.Printf("[MediaMTXEvent] database error setting channel %q live: %v", channelSlug, err)
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error": "DATABASE_ERROR",
				})
			}
			if _, err := ctrl.streamRepo.CreateStreamSession(c.UserContext(), channelID); err != nil {
				log.Printf("[MediaMTXEvent] database error creating stream session for channel %q (%s): %v", channelSlug, channelID, err)
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error": "DATABASE_ERROR",
				})
			}
		}
	} else {
		// stream.not_ready
		if ctrl.streamRepo != nil {
			channelID, err := ctrl.streamRepo.SetChannelLive(c.UserContext(), channelSlug, false)
			if err != nil {
				if errors.Is(err, models.ErrChannelNotFound) {
					log.Printf("[MediaMTXEvent] channel %q not found setting offline: %v", channelSlug, err)
					return c.Status(fiber.StatusNotFound).JSON(fiber.Map{
						"error": "CHANNEL_NOT_FOUND",
					})
				}
				log.Printf("[MediaMTXEvent] database error setting channel %q offline: %v", channelSlug, err)
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error": "DATABASE_ERROR",
				})
			}
			if err := ctrl.streamRepo.EndStreamSession(c.UserContext(), channelID); err != nil {
				log.Printf("[MediaMTXEvent] database error ending stream session for channel %q (%s): %v", channelSlug, channelID, err)
				return c.Status(fiber.StatusInternalServerError).JSON(fiber.Map{
					"error": "DATABASE_ERROR",
				})
			}
		}
	}

	if ctrl.hub != nil {
		if status == "offline" {
			ctrl.hub.DeleteSnapshot(channelSlug)
		}
		frameBytes, err := json.Marshal(models.WsFrame{
			Type: models.FrameTypeStreamStatus,
			Payload: models.StreamStatusEvent{
				ChannelID: channelSlug,
				Status:    status,
				UpdatedAt: time.Now().UTC().Format(time.RFC3339),
			},
		})
		if err == nil {
			ctrl.hub.Broadcast(channelSlug, frameBytes)
			ctrl.hub.Broadcast("__live__", frameBytes)
		}
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"accepted": true,
		"path":     channelSlug,
		"status":   status,
	})
}

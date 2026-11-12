package controllers

import (
	"crypto/subtle"
	"encoding/json"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/velostream/fiber/models"
	"github.com/velostream/fiber/services"
)

const WebhookSecretHeader = "X-VeloStream-Webhook-Secret"

type WebhookController struct {
	secret string
	hub    *services.HubService
}

func NewWebhookController(secret string, hub *services.HubService) *WebhookController {
	return &WebhookController{
		secret: secret,
		hub:    hub,
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
	if payload.Action == "read" || payload.Action == "playback" {
		return c.SendStatus(fiber.StatusOK)
	}
	if payload.Action == "publish" && payload.Password == "" && payload.User == "" {
		return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
			"error": "MISSING_STREAM_CREDENTIALS",
		})
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

	status := "offline"
	if payload.Event == "stream.ready" {
		status = "live"
	}

	if ctrl.hub != nil {
		frameBytes, err := json.Marshal(models.WsFrame{
			Type: models.FrameTypeStreamStatus,
			Payload: models.StreamStatusEvent{
				ChannelID: payload.Path,
				StreamKey: payload.Path,
				Status:    status,
				UpdatedAt: time.Now().UTC().Format(time.RFC3339),
			},
		})
		if err == nil {
			ctrl.hub.Broadcast(payload.Path, frameBytes)
		}
	}

	return c.Status(fiber.StatusOK).JSON(fiber.Map{
		"accepted": true,
		"path":     payload.Path,
		"status":   status,
	})
}

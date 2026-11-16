package routes

import (
	"github.com/gofiber/fiber/v2"
	"github.com/velostream/fiber/controllers"
	"github.com/velostream/fiber/models"
	"github.com/velostream/fiber/services"
)

func RegisterWebhookRoutes(app *fiber.App, secret string, hub *services.HubService, streamRepo models.StreamRepository, chatModel ...*models.ChatModel) {
	ctrl := controllers.NewWebhookController(secret, hub, streamRepo, chatModel...)
	webhooks := app.Group("/webhooks/mediamtx")
	webhooks.Post("/auth", ctrl.MediaMTXAuth)
	webhooks.Post("/event", ctrl.MediaMTXEvent)
}

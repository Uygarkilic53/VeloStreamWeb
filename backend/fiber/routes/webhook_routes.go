package routes

import (
	"github.com/gofiber/fiber/v2"
	"github.com/velostream/fiber/controllers"
	"github.com/velostream/fiber/services"
)

func RegisterWebhookRoutes(app *fiber.App, secret string, hub *services.HubService) {
	ctrl := controllers.NewWebhookController(secret, hub)
	webhooks := app.Group("/webhooks/mediamtx")
	webhooks.Post("/auth", ctrl.MediaMTXAuth)
	webhooks.Post("/event", ctrl.MediaMTXEvent)
}

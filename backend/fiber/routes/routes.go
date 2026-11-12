package routes

import (
	"github.com/gofiber/fiber/v2"
	"github.com/velostream/fiber/services"
)

type Dependencies struct {
	Hub                *services.HubService
	JwtService         *services.JwtService
	MediaWebhookSecret string
}

// RegisterAll mounts every route module onto the Fiber app (mirrors Fastify's routes/index.ts).
func RegisterAll(app *fiber.App, deps Dependencies) {
	RegisterWebhookRoutes(app, deps.MediaWebhookSecret, deps.Hub)
	RegisterChatRoutes(app, deps.JwtService, deps.Hub)
}

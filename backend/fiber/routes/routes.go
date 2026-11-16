package routes

import (
	"github.com/gofiber/fiber/v2"
	"github.com/velostream/fiber/models"
	"github.com/velostream/fiber/services"
)

type Dependencies struct {
	Hub                *services.HubService
	JwtService         *services.JwtService
	MediaWebhookSecret string
	StreamRepo         models.StreamRepository
	ChatModel          *models.ChatModel
	GiphyAPIKey        string
}

// RegisterAll mounts every route module onto the Fiber app (mirrors Fastify's routes/index.ts).
func RegisterAll(app *fiber.App, deps Dependencies) {
	RegisterSwaggerRoutes(app)
	RegisterWebhookRoutes(app, deps.MediaWebhookSecret, deps.Hub, deps.StreamRepo, deps.ChatModel)
	RegisterChatRoutes(app, deps.JwtService, deps.Hub, deps.ChatModel, deps.GiphyAPIKey)
}

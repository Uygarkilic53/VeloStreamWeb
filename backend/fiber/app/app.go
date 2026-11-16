package app

import (
	"errors"
	"strings"

	"github.com/gofiber/fiber/v2"
	"github.com/gofiber/fiber/v2/middleware/cors"
	"github.com/gofiber/fiber/v2/middleware/recover"
	"github.com/velostream/fiber/models"
	"github.com/velostream/fiber/routes"
	"github.com/velostream/fiber/services"
)

type Options struct {
	CorsOrigin         string
	Hub                *services.HubService
	JwtService         *services.JwtService
	MediaWebhookSecret string
	StreamRepo         models.StreamRepository
	ChatModel          *models.ChatModel
	GiphyAPIKey        string
}

// New builds and configures the Fiber app without calling Listen (mirrors Fastify's src/app.ts).
// Tests call app.New(...).Test(req) directly in memory.
func New(opts Options) *fiber.App {
	fiberApp := fiber.New(fiber.Config{
		DisableStartupMessage: true,
		ErrorHandler: func(c *fiber.Ctx, err error) error {
			code := fiber.StatusInternalServerError
			message := "An unexpected server error occurred."
			var fiberErr *fiber.Error
			if errors.As(err, &fiberErr) {
				code = fiberErr.Code
				message = fiberErr.Message
			}
			return c.Status(code).JSON(fiber.Map{
				"error":   strings.ToUpper(strings.ReplaceAll(message, " ", "_")),
				"message": message,
			})
		},
	})

	fiberApp.Use(recover.New())

	corsOrigin := strings.TrimSpace(opts.CorsOrigin)
	if corsOrigin == "" {
		corsOrigin = "http://localhost:5173"
	}
	fiberApp.Use(cors.New(cors.Config{
		AllowOrigins:     corsOrigin,
		AllowCredentials: corsOrigin != "*",
		AllowMethods:     "GET,HEAD,POST,PUT,PATCH,DELETE,OPTIONS",
		AllowHeaders:     "Content-Type,Authorization,Accept",
	}))

	routes.RegisterAll(fiberApp, routes.Dependencies{
		Hub:                opts.Hub,
		JwtService:         opts.JwtService,
		MediaWebhookSecret: opts.MediaWebhookSecret,
		StreamRepo:         opts.StreamRepo,
		ChatModel:          opts.ChatModel,
		GiphyAPIKey:        opts.GiphyAPIKey,
	})

	return fiberApp
}

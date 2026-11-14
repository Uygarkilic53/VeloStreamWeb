package routes

import (
	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/velostream/fiber/controllers"
	"github.com/velostream/fiber/middlewares"
	"github.com/velostream/fiber/services"
)

func RegisterChatRoutes(app *fiber.App, jwtSvc *services.JwtService, hub *services.HubService) {
	ctrl := controllers.NewChatController(hub)
	app.Get("/ws/live", websocket.New(ctrl.HandleLiveSocket))
	app.Use("/ws/chat/:channelId", middlewares.RequireWebSocketAuth(jwtSvc))
	app.Get("/ws/chat/:channelId", websocket.New(ctrl.HandleSocket))
}

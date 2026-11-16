package routes

import (
	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/velostream/fiber/controllers"
	"github.com/velostream/fiber/middlewares"
	"github.com/velostream/fiber/models"
	"github.com/velostream/fiber/services"
)

func RegisterChatRoutes(app *fiber.App, jwtSvc *services.JwtService, hub *services.HubService, chatModel *models.ChatModel, giphyKey string) {
	ctrl := controllers.NewChatController(hub, chatModel)
	app.Get("/ws/live", websocket.New(ctrl.HandleLiveSocket))
	app.Use("/ws/chat/:channelId", middlewares.RequireWebSocketAuth(jwtSvc))
	app.Get("/ws/chat/:channelId", websocket.New(ctrl.HandleSocket))

	// REST chat messages history
	app.Get("/api/chat/:channelId/messages", ctrl.GetMessages)

	// GIPHY endpoints
	giphyCtrl := controllers.NewGiphyController(giphyKey)
	app.Get("/api/gifs/trending", giphyCtrl.Trending)
	app.Get("/api/gifs/search", giphyCtrl.Search)
}

package middlewares

import (
	"strings"

	"github.com/gofiber/contrib/websocket"
	"github.com/gofiber/fiber/v2"
	"github.com/velostream/fiber/services"
)

const ClaimsLocalKey = "claims"

// RequireWebSocketAuth enforces WebSocket upgrade headers and verifies the asymmetric JWT access token.
func RequireWebSocketAuth(jwtSvc *services.JwtService) fiber.Handler {
	return func(c *fiber.Ctx) error {
		if !websocket.IsWebSocketUpgrade(c) {
			return fiber.ErrUpgradeRequired
		}
		if jwtSvc == nil {
			return c.Status(fiber.StatusServiceUnavailable).JSON(fiber.Map{
				"error": "AUTH_UNCONFIGURED",
			})
		}

		token := extractBearerToken(c)
		claims, err := jwtSvc.Verify(token)
		if err != nil {
			return c.Status(fiber.StatusUnauthorized).JSON(fiber.Map{
				"error": "UNAUTHORIZED",
			})
		}

		c.Locals(ClaimsLocalKey, claims)
		return c.Next()
	}
}

func extractBearerToken(c *fiber.Ctx) string {
	authHeader := strings.TrimSpace(c.Get("Authorization"))
	if strings.HasPrefix(strings.ToLower(authHeader), "bearer ") {
		return strings.TrimSpace(authHeader[7:])
	}
	return strings.TrimSpace(c.Query("token"))
}

package routes

import (
	"github.com/gofiber/fiber/v2"
)

const swaggerUIHTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>VeloStream Fiber API - Swagger UI</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css" />
</head>
<body>
<div id="swagger-ui"></div>
<script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js" crossorigin="anonymous"></script>
<script>
  window.onload = () => {
    window.ui = SwaggerUIBundle({
      url: '/docs/openapi.json',
      dom_id: '#swagger-ui',
    });
  };
</script>
</body>
</html>`

const openAPISpecJSON = `{
  "openapi": "3.0.3",
  "info": {
    "title": "VeloStream Real-Time Fiber API",
    "description": "High-concurrency Go Fiber service handling MediaMTX webhooks, chat persistence, and real-time WebSocket broadcasting.",
    "version": "1.0.0"
  },
  "servers": [
    {
      "url": "/",
      "description": "Current Fiber Server"
    }
  ],
  "paths": {
    "/webhooks/mediamtx/auth": {
      "post": {
        "summary": "MediaMTX Ingest Authentication",
        "description": "Validates publisher stream credentials or allows public playback access.",
        "tags": ["MediaMTX Webhooks"],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/MediaMTXAuthPayload"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Ingest or playback authorized"
          },
          "400": {
            "description": "Invalid request payload",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized - Missing or invalid credentials",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "Internal database error",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/webhooks/mediamtx/event": {
      "post": {
        "summary": "MediaMTX Stream Lifecycle Event",
        "description": "Receives runOnReady / runOnNotReady events, persists stream session and channel live status, clears chat messages on stream end, and broadcasts stream.status and chat.reset over WebSockets.",
        "tags": ["MediaMTX Webhooks"],
        "parameters": [
          {
            "name": "X-VeloStream-Webhook-Secret",
            "in": "header",
            "required": true,
            "description": "Shared webhook secret token",
            "schema": {
              "type": "string"
            }
          }
        ],
        "requestBody": {
          "required": true,
          "content": {
            "application/json": {
              "schema": {
                "$ref": "#/components/schemas/MediaMTXEventPayload"
              }
            }
          }
        },
        "responses": {
          "200": {
            "description": "Event accepted and state synchronized",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/MediaMTXEventResponse"
                }
              }
            }
          },
          "400": {
            "description": "Invalid event payload or unsupported event",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "401": {
            "description": "Unauthorized webhook secret",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "404": {
            "description": "Channel not found in database",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          },
          "500": {
            "description": "Internal database error",
            "content": {
              "application/json": {
                "schema": {
                  "$ref": "#/components/schemas/ErrorResponse"
                }
              }
            }
          }
        }
      }
    },
    "/ws/live": {
      "get": {
        "summary": "Live Stream Status WebSocket Subscription",
        "description": "Subscribes to global stream status updates (live/offline) and real-time moderation events (moderation.banned and moderation.unbanned) across all channels without authentication.",
        "tags": ["WebSockets"],
        "responses": {
          "101": {
            "description": "Switching Protocols to WebSocket"
          },
          "426": {
            "description": "Upgrade Required"
          }
        }
      }
    },
    "/ws/chat/{channelId}": {
      "get": {
        "summary": "Channel Chat & Moderation WebSocket Connection",
        "description": "Connects to a channel chat room with realtime history, moderation (silence/unsilence, ban/unban, warnings), creator chat freeze/pause controls, slow mode rate-limiting (3s cooldown), and automatic silence persistence on reconnect. Requires a valid JWT token query parameter.",
        "tags": ["WebSockets"],
        "parameters": [
          {
            "name": "channelId",
            "in": "path",
            "required": true,
            "description": "Channel ID or slug",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "token",
            "in": "query",
            "required": true,
            "description": "JWT authentication token",
            "schema": {
              "type": "string"
            }
          }
        ],
        "responses": {
          "101": {
            "description": "Switching Protocols to WebSocket"
          },
          "401": {
            "description": "Unauthorized - Missing or invalid JWT token"
          },
          "426": {
            "description": "Upgrade Required"
          },
          "503": {
            "description": "JWT authentication service unconfigured"
          }
        }
      }
    },
    "/api/chat/{channelId}/messages": {
      "get": {
        "summary": "Channel Recent Chat Messages",
        "description": "Retrieves recent chat history for the specified channel.",
        "tags": ["Chat"],
        "parameters": [
          {
            "name": "channelId",
            "in": "path",
            "required": true,
            "description": "Channel ID or slug",
            "schema": {
              "type": "string"
            }
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "description": "Max messages to return (default 50)",
            "schema": {
              "type": "integer",
              "default": 50
            }
          }
        ],
        "responses": {
          "200": {
            "description": "Recent messages list",
            "content": {
              "application/json": {
                "schema": {
                  "type": "object",
                  "properties": {
                    "messages": {
                      "type": "array",
                      "items": { "$ref": "#/components/schemas/ChatMessage" }
                    }
                  }
                }
              }
            }
          }
        }
      }
    },
    "/api/gifs/trending": {
      "get": {
        "summary": "Trending GIPHY GIFs",
        "description": "Fetches currently trending GIFs from GIPHY with caching.",
        "tags": ["Giphy"],
        "parameters": [
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": { "type": "integer", "default": 24 }
          },
          {
            "name": "offset",
            "in": "query",
            "required": false,
            "schema": { "type": "integer", "default": 0 }
          },
          {
            "name": "rating",
            "in": "query",
            "required": false,
            "schema": { "type": "string", "default": "g" }
          }
        ],
        "responses": {
          "200": {
            "description": "Normalized trending GIFs response",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/GiphyResponse" }
              }
            }
          },
          "502": {
            "description": "GIPHY service unavailable"
          }
        }
      }
    },
    "/api/gifs/search": {
      "get": {
        "summary": "Search GIPHY GIFs",
        "description": "Searches GIPHY GIFs by query string with caching.",
        "tags": ["Giphy"],
        "parameters": [
          {
            "name": "q",
            "in": "query",
            "required": true,
            "schema": { "type": "string" }
          },
          {
            "name": "limit",
            "in": "query",
            "required": false,
            "schema": { "type": "integer", "default": 24 }
          },
          {
            "name": "offset",
            "in": "query",
            "required": false,
            "schema": { "type": "integer", "default": 0 }
          },
          {
            "name": "rating",
            "in": "query",
            "required": false,
            "schema": { "type": "string", "default": "g" }
          }
        ],
        "responses": {
          "200": {
            "description": "Search results matching query",
            "content": {
              "application/json": {
                "schema": { "$ref": "#/components/schemas/GiphyResponse" }
              }
            }
          },
          "502": {
            "description": "GIPHY service unavailable"
          }
        }
      }
    }
  },
  "components": {
    "schemas": {
      "ChatMessage": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "channelId": { "type": "string" },
          "userId": { "type": "string" },
          "username": { "type": "string" },
          "avatarUrl": { "type": "string", "nullable": true },
          "role": { "type": "string", "enum": ["Creator", "Moderator", "User"] },
          "content": { "type": "string" },
          "messageType": { "type": "string", "enum": ["text", "gif"] },
          "gifUrl": { "type": "string", "nullable": true },
          "isDeleted": { "type": "boolean" },
          "createdAt": { "type": "string", "format": "date-time" }
        }
      },
      "GiphyGifItem": {
        "type": "object",
        "properties": {
          "id": { "type": "string" },
          "title": { "type": "string" },
          "previewUrl": { "type": "string" },
          "originalUrl": { "type": "string" },
          "width": { "type": "integer" },
          "height": { "type": "integer" }
        }
      },
      "GiphyResponse": {
        "type": "object",
        "properties": {
          "gifs": {
            "type": "array",
            "items": { "$ref": "#/components/schemas/GiphyGifItem" }
          },
          "pagination": {
            "type": "object",
            "properties": {
              "totalCount": { "type": "integer" },
              "count": { "type": "integer" },
              "offset": { "type": "integer" }
            }
          }
        }
      },
      "MediaMTXAuthPayload": {
        "type": "object",
        "properties": {
          "action": { "type": "string", "example": "publish" },
          "path": { "type": "string", "example": "streamer" },
          "protocol": { "type": "string", "example": "whip" },
          "user": { "type": "string" },
          "password": { "type": "string" },
          "token": { "type": "string" },
          "jwt": { "type": "string" },
          "query": { "type": "string" }
        },
        "required": ["path"]
      },
      "MediaMTXEventPayload": {
        "type": "object",
        "properties": {
          "event": { "type": "string", "enum": ["stream.ready", "stream.not_ready"], "example": "stream.ready" },
          "path": { "type": "string", "example": "streamer" },
          "sourceType": { "type": "string", "example": "whip" }
        },
        "required": ["event", "path"]
      },
      "MediaMTXEventResponse": {
        "type": "object",
        "properties": {
          "accepted": { "type": "boolean", "example": true },
          "path": { "type": "string", "example": "streamer" },
          "status": { "type": "string", "enum": ["live", "offline"], "example": "live" }
        }
      },
      "ModerationUnbanPayload": {
        "type": "object",
        "properties": {
          "channelId": { "type": "string" },
          "channelSlug": { "type": "string" },
          "userId": { "type": "string" },
          "username": { "type": "string" }
        },
        "required": ["channelId", "userId"]
      },
      "ChatSlowModePayload": {
        "type": "object",
        "properties": {
          "channelId": { "type": "string" },
          "enabled": { "type": "boolean" },
          "cooldownSeconds": { "type": "integer", "example": 3 },
          "initial": { "type": "boolean" }
        },
        "required": ["channelId", "enabled"]
      },
      "ErrorResponse": {
        "type": "object",
        "properties": {
          "error": { "type": "string", "example": "UNAUTHORIZED_WEBHOOK" },
          "message": { "type": "string" }
        }
      }
    }
  }
}
`

func RegisterSwaggerRoutes(app *fiber.App) {
	sendSpec := func(c *fiber.Ctx) error {
		c.Set("Content-Type", "application/json")
		return c.SendString(openAPISpecJSON)
	}

	app.Get("/docs/openapi.json", sendSpec)
	app.Get("/docs/json", sendSpec)

	app.Get("/docs", func(c *fiber.Ctx) error {
		c.Set("Content-Type", "text/html; charset=utf-8")
		return c.SendString(swaggerUIHTML)
	})
}

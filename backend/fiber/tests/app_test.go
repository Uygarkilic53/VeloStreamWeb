package tests

import (
	"bytes"
	"context"
	"crypto/ed25519"
	"crypto/rand"
	"crypto/x509"
	"encoding/json"
	"encoding/pem"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/velostream/fiber/app"
	"github.com/velostream/fiber/controllers"
	"github.com/velostream/fiber/models"
	"github.com/velostream/fiber/services"
)

func TestCORSMiddlewareAndRemovedHealthRoute(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	h := services.NewHubService()
	go h.Run(ctx)

	fiberApp := app.New(app.Options{
		CorsOrigin: "http://localhost:5173",
		Hub:        h,
	})

	req := httptest.NewRequest(http.MethodGet, "/healthz", nil)
	req.Header.Set("Origin", "http://localhost:5173")
	resp, err := fiberApp.Test(req)
	if err != nil {
		t.Fatalf("app.Test /healthz: %v", err)
	}
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 after removing /healthz, got %d", resp.StatusCode)
	}
	if got := resp.Header.Get("Access-Control-Allow-Origin"); got != "http://localhost:5173" {
		t.Fatalf("expected CORS header http://localhost:5173, got %q", got)
	}
}

func TestMediaMTXWebhooks(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	h := services.NewHubService()
	go h.Run(ctx)

	client := services.NewClient("creator_1", "usr_1", "viewer1")
	h.Register(client)
	defer h.Unregister(client)

	liveClient := services.NewClient("__live__", "viewer", "viewer")
	h.Register(liveClient)
	defer h.Unregister(liveClient)

	fiberApp := app.New(app.Options{
		Hub:                h,
		MediaWebhookSecret: "top-secret-webhook",
	})

	// Reject spoofed event without valid secret header.
	body := []byte(`{"event":"stream.ready","path":"creator_1","sourceType":"whip"}`)
	unauthReq := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/event", bytes.NewReader(body))
	unauthReq.Header.Set("Content-Type", "application/json")
	unauthResp, err := fiberApp.Test(unauthReq)
	if err != nil {
		t.Fatalf("unauth webhook test: %v", err)
	}
	if unauthResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for missing secret, got %d", unauthResp.StatusCode)
	}

	// Accept valid event with secret header and broadcast to room.
	authReq := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/event", bytes.NewReader(body))
	authReq.Header.Set("Content-Type", "application/json")
	authReq.Header.Set(controllers.WebhookSecretHeader, "top-secret-webhook")
	authResp, err := fiberApp.Test(authReq)
	if err != nil {
		t.Fatalf("auth webhook test: %v", err)
	}
	if authResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 for valid webhook, got %d", authResp.StatusCode)
	}

	var parsed map[string]any
	if err := json.NewDecoder(authResp.Body).Decode(&parsed); err != nil {
		t.Fatalf("decode webhook response: %v", err)
	}
	if parsed["status"] != "live" {
		t.Fatalf("expected status live, got %v", parsed["status"])
	}

	select {
	case msg := <-client.Send:
		if len(msg) == 0 {
			t.Fatal("expected stream.status frame broadcast to connected client")
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for stream.status broadcast")
	}

	select {
	case msg := <-liveClient.Send:
		if len(msg) == 0 {
			t.Fatal("expected stream.status frame broadcast to live subscription client")
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for live subscription broadcast")
	}

	// Publish auth without credentials must fail.
	pubReq := httptest.NewRequest(
		http.MethodPost,
		"/webhooks/mediamtx/auth",
		bytes.NewReader([]byte(`{"action":"publish","path":"creator_1"}`)),
	)
	pubReq.Header.Set("Content-Type", "application/json")
	pubResp, err := fiberApp.Test(pubReq)
	if err != nil {
		t.Fatalf("publish auth test: %v", err)
	}
	if pubResp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for unauthenticated publish, got %d", pubResp.StatusCode)
	}
}

func TestWebSocketRouteUpgradeAndAuth(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	h := services.NewHubService()
	go h.Run(ctx)

	unconfiguredApp := app.New(app.Options{Hub: h})

	// Non-WebSocket request returns 426 Upgrade Required.
	resp, err := unconfiguredApp.Test(httptest.NewRequest(http.MethodGet, "/ws/chat/ch_1", nil))
	if err != nil {
		t.Fatalf("ws non-upgrade test: %v", err)
	}
	if resp.StatusCode != http.StatusUpgradeRequired {
		t.Fatalf("expected 426 Upgrade Required, got %d", resp.StatusCode)
	}

	// WebSocket upgrade without configured JWT service returns 503 AUTH_UNCONFIGURED.
	upgradeReq := httptest.NewRequest(http.MethodGet, "/ws/chat/ch_1", nil)
	upgradeReq.Header.Set("Connection", "Upgrade")
	upgradeReq.Header.Set("Upgrade", "websocket")
	upgradeReq.Header.Set("Sec-WebSocket-Version", "13")
	upgradeReq.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	resp503, err := unconfiguredApp.Test(upgradeReq)
	if err != nil {
		t.Fatalf("ws unconfigured auth test: %v", err)
	}
	if resp503.StatusCode != http.StatusServiceUnavailable {
		t.Fatalf("expected 503 AUTH_UNCONFIGURED, got %d", resp503.StatusCode)
	}

	// WebSocket upgrade with invalid JWT returns 401 Unauthorized.
	pub, priv, err := ed25519.GenerateKey(rand.Reader)
	if err != nil {
		t.Fatalf("generate key: %v", err)
	}
	der, err := x509.MarshalPKIXPublicKey(pub)
	if err != nil {
		t.Fatalf("marshal key: %v", err)
	}
	pubPEM := pem.EncodeToMemory(&pem.Block{Type: "PUBLIC KEY", Bytes: der})
	jwtSvc, err := services.NewJwtServiceFromPEM(pubPEM, "velostream-fastify", "velostream-clients")
	if err != nil {
		t.Fatalf("new jwt service: %v", err)
	}

	authedApp := app.New(app.Options{Hub: h, JwtService: jwtSvc})

	// Missing token returns 401 Unauthorized
	missingTokenReq := httptest.NewRequest(http.MethodGet, "/ws/chat/ch_1", nil)
	missingTokenReq.Header.Set("Connection", "Upgrade")
	missingTokenReq.Header.Set("Upgrade", "websocket")
	missingTokenReq.Header.Set("Sec-WebSocket-Version", "13")
	missingTokenReq.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	respMissing, err := authedApp.Test(missingTokenReq)
	if err != nil {
		t.Fatalf("ws missing token test: %v", err)
	}
	if respMissing.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized for missing token, got %d", respMissing.StatusCode)
	}

	// Invalid token returns 401 Unauthorized
	badTokenReq := httptest.NewRequest(http.MethodGet, "/ws/chat/ch_1?token=invalid.jwt.token", nil)
	badTokenReq.Header.Set("Connection", "Upgrade")
	badTokenReq.Header.Set("Upgrade", "websocket")
	badTokenReq.Header.Set("Sec-WebSocket-Version", "13")
	badTokenReq.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	resp401, err := authedApp.Test(badTokenReq)
	if err != nil {
		t.Fatalf("ws invalid token test: %v", err)
	}
	if resp401.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 Unauthorized, got %d", resp401.StatusCode)
	}

	// Valid JWT token returns 101 Switching Protocols
	token := jwt.NewWithClaims(jwt.SigningMethodEdDSA, jwt.MapClaims{
		"sub":      "usr_test_123",
		"username": "tester",
		"role":     "USER",
		"iss":      "velostream-fastify",
		"aud":      "velostream-clients",
		"exp":      time.Now().Add(1 * time.Hour).Unix(),
	})
	validTokenStr, err := token.SignedString(priv)
	if err != nil {
		t.Fatalf("sign valid token: %v", err)
	}

	validReq := httptest.NewRequest(http.MethodGet, "/ws/chat/ch_1?token="+validTokenStr, nil)
	validReq.Header.Set("Connection", "Upgrade")
	validReq.Header.Set("Upgrade", "websocket")
	validReq.Header.Set("Sec-WebSocket-Version", "13")
	validReq.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	resp101, err := authedApp.Test(validReq)
	if err != nil {
		t.Fatalf("ws valid token test: %v", err)
	}
	if resp101.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("expected 101 Switching Protocols, got %d", resp101.StatusCode)
	}

	// Valid JWT with Bearer prefix in query param returns 101 Switching Protocols
	bearerReq := httptest.NewRequest(http.MethodGet, "/ws/chat/ch_1?token=Bearer%20"+validTokenStr, nil)
	bearerReq.Header.Set("Connection", "Upgrade")
	bearerReq.Header.Set("Upgrade", "websocket")
	bearerReq.Header.Set("Sec-WebSocket-Version", "13")
	bearerReq.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	respBearer101, err := authedApp.Test(bearerReq)
	if err != nil {
		t.Fatalf("ws bearer token test: %v", err)
	}
	if respBearer101.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("expected 101 Switching Protocols with Bearer query, got %d", respBearer101.StatusCode)
	}

	// Valid JWT with Bearer+ prefix in query param returns 101 Switching Protocols
	bearerPlusReq := httptest.NewRequest(http.MethodGet, "/ws/chat/ch_1?token=Bearer+"+validTokenStr, nil)
	bearerPlusReq.Header.Set("Connection", "Upgrade")
	bearerPlusReq.Header.Set("Upgrade", "websocket")
	bearerPlusReq.Header.Set("Sec-WebSocket-Version", "13")
	bearerPlusReq.Header.Set("Sec-WebSocket-Key", "dGhlIHNhbXBsZSBub25jZQ==")
	respBearerPlus101, err := authedApp.Test(bearerPlusReq)
	if err != nil {
		t.Fatalf("ws bearer+ token test: %v", err)
	}
	if respBearerPlus101.StatusCode != http.StatusSwitchingProtocols {
		t.Fatalf("expected 101 Switching Protocols with Bearer+ query, got %d", respBearerPlus101.StatusCode)
	}

	// Channel messages endpoint when chatModel is nil returns 200 with empty messages
	msgReq := httptest.NewRequest(http.MethodGet, "/api/chat/ch_1/messages", nil)
	respMsg, err := authedApp.Test(msgReq)
	if err != nil {
		t.Fatalf("get messages test: %v", err)
	}
	if respMsg.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for /api/chat/ch_1/messages, got %d", respMsg.StatusCode)
	}

	// Channel messages endpoint with encoded @ in slug (/api/chat/%40ch_1/messages) returns 200 OK
	encMsgReq := httptest.NewRequest(http.MethodGet, "/api/chat/%40ch_1/messages", nil)
	respEncMsg, err := authedApp.Test(encMsgReq)
	if err != nil {
		t.Fatalf("get encoded messages test: %v", err)
	}
	if respEncMsg.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for /api/chat/%%40ch_1/messages, got %d", respEncMsg.StatusCode)
	}
}

func TestStreamSnapshotBroadcast(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	h := services.NewHubService()
	go h.Run(ctx)

	liveClient := services.NewClient("__live__", "viewer", "viewer")
	h.Register(liveClient)
	defer h.Unregister(liveClient)

	creatorClient := services.NewClient("streamer_x", "usr_x", "StreamerX")
	h.Register(creatorClient)
	defer h.Unregister(creatorClient)

	frameBytes, err := json.Marshal(models.WsFrame{
		Type: models.FrameTypeStreamSnapshot,
		Payload: models.StreamSnapshotEvent{
			ChannelID:   "streamer_x",
			SnapshotURL: "data:image/jpeg;base64,frame_snapshot_data",
			UpdatedAt:   time.Now().UTC().Format(time.RFC3339),
		},
	})
	if err != nil {
		t.Fatalf("marshal frame: %v", err)
	}

	h.Broadcast("streamer_x", frameBytes)
	h.Broadcast("__live__", frameBytes)

	select {
	case msg := <-liveClient.Send:
		var frame models.WsFrame
		if err := json.Unmarshal(msg, &frame); err != nil {
			t.Fatalf("unmarshal live frame: %v", err)
		}
		if frame.Type != models.FrameTypeStreamSnapshot {
			t.Fatalf("expected frame type %q, got %q", models.FrameTypeStreamSnapshot, frame.Type)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timed out waiting for stream.snapshot frame on __live__")
	}

	select {
	case msg := <-creatorClient.Send:
		var frame models.WsFrame
		if err := json.Unmarshal(msg, &frame); err != nil {
			t.Fatalf("unmarshal creator frame: %v", err)
		}
		if frame.Type != models.FrameTypeStreamSnapshot {
			t.Fatalf("expected frame type %q, got %q", models.FrameTypeStreamSnapshot, frame.Type)
		}
	case <-time.After(500 * time.Millisecond):
		t.Fatal("timed out waiting for stream.snapshot frame on streamer_x")
	}

	// Verify snapshot caching on hub
	h.SaveSnapshot("streamer_x", frameBytes)
	allSnaps := h.GetAllSnapshots()
	if len(allSnaps) != 1 {
		t.Fatalf("expected 1 cached snapshot, got %d", len(allSnaps))
	}
	h.DeleteSnapshot("streamer_x")
	if len(h.GetAllSnapshots()) != 0 {
		t.Fatalf("expected 0 cached snapshots after deletion, got %d", len(h.GetAllSnapshots()))
	}
}

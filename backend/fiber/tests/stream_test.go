package tests

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"

	"github.com/velostream/fiber/app"
	"github.com/velostream/fiber/controllers"
	"github.com/velostream/fiber/models"
	"github.com/velostream/fiber/services"
)

func TestMediaMTXAuth_PublicReadBypass(t *testing.T) {
	mockRepo := models.NewMockStreamRepository()
	fiberApp := app.New(app.Options{
		StreamRepo: mockRepo,
	})

	actions := []string{"read", "playback", "metrics", "api"}
	for _, action := range actions {
		body, _ := json.Marshal(models.MediaMTXAuthPayload{
			Action: action,
			Path:   "some_channel",
		})
		req := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/auth", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		resp, err := fiberApp.Test(req)
		if err != nil {
			t.Fatalf("auth bypass test (%s): %v", action, err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 OK for action %s, got %d", action, resp.StatusCode)
		}
	}
}

func TestMediaMTXAuth_MissingPath(t *testing.T) {
	fiberApp := app.New(app.Options{})

	// Empty path
	body := []byte(`{"action":"publish","path":""}`)
	req := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/auth", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := fiberApp.Test(req)
	if err != nil {
		t.Fatalf("missing path test: %v", err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for empty path, got %d", resp.StatusCode)
	}

	// Slash-only path
	bodySlash := []byte(`{"action":"publish","path":"///"}`)
	reqSlash := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/auth", bytes.NewReader(bodySlash))
	reqSlash.Header.Set("Content-Type", "application/json")
	respSlash, err := fiberApp.Test(reqSlash)
	if err != nil {
		t.Fatalf("slash path test: %v", err)
	}
	if respSlash.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for slash-only path, got %d", respSlash.StatusCode)
	}
}

func TestMediaMTXAuth_Publish_MissingCredentials(t *testing.T) {
	mockRepo := models.NewMockStreamRepository()
	mockRepo.Channels["test_creator"] = models.MockChannel{
		ID:        "ch_1",
		StreamKey: "live_secret_123",
		IsLive:    false,
	}

	fiberApp := app.New(app.Options{
		StreamRepo: mockRepo,
	})

	body := []byte(`{"action":"publish","path":"test_creator"}`)
	req := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/auth", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := fiberApp.Test(req)
	if err != nil {
		t.Fatalf("missing credentials test: %v", err)
	}
	if resp.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for missing credentials, got %d", resp.StatusCode)
	}

	var parsed map[string]any
	_ = json.NewDecoder(resp.Body).Decode(&parsed)
	if parsed["error"] != "MISSING_STREAM_CREDENTIALS" {
		t.Fatalf("expected error MISSING_STREAM_CREDENTIALS, got %v", parsed["error"])
	}
}

func TestMediaMTXAuth_Publish_InvalidCredentialsAndNonExistentChannel(t *testing.T) {
	mockRepo := models.NewMockStreamRepository()
	mockRepo.Channels["existing_slug"] = models.MockChannel{
		ID:        "ch_1",
		StreamKey: "real_secret_key",
		IsLive:    false,
	}

	fiberApp := app.New(app.Options{
		StreamRepo: mockRepo,
	})

	// Wrong key for existing channel
	bodyWrongKey, _ := json.Marshal(models.MediaMTXAuthPayload{
		Action:   "publish",
		Path:     "existing_slug",
		Password: "wrong_secret_key",
	})
	reqWrong := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/auth", bytes.NewReader(bodyWrongKey))
	reqWrong.Header.Set("Content-Type", "application/json")
	respWrong, err := fiberApp.Test(reqWrong)
	if err != nil {
		t.Fatalf("wrong key test: %v", err)
	}
	if respWrong.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for wrong key, got %d", respWrong.StatusCode)
	}

	// Non-existent channel slug
	bodyNonExistent, _ := json.Marshal(models.MediaMTXAuthPayload{
		Action:   "publish",
		Path:     "unknown_channel",
		Password: "some_key",
	})
	reqNonExistent := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/auth", bytes.NewReader(bodyNonExistent))
	reqNonExistent.Header.Set("Content-Type", "application/json")
	respNonExistent, err := fiberApp.Test(reqNonExistent)
	if err != nil {
		t.Fatalf("nonexistent channel test: %v", err)
	}
	if respNonExistent.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for non-existent channel, got %d", respNonExistent.StatusCode)
	}
}

func TestMediaMTXAuth_Publish_SuccessVariants(t *testing.T) {
	mockRepo := models.NewMockStreamRepository()
	mockRepo.Channels["my_streamer"] = models.MockChannel{
		ID:        "ch_10",
		StreamKey: "valid_secret_key_123",
		IsLive:    false,
	}

	fiberApp := app.New(app.Options{
		StreamRepo: mockRepo,
	})

	testCases := []struct {
		name    string
		payload models.MediaMTXAuthPayload
	}{
		{
			name: "Bearer / Password Auth",
			payload: models.MediaMTXAuthPayload{
				Action:   "publish",
				Path:     "my_streamer",
				Password: "valid_secret_key_123",
			},
		},
		{
			name: "Token Auth Field",
			payload: models.MediaMTXAuthPayload{
				Action: "publish",
				Path:   "my_streamer",
				Token:  "valid_secret_key_123",
			},
		},
		{
			name: "User Field Auth",
			payload: models.MediaMTXAuthPayload{
				Action: "publish",
				Path:   "my_streamer",
				User:   "valid_secret_key_123",
			},
		},
		{
			name: "RTMP Path Subcomponent Auth",
			payload: models.MediaMTXAuthPayload{
				Action: "publish",
				Path:   "my_streamer/valid_secret_key_123",
			},
		},
		{
			name: "Query Param streamKey Auth",
			payload: models.MediaMTXAuthPayload{
				Action: "publish",
				Path:   "my_streamer",
				Query:  "?streamKey=valid_secret_key_123",
			},
		},
		{
			name: "Query Param key Auth",
			payload: models.MediaMTXAuthPayload{
				Action: "publish",
				Path:   "/my_streamer",
				Query:  "key=valid_secret_key_123",
			},
		},
		{
			name: "JWT Auth Field",
			payload: models.MediaMTXAuthPayload{
				Action: "publish",
				Path:   "my_streamer",
				JWT:    "valid_secret_key_123",
			},
		},
		{
			name: "Query Param jwt Auth (MediaMTX WHIP Translation)",
			payload: models.MediaMTXAuthPayload{
				Action: "publish",
				Path:   "my_streamer",
				Query:  "jwt=valid_secret_key_123",
			},
		},
		{
			name: "Query Param jwt Auth with Leading Question Mark",
			payload: models.MediaMTXAuthPayload{
				Action: "publish",
				Path:   "my_streamer",
				Query:  "?jwt=valid_secret_key_123",
			},
		},
	}

	for _, tc := range testCases {
		t.Run(tc.name, func(t *testing.T) {
			body, _ := json.Marshal(tc.payload)
			req := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/auth", bytes.NewReader(body))
			req.Header.Set("Content-Type", "application/json")
			resp, err := fiberApp.Test(req)
			if err != nil {
				t.Fatalf("%s failed: %v", tc.name, err)
			}
			if resp.StatusCode != http.StatusOK {
				t.Fatalf("%s: expected 200 OK, got %d", tc.name, resp.StatusCode)
			}
		})
	}

	t.Run("Authorization Header Fallback", func(t *testing.T) {
		body, _ := json.Marshal(models.MediaMTXAuthPayload{
			Action: "publish",
			Path:   "my_streamer",
		})
		req := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/auth", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("Authorization", "Bearer valid_secret_key_123")
		resp, err := fiberApp.Test(req)
		if err != nil {
			t.Fatalf("auth header fallback failed: %v", err)
		}
		if resp.StatusCode != http.StatusOK {
			t.Fatalf("expected 200 OK from auth header fallback, got %d", resp.StatusCode)
		}
	})
}

func TestMediaMTXAuth_DatabaseError(t *testing.T) {
	mockRepo := models.NewMockStreamRepository()
	mockRepo.ValidateKeyErr = errors.New("db connection failure")

	fiberApp := app.New(app.Options{
		StreamRepo: mockRepo,
	})

	body, _ := json.Marshal(models.MediaMTXAuthPayload{
		Action:   "publish",
		Path:     "streamer",
		Password: "key",
	})
	req := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/auth", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	resp, err := fiberApp.Test(req)
	if err != nil {
		t.Fatalf("db error test: %v", err)
	}
	if resp.StatusCode != http.StatusInternalServerError {
		t.Fatalf("expected 500 for db error, got %d", resp.StatusCode)
	}
}

func TestMediaMTXEvent_SecretVerification(t *testing.T) {
	fiberApp := app.New(app.Options{
		MediaWebhookSecret: "super-secret-key",
	})

	body := []byte(`{"event":"stream.ready","path":"streamer","sourceType":"whip"}`)

	// Missing header
	reqNoSecret := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/event", bytes.NewReader(body))
	reqNoSecret.Header.Set("Content-Type", "application/json")
	respNoSecret, err := fiberApp.Test(reqNoSecret)
	if err != nil {
		t.Fatalf("no secret test: %v", err)
	}
	if respNoSecret.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for missing secret, got %d", respNoSecret.StatusCode)
	}

	// Invalid header
	reqBadSecret := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/event", bytes.NewReader(body))
	reqBadSecret.Header.Set("Content-Type", "application/json")
	reqBadSecret.Header.Set(controllers.WebhookSecretHeader, "wrong-secret-token")
	respBadSecret, err := fiberApp.Test(reqBadSecret)
	if err != nil {
		t.Fatalf("bad secret test: %v", err)
	}
	if respBadSecret.StatusCode != http.StatusUnauthorized {
		t.Fatalf("expected 401 for wrong secret, got %d", respBadSecret.StatusCode)
	}
}

func TestMediaMTXEvent_InvalidPayload(t *testing.T) {
	fiberApp := app.New(app.Options{
		MediaWebhookSecret: "my-secret",
	})

	// Invalid JSON
	reqBadJSON := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/event", bytes.NewReader([]byte("{invalid-json")))
	reqBadJSON.Header.Set("Content-Type", "application/json")
	reqBadJSON.Header.Set(controllers.WebhookSecretHeader, "my-secret")
	respBadJSON, err := fiberApp.Test(reqBadJSON)
	if err != nil {
		t.Fatalf("bad json test: %v", err)
	}
	if respBadJSON.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for bad json, got %d", respBadJSON.StatusCode)
	}

	// Unsupported event
	bodyBadEvent := []byte(`{"event":"stream.unknown","path":"streamer"}`)
	reqBadEvent := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/event", bytes.NewReader(bodyBadEvent))
	reqBadEvent.Header.Set("Content-Type", "application/json")
	reqBadEvent.Header.Set(controllers.WebhookSecretHeader, "my-secret")
	respBadEvent, err := fiberApp.Test(reqBadEvent)
	if err != nil {
		t.Fatalf("bad event test: %v", err)
	}
	if respBadEvent.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for unsupported event, got %d", respBadEvent.StatusCode)
	}

	// Empty path
	bodyEmptyPath := []byte(`{"event":"stream.ready","path":""}`)
	reqEmptyPath := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/event", bytes.NewReader(bodyEmptyPath))
	reqEmptyPath.Header.Set("Content-Type", "application/json")
	reqEmptyPath.Header.Set(controllers.WebhookSecretHeader, "my-secret")
	respEmptyPath, err := fiberApp.Test(reqEmptyPath)
	if err != nil {
		t.Fatalf("empty path test: %v", err)
	}
	if respEmptyPath.StatusCode != http.StatusBadRequest {
		t.Fatalf("expected 400 for empty path, got %d", respEmptyPath.StatusCode)
	}
}

func TestMediaMTXEvent_StreamLifecycleAndBroadcasting(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	hub := services.NewHubService()
	go hub.Run(ctx)

	// Register listener in channel room
	chClient := services.NewClient("creator_alice", "alice_id", "alice")
	hub.Register(chClient)
	defer hub.Unregister(chClient)

	// Register listener in global live room
	liveClient := services.NewClient("__live__", "viewer_bob", "bob")
	hub.Register(liveClient)
	defer hub.Unregister(liveClient)

	mockRepo := models.NewMockStreamRepository()
	mockRepo.Channels["creator_alice"] = models.MockChannel{
		ID:        "chan_alice_id",
		StreamKey: "alice_key",
		IsLive:    false,
	}

	fiberApp := app.New(app.Options{
		Hub:                hub,
		MediaWebhookSecret: "test-secret-123",
		StreamRepo:         mockRepo,
	})

	// 1. stream.ready event
	readyBody := []byte(`{"event":"stream.ready","path":"/creator_alice","sourceType":"whip"}`)
	readyReq := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/event", bytes.NewReader(readyBody))
	readyReq.Header.Set("Content-Type", "application/json")
	readyReq.Header.Set(controllers.WebhookSecretHeader, "test-secret-123")
	readyResp, err := fiberApp.Test(readyReq)
	if err != nil {
		t.Fatalf("stream.ready request: %v", err)
	}
	if readyResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for stream.ready, got %d", readyResp.StatusCode)
	}

	// Verify channel is live and session exists in repo
	ch := mockRepo.Channels["creator_alice"]
	if !ch.IsLive {
		t.Fatalf("expected channel isLive to be true after stream.ready")
	}
	if len(mockRepo.Sessions) != 1 {
		t.Fatalf("expected 1 session created, got %d", len(mockRepo.Sessions))
	}
	if mockRepo.Sessions[0].EndedAt != nil {
		t.Fatalf("expected session EndedAt to be nil while active")
	}

	// Verify broadcast frames
	select {
	case msg := <-chClient.Send:
		var frame models.WsFrame
		if err := json.Unmarshal(msg, &frame); err != nil {
			t.Fatalf("unmarshal channel frame: %v", err)
		}
		if frame.Type != models.FrameTypeStreamStatus {
			t.Fatalf("expected frame type stream.status, got %s", frame.Type)
		}
		payloadMap := frame.Payload.(map[string]any)
		if payloadMap["status"] != "live" || payloadMap["channelId"] != "creator_alice" {
			t.Fatalf("unexpected payload in channel frame: %v", payloadMap)
		}
		// Confirm streamKey is NOT leaked over WebSocket
		if _, hasKey := payloadMap["streamKey"]; hasKey {
			t.Fatalf("SECURITY VIOLATION: streamKey leaked in WebSocket frame: %v", payloadMap)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for channel room broadcast")
	}

	select {
	case msg := <-liveClient.Send:
		var frame models.WsFrame
		if err := json.Unmarshal(msg, &frame); err != nil {
			t.Fatalf("unmarshal live frame: %v", err)
		}
		payloadMap := frame.Payload.(map[string]any)
		if payloadMap["status"] != "live" || payloadMap["channelId"] != "creator_alice" {
			t.Fatalf("unexpected payload in live frame: %v", payloadMap)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for __live__ room broadcast")
	}

	// Freeze room during live stream to verify reset on offline
	hub.SetRoomFrozen("creator_alice", true)
	if !hub.IsRoomFrozen("creator_alice") {
		t.Fatalf("expected room to be frozen")
	}

	// 2. stream.not_ready event
	notReadyBody := []byte(`{"event":"stream.not_ready","path":"creator_alice","sourceType":"whip"}`)
	notReadyReq := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/event", bytes.NewReader(notReadyBody))
	notReadyReq.Header.Set("Content-Type", "application/json")
	notReadyReq.Header.Set(controllers.WebhookSecretHeader, "test-secret-123")
	notReadyResp, err := fiberApp.Test(notReadyReq)
	if err != nil {
		t.Fatalf("stream.not_ready request: %v", err)
	}
	if notReadyResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for stream.not_ready, got %d", notReadyResp.StatusCode)
	}

	// Verify channel is offline and session ended in repo
	chOffline := mockRepo.Channels["creator_alice"]
	if chOffline.IsLive {
		t.Fatalf("expected channel isLive to be false after stream.not_ready")
	}
	if len(mockRepo.Sessions) != 1 || mockRepo.Sessions[0].EndedAt == nil {
		t.Fatalf("expected session EndedAt to be set after stream.not_ready")
	}

	// Verify broadcast offline frame
	select {
	case msg := <-chClient.Send:
		var frame models.WsFrame
		_ = json.Unmarshal(msg, &frame)
		payloadMap := frame.Payload.(map[string]any)
		if payloadMap["status"] != "offline" {
			t.Fatalf("expected offline status, got %v", payloadMap["status"])
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for channel room offline broadcast")
	}

	// Verify broadcast chat.reset frame on stream ending
	select {
	case msg := <-chClient.Send:
		var frame models.WsFrame
		_ = json.Unmarshal(msg, &frame)
		if frame.Type != models.FrameTypeChatReset {
			t.Fatalf("expected chat.reset frame, got %s", frame.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for channel room chat.reset broadcast")
	}

	// Verify room freeze state is reset to false on stream end
	if hub.IsRoomFrozen("creator_alice") {
		t.Fatalf("expected room freeze to be reset to false after stream.not_ready")
	}

	select {
	case msg := <-liveClient.Send:
		var frame models.WsFrame
		_ = json.Unmarshal(msg, &frame)
		payloadMap := frame.Payload.(map[string]any)
		if payloadMap["status"] != "offline" {
			t.Fatalf("expected offline status, got %v", payloadMap["status"])
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for live room offline broadcast")
	}
}

func TestMediaMTXEvent_ChannelNotFound(t *testing.T) {
	mockRepo := models.NewMockStreamRepository()
	fiberApp := app.New(app.Options{
		MediaWebhookSecret: "test-secret",
		StreamRepo:         mockRepo,
	})

	body := []byte(`{"event":"stream.ready","path":"nonexistent_slug"}`)
	req := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/event", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(controllers.WebhookSecretHeader, "test-secret")
	resp, err := fiberApp.Test(req)
	if err != nil {
		t.Fatalf("channel not found test: %v", err)
	}
	if resp.StatusCode != http.StatusNotFound {
		t.Fatalf("expected 404 for nonexistent channel, got %d", resp.StatusCode)
	}
}

func TestMediaMTXEvent_DatabaseError(t *testing.T) {
	mockRepo := models.NewMockStreamRepository()
	mockRepo.SetLiveErr = errors.New("db error")
	fiberApp := app.New(app.Options{
		MediaWebhookSecret: "test-secret",
		StreamRepo:         mockRepo,
	})

	body := []byte(`{"event":"stream.ready","path":"streamer"}`)
	req := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/event", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set(controllers.WebhookSecretHeader, "test-secret")
	resp, err := fiberApp.Test(req)
	if err != nil {
		t.Fatalf("db error test: %v", err)
	}
	if resp.StatusCode != http.StatusInternalServerError {
		t.Fatalf("expected 500 for db error, got %d", resp.StatusCode)
	}
}

func TestMediaMTXEvent_SessionDatabaseErrors(t *testing.T) {
	// Case 1: CreateStreamSession error on stream.ready
	{
		mockRepo := models.NewMockStreamRepository()
		mockRepo.Channels["streamer"] = models.MockChannel{ID: "ch_1", StreamKey: "key"}
		mockRepo.CreateSessErr = errors.New("failed to insert session")
		fiberApp := app.New(app.Options{
			MediaWebhookSecret: "test-secret",
			StreamRepo:         mockRepo,
		})

		body := []byte(`{"event":"stream.ready","path":"streamer"}`)
		req := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/event", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set(controllers.WebhookSecretHeader, "test-secret")
		resp, err := fiberApp.Test(req)
		if err != nil {
			t.Fatalf("create session error test: %v", err)
		}
		if resp.StatusCode != http.StatusInternalServerError {
			t.Fatalf("expected 500 when CreateStreamSession fails, got %d", resp.StatusCode)
		}
	}

	// Case 2: EndStreamSession error on stream.not_ready
	{
		mockRepo := models.NewMockStreamRepository()
		mockRepo.Channels["streamer"] = models.MockChannel{ID: "ch_1", StreamKey: "key", IsLive: true}
		mockRepo.EndSessErr = errors.New("failed to end session")
		fiberApp := app.New(app.Options{
			MediaWebhookSecret: "test-secret",
			StreamRepo:         mockRepo,
		})

		body := []byte(`{"event":"stream.not_ready","path":"streamer"}`)
		req := httptest.NewRequest(http.MethodPost, "/webhooks/mediamtx/event", bytes.NewReader(body))
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set(controllers.WebhookSecretHeader, "test-secret")
		resp, err := fiberApp.Test(req)
		if err != nil {
			t.Fatalf("end session error test: %v", err)
		}
		if resp.StatusCode != http.StatusInternalServerError {
			t.Fatalf("expected 500 when EndStreamSession fails, got %d", resp.StatusCode)
		}
	}
}

func TestStreamModel_NilPoolSafety(t *testing.T) {
	model := models.NewStreamModel(nil)
	ctx := context.Background()

	_, err := model.ValidateStreamKey(ctx, "slug", "key")
	if err == nil {
		t.Fatal("expected error on ValidateStreamKey with nil pool")
	}

	_, err = model.SetChannelLive(ctx, "slug", true)
	if err == nil {
		t.Fatal("expected error on SetChannelLive with nil pool")
	}

	_, err = model.CreateStreamSession(ctx, "chan_1")
	if err == nil {
		t.Fatal("expected error on CreateStreamSession with nil pool")
	}

	err = model.EndStreamSession(ctx, "chan_1")
	if err == nil {
		t.Fatal("expected error on EndStreamSession with nil pool")
	}
}

func TestSwaggerRoutes(t *testing.T) {
	fiberApp := app.New(app.Options{})

	// GET /docs: Swagger UI HTML
	reqDocs := httptest.NewRequest(http.MethodGet, "/docs", nil)
	respDocs, err := fiberApp.Test(reqDocs)
	if err != nil {
		t.Fatalf("get /docs: %v", err)
	}
	if respDocs.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for /docs, got %d", respDocs.StatusCode)
	}
	ctDocs := respDocs.Header.Get("Content-Type")
	if !strings.Contains(ctDocs, "text/html") {
		t.Fatalf("expected text/html for /docs, got %s", ctDocs)
	}

	buf := new(bytes.Buffer)
	_, _ = buf.ReadFrom(respDocs.Body)
	if !strings.Contains(buf.String(), "SwaggerUIBundle") {
		t.Fatalf("expected SwaggerUIBundle in /docs HTML")
	}

	// GET /docs/openapi.json: OpenAPI 3.0 JSON
	reqJSON := httptest.NewRequest(http.MethodGet, "/docs/openapi.json", nil)
	respJSON, err := fiberApp.Test(reqJSON)
	if err != nil {
		t.Fatalf("get /docs/openapi.json: %v", err)
	}
	if respJSON.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for /docs/openapi.json, got %d", respJSON.StatusCode)
	}
	ctJSON := respJSON.Header.Get("Content-Type")
	if !strings.Contains(ctJSON, "application/json") {
		t.Fatalf("expected application/json for /docs/openapi.json, got %s", ctJSON)
	}

	var openAPISpec map[string]any
	if err := json.NewDecoder(respJSON.Body).Decode(&openAPISpec); err != nil {
		t.Fatalf("failed to parse /docs/openapi.json as JSON: %v", err)
	}
	if openAPISpec["openapi"] != "3.0.3" {
		t.Fatalf("expected openapi 3.0.3, got %v", openAPISpec["openapi"])
	}

	paths, ok := openAPISpec["paths"].(map[string]any)
	if !ok {
		t.Fatal("expected paths object in openapi spec")
	}
	for _, expectedPath := range []string{
		"/webhooks/mediamtx/auth",
		"/webhooks/mediamtx/event",
		"/ws/live",
		"/ws/chat/{channelId}",
	} {
		if _, exists := paths[expectedPath]; !exists {
			t.Fatalf("expected path %s in OpenAPI spec", expectedPath)
		}
	}

	// GET /docs/json alias
	reqAlias := httptest.NewRequest(http.MethodGet, "/docs/json", nil)
	respAlias, err := fiberApp.Test(reqAlias)
	if err != nil {
		t.Fatalf("get /docs/json: %v", err)
	}
	if respAlias.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 OK for /docs/json, got %d", respAlias.StatusCode)
	}
}

func TestLiveWebSocket_EndpointRegistration(t *testing.T) {
	fiberApp := app.New(app.Options{})

	req := httptest.NewRequest(http.MethodGet, "/ws/live", nil)
	resp, err := fiberApp.Test(req)
	if err != nil {
		t.Fatalf("request /ws/live: %v", err)
	}
	if resp.StatusCode != http.StatusUpgradeRequired {
		t.Fatalf("expected 426 StatusUpgradeRequired for /ws/live without upgrade headers, got %d", resp.StatusCode)
	}
}

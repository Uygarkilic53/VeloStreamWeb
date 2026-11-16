package tests

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"

	"github.com/velostream/fiber/app"
	"github.com/velostream/fiber/models"
	"github.com/velostream/fiber/services"
)

func TestChatMessagesAndSwaggerEndpoints(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	h := services.NewHubService()
	go h.Run(ctx)

	fiberApp := app.New(app.Options{
		Hub:         h,
		GiphyAPIKey: "test_key",
	})

	// Test GET /api/chat/:channelId/messages returns 200 with empty array when no DB configured
	req := httptest.NewRequest(http.MethodGet, "/api/chat/ch_general/messages", nil)
	resp, err := fiberApp.Test(req)
	if err != nil {
		t.Fatalf("GET /api/chat/:channelId/messages failed: %v", err)
	}
	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 from chat messages endpoint, got %d", resp.StatusCode)
	}
	var res map[string][]models.ChatMessage
	if err := json.NewDecoder(resp.Body).Decode(&res); err != nil {
		t.Fatalf("decode chat messages response: %v", err)
	}
	if res["messages"] == nil {
		t.Fatal("expected messages array in response")
	}

	// Test GET /docs and /docs/openapi.json
	docsReq := httptest.NewRequest(http.MethodGet, "/docs", nil)
	docsResp, err := fiberApp.Test(docsReq)
	if err != nil || docsResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 from /docs, got status %v, err %v", docsResp.StatusCode, err)
	}

	specReq := httptest.NewRequest(http.MethodGet, "/docs/openapi.json", nil)
	specResp, err := fiberApp.Test(specReq)
	if err != nil || specResp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200 from /docs/openapi.json, got status %v, err %v", specResp.StatusCode, err)
	}

	// Verify OpenAPI spec contains new Giphy and Chat paths
	var spec map[string]any
	if err := json.NewDecoder(specResp.Body).Decode(&spec); err != nil {
		t.Fatalf("decode openapi spec: %v", err)
	}
	paths, ok := spec["paths"].(map[string]any)
	if !ok {
		t.Fatal("missing paths in openapi spec")
	}
	if _, exists := paths["/api/gifs/trending"]; !exists {
		t.Fatal("expected /api/gifs/trending in OpenAPI spec")
	}
	if _, exists := paths["/api/chat/{channelId}/messages"]; !exists {
		t.Fatal("expected /api/chat/{channelId}/messages in OpenAPI spec")
	}
}

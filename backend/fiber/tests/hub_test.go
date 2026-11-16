package tests

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/velostream/fiber/models"
	"github.com/velostream/fiber/services"
)

func TestHubService_BroadcastAndBanEviction(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	h := services.NewHubService()
	go h.Run(ctx)

	c1 := services.NewClient("ch_1", "usr_1", "alice")
	c2 := services.NewClient("ch_1", "usr_2", "bob")
	h.Register(c1)
	h.Register(c2)

	h.Broadcast("ch_1", []byte(`{"type":"chat.message","payload":{"content":"hi"}}`))

	select {
	case msg := <-c1.Send:
		if len(msg) == 0 {
			t.Fatal("expected message for c1")
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for c1 message")
	}

	select {
	case msg := <-c2.Send:
		if len(msg) == 0 {
			t.Fatal("expected message for c2")
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for c2 message")
	}

	h.EvictUser("ch_1", "usr_1", "Spamming")

	// Expect ban notification frame followed by channel close for usr_1.
	var gotBanFrame bool
	timeout := time.After(time.Second)
	for {
		select {
		case raw, ok := <-c1.Send:
			if !ok {
				if !gotBanFrame {
					t.Fatal("expected moderation.banned frame before channel close")
				}
				goto verifyRemaining
			}
			var frame models.WsFrame
			if err := json.Unmarshal(raw, &frame); err == nil && frame.Type == models.FrameTypeModerationBanned {
				gotBanFrame = true
			}
		case <-timeout:
			t.Fatal("timed out waiting for usr_1 eviction")
		}
	}

verifyRemaining:
	if got := h.RoomSize("ch_1"); got != 1 {
		t.Fatalf("expected room size 1 after eviction, got %d", got)
	}
}

func TestHubService_SendToUser(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	h := services.NewHubService()
	go h.Run(ctx)

	targetClient := services.NewClient("ch_warn", "target_user_1", "charlie")
	otherClient := services.NewClient("ch_warn", "other_user_2", "david")
	h.Register(targetClient)
	h.Register(otherClient)
	defer h.Unregister(targetClient)
	defer h.Unregister(otherClient)

	warnPayload := []byte(`{"type":"moderation.warning","payload":{"reason":"civility"}}`)
	h.SendToUser("ch_warn", "target_user_1", warnPayload)

	select {
	case msg := <-targetClient.Send:
		if string(msg) != string(warnPayload) {
			t.Fatalf("expected warning payload on target client, got %s", string(msg))
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for target warning frame")
	}

	select {
	case unexpected := <-otherClient.Send:
		t.Fatalf("other client should not receive targeted user frame, got %s", string(unexpected))
	case <-time.After(50 * time.Millisecond):
		// Expected: nothing received on peer client
	}
}

func TestHubService_ConcurrentOperationsRaceFree(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	h := services.NewHubService()
	go h.Run(ctx)

	var wg sync.WaitGroup
	for i := range 20 {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			c := services.NewClient("ch_race", "usr_race", "user")
			h.Register(c)
			h.Broadcast("ch_race", []byte(`{"type":"chat.message","payload":{}}`))
			_ = h.RoomSize("ch_race")
			if idx%2 == 0 {
				h.Unregister(c)
			} else {
				h.EvictUser("ch_race", "usr_race", "test")
			}
		}(i)
	}
	wg.Wait()
}

func TestHubService_EvictsSlowClientOnOverflow(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	h := services.NewHubService()
	go h.Run(ctx)

	slow := services.NewClient("ch_slow", "usr_slow", "slow_viewer")
	h.Register(slow)

	for range 100 {
		h.Broadcast("ch_slow", []byte(`{"type":"chat.message","payload":{}}`))
	}

	deadline := time.Now().Add(time.Second)
	for time.Now().Before(deadline) {
		if h.RoomSize("ch_slow") == 0 {
			return
		}
		time.Sleep(10 * time.Millisecond)
	}
	t.Fatalf("expected slow client to be evicted, room size=%d", h.RoomSize("ch_slow"))
}

func TestHubService_RoomFrozenTracking(t *testing.T) {
	h := services.NewHubService()
	if h.IsRoomFrozen("channel_alpha") {
		t.Fatal("expected room to not be frozen initially")
	}

	h.SetRoomFrozen("channel_alpha", true)
	if !h.IsRoomFrozen("channel_alpha") {
		t.Fatal("expected room to be frozen")
	}
	// Case insensitivity
	if !h.IsRoomFrozen("CHANNEL_ALPHA") {
		t.Fatal("expected room lookup to be case-insensitive")
	}

	h.SetRoomFrozen("channel_alpha", false)
	if h.IsRoomFrozen("channel_alpha") {
		t.Fatal("expected room to no longer be frozen")
	}
}

func TestHubService_UnbanBroadcastToRoomAndLive(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	h := services.NewHubService()
	go h.Run(ctx)

	roomClient := services.NewClient("creator_alice", "usr_viewer", "viewer_bob")
	h.Register(roomClient)
	defer h.Unregister(roomClient)

	liveClient := services.NewClient("__live__", "viewer", "viewer")
	h.Register(liveClient)
	defer h.Unregister(liveClient)

	unbanFrame, err := json.Marshal(models.WsFrame{
		Type: models.FrameTypeModerationUnbanned,
		Payload: models.ModerationUnbanPayload{
			ChannelID:   "creator_alice",
			ChannelSlug: "creator_alice",
			UserID:      "usr_viewer",
			Username:    "viewer_bob",
		},
	})
	if err != nil {
		t.Fatalf("marshal unban frame: %v", err)
	}

	h.Broadcast("creator_alice", unbanFrame)
	h.Broadcast("__live__", unbanFrame)

	// Verify room client received unban frame
	select {
	case msg := <-roomClient.Send:
		var frame models.WsFrame
		if err := json.Unmarshal(msg, &frame); err != nil {
			t.Fatalf("unmarshal room frame: %v", err)
		}
		if frame.Type != models.FrameTypeModerationUnbanned {
			t.Fatalf("expected %q, got %q", models.FrameTypeModerationUnbanned, frame.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for unban frame on room client")
	}

	// Verify live client received unban frame
	select {
	case msg := <-liveClient.Send:
		var frame models.WsFrame
		if err := json.Unmarshal(msg, &frame); err != nil {
			t.Fatalf("unmarshal live frame: %v", err)
		}
		if frame.Type != models.FrameTypeModerationUnbanned {
			t.Fatalf("expected %q, got %q", models.FrameTypeModerationUnbanned, frame.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for unban frame on __live__")
	}
}

func TestHubService_SilencedBroadcastAndTargeting(t *testing.T) {
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	h := services.NewHubService()
	go h.Run(ctx)

	targetClient := services.NewClient("creator_alice", "usr_silenced", "viewer_charlie")
	h.Register(targetClient)
	defer h.Unregister(targetClient)

	futureExp := time.Now().UTC().Add(time.Hour).Format(time.RFC3339)
	silenceFrame, err := json.Marshal(models.WsFrame{
		Type: models.FrameTypeModerationSilenced,
		Payload: models.ModerationSilencePayload{
			ChannelID: "creator_alice",
			UserID:    "usr_silenced",
			Username:  "viewer_charlie",
			ExpiresAt: &futureExp,
			Reason:    "Spamming links",
		},
	})
	if err != nil {
		t.Fatalf("marshal silence frame: %v", err)
	}

	h.Broadcast("creator_alice", silenceFrame)

	select {
	case msg := <-targetClient.Send:
		var frame models.WsFrame
		if err := json.Unmarshal(msg, &frame); err != nil {
			t.Fatalf("unmarshal silence frame: %v", err)
		}
		if frame.Type != models.FrameTypeModerationSilenced {
			t.Fatalf("expected %q, got %q", models.FrameTypeModerationSilenced, frame.Type)
		}
	case <-time.After(time.Second):
		t.Fatal("timed out waiting for silence frame on target client")
	}
}

func TestHubService_SlowModeAndRateLimiting(t *testing.T) {
	h := services.NewHubService()

	// Initial state: room not in slow mode
	if h.IsRoomSlowMode("ch_slow") {
		t.Fatal("expected room not to be in slow mode initially")
	}

	// Enable slow mode with 3s default cooldown
	h.SetRoomSlowMode("ch_slow", true, 3)
	if !h.IsRoomSlowMode("ch_slow") {
		t.Fatal("expected room to be in slow mode")
	}
	if cd := h.GetRoomSlowModeCooldown("ch_slow"); cd != 3 {
		t.Fatalf("expected cooldown 3, got %d", cd)
	}

	// First message from user1 should succeed
	allowed := h.CheckAndRecordUserMessage("ch_slow", "usr_1", 3*time.Second)
	if !allowed {
		t.Fatal("expected first message from usr_1 to be allowed")
	}

	// Immediate second message from user1 must be rejected by slow mode
	allowedSecond := h.CheckAndRecordUserMessage("ch_slow", "usr_1", 3*time.Second)
	if allowedSecond {
		t.Fatal("expected immediate second message from usr_1 to be rejected")
	}

	// Different user (usr_2) in same room should be allowed their first message
	allowedUser2 := h.CheckAndRecordUserMessage("ch_slow", "usr_2", 3*time.Second)
	if !allowedUser2 {
		t.Fatal("expected first message from usr_2 to be allowed independently")
	}

	// User1 in different room should be allowed
	allowedOtherRoom := h.CheckAndRecordUserMessage("ch_other", "usr_1", 3*time.Second)
	if !allowedOtherRoom {
		t.Fatal("expected usr_1 in different room to be allowed")
	}

	// With short cooldown (10ms), verify rate limit expires cleanly
	shortCooldown := 20 * time.Millisecond
	h.CheckAndRecordUserMessage("ch_quick", "usr_quick", shortCooldown)
	time.Sleep(30 * time.Millisecond)
	allowedAfterCooldown := h.CheckAndRecordUserMessage("ch_quick", "usr_quick", shortCooldown)
	if !allowedAfterCooldown {
		t.Fatal("expected message after cooldown expiry to be allowed")
	}

	// Disable slow mode
	h.SetRoomSlowMode("ch_slow", false, 0)
	if h.IsRoomSlowMode("ch_slow") {
		t.Fatal("expected room slow mode to be disabled")
	}

	// Concurrency test for race detection
	var wg sync.WaitGroup
	for i := 0; i < 20; i++ {
		wg.Add(1)
		go func(idx int) {
			defer wg.Done()
			u := string(rune('a' + idx))
			h.CheckAndRecordUserMessage("ch_race", u, time.Second)
		}(i)
	}
	wg.Wait()
}

func TestChatSlowModePayload_InitialFieldSerialization(t *testing.T) {
	initialPayload := models.ChatSlowModePayload{
		ChannelID:       "ch_dev",
		Enabled:         true,
		CooldownSeconds: 3,
		Initial:         true,
	}
	data, err := json.Marshal(initialPayload)
	if err != nil {
		t.Fatalf("failed to marshal initial slow mode payload: %v", err)
	}
	if !strings.Contains(string(data), `"initial":true`) {
		t.Fatalf("expected payload JSON to contain initial:true, got: %s", string(data))
	}

	livePayload := models.ChatSlowModePayload{
		ChannelID:       "ch_dev",
		Enabled:         true,
		CooldownSeconds: 3,
		Initial:         false,
	}
	liveData, err := json.Marshal(livePayload)
	if err != nil {
		t.Fatalf("failed to marshal live slow mode payload: %v", err)
	}
	// Initial: false has omitempty, so it should not appear in live payloads
	if strings.Contains(string(liveData), `"initial"`) {
		t.Fatalf("expected live payload JSON to omit initial field, got: %s", string(liveData))
	}
}

package tests

import (
	"context"
	"encoding/json"
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

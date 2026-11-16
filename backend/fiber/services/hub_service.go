package services

import (
	"context"
	"encoding/json"
	"strings"
	"sync"
	"time"

	"github.com/velostream/fiber/models"
)

const clientSendBufferSize = 64

type Client struct {
	ChannelID string
	UserID    string
	Username  string
	Send      chan []byte
}

func NewClient(channelID, userID, username string) *Client {
	return &Client{
		ChannelID: channelID,
		UserID:    userID,
		Username:  username,
		Send:      make(chan []byte, clientSendBufferSize),
	}
}

type eventKind uint8

const (
	eventRegister eventKind = iota
	eventUnregister
	eventBroadcast
	eventEvictUser
	eventRoomSize
	eventSendToUser
)

type hubEvent struct {
	kind      eventKind
	client    *Client
	channelID string
	userID    string
	reason    string
	data      []byte
	ack       chan struct{}
	sizeReply chan int
}

// HubService manages WebSocket rooms and client connections inside a single actor goroutine.
type HubService struct {
	events      chan hubEvent
	done        chan struct{}
	snapMu      sync.RWMutex
	snapshots   map[string][]byte
	freezeMu    sync.RWMutex
	frozenRooms map[string]bool
	slowMu      sync.RWMutex
	slowRooms   map[string]int
	userMsgMu   sync.Mutex
	lastUserMsg map[string]time.Time
}

func NewHubService() *HubService {
	return &HubService{
		events:      make(chan hubEvent, 256),
		done:        make(chan struct{}),
		snapshots:   make(map[string][]byte),
		frozenRooms: make(map[string]bool),
		slowRooms:   make(map[string]int),
		lastUserMsg: make(map[string]time.Time),
	}
}

func (h *HubService) SetRoomSlowMode(channelID string, enabled bool, cooldownSeconds int) {
	h.slowMu.Lock()
	defer h.slowMu.Unlock()
	clean := strings.ToLower(strings.TrimSpace(channelID))
	if clean == "" {
		return
	}
	if enabled {
		if cooldownSeconds <= 0 {
			cooldownSeconds = 3
		}
		h.slowRooms[clean] = cooldownSeconds
	} else {
		delete(h.slowRooms, clean)
	}
}

func (h *HubService) IsRoomSlowMode(channelID string) bool {
	h.slowMu.RLock()
	defer h.slowMu.RUnlock()
	clean := strings.ToLower(strings.TrimSpace(channelID))
	return h.slowRooms[clean] > 0
}

func (h *HubService) GetRoomSlowModeCooldown(channelID string) int {
	h.slowMu.RLock()
	defer h.slowMu.RUnlock()
	clean := strings.ToLower(strings.TrimSpace(channelID))
	cd := h.slowRooms[clean]
	if cd <= 0 {
		return 3
	}
	return cd
}

func (h *HubService) CheckAndRecordUserMessage(channelID, userID string, cooldown time.Duration) bool {
	h.userMsgMu.Lock()
	defer h.userMsgMu.Unlock()
	clean := strings.ToLower(strings.TrimSpace(channelID))
	user := strings.ToLower(strings.TrimSpace(userID))
	if clean == "" || user == "" {
		return true
	}
	key := clean + ":" + user
	now := time.Now()
	if last, exists := h.lastUserMsg[key]; exists {
		if now.Sub(last) < cooldown {
			return false
		}
	}
	h.lastUserMsg[key] = now
	if len(h.lastUserMsg) > 5000 {
		for k, t := range h.lastUserMsg {
			if now.Sub(t) > 5*time.Minute {
				delete(h.lastUserMsg, k)
			}
		}
	}
	return true
}

func (h *HubService) SetRoomFrozen(channelID string, isFrozen bool) {
	h.freezeMu.Lock()
	defer h.freezeMu.Unlock()
	clean := strings.ToLower(strings.TrimSpace(channelID))
	if clean == "" {
		return
	}
	if isFrozen {
		h.frozenRooms[clean] = true
	} else {
		delete(h.frozenRooms, clean)
	}
}

func (h *HubService) IsRoomFrozen(channelID string) bool {
	h.freezeMu.RLock()
	defer h.freezeMu.RUnlock()
	clean := strings.ToLower(strings.TrimSpace(channelID))
	return h.frozenRooms[clean]
}

func (h *HubService) SaveSnapshot(channelID string, frameBytes []byte) {
	h.snapMu.Lock()
	defer h.snapMu.Unlock()
	h.snapshots[channelID] = frameBytes
}

func (h *HubService) DeleteSnapshot(channelID string) {
	h.snapMu.Lock()
	defer h.snapMu.Unlock()
	delete(h.snapshots, channelID)
}

func (h *HubService) GetAllSnapshots() [][]byte {
	h.snapMu.RLock()
	defer h.snapMu.RUnlock()
	res := make([][]byte, 0, len(h.snapshots))
	for _, snap := range h.snapshots {
		res = append(res, snap)
	}
	return res
}

func (h *HubService) Run(ctx context.Context) {
	defer close(h.done)
	rooms := make(map[string]map[*Client]struct{})

	removeClient := func(c *Client) {
		clients, ok := rooms[c.ChannelID]
		if !ok {
			return
		}
		if _, exists := clients[c]; !exists {
			return
		}
		delete(clients, c)
		close(c.Send)
		if len(clients) == 0 {
			delete(rooms, c.ChannelID)
		}
	}

	for {
		select {
		case <-ctx.Done():
			for chID, clients := range rooms {
				for c := range clients {
					delete(clients, c)
					close(c.Send)
				}
				delete(rooms, chID)
			}
			return

		case ev := <-h.events:
			switch ev.kind {
			case eventRegister:
				clients, ok := rooms[ev.client.ChannelID]
				if !ok {
					clients = make(map[*Client]struct{})
					rooms[ev.client.ChannelID] = clients
				}
				clients[ev.client] = struct{}{}
				if ev.ack != nil {
					close(ev.ack)
				}

			case eventUnregister:
				removeClient(ev.client)
				if ev.ack != nil {
					close(ev.ack)
				}

			case eventBroadcast:
				clients := rooms[ev.channelID]
				for c := range clients {
					select {
					case c.Send <- ev.data:
					default:
						// Evict stalled clients instead of blocking room broadcasts.
						removeClient(c)
					}
				}

			case eventEvictUser:
				clients := rooms[ev.channelID]
				if len(clients) == 0 {
					continue
				}
				banFrame, err := json.Marshal(models.WsFrame{
					Type: models.FrameTypeModerationBanned,
					Payload: map[string]string{
						"channelId": ev.channelID,
						"userId":    ev.userID,
						"reason":    ev.reason,
					},
				})
				var evictedClients []*Client
				for c := range clients {
					if c.UserID == ev.userID || strings.EqualFold(c.Username, ev.userID) {
						if err == nil {
							select {
							case c.Send <- banFrame:
							default:
							}
						}
						evictedClients = append(evictedClients, c)
					} else if err == nil {
						select {
						case c.Send <- banFrame:
						default:
						}
					}
				}
				for _, c := range evictedClients {
					removeClient(c)
				}

			case eventRoomSize:
				ev.sizeReply <- len(rooms[ev.channelID])

			case eventSendToUser:
				clients := rooms[ev.channelID]
				for c := range clients {
					if c.UserID == ev.userID || strings.EqualFold(c.Username, ev.userID) {
						select {
						case c.Send <- ev.data:
						default:
							removeClient(c)
						}
					}
				}
			}
		}
	}
}

func (h *HubService) Register(c *Client) {
	ack := make(chan struct{})
	select {
	case h.events <- hubEvent{kind: eventRegister, client: c, ack: ack}:
	case <-h.done:
		return
	}
	select {
	case <-ack:
	case <-h.done:
	}
}

func (h *HubService) Unregister(c *Client) {
	ack := make(chan struct{})
	select {
	case h.events <- hubEvent{kind: eventUnregister, client: c, ack: ack}:
	case <-h.done:
		return
	}
	select {
	case <-ack:
	case <-h.done:
	}
}

func (h *HubService) Broadcast(channelID string, data []byte) {
	select {
	case h.events <- hubEvent{kind: eventBroadcast, channelID: channelID, data: data}:
	case <-h.done:
	}
}

func (h *HubService) EvictUser(channelID, userID, reason string) {
	select {
	case h.events <- hubEvent{kind: eventEvictUser, channelID: channelID, userID: userID, reason: reason}:
	case <-h.done:
	}
}

func (h *HubService) SendToUser(channelID, userID string, data []byte) {
	select {
	case h.events <- hubEvent{kind: eventSendToUser, channelID: channelID, userID: userID, data: data}:
	case <-h.done:
	}
}

func (h *HubService) RoomSize(channelID string) int {
	reply := make(chan int, 1)
	select {
	case h.events <- hubEvent{kind: eventRoomSize, channelID: channelID, sizeReply: reply}:
	case <-h.done:
		return 0
	}
	select {
	case n := <-reply:
		return n
	case <-h.done:
		return 0
	}
}

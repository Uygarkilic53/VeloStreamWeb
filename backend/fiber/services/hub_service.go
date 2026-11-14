package services

import (
	"context"
	"encoding/json"
	"sync"

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
	events    chan hubEvent
	done      chan struct{}
	snapMu    sync.RWMutex
	snapshots map[string][]byte
}

func NewHubService() *HubService {
	return &HubService{
		events:    make(chan hubEvent, 256),
		done:      make(chan struct{}),
		snapshots: make(map[string][]byte),
	}
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
				for c := range clients {
					if c.UserID != ev.userID {
						continue
					}
					if err == nil {
						select {
						case c.Send <- banFrame:
						default:
						}
					}
					removeClient(c)
				}

			case eventRoomSize:
				ev.sizeReply <- len(rooms[ev.channelID])
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

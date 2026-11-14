package models

import (
	"context"
	"crypto/subtle"
	"errors"
	"sync"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

var (
	ErrChannelNotFound = errors.New("channel not found")
)

type StreamRepository interface {
	ValidateStreamKey(ctx context.Context, slug string, streamKey string) (bool, error)
	SetChannelLive(ctx context.Context, slug string, isLive bool) (string, error)
	CreateStreamSession(ctx context.Context, channelID string) (string, error)
	EndStreamSession(ctx context.Context, channelID string) error
}

type StreamModel struct {
	pool *pgxpool.Pool
}

func NewStreamModel(pool *pgxpool.Pool) *StreamModel {
	return &StreamModel{pool: pool}
}

func (m *StreamModel) ValidateStreamKey(ctx context.Context, slug string, streamKey string) (bool, error) {
	if m.pool == nil {
		return false, errors.New("database pool is not initialized")
	}
	var storedKey string
	err := m.pool.QueryRow(ctx, "SELECT stream_key FROM channels WHERE slug = $1", slug).Scan(&storedKey)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return subtle.ConstantTimeCompare([]byte(storedKey), []byte(streamKey)) == 1, nil
}

func (m *StreamModel) SetChannelLive(ctx context.Context, slug string, isLive bool) (string, error) {
	if m.pool == nil {
		return "", errors.New("database pool is not initialized")
	}
	var channelID string
	err := m.pool.QueryRow(ctx,
		"UPDATE channels SET is_live = $1, updated_at = $2 WHERE slug = $3 RETURNING id",
		isLive, time.Now().UTC(), slug,
	).Scan(&channelID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return "", ErrChannelNotFound
		}
		return "", err
	}
	return channelID, nil
}

func (m *StreamModel) CreateStreamSession(ctx context.Context, channelID string) (string, error) {
	if m.pool == nil {
		return "", errors.New("database pool is not initialized")
	}
	now := time.Now().UTC()
	// Close any unfinalized stale session for this channel
	_, _ = m.pool.Exec(ctx,
		"UPDATE stream_sessions SET ended_at = $1 WHERE channel_id = $2 AND ended_at IS NULL",
		now, channelID,
	)

	sessionID := uuid.New().String()
	_, err := m.pool.Exec(ctx,
		"INSERT INTO stream_sessions (id, channel_id, started_at, peak_viewer) VALUES ($1, $2, $3, 0)",
		sessionID, channelID, now,
	)
	if err != nil {
		return "", err
	}
	return sessionID, nil
}

func (m *StreamModel) EndStreamSession(ctx context.Context, channelID string) error {
	if m.pool == nil {
		return errors.New("database pool is not initialized")
	}
	now := time.Now().UTC()
	_, err := m.pool.Exec(ctx,
		"UPDATE stream_sessions SET ended_at = $1 WHERE channel_id = $2 AND ended_at IS NULL",
		now, channelID,
	)
	return err
}

// MockStreamRepository provides an in-memory thread-safe StreamRepository for unit and integration testing.
type MockStreamRepository struct {
	mu             sync.RWMutex
	Channels       map[string]MockChannel
	Sessions       []MockSession
	ValidateKeyErr error
	SetLiveErr     error
	CreateSessErr  error
	EndSessErr     error
}

type MockChannel struct {
	ID        string
	StreamKey string
	IsLive    bool
}

type MockSession struct {
	ID        string
	ChannelID string
	StartedAt time.Time
	EndedAt   *time.Time
}

func NewMockStreamRepository() *MockStreamRepository {
	return &MockStreamRepository{
		Channels: make(map[string]MockChannel),
		Sessions: make([]MockSession, 0),
	}
}

func (m *MockStreamRepository) ValidateStreamKey(_ context.Context, slug string, streamKey string) (bool, error) {
	m.mu.RLock()
	defer m.mu.RUnlock()
	if m.ValidateKeyErr != nil {
		return false, m.ValidateKeyErr
	}
	ch, ok := m.Channels[slug]
	if !ok {
		return false, nil
	}
	return subtle.ConstantTimeCompare([]byte(ch.StreamKey), []byte(streamKey)) == 1, nil
}

func (m *MockStreamRepository) SetChannelLive(_ context.Context, slug string, isLive bool) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.SetLiveErr != nil {
		return "", m.SetLiveErr
	}
	ch, ok := m.Channels[slug]
	if !ok {
		return "", ErrChannelNotFound
	}
	ch.IsLive = isLive
	m.Channels[slug] = ch
	return ch.ID, nil
}

func (m *MockStreamRepository) CreateStreamSession(_ context.Context, channelID string) (string, error) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.CreateSessErr != nil {
		return "", m.CreateSessErr
	}
	now := time.Now().UTC()
	for i := range m.Sessions {
		if m.Sessions[i].ChannelID == channelID && m.Sessions[i].EndedAt == nil {
			m.Sessions[i].EndedAt = &now
		}
	}
	sessID := uuid.New().String()
	m.Sessions = append(m.Sessions, MockSession{
		ID:        sessID,
		ChannelID: channelID,
		StartedAt: now,
	})
	return sessID, nil
}

func (m *MockStreamRepository) EndStreamSession(_ context.Context, channelID string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.EndSessErr != nil {
		return m.EndSessErr
	}
	now := time.Now().UTC()
	for i := range m.Sessions {
		if m.Sessions[i].ChannelID == channelID && m.Sessions[i].EndedAt == nil {
			m.Sessions[i].EndedAt = &now
		}
	}
	return nil
}

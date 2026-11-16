package models

import (
	"context"
	"database/sql"
	"errors"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"
)

// ChatModel wraps pgxpool access to tables owned by backend/fastify/prisma.
// Never add SQL DDL migrations here; Prisma owns all PostgreSQL schema definitions.
type ChatModel struct {
	pool *pgxpool.Pool
}

func NewChatModel(pool *pgxpool.Pool) *ChatModel {
	return &ChatModel{pool: pool}
}

func (m *ChatModel) Ping(ctx context.Context) error {
	if m == nil || m.pool == nil {
		return nil
	}
	return m.pool.Ping(ctx)
}

func (m *ChatModel) Close() {
	if m == nil || m.pool == nil {
		return
	}
	m.pool.Close()
}

// ResolveChannel returns id, slug, ownerId for a channel slug or channel id.
func (m *ChatModel) ResolveChannel(ctx context.Context, identifier string) (string, string, string, error) {
	if m == nil || m.pool == nil || strings.TrimSpace(identifier) == "" {
		return identifier, identifier, "", nil
	}
	clean := strings.TrimPrefix(strings.TrimSpace(identifier), "@")
	var id, slug, ownerID string
	err := m.pool.QueryRow(ctx, `
		SELECT id, slug, owner_id FROM channels
		WHERE id = $1 OR LOWER(slug) = LOWER($1)
		LIMIT 1
	`, clean).Scan(&id, &slug, &ownerID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return clean, clean, "", nil
		}
		return "", "", "", err
	}
	return id, slug, ownerID, nil
}

// ResolveUser returns id, username for a user id or username.
func (m *ChatModel) ResolveUser(ctx context.Context, identifier string) (string, string, error) {
	if m == nil || m.pool == nil || strings.TrimSpace(identifier) == "" {
		return identifier, identifier, nil
	}
	clean := strings.TrimPrefix(strings.TrimSpace(identifier), "@")
	var id, username string
	err := m.pool.QueryRow(ctx, `
		SELECT id, username FROM users
		WHERE id = $1 OR LOWER(username) = LOWER($1)
		LIMIT 1
	`, clean).Scan(&id, &username)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return clean, clean, nil
		}
		return "", "", err
	}
	return id, username, nil
}

// GetUserRole returns "Creator", "Moderator", or "User" for a user in a channel.
func (m *ChatModel) GetUserRole(ctx context.Context, channelID, userID string) (string, error) {
	if m == nil || m.pool == nil || channelID == "" || userID == "" {
		return "User", nil
	}
	var ownerID string
	err := m.pool.QueryRow(ctx, `SELECT owner_id FROM channels WHERE id = $1 OR LOWER(slug) = LOWER($1)`, channelID).Scan(&ownerID)
	if err == nil && ownerID == userID {
		return "Creator", nil
	}

	var exists bool
	err = m.pool.QueryRow(ctx, `
		SELECT EXISTS(
			SELECT 1 FROM channel_moderators cm
			JOIN channels c ON c.id = cm.channel_id
			WHERE (cm.channel_id = $1 OR LOWER(c.slug) = LOWER($1)) AND cm.user_id = $2
		)
	`, channelID, userID).Scan(&exists)
	if err == nil && exists {
		return "Moderator", nil
	}

	return "User", nil
}

// IsUserMuted checks if the user is currently silenced in the channel.
func (m *ChatModel) IsUserMuted(ctx context.Context, channelID, userID string) (bool, *time.Time, string, error) {
	if m == nil || m.pool == nil || strings.TrimSpace(channelID) == "" || strings.TrimSpace(userID) == "" {
		return false, nil, "", nil
	}
	ch := strings.TrimPrefix(strings.TrimSpace(channelID), "@")
	usr := strings.TrimPrefix(strings.TrimSpace(userID), "@")

	var expiresAt *time.Time
	var reason string
	err := m.pool.QueryRow(ctx, `
		SELECT cm.expires_at, cm.reason
		FROM channel_mutes cm
		LEFT JOIN channels c ON c.id = cm.channel_id
		LEFT JOIN users u ON u.id = cm.user_id
		WHERE (cm.channel_id = $1 OR LOWER(cm.channel_id) = LOWER($1) OR (c.slug IS NOT NULL AND LOWER(c.slug) = LOWER($1)))
		  AND (cm.user_id = $2 OR LOWER(cm.user_id) = LOWER($2) OR (u.username IS NOT NULL AND LOWER(u.username) = LOWER($2)))
		  AND (cm.expires_at IS NULL OR cm.expires_at > (NOW() AT TIME ZONE 'UTC') OR cm.expires_at > NOW())
		ORDER BY cm.created_at DESC
		LIMIT 1
	`, ch, usr).Scan(&expiresAt, &reason)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil, "", nil
		}
		return false, nil, "", err
	}
	if expiresAt != nil && expiresAt.UTC().Before(time.Now().UTC()) {
		return false, nil, "", nil
	}
	return true, expiresAt, reason, nil
}

// IsUserBanned checks if the user is currently banned in the channel.
func (m *ChatModel) IsUserBanned(ctx context.Context, channelID, userID string) (bool, string, error) {
	if m == nil || m.pool == nil || strings.TrimSpace(channelID) == "" || strings.TrimSpace(userID) == "" {
		return false, "", nil
	}
	ch := strings.TrimPrefix(strings.TrimSpace(channelID), "@")
	usr := strings.TrimPrefix(strings.TrimSpace(userID), "@")

	var expiresAt *time.Time
	var reason string
	err := m.pool.QueryRow(ctx, `
		SELECT cb.expires_at, cb.reason
		FROM channel_bans cb
		LEFT JOIN channels c ON c.id = cb.channel_id
		LEFT JOIN users u ON u.id = cb.user_id
		WHERE (cb.channel_id = $1 OR LOWER(cb.channel_id) = LOWER($1) OR (c.slug IS NOT NULL AND LOWER(c.slug) = LOWER($1)))
		  AND (cb.user_id = $2 OR LOWER(cb.user_id) = LOWER($2) OR (u.username IS NOT NULL AND LOWER(u.username) = LOWER($2)))
		  AND (cb.expires_at IS NULL OR cb.expires_at > (NOW() AT TIME ZONE 'UTC') OR cb.expires_at > NOW())
		ORDER BY cb.created_at DESC
		LIMIT 1
	`, ch, usr).Scan(&expiresAt, &reason)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, "", nil
		}
		return false, "", err
	}
	if expiresAt != nil && expiresAt.UTC().Before(time.Now().UTC()) {
		return false, "", nil
	}
	return true, reason, nil
}

// ClearChannelMessages deletes all chat messages for a channel (by channel ID or slug).
func (m *ChatModel) ClearChannelMessages(ctx context.Context, channelID string) error {
	if m == nil || m.pool == nil || strings.TrimSpace(channelID) == "" {
		return nil
	}
	cleanID := strings.TrimSpace(channelID)
	_, err := m.pool.Exec(ctx, `
		DELETE FROM chat_messages
		WHERE channel_id = $1
		   OR channel_id IN (SELECT id FROM channels WHERE LOWER(slug) = LOWER($1))
	`, cleanID)
	return err
}

// SaveMessage inserts a chat message record into chat_messages.
func (m *ChatModel) SaveMessage(ctx context.Context, msg *ChatMessage) error {
	if m == nil || m.pool == nil {
		return nil
	}
	if msg.ID == "" {
		msg.ID = "msg_" + uuid.NewString()
	}
	createdAt, err := time.Parse(time.RFC3339, msg.CreatedAt)
	if err != nil {
		createdAt = time.Now().UTC()
	}
	msgType := msg.MessageType
	if msgType == "" {
		msgType = "text"
	}
	_, err = m.pool.Exec(ctx, `
		INSERT INTO chat_messages (id, channel_id, user_id, content, message_type, gif_url, is_deleted, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
	`, msg.ID, msg.ChannelID, msg.UserID, msg.Content, msgType, msg.GifURL, msg.IsDeleted, createdAt)
	return err
}

// GetRecentMessages loads the recent chat history for a channel in chronological order.
func (m *ChatModel) GetRecentMessages(ctx context.Context, channelID string, limit int) ([]ChatMessage, error) {
	if m == nil || m.pool == nil {
		return nil, nil
	}
	if limit <= 0 || limit > 100 {
		limit = 50
	}
	rows, err := m.pool.Query(ctx, `
		SELECT m.id, m.channel_id, m.user_id, u.username, u.avatar_url,
		       CASE
		         WHEN c.owner_id = m.user_id THEN 'Creator'
		         WHEN cm.user_id IS NOT NULL THEN 'Moderator'
		         ELSE 'User'
		       END AS role,
		       m.content, m.message_type, m.gif_url, m.is_deleted, m.created_at
		FROM chat_messages m
		JOIN users u ON u.id = m.user_id
		JOIN channels c ON c.id = m.channel_id
		LEFT JOIN channel_moderators cm ON cm.channel_id = m.channel_id AND cm.user_id = m.user_id
		WHERE m.channel_id = $1 OR LOWER(c.slug) = LOWER($1)
		ORDER BY m.created_at DESC
		LIMIT $2
	`, channelID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var descMessages []ChatMessage
	for rows.Next() {
		var item ChatMessage
		var avatar sql.NullString
		var gifURL sql.NullString
		var createdAt time.Time
		if err := rows.Scan(
			&item.ID,
			&item.ChannelID,
			&item.UserID,
			&item.Username,
			&avatar,
			&item.Role,
			&item.Content,
			&item.MessageType,
			&gifURL,
			&item.IsDeleted,
			&createdAt,
		); err != nil {
			return nil, err
		}
		if avatar.Valid && avatar.String != "" {
			item.AvatarURL = &avatar.String
		}
		if gifURL.Valid && gifURL.String != "" {
			item.GifURL = &gifURL.String
		}
		item.CreatedAt = createdAt.UTC().Format(time.RFC3339)
		descMessages = append(descMessages, item)
	}

	messages := make([]ChatMessage, len(descMessages))
	for i, msg := range descMessages {
		messages[len(descMessages)-1-i] = msg
	}
	return messages, nil
}

// DeleteMessage soft deletes a message and records who deleted it.
func (m *ChatModel) DeleteMessage(ctx context.Context, messageID, deletedBy string) (string, error) {
	if m == nil || m.pool == nil {
		return "", nil
	}
	var channelID string
	err := m.pool.QueryRow(ctx, `
		UPDATE chat_messages
		SET is_deleted = true, deleted_by = $1, deleted_at = NOW()
		WHERE id = $2
		RETURNING channel_id
	`, deletedBy, messageID).Scan(&channelID)
	return channelID, err
}

// GetMessageAuthorAndRole returns author details for permission verification.
func (m *ChatModel) GetMessageAuthorAndRole(ctx context.Context, messageID string) (string, string, string, bool, error) {
	if m == nil || m.pool == nil {
		return "", "", "User", false, nil
	}
	var channelID, authorID string
	var isDeleted bool
	err := m.pool.QueryRow(ctx, `
		SELECT channel_id, user_id, is_deleted
		FROM chat_messages
		WHERE id = $1
	`, messageID).Scan(&channelID, &authorID, &isDeleted)
	if err != nil {
		return "", "", "", false, err
	}
	role, _ := m.GetUserRole(ctx, channelID, authorID)
	return channelID, authorID, role, isDeleted, nil
}

// MuteUser adds or updates a channel mute record.
func (m *ChatModel) MuteUser(ctx context.Context, channelID, userID, issuedBy, reason string, expiresAt *time.Time) error {
	if m == nil || m.pool == nil {
		return nil
	}
	cID, _, _, err := m.ResolveChannel(ctx, channelID)
	if err == nil && cID != "" {
		channelID = cID
	}
	uID, _, err := m.ResolveUser(ctx, userID)
	if err == nil && uID != "" {
		userID = uID
	}
	actorID, _, err := m.ResolveUser(ctx, issuedBy)
	if err == nil && actorID != "" {
		issuedBy = actorID
	}

	id := "mute_" + uuid.NewString()
	_, err = m.pool.Exec(ctx, `
		INSERT INTO channel_mutes (id, channel_id, user_id, issued_by, reason, expires_at, created_at)
		VALUES ($1, $2, $3, $4, $5, $6, NOW())
		ON CONFLICT (channel_id, user_id)
		DO UPDATE SET issued_by = EXCLUDED.issued_by, reason = EXCLUDED.reason, expires_at = EXCLUDED.expires_at
	`, id, channelID, userID, issuedBy, reason, expiresAt)
	return err
}

// UnmuteUser removes a channel mute record.
func (m *ChatModel) UnmuteUser(ctx context.Context, channelID, userID string) error {
	if m == nil || m.pool == nil {
		return nil
	}
	ch := strings.TrimPrefix(strings.TrimSpace(channelID), "@")
	usr := strings.TrimPrefix(strings.TrimSpace(userID), "@")
	_, err := m.pool.Exec(ctx, `
		DELETE FROM channel_mutes
		WHERE (channel_id = $1 OR LOWER(channel_id) = LOWER($1) OR channel_id IN (SELECT id FROM channels WHERE LOWER(slug) = LOWER($1)))
		  AND (user_id = $2 OR LOWER(user_id) = LOWER($2) OR user_id IN (SELECT id FROM users WHERE LOWER(username) = LOWER($2)))
	`, ch, usr)
	return err
}

// CreateWarning records a warning issued to a user.
func (m *ChatModel) CreateWarning(ctx context.Context, channelID, userID, issuedBy, reason string) error {
	if m == nil || m.pool == nil {
		return nil
	}
	id := "warn_" + uuid.NewString()
	_, err := m.pool.Exec(ctx, `
		INSERT INTO channel_warnings (id, channel_id, user_id, issued_by, reason, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
	`, id, channelID, userID, issuedBy, reason)
	return err
}

// BanUser adds or updates a channel ban record.
func (m *ChatModel) BanUser(ctx context.Context, channelID, userID, issuedBy, reason string) error {
	if m == nil || m.pool == nil {
		return nil
	}
	cID, _, _, err := m.ResolveChannel(ctx, channelID)
	if err == nil && cID != "" {
		channelID = cID
	}
	uID, _, err := m.ResolveUser(ctx, userID)
	if err == nil && uID != "" {
		userID = uID
	}
	actorID, _, err := m.ResolveUser(ctx, issuedBy)
	if err == nil && actorID != "" {
		issuedBy = actorID
	}

	id := "ban_" + uuid.NewString()
	_, err = m.pool.Exec(ctx, `
		INSERT INTO channel_bans (id, channel_id, user_id, issued_by, reason, created_at)
		VALUES ($1, $2, $3, $4, $5, NOW())
		ON CONFLICT (channel_id, user_id)
		DO UPDATE SET reason = EXCLUDED.reason, issued_by = EXCLUDED.issued_by
	`, id, channelID, userID, issuedBy, reason)
	return err
}

// UnbanUser removes a channel ban record.
func (m *ChatModel) UnbanUser(ctx context.Context, channelID, userID string) error {
	if m == nil || m.pool == nil {
		return nil
	}
	ch := strings.TrimPrefix(strings.TrimSpace(channelID), "@")
	usr := strings.TrimPrefix(strings.TrimSpace(userID), "@")
	_, err := m.pool.Exec(ctx, `
		DELETE FROM channel_bans
		WHERE (channel_id = $1 OR LOWER(channel_id) = LOWER($1) OR channel_id IN (SELECT id FROM channels WHERE LOWER(slug) = LOWER($1)))
		  AND (user_id = $2 OR LOWER(user_id) = LOWER($2) OR user_id IN (SELECT id FROM users WHERE LOWER(username) = LOWER($2)))
	`, ch, usr)
	return err
}

// AddModerator assigns a moderator in a channel.
func (m *ChatModel) AddModerator(ctx context.Context, channelID, userID, assignedBy string) error {
	if m == nil || m.pool == nil {
		return nil
	}
	id := "cmod_" + uuid.NewString()
	_, err := m.pool.Exec(ctx, `
		INSERT INTO channel_moderators (id, channel_id, user_id, assigned_by, created_at)
		VALUES ($1, $2, $3, $4, NOW())
		ON CONFLICT (channel_id, user_id) DO NOTHING
	`, id, channelID, userID, assignedBy)
	return err
}

// RemoveModerator removes a moderator from a channel.
func (m *ChatModel) RemoveModerator(ctx context.Context, channelID, userID string) error {
	if m == nil || m.pool == nil {
		return nil
	}
	_, err := m.pool.Exec(ctx, `DELETE FROM channel_moderators WHERE channel_id = $1 AND user_id = $2`, channelID, userID)
	return err
}

// FindUserByUsername looks up a user's id, clean username, and avatar URL.
func (m *ChatModel) FindUserByUsername(ctx context.Context, username string) (string, string, string, error) {
	if m == nil || m.pool == nil {
		return "", username, "", nil
	}
	var id, cleanUsername string
	var avatar sql.NullString
	err := m.pool.QueryRow(ctx, `
		SELECT id, username, avatar_url FROM users
		WHERE LOWER(username) = LOWER($1)
		LIMIT 1
	`, username).Scan(&id, &cleanUsername, &avatar)
	if err != nil {
		return "", "", "", err
	}
	return id, cleanUsername, avatar.String, nil
}

// GetChannelSlowMode returns whether slow mode is enabled for a channel.
func (m *ChatModel) GetChannelSlowMode(ctx context.Context, identifier string) (bool, error) {
	if m == nil || m.pool == nil || strings.TrimSpace(identifier) == "" {
		return false, nil
	}
	clean := strings.TrimPrefix(strings.TrimSpace(identifier), "@")
	var slowMode bool
	err := m.pool.QueryRow(ctx, `
		SELECT slow_mode FROM channels
		WHERE id = $1 OR LOWER(slug) = LOWER($1)
		LIMIT 1
	`, clean).Scan(&slowMode)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return slowMode, nil
}

// UpdateChannelSlowMode updates slow_mode in the channels table.
func (m *ChatModel) UpdateChannelSlowMode(ctx context.Context, identifier string, slowMode bool) error {
	if m == nil || m.pool == nil || strings.TrimSpace(identifier) == "" {
		return nil
	}
	clean := strings.TrimPrefix(strings.TrimSpace(identifier), "@")
	_, err := m.pool.Exec(ctx, `
		UPDATE channels
		SET slow_mode = $1
		WHERE id = $2 OR LOWER(slug) = LOWER($2)
	`, slowMode, clean)
	return err
}

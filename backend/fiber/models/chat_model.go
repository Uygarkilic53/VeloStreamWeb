package models

import (
	"context"

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
	return m.pool.Ping(ctx)
}

func (m *ChatModel) Close() {
	m.pool.Close()
}

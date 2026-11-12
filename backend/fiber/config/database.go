package config

import (
	"context"

	"github.com/jackc/pgx/v5/pgxpool"
)

// ConnectDatabase creates a PostgreSQL connection pool using pgxpool.
func ConnectDatabase(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	return pgxpool.New(ctx, databaseURL)
}

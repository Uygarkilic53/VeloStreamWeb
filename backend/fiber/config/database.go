package config

import (
	"context"
	"fmt"
	"net/url"
	"strconv"
	"strings"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
)

var prismaKeys = []string{
	"connection_limit",
	"pool_timeout",
	"socket_timeout",
	"statement_cache_size",
	"pgbouncer",
	"sslidentity",
	"sslaccept",
}

// NormalizeRuntimeParams cleans up Prisma-specific parameters that pgx would
// otherwise send as PostgreSQL configuration parameters (causing SQLSTATE 42704).
func NormalizeRuntimeParams(params map[string]string) {
	if params == nil {
		return
	}

	// Map schema to search_path (case-insensitive check for schema)
	for k, v := range params {
		if strings.EqualFold(k, "schema") {
			trimmedSchema := strings.TrimSpace(v)
			if trimmedSchema != "" {
				hasSearchPath := false
				for sk, sv := range params {
					if strings.EqualFold(sk, "search_path") && strings.TrimSpace(sv) != "" {
						hasSearchPath = true
						break
					}
				}
				if !hasSearchPath {
					params["search_path"] = trimmedSchema
				}
			}
			delete(params, k)
		}
	}

	// Delete all Prisma-specific keys (case-insensitive)
	for _, pKey := range prismaKeys {
		for k := range params {
			if strings.EqualFold(k, pKey) {
				delete(params, k)
			}
		}
	}
}

// ParseDatabaseConfig parses the database URL, maps connection_limit to cfg.MaxConns
// if positive and not already set via pool_max_conns, and normalizes RuntimeParams.
func ParseDatabaseConfig(databaseURL string) (*pgxpool.Config, error) {
	cfg, err := pgxpool.ParseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("parse pgxpool config: %w", err)
	}

	if cfg.ConnConfig != nil && cfg.ConnConfig.RuntimeParams != nil {
		var rawLimit string
		hasLimit := false
		for k, v := range cfg.ConnConfig.RuntimeParams {
			if strings.EqualFold(k, "connection_limit") {
				rawLimit = v
				hasLimit = true
				break
			}
		}

		if hasLimit {
			if limit, parseErr := strconv.Atoi(strings.TrimSpace(rawLimit)); parseErr == nil && limit > 0 {
				hasPoolMaxConns := false
				if u, uErr := url.Parse(databaseURL); uErr == nil {
					for qk := range u.Query() {
						if strings.EqualFold(qk, "pool_max_conns") {
							hasPoolMaxConns = true
							break
						}
					}
				}
				if !hasPoolMaxConns && strings.Contains(strings.ToLower(databaseURL), "pool_max_conns") {
					hasPoolMaxConns = true
				}
				if !hasPoolMaxConns {
					cfg.MaxConns = int32(limit)
				}
			}
		}

		NormalizeRuntimeParams(cfg.ConnConfig.RuntimeParams)
	}

	return cfg, nil
}

// ConnectDatabase creates and validates a PostgreSQL connection pool using pgxpool.
// It parses the database URL, normalizes Prisma parameters, initializes the pool,
// and executes a fail-fast health check probe with a 5-second timeout.
func ConnectDatabase(ctx context.Context, databaseURL string) (*pgxpool.Pool, error) {
	if ctx == nil {
		ctx = context.Background()
	}

	cfg, err := ParseDatabaseConfig(databaseURL)
	if err != nil {
		return nil, fmt.Errorf("database config: %w", err)
	}

	pool, err := pgxpool.NewWithConfig(ctx, cfg)
	if err != nil {
		return nil, fmt.Errorf("create connection pool: %w", err)
	}

	pingCtx, cancel := context.WithTimeout(ctx, 5*time.Second)
	defer cancel()

	if err := pool.Ping(pingCtx); err != nil {
		pool.Close()
		return nil, fmt.Errorf("ping database: %w", err)
	}

	return pool, nil
}

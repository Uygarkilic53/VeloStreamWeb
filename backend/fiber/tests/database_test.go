package tests

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/velostream/fiber/config"
)

func TestNormalizeRuntimeParams_SchemaToSearchPath(t *testing.T) {
	params := map[string]string{
		"schema": "public",
	}
	config.NormalizeRuntimeParams(params)

	if val, ok := params["search_path"]; !ok || val != "public" {
		t.Fatalf("expected search_path to be 'public', got %q (ok=%v)", val, ok)
	}
	if _, ok := params["schema"]; ok {
		t.Fatalf("expected 'schema' to be removed from params")
	}
}

func TestNormalizeRuntimeParams_SearchPathPrecedence(t *testing.T) {
	params := map[string]string{
		"schema":      "public",
		"search_path": "custom_schema",
	}
	config.NormalizeRuntimeParams(params)

	if val := params["search_path"]; val != "custom_schema" {
		t.Fatalf("expected existing search_path to be preserved as 'custom_schema', got %q", val)
	}
	if _, ok := params["schema"]; ok {
		t.Fatalf("expected 'schema' to be removed from params")
	}
}

func TestNormalizeRuntimeParams_EmptySchema(t *testing.T) {
	params := map[string]string{
		"schema": "",
	}
	config.NormalizeRuntimeParams(params)

	if _, ok := params["search_path"]; ok {
		t.Fatalf("expected search_path not to be set for empty schema")
	}
	if _, ok := params["schema"]; ok {
		t.Fatalf("expected 'schema' to be removed from params")
	}

	// Also test whitespace-only schema
	paramsWhitespace := map[string]string{
		"schema": "   ",
	}
	config.NormalizeRuntimeParams(paramsWhitespace)
	if _, ok := paramsWhitespace["search_path"]; ok {
		t.Fatalf("expected search_path not to be set for whitespace-only schema")
	}
	if _, ok := paramsWhitespace["schema"]; ok {
		t.Fatalf("expected 'schema' to be removed from params")
	}
}

func TestNormalizeRuntimeParams_StripPrismaKeys(t *testing.T) {
	params := map[string]string{
		"connection_limit":     "10",
		"pool_timeout":         "5",
		"socket_timeout":       "3",
		"statement_cache_size": "100",
		"pgbouncer":            "true",
		"sslidentity":          "client.crt",
		"sslaccept":            "strict",
		"application_name":     "velostream_test",
	}

	config.NormalizeRuntimeParams(params)

	keysToCheck := []string{
		"connection_limit",
		"pool_timeout",
		"socket_timeout",
		"statement_cache_size",
		"pgbouncer",
		"sslidentity",
		"sslaccept",
	}
	for _, key := range keysToCheck {
		if _, ok := params[key]; ok {
			t.Fatalf("expected Prisma key %q to be deleted from params", key)
		}
	}

	if params["application_name"] != "velostream_test" {
		t.Fatalf("expected standard param application_name to be preserved, got %q", params["application_name"])
	}
}

func TestNormalizeRuntimeParams_NilSafety(t *testing.T) {
	defer func() {
		if r := recover(); r != nil {
			t.Fatalf("NormalizeRuntimeParams panicked on nil map: %v", r)
		}
	}()
	config.NormalizeRuntimeParams(nil)
}

func TestParseDatabaseConfig_ConnectionLimitMapping(t *testing.T) {
	url := "postgresql://postgres:secret@localhost:5432/velostream?connection_limit=25&schema=public&sslmode=disable"
	cfg, err := config.ParseDatabaseConfig(url)
	if err != nil {
		t.Fatalf("ParseDatabaseConfig returned error: %v", err)
	}

	if cfg.MaxConns != 25 {
		t.Fatalf("expected cfg.MaxConns to be 25 from connection_limit, got %d", cfg.MaxConns)
	}

	if cfg.ConnConfig.RuntimeParams["search_path"] != "public" {
		t.Fatalf("expected search_path to be 'public', got %q", cfg.ConnConfig.RuntimeParams["search_path"])
	}

	if _, ok := cfg.ConnConfig.RuntimeParams["schema"]; ok {
		t.Fatalf("expected schema to be deleted from RuntimeParams")
	}

	if _, ok := cfg.ConnConfig.RuntimeParams["connection_limit"]; ok {
		t.Fatalf("expected connection_limit to be deleted from RuntimeParams")
	}
}

func TestParseDatabaseConfig_PoolMaxConnsPriority(t *testing.T) {
	url := "postgresql://postgres:secret@localhost:5432/velostream?pool_max_conns=15&connection_limit=30&sslmode=disable"
	cfg, err := config.ParseDatabaseConfig(url)
	if err != nil {
		t.Fatalf("ParseDatabaseConfig returned error: %v", err)
	}

	if cfg.MaxConns != 15 {
		t.Fatalf("expected cfg.MaxConns to remain 15 from pool_max_conns, got %d", cfg.MaxConns)
	}
}

func TestParseDatabaseConfig_InvalidURL(t *testing.T) {
	_, err := config.ParseDatabaseConfig("://invalid-url-with-no-scheme")
	if err == nil {
		t.Fatalf("expected ParseDatabaseConfig to fail with invalid URL")
	}
}

func TestConnectDatabase_FailFastUnreachableDB(t *testing.T) {
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	// 127.0.0.1:54399 is unused on localhost and should fail fast
	unreachableURL := "postgresql://postgres:wrong_pass@127.0.0.1:54399/velostream?sslmode=disable&connect_timeout=1"
	pool, err := config.ConnectDatabase(ctx, unreachableURL)
	if err == nil {
		if pool != nil {
			pool.Close()
		}
		t.Fatalf("expected ConnectDatabase to fail fast on unreachable database, but succeeded")
	}
	if pool != nil {
		t.Fatalf("expected pool to be nil on failed connection")
	}
	if !strings.Contains(err.Error(), "ping database") {
		t.Logf("expected ping database error, got: %v", err)
	}
}

func TestNormalizeRuntimeParams_CaseInsensitivity(t *testing.T) {
	params := map[string]string{
		"SCHEMA":           "public",
		"Connection_Limit": "10",
		"Pool_Timeout":     "5",
		"PGbouncer":        "true",
	}
	config.NormalizeRuntimeParams(params)

	if val := params["search_path"]; val != "public" {
		t.Fatalf("expected search_path to be 'public', got %q", val)
	}
	if _, ok := params["SCHEMA"]; ok {
		t.Fatalf("expected uppercase 'SCHEMA' to be removed")
	}
	if _, ok := params["Connection_Limit"]; ok {
		t.Fatalf("expected 'Connection_Limit' to be removed")
	}
	if _, ok := params["Pool_Timeout"]; ok {
		t.Fatalf("expected 'Pool_Timeout' to be removed")
	}
	if _, ok := params["PGbouncer"]; ok {
		t.Fatalf("expected 'PGbouncer' to be removed")
	}
}

func TestNormalizeRuntimeParams_WhitespaceSearchPathOverridden(t *testing.T) {
	params := map[string]string{
		"schema":      "tenant_schema",
		"search_path": "   ",
	}
	config.NormalizeRuntimeParams(params)

	if val := params["search_path"]; val != "tenant_schema" {
		t.Fatalf("expected whitespace-only search_path to be overridden by schema, got %q", val)
	}
	if _, ok := params["schema"]; ok {
		t.Fatalf("expected 'schema' to be deleted")
	}
}

func TestParseDatabaseConfig_AllPrismaKeysInURL(t *testing.T) {
	url := "postgresql://postgres:secret@localhost:5432/velostream?schema=custom&connection_limit=8&pool_timeout=15&socket_timeout=10&statement_cache_size=50&pgbouncer=true&sslidentity=client.crt&sslaccept=strict"
	cfg, err := config.ParseDatabaseConfig(url)
	if err != nil {
		t.Fatalf("ParseDatabaseConfig returned error: %v", err)
	}

	if cfg.MaxConns != 8 {
		t.Fatalf("expected cfg.MaxConns to be 8, got %d", cfg.MaxConns)
	}

	if cfg.ConnConfig.RuntimeParams["search_path"] != "custom" {
		t.Fatalf("expected search_path 'custom', got %q", cfg.ConnConfig.RuntimeParams["search_path"])
	}

	for _, key := range []string{"schema", "connection_limit", "pool_timeout", "socket_timeout", "statement_cache_size", "pgbouncer", "sslidentity", "sslaccept"} {
		if _, exists := cfg.ConnConfig.RuntimeParams[key]; exists {
			t.Fatalf("expected Prisma key %q to be deleted from RuntimeParams", key)
		}
	}
}

func TestConnectDatabase_NilContextSafety(t *testing.T) {
	// Should not panic when nil context is supplied
	unreachableURL := "postgresql://postgres:wrong@127.0.0.1:54398/velostream?sslmode=disable&connect_timeout=1"
	pool, err := config.ConnectDatabase(nil, unreachableURL)
	if err == nil {
		if pool != nil {
			pool.Close()
		}
		t.Fatalf("expected error from unreachable DB")
	}
	if pool != nil {
		t.Fatalf("expected nil pool")
	}
}

func TestConnectDatabase_LivePostgresPrismaSchemaParam(t *testing.T) {
	// Tests that ?schema=public and prisma keys do NOT cause SQLSTATE 42704 on live postgres
	liveURL := "postgresql://postgres:1234@localhost:5432/velostream?schema=public&pool_timeout=10&connection_limit=5&sslmode=disable"
	ctx, cancel := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancel()

	pool, err := config.ConnectDatabase(ctx, liveURL)
	if err != nil {
		t.Skipf("Skipping live PostgreSQL check (not reachable or different credentials): %v", err)
		return
	}
	defer pool.Close()

	var searchPath string
	rowErr := pool.QueryRow(ctx, "SHOW search_path").Scan(&searchPath)
	if rowErr != nil {
		t.Fatalf("query SHOW search_path failed: %v", rowErr)
	}
	if !strings.Contains(searchPath, "public") {
		t.Fatalf("expected search_path to contain 'public', got %q", searchPath)
	}
}

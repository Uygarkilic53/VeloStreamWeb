package config

import (
	"errors"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

type Env struct {
	Host               string
	Port               int
	CorsOrigin         string
	DatabaseURL        string
	JWTIssuer          string
	JWTAudience        string
	JWTPublicKeyPEM    string
	MediaWebhookSecret string
	GiphyAPIKey        string
}

// ParseDotEnv parses `.env` text into a key/value map without mutating process state.
func ParseDotEnv(content string) map[string]string {
	parsed := make(map[string]string)
	for _, rawLine := range strings.Split(content, "\n") {
		line := strings.TrimSpace(strings.TrimSuffix(rawLine, "\r"))
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		if strings.HasPrefix(line, "export ") {
			line = strings.TrimSpace(strings.TrimPrefix(line, "export "))
		}
		eqIdx := strings.IndexByte(line, '=')
		if eqIdx <= 0 {
			continue
		}
		key := strings.TrimSpace(line[:eqIdx])
		if key == "" {
			continue
		}
		val := strings.TrimSpace(line[eqIdx+1:])
		if !strings.HasPrefix(val, `"`) && !strings.HasPrefix(val, `'`) {
			if commentIdx := strings.Index(val, " #"); commentIdx != -1 {
				val = strings.TrimSpace(val[:commentIdx])
			}
		}
		parsed[key] = stripQuotes(val)
	}
	return parsed
}

// LoadDotEnvFiles loads `.env` candidates in priority order without overriding
// environment variables already present in the OS/container environment.
func LoadDotEnvFiles(candidates ...string) {
	if len(candidates) == 0 {
		candidates = []string{
			".env",
			filepath.Join("..", ".env"),
			filepath.Join("..", "..", ".env"),
		}
	}

	preExisting := make(map[string]bool)
	for _, entry := range os.Environ() {
		if k, _, ok := strings.Cut(entry, "="); ok {
			preExisting[k] = true
		}
	}

	for _, filePath := range candidates {
		raw, err := os.ReadFile(filePath)
		if err != nil {
			continue
		}
		for key, value := range ParseDotEnv(string(raw)) {
			if preExisting[key] {
				continue
			}
			if _, exists := os.LookupEnv(key); !exists {
				_ = os.Setenv(key, value)
			}
		}
	}
}

// LoadFromEnv loads local `.env` files (if any) and validates the process environment.
func LoadFromEnv() (Env, error) {
	LoadDotEnvFiles()
	return ParseEnv(os.LookupEnv)
}

// ParseEnv parses and validates configuration from an injected lookup function.
func ParseEnv(lookup func(string) (string, bool)) (Env, error) {
	get := func(key string) string {
		val, _ := lookup(key)
		return strings.TrimSpace(val)
	}
	getOrDefault := func(key, fallback string) string {
		if val := get(key); val != "" {
			return val
		}
		return fallback
	}

	cfg := Env{
		Host:               getOrDefault("FIBER_HOST", "0.0.0.0"),
		CorsOrigin:         getOrDefault("CORS_ORIGIN", "http://localhost:5173"),
		DatabaseURL:        get("DATABASE_URL"),
		JWTIssuer:          getOrDefault("JWT_ISSUER", "velostream-fastify"),
		JWTAudience:        getOrDefault("JWT_AUDIENCE", "velostream-clients"),
		MediaWebhookSecret: get("MEDIA_WEBHOOK_SECRET"),
		GiphyAPIKey:        getOrDefault("GIPHY_DEVELOPERS_API", getOrDefault("GIPHY_API_KEY", "igSzLjA7q9mSr0QNgANOc6w6AqGOdqxt")),
	}

	portStr := get("FIBER_PORT")
	if portStr == "" {
		portStr = getOrDefault("PORT", "3002")
	}
	port, err := strconv.Atoi(portStr)
	if err != nil || port < 1 || port > 65535 {
		return Env{}, fmt.Errorf("invalid FIBER_PORT %q", portStr)
	}
	cfg.Port = port

	inlinePEM := get("JWT_PUBLIC_KEY_PEM")
	keyPath := get("JWT_PUBLIC_KEY_PATH")
	switch {
	case inlinePEM != "":
		cfg.JWTPublicKeyPEM = strings.ReplaceAll(inlinePEM, `\n`, "\n")
	case keyPath != "":
		raw, readErr := os.ReadFile(keyPath)
		if readErr != nil {
			if !errors.Is(readErr, os.ErrNotExist) {
				return Env{}, fmt.Errorf("read JWT_PUBLIC_KEY_PATH: %w", readErr)
			}
		} else {
			cfg.JWTPublicKeyPEM = string(raw)
		}
	}

	return cfg, nil
}

func stripQuotes(value string) string {
	if len(value) >= 2 {
		first := value[0]
		last := value[len(value)-1]
		if (first == '"' && last == '"') || (first == '\'' && last == '\'') {
			return value[1 : len(value)-1]
		}
	}
	return value
}

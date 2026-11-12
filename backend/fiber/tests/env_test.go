package tests

import (
	"testing"

	"github.com/velostream/fiber/config"
)

func TestParseDotEnv(t *testing.T) {
	parsed := config.ParseDotEnv(
		"# comment\n" +
			"DATABASE_URL=\"postgresql://postgres:secret@localhost:5432/velostream\"\n" +
			"export FIBER_PORT=3005\n" +
			"CORS_ORIGIN='http://localhost:5173'\n" +
			"MEDIA_WEBHOOK_SECRET=dev_secret # trailing comment\n",
	)
	if parsed["DATABASE_URL"] != "postgresql://postgres:secret@localhost:5432/velostream" {
		t.Fatalf("unexpected DATABASE_URL: %q", parsed["DATABASE_URL"])
	}
	if parsed["FIBER_PORT"] != "3005" {
		t.Fatalf("unexpected FIBER_PORT: %q", parsed["FIBER_PORT"])
	}
	if parsed["CORS_ORIGIN"] != "http://localhost:5173" {
		t.Fatalf("unexpected CORS_ORIGIN: %q", parsed["CORS_ORIGIN"])
	}
	if parsed["MEDIA_WEBHOOK_SECRET"] != "dev_secret" {
		t.Fatalf("unexpected MEDIA_WEBHOOK_SECRET: %q", parsed["MEDIA_WEBHOOK_SECRET"])
	}
}

func TestParseEnvDefaultsAndValidation(t *testing.T) {
	emptyLookup := func(string) (string, bool) { return "", false }
	cfg, err := config.ParseEnv(emptyLookup)
	if err != nil {
		t.Fatalf("expected empty env to use defaults, got: %v", err)
	}
	if cfg.Port != 3002 || cfg.Host != "0.0.0.0" || cfg.JWTIssuer != "velostream-fastify" {
		t.Fatalf("unexpected default config: %+v", cfg)
	}

	portFallbackLookup := func(key string) (string, bool) {
		if key == "PORT" {
			return "4100", true
		}
		if key == "JWT_PUBLIC_KEY_PEM" {
			return "LINE1\\nLINE2", true
		}
		return "", false
	}
	cfg2, err := config.ParseEnv(portFallbackLookup)
	if err != nil {
		t.Fatalf("expected PORT fallback to succeed, got: %v", err)
	}
	if cfg2.Port != 4100 || cfg2.JWTPublicKeyPEM != "LINE1\nLINE2" {
		t.Fatalf("unexpected fallback config: %+v", cfg2)
	}

	badPortLookup := func(key string) (string, bool) {
		if key == "FIBER_PORT" {
			return "99999", true
		}
		return "", false
	}
	if _, err := config.ParseEnv(badPortLookup); err == nil {
		t.Fatal("expected out-of-range FIBER_PORT to return error")
	}
}

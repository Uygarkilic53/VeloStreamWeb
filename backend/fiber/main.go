package main

import (
	"context"
	"fmt"
	"log"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gofiber/fiber/v2"
	"github.com/velostream/fiber/app"
	"github.com/velostream/fiber/config"
	"github.com/velostream/fiber/models"
	"github.com/velostream/fiber/services"
)

// main is the runtime entrypoint (mirrors Fastify's src/server.ts).
func main() {
	cfg, err := config.LoadFromEnv()
	if err != nil {
		log.Fatalf("load config: %v", err)
	}

	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	var jwtSvc *services.JwtService
	if cfg.JWTPublicKeyPEM != "" {
		jwtSvc, err = services.NewJwtServiceFromPEM([]byte(cfg.JWTPublicKeyPEM), cfg.JWTIssuer, cfg.JWTAudience)
		if err != nil {
			log.Fatalf("load JWT public key: %v", err)
		}
	}

	var streamRepo models.StreamRepository
	if cfg.DatabaseURL != "" {
		pool, dbErr := config.ConnectDatabase(ctx, cfg.DatabaseURL)
		if dbErr != nil {
			log.Fatalf("connect postgres: %v", dbErr)
		}
		defer pool.Close()
		streamRepo = models.NewStreamModel(pool)
	}

	hubSvc := services.NewHubService()
	go hubSvc.Run(ctx)
	go services.EnsureMediaMTX(ctx)

	fiberApp := app.New(app.Options{
		CorsOrigin:         cfg.CorsOrigin,
		Hub:                hubSvc,
		JwtService:         jwtSvc,
		MediaWebhookSecret: cfg.MediaWebhookSecret,
		StreamRepo:         streamRepo,
	})

	addr := fmt.Sprintf("%s:%d", cfg.Host, cfg.Port)
	fiberApp.Hooks().OnListen(func(listenData fiber.ListenData) error {
		log.Printf("fiber server is running on %s:%s", listenData.Host, listenData.Port)
		return nil
	})

	errCh := make(chan error, 1)
	go func() {
		errCh <- fiberApp.Listen(addr)
	}()

	select {
	case <-ctx.Done():
		log.Println("shutting down fiber...")
		if shutdownErr := fiberApp.ShutdownWithTimeout(5 * time.Second); shutdownErr != nil {
			log.Printf("fiber shutdown error: %v", shutdownErr)
		}
	case listenErr := <-errCh:
		if listenErr != nil {
			log.Fatalf("server failed: %v", listenErr)
		}
	}
}

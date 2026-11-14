package services

import (
	"context"
	"log"
	"net/http"
	"os/exec"
	"time"
)

// EnsureMediaMTX checks whether MediaMTX is already running on port 8889,
// and if not, attempts to start it via Docker Compose (or local binary) in the background.
func EnsureMediaMTX(ctx context.Context) {
	client := &http.Client{Timeout: 600 * time.Millisecond}
	resp, err := client.Get("http://localhost:8889")
	if err == nil {
		_ = resp.Body.Close()
		log.Println("[MediaMTX] Service detected running on http://localhost:8889.")
		return
	}

	log.Println("[MediaMTX] Port 8889 not responding. Attempting to start MediaMTX via docker compose...")

	// Attempt starting via docker compose from repository root
	cmd := exec.CommandContext(ctx, "docker", "compose", "up", "-d", "mediamtx")
	if err := cmd.Run(); err == nil {
		log.Println("[MediaMTX] Successfully started MediaMTX container via docker compose.")
		return
	}

	// Fallback notice
	log.Println("[MediaMTX] Notice: Could not automatically start MediaMTX via docker compose. " +
		"Ensure Docker is running and execute 'npm run infra:up' to enable WebRTC/RTMP broadcasting.")
}

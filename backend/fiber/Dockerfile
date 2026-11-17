# ── Stage 1: Build ────────────────────────────────────────────────
FROM golang:1.24-alpine AS builder
WORKDIR /src

# Download Go module dependencies
COPY go.mod go.sum* ./
RUN go mod download

# Copy source code and build lean static binary
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -trimpath -o /out/fiber .

# ── Stage 2: Runtime ──────────────────────────────────────────────
FROM alpine:3.21
WORKDIR /app

RUN apk add --no-cache ca-certificates wget tzdata

COPY --from=builder /out/fiber /usr/local/bin/fiber

EXPOSE 3002

ENTRYPOINT ["/usr/local/bin/fiber"]

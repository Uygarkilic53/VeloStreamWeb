# VeloStream 🚀

**A High-Concurrency, Polyglot Live Streaming Platform**

## 📖 What is VeloStream?

VeloStream is a modern, real-time live streaming web application inspired by platforms like Twitch and Kick. It allows creators to broadcast live video directly from their browsers or streaming software (like OBS) while viewers can watch with ultra-low latency and interact via a highly concurrent live chat.

More than just a streaming site, VeloStream is engineered as a **proof-of-concept for scalable system design**. It demonstrates how to handle the two distinct challenges of live streaming: managing complex business logic (users, channels, moderation) and handling raw, high-throughput concurrency (thousands of simultaneous chat messages and WebSocket connections).

### Core Features

* **Live Video Broadcasting:** Low-latency WebRTC ingest and HLS playback.

* **High-Octane Live Chat:** Real-time, concurrent messaging with zero lag.

* **Secure Authentication:** Asymmetric JWT-based security across multiple backend services.

* **Creator Dashboard:** Stream key generation, channel management, and moderation tools.

* **Real-time Analytics:** Live viewer counts and stream status updates.

## 🏗️ How We Will Build It

To achieve both rapid development and maximum performance, VeloStream uses a **Polyglot Microservice Architecture**. Instead of forcing one language to do everything, we divide the system based on responsibility.

### 1. The Frontend (The Stage)

* **Tech:** React.js, Tailwind CSS

* **Role:** A sleek, responsive web interface. It captures webcam/microphone data using browser APIs, renders the HLS video player for viewers, and connects to our backend via HTTP and WebSockets for chat and channel data.

### 2. The Core API (The Brain)

* **Tech:** Node.js, Fastify, TypeScript

* **Role:** This is the traditional REST API. It handles the relational business logic: User registration, JWT authentication, generating stream keys, updating channel profiles, and processing moderation commands (like banning a user). Fastify was chosen for its speed and rich ecosystem for data validation.

### 3. The Real-Time Engine (The Muscle)

* **Tech:** Golang, Fiber

* **Role:** Go is built for concurrency. This service handles thousands of active WebSocket connections for the live chat. It tracks real-time viewer counts and listens for streaming events. Using Go's native goroutines allows us to scale chat effortlessly without eating up server memory.

### 4. The Media Router (The Antenna)

* **Tech:** MediaMTX (Dockerized)

* **Role:** An open-source, lightweight media server. It receives the raw video feed from the creator and seamlessly transcodes/routes it to the viewers. It communicates with our Go Fiber backend via webhooks to announce when a stream goes live or offline.

### 5. The Data Backbone (The Memory)

* **Tech:** PostgreSQL

* **Role:**

  * **PostgreSQL:** The single source of truth for persistent data (user accounts, channels, chat history, channel bans).

## 🛣️ Development Roadmap

Building VeloStream will follow a structured, 4-phase approach:

1. **Phase 1: Infrastructure & Media:** Setting up Docker, PostgreSQL, and configuring the MediaMTX server to accept video feeds.

2. **Phase 2: Core Business Logic:** Building the Fastify backend, securing endpoints with JWTs, and setting up the PostgreSQL schema for users and channels.

3. **Phase 3: The Concurrency Engine:** Writing the Go Fiber WebSocket hub and handling chat message broadcasting.

4. **Phase 4: Frontend Assembly:** Bringing it all together in React with the video player, chat interface, and creator dashboard.
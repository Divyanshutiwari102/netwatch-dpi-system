# NetWatch — Deep Packet Inspection System

> *Real-time network traffic inspection and control — without decrypting a single byte.*

**Java 17 · Spring Boot 3.2 · Pcap4J · Next.js 15 · WebSocket / STOMP · Tailwind CSS**

---
## 🚀 Live Demo

Access the deployed dashboard here:

🔗 https://netwatch-dpi-system.vercel.app/dashboard
## ⚙️ Backend API

The backend service powers PCAP processing and rule-based filtering.

🔗 Backend URL: https://your-backend-url.onrender.com

---

## 📁 PCAP Demo (Cloud Mode)

Since live packet capture is not supported in cloud environments, this system analyzes pre-recorded PCAP files.

### 📌 PCAP File Path (Used in Demo)
/app/sample-data/demo.pcap

---

## 🧪 How to Test Blocking

### 🔴 Domain-Based Blocking

Use the following domains to test:

- google.com (for testing rule matching)

👉 Add rule:
Block Domain → google

---

### 🔴 IP-Based Blocking

Use the following IP for testing:
142.251.150.119

👉 Add rule:
Block IP → 142.251.150.119

---

## 📊 Expected Behavior

| Test Type | Result |
|----------|--------|
| Normal traffic | ✅ Allowed |
| Blocked domain/IP | 🔴 Marked as BLOCKED |
| Filtered packets | ⚪ Ignored |

---

## ⚠️ Note

- This system operates in **PCAP Analysis Mode** in the cloud.
- Blocking is implemented as **rule-based filtering on analyzed traffic**.
- Live packet interception is not supported in deployment environments like Vercel.

---

## 🎯 Key Features Demonstrated

- Packet parsing from PCAP
- Protocol classification (TCP, UDP, HTTPS)
- Domain & IP extraction
- Rule-based filtering (IP & Domain)
- Blocked event detection
- CSV export of filtered packets

## 🎥 Demo

[NetWatch Demo](https://youtu.be/Cq6tmgdrz7Q)
> Live capture showing real-time SNI extraction and flow-level blocking.
## 🔥 Overview

Classic firewalls block by IP and port — but IP `142.250.80.14` serves YouTube, Gmail, and Google Drive on the same port 443. You can't tell them apart without going deeper.

**NetWatch** solves this by reading the TLS handshake layer, where every browser reveals the destination domain in plaintext *before* encryption begins. It captures live packets, extracts SNI hostnames, classifies traffic by application, enforces flow-level blocking rules, and streams everything to a real-time dashboard.

Architecturally, it mirrors how **pfSense**, **Cisco Umbrella**, and **Palo Alto Cortex** work internally — rebuilt from scratch in Java with a clean, production-aware design.

---

## ✨ Key Features

- **Live packet capture** — Pcap4J reads raw packets off the network interface in real time
- **SNI extraction** — parses raw TLS `ClientHello` bytes to recover the destination hostname before encryption
- **5-tuple flow tracking** — stateful per-connection tracking across all packets (src IP, dst IP, src port, dst port, protocol)
- **Rule engine** — block by IP, domain wildcard (`*.tiktok.com`), port, or protocol; evaluated per-flow, not per-packet
- **Producer-consumer pipeline** — bounded `LinkedBlockingQueue` decouples capture from processing with built-in backpressure
- **WebSocket streaming** — every processed packet pushed live to the dashboard via STOMP
- **Scheduled flow eviction** — `@Scheduled` cleanup prevents unbounded `ConcurrentHashMap` growth

---

## 🧠 Architecture

```
[ Network Interface ]
        │  Pcap4J raw capture
        ▼
[ CaptureEngine ]  — 1 producer thread
        │
        ▼
[ LinkedBlockingQueue ]  — bounded, backpressure valve
        │
   ┌────┴────┬────────┐
   ▼         ▼        ▼
[ Worker ]  [ Worker ] [ Worker ]  — N consumer threads
   │  PacketParser  → Ethernet / IP / TCP headers
   │  SniExtractor  → TLS record walk → SNI hostname
   │  FlowTracker   → ConcurrentHashMap<FiveTuple, FlowRecord>
   │  RuleEngine    → IP / domain / port / protocol rules
   │
   ├──► PacketStore (ring buffer)
   └──► WebSocketBroadcaster ──► [ Next.js Dashboard ]
```

One producer, one queue, N workers, one broadcast channel. Scaling path: swap queue → Kafka, flow table → Redis. Architecture is unchanged.

---

## ⚙️ Tech Stack

| Layer | Technology |
|---|---|
| Language | Java 21 |
| Framework | Spring Boot 3.2 |
| Packet Capture | Pcap4J 1.8 (libpcap wrapper) |
| Concurrency | `LinkedBlockingQueue` · `ConcurrentHashMap` · `AtomicLong` |
| Real-time Push | WebSocket + STOMP |
| Frontend | Next.js 15, Tailwind CSS |
| Build | Maven |

---

## 📦 Project Structure

```
netwatch-dpi-system/
├── backend/src/main/java/com/dpi/
│   ├── capture/        CaptureEngine.java — Pcap4J loop + queue + worker pool
│   ├── engine/         PacketProcessor.java — 6-step DPI pipeline per packet
│   ├── parser/         PacketParser.java, SniExtractor.java
│   ├── flow/           FlowTracker.java — ConcurrentHashMap + @Scheduled eviction
│   ├── rules/          RuleEngine.java — wildcard matching, ConcurrentHashMap rules
│   ├── storage/        PacketStore.java — ConcurrentLinkedDeque ring buffer
│   ├── websocket/      PacketBroadcaster.java — STOMP push
│   ├── controller/     REST endpoints (capture, packets, flows, rules)
│   └── model/          PacketInfo, FlowKey (record), FlowRecord, Rule
│
└── frontend/src/
    ├── app/page.tsx
    └── components/     PacketFeed, TrafficChart, RulePanel
```

---

## ▶️ How to Run

**Prerequisites:** Java 21+, Maven 3.8+, Node.js 18+, `libpcap` installed, root/admin for live capture.

```bash
# Install libpcap
sudo apt install libpcap-dev   # Ubuntu
brew install libpcap            # macOS
```

### Backend
```bash
cd backend
mvn clean package -DskipTests
sudo java -jar target/dpi-engine-1.0.0.jar
# → http://localhost:8080
```

### Frontend
```bash
cd frontend
npm install && npm run dev
# → http://localhost:3000
```

> For PCAP file replay, `sudo` is not required. Pass `pcapFilePath` in the start request body.

---

## 🔌 API Overview

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/capture/start` | Start live or file capture |
| `POST` | `/api/capture/stop` | Stop capture |
| `GET` | `/api/packets` | Query packets (filter by IP, port, protocol, blocked) |
| `GET` | `/api/packets/stats` | Aggregate statistics |
| `GET` | `/api/flows` | Active flow table |
| `POST` | `/api/rules` | Add a blocking rule |
| `DELETE` | `/api/rules/{id}` | Remove a rule |
| `WS` | `/ws` → `/topic/packets` | Live packet stream (STOMP) |

```bash
# Block a domain
curl -X POST http://localhost:8080/api/rules \
  -H "Content-Type: application/json" \
  -d '{"type":"BLOCK_DOMAIN","value":"*.youtube.com"}'

# Block a source IP
curl -X POST http://localhost:8080/api/rules \
  -H "Content-Type: application/json" \
  -d '{"type":"BLOCK_IP","value":"192.168.1.50"}'
```

---

## 🎯 Key Engineering Highlights

### Producer-Consumer with Explicit Backpressure
The capture thread calls `queue.offer()` — non-blocking. If the queue is full, the packet is dropped and a counter is incremented. This is intentional: `put()` would block the Pcap4J listener, stalling the kernel buffer and causing silent packet loss. Explicit drops are always preferable to invisible ones.

### `LinkedBlockingQueue` vs `ArrayBlockingQueue`
`LinkedBlockingQueue` maintains **two separate locks** — head (consumer) and tail (producer). Capture thread writes to tail; workers read from head — zero contention between them. `ArrayBlockingQueue` uses one lock for both, serializing all threads under high throughput.

### `ConcurrentHashMap` for Flow State
Each 5-tuple maps to a `FlowRecord`. Lock striping (16 segments by default) lets worker threads update different flow keys simultaneously. A `synchronized(HashMap)` would serialize all workers — at 4 threads × 100k pps, that's 400k lock contentions per second.

### `AtomicLong` vs `volatile long`
`volatile` guarantees visibility but `count++` is still three operations (read-increment-write). Two threads reading the same value both write the same result; one increment is lost. `AtomicLong.incrementAndGet()` is a single CAS CPU instruction — lock-free and correct under any concurrency.

### SNI Without Decryption
The TLS `ClientHello` is sent before any key exchange. The parser validates `byte[0] == 0x16` (Handshake), `byte[5] == 0x01` (ClientHello), skips session ID / cipher suites / compression, then walks extensions until type `0x0000` (SNI). The hostname is there in plain ASCII — no keys, no decryption.

### Flow-Level Blocking (O(1) after first match)
Rules are evaluated once per flow — on the `ClientHello` where SNI is first seen. Once `FlowRecord` is marked `BLOCKED`, all subsequent packets on that 5-tuple skip the rule engine and are dropped via O(1) map lookup. Rule scanning is O(rules); every packet after the first is O(1).

### Scheduled Flow Eviction
`@Scheduled(fixedDelay = 30_000)` removes flows idle > 120s (10s for FIN/RST). Without this, the map grows forever — 10k new flows/sec for 8 hours is an `OutOfMemoryError`. `ConcurrentHashMap.removeIf()` is atomic per entry; no external lock needed.

---

## 💡 Interview Talking Points

- **SNI is plaintext by design** — virtual hosting requires the server to know which certificate to send before encryption; the domain leaks in the very first packet of every HTTPS connection
- **YouTube vs Google on the same IP** — port 443 is identical; SNI `www.youtube.com` vs `mail.google.com` is not
- **Threading model** — 1 producer, bounded queue, N workers, 1 broadcaster; queue depth is the health metric
- **TOCTOU in `PacketStore`** — two workers can both pass `size() >= maxCapacity` before either evicts; buffer briefly under-fills by one. Fixing it needs a global write lock on the hottest path. For a monitoring buffer, a brief under-fill is operationally invisible — documented and intentional
- **Horizontal scaling** — `LinkedBlockingQueue` → Kafka, `ConcurrentHashMap` → Redis (TTL = flow timeout), broadcast → Redis Pub/Sub; pipeline topology unchanged

---

## 🚀 Future Improvements

- **Persistence** — Spring Data JPA + PostgreSQL; rules survive restarts, session logs queryable by time range
- **Metrics** — Micrometer + Prometheus + Grafana; alert on queue depth > 80%, drop rate > 1%
- **QUIC / HTTP3** — QUIC runs over UDP/443; SNI lives in the CRYPTO frame, requires a dedicated parser
- **Geo-IP enrichment** — MaxMind GeoLite2 country/ASN annotation; `BLOCK_GEO` rule type
- **Distributed mode** — Kafka-partitioned capture nodes, shared Redis flow table, WebSocket gateway via Pub/Sub
- **Anomaly detection** — entropy-based port scan detection, per-source sliding-window rate alerts

---

## 📄 License

MIT

# Real-Time Network Monitoring System
### A Deep Packet Inspection (DPI)-Inspired Backend — Java · Spring Boot · WebSocket

> **"Your browser sends the destination domain name in plain text before encryption begins. This system catches it."**

---

## Table of Contents

1. [What Problem Does This Solve?](#1-what-problem-does-this-solve)
2. [What is Deep Packet Inspection?](#2-what-is-deep-packet-inspection)
3. [Networking Fundamentals](#3-networking-fundamentals)
4. [System Architecture](#4-system-architecture)
5. [The Journey of a Packet](#5-the-journey-of-a-packet)
6. [Multi-Threaded Pipeline Deep Dive](#6-multi-threaded-pipeline-deep-dive)
7. [Flow Tracking](#7-flow-tracking)
8. [SNI Extraction](#8-sni-extraction)
9. [Rule Engine](#9-rule-engine)
10. [Frontend Dashboard](#10-frontend-dashboard)
11. [Key Design Decisions](#11-key-design-decisions)
12. [How to Run](#12-how-to-run)
13. [API Reference](#13-api-reference)
14. [Project Structure & Integration Guide](#14-project-structure)
15. [Interview Q&A](#15-interview-qa)
16. [Future Improvements](#16-future-improvements)

---

## 1. What Problem Does This Solve?

Every enterprise network, every ISP, and every parental control system faces the same challenge: **you need to see what is happening on your network without decrypting user traffic.**

Classic firewalls only look at IP addresses and ports. That is not enough:

| Old approach | Problem |
|---|---|
| Block IP `142.250.80.14` | That IP serves 100 Google services, not just YouTube |
| Block port 443 | Breaks all HTTPS — unusable |
| Decrypt all traffic | Privacy violation, performance nightmare, legal issues |

**DPI solves this** by inspecting the application-layer data that travels *before* encryption starts. The most important example: TLS Server Name Indication (SNI).

This system demonstrates how production network monitoring tools like **pfSense**, **Cisco Umbrella**, and **enterprise firewalls** work internally — rebuilt from scratch in Java with a clean, teachable architecture.

---

## 2. What is Deep Packet Inspection?

A normal firewall sees the **envelope** of a network packet (who sent it, where it is going). DPI opens the envelope and reads the letter inside.

```
Normal Firewall:
  Packet: [192.168.1.5 → 142.250.80.14:443]
  Decision: ALLOW (port 443 is HTTPS — acceptable)
  Problem: Can't tell if it's YouTube, Google Drive, or Gmail

DPI System:
  Packet: [192.168.1.5 → 142.250.80.14:443]
  Payload: TLS Client Hello with SNI = "www.youtube.com"
  Decision: BLOCK (YouTube is on the blocked list)
  Correct!
```

### Real-world uses

- **ISPs** — throttle BitTorrent while keeping HTTP fast
- **Corporate networks** — block social media during work hours
- **Parental controls** — block adult content by domain
- **Security tools** — detect malware calling home to its C2 server
- **IDS/IPS systems** — intrusion detection and prevention

### What this project inspects

```
Layer 7 payload ←── This system reads here
    ↑
Layer 4 headers (TCP/UDP ports)
    ↑
Layer 3 headers (IP addresses)  ←── Normal firewalls stop here
    ↑
Layer 2 headers (MAC addresses)
```

---

## 3. Networking Fundamentals

### The OSI Model (what we use)

```
┌──────────────────────────────────────────────────────────┐
│  Layer 7 — Application   │ HTTP, TLS, DNS, SMTP          │
├──────────────────────────────────────────────────────────┤
│  Layer 4 — Transport     │ TCP (reliable), UDP (fast)    │
├──────────────────────────────────────────────────────────┤
│  Layer 3 — Network       │ IP addresses, routing         │
├──────────────────────────────────────────────────────────┤
│  Layer 2 — Data Link     │ Ethernet, MAC addresses       │
└──────────────────────────────────────────────────────────┘
```

### A packet is a Russian nesting doll

Every packet wraps headers inside headers. Our parser unwraps each layer:

```
┌─────────────────────────────────────────────────────────────────┐
│  Ethernet Header  (14 bytes)  — src MAC, dst MAC, EtherType     │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │  IP Header  (20 bytes)  — src IP, dst IP, protocol, TTL   │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │  TCP Header  (20 bytes)  — ports, flags, seq/ack     │  │  │
│  │  │  ┌───────────────────────────────────────────────┐  │  │  │
│  │  │  │  TLS Client Hello  — SNI = "www.youtube.com"  │  │  │  │
│  │  │  │           ↑                                   │  │  │  │
│  │  │  │   We read this!                               │  │  │  │
│  │  │  └───────────────────────────────────────────────┘  │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

### The Five-Tuple

A **network flow** (a single conversation between two endpoints) is uniquely identified by exactly five fields:

| Field | Example | Meaning |
|---|---|---|
| Source IP | `192.168.1.100` | Client machine |
| Destination IP | `142.250.80.14` | YouTube server |
| Source Port | `54321` | Client-side ephemeral port |
| Destination Port | `443` | HTTPS service |
| Protocol | `TCP` | Reliable transport |

Every packet with the same five-tuple belongs to the **same connection**. This is how we track conversations across multiple packets — and how we know that once we identify a flow as YouTube, all future packets on that flow are also YouTube.

### Why SNI is the key

When your browser connects to `https://www.youtube.com`:

```
Browser → Server:  "CLIENT HELLO"
  ├── I want to speak TLS
  ├── Here are my cipher suites
  └── SNI Extension: server_name = "www.youtube.com"  ← PLAIN TEXT!

Server → Browser:  "SERVER HELLO"  (picks cipher, sends certificate)

From this point → ALL DATA IS ENCRYPTED
```

The SNI field exists because a single IP address can host thousands of websites (virtual hosting). The server needs to know which certificate to send before encryption begins. This design makes the domain name visible to any observer on the network path — including our DPI system.

---

## 4. System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        NETWORK / PCAP FILE                          │
└──────────────────────────────┬──────────────────────────────────────┘
                               │  Raw packets
                               ▼
┌──────────────────────────────────────────────────────────────────┐
│                    CAPTURE ENGINE  (1 thread)                     │
│                                                                   │
│  Pcap4J opens a native libpcap handle on the network interface.  │
│  For each arriving packet:                                        │
│    1. Parse Layer 2/3/4 fields (fast — just struct reads)         │
│    2. Call queue.offer(packet)  — non-blocking                    │
│       If queue full → drop packet + increment counter             │
└─────────────────────────────┬────────────────────────────────────┘
                              │
                  LinkedBlockingQueue<QueueEntry>
                  (bounded, capacity = 5,000)
                  Decouples capture from processing
                              │
          ┌───────────────────┼───────────────────┐
          ▼                   ▼                   ▼
  ┌──────────────┐    ┌──────────────┐    ┌──────────────┐
  │  dpi-worker-0│    │  dpi-worker-1│    │  dpi-worker-N│
  │              │    │              │    │              │
  │  PacketProc  │    │  PacketProc  │    │  PacketProc  │
  │  .process()  │    │  .process()  │    │  .process()  │
  └──────┬───────┘    └──────┬───────┘    └──────┬───────┘
         │                   │                   │
         └───────────────────┼───────────────────┘
                             │
             ┌───────────────┼────────────────┐
             ▼               ▼                ▼
     ┌──────────────┐ ┌────────────┐ ┌─────────────────┐
     │  FlowTracker │ │ PacketStore│ │ PacketBroadcaster│
     │  (CHM flows) │ │ (ring buf) │ │ (STOMP /topic/) │
     └──────────────┘ └────────────┘ └─────────────────┘
             ▲
     ┌───────┴───────────────────────────────┐
     │           PROCESSING STEPS            │
     │  1. SniExtractor.extract(rawPacket)   │
     │  2. ApplicationClassifier.classify()  │
     │  3. FlowTracker.track(packet)         │
     │  4. RuleEngine.apply(packet)          │
     │  5. PacketStore.store(packet)         │
     │  6. PacketBroadcaster.broadcast()     │
     └───────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────┐
│                   SPRING BOOT REST API                    │
│                                                          │
│  GET  /api/packets          → query packets (filtered)   │
│  GET  /api/packets/stats    → aggregate statistics       │
│  GET  /api/flows            → active flow table          │
│  POST /api/capture/start    → start capture              │
│  POST /api/capture/stop     → stop capture               │
│  POST /api/rules            → add blocking rule          │
│  DEL  /api/rules/{id}       → remove rule                │
│  GET  /swagger-ui.html      → interactive API docs       │
└──────────────────────────────────────────────────────────┘
             │
             ▼
┌──────────────────────────────────────────────────────────┐
│              REACT DASHBOARD  (localhost:8080)            │
│  • Live packet table with per-column filters             │
│  • Real-time stats cards + application donut chart       │
│  • Active flow list (5-tuple + SNI + state)              │
│  • Rule management panel (add/remove/list)               │
│  • Capture control (live interface or PCAP file)         │
└──────────────────────────────────────────────────────────┘
```

### Technology choices

| Component | Technology | Why |
|---|---|---|
| Packet capture | Pcap4J (libpcap wrapper) | Industry standard, cross-platform |
| Queue | `LinkedBlockingQueue` | Bounded, thread-safe, non-blocking offer |
| Worker pool | `ExecutorService` | Managed threads, clean shutdown |
| Flow table | `ConcurrentHashMap` | Lock-striped, no global lock |
| Counters | `AtomicLong` | CAS — faster than synchronized |
| REST API | Spring Boot | Clean MVC, Swagger support |
| Real-time push | STOMP over WebSocket | Standard browser-compatible protocol |
| Frontend | React (CDN) | Single HTML file, no build step needed |

---

## 5. The Journey of a Packet

Let's follow a single HTTPS packet to `www.youtube.com` through every step.

### Step 1 — Capture (CaptureEngine)

Pcap4J receives the raw bytes from the OS kernel. The listener callback fires on the capture thread:

```java
PacketListener listener = packet -> {
    Instant ts = Instant.ofEpochMilli(handle.getTimestamp().getTime());
    PacketInfo info = packetParser.parse(packet, ifName, ts);

    if (!queue.offer(entry)) {
        droppedPackets.incrementAndGet(); // queue full — drop, never block
    }
};
```

Key decision: `queue.offer()` is non-blocking. If the workers can't keep up, we **drop packets and keep capturing** rather than stalling the capture loop. A stalled capture loop means we lose packets silently at the kernel level — much worse.

### Step 2 — Parse (PacketParser)

The worker thread picks up the packet and parses each layer:

```
Raw bytes → EthernetPacket → IpV4Packet → TcpPacket → payload

Extracted:
  srcIp    = "192.168.1.100"
  dstIp    = "142.250.80.14"
  srcPort  = 54321
  dstPort  = 443           ← HTTPS
  protocol = TCP
  tcpFlags = 0x02          ← SYN
  totalBytes = 66
```

### Step 3 — SNI Extraction (SniExtractor)

Only called for port 443 traffic. Walks the raw bytes following the TLS record format:

```
Byte 0:    0x16 → Content-Type = Handshake ✓
Byte 5:    0x01 → Handshake-Type = Client Hello ✓
Skip:      Version, Random (32 bytes), Session ID
Skip:      Cipher Suites, Compression Methods
Scan extensions until type = 0x0000 (SNI)
Read:      "www.youtube.com" ← extracted!
```

Result: `packet.setSni("www.youtube.com")`

### Step 4 — Classification (ApplicationClassifier)

```java
"www.youtube.com".contains("youtube") → AppType = "YouTube"
```

Result: `packet.setApplication("YouTube")`

### Step 5 — Flow Tracking (FlowTracker)

```java
FlowKey key = FlowKey.from(packet);
// key = FlowKey[192.168.1.100:54321 → 142.250.80.14:443 [TCP]]

FlowRecord flow = flowTable.computeIfAbsent(key, FlowRecord::new);
flow.recordPacket(packet.getTotalBytes()); // AtomicLong — thread-safe
flow.classify("www.youtube.com", "YouTube");
```

Now every future packet with this 5-tuple will inherit the "YouTube" classification — even after encryption begins and SNI is no longer visible.

### Step 6 — Rule Engine (RuleEngine)

```java
// Rule exists: BLOCK_DOMAIN → "*.youtube.com"
matchesDomain("*.youtube.com", "www.youtube.com") → true ✓

packet.setBlocked(true);
packet.setBlockedBy("BLOCK_DOMAIN:*.youtube.com");
flow.markBlocked();
log.info("[BLOCKED] {} — rule: {}", packet.toSummary(), rule.label());
```

### Step 7 — Store + Broadcast

```java
packetStore.store(packet);          // ring buffer — O(1)
broadcaster.broadcast(packet);      // WebSocket → React dashboard
```

The React dashboard receives the packet as JSON via STOMP and adds it to the live table.

---

## 6. Multi-Threaded Pipeline Deep Dive

### Why we need multiple threads

The capture loop receives packets at wire speed — potentially **millions per second** on a busy network. Processing each packet (SNI parsing, flow lookup, rule checking) takes measurably longer than reading it from the kernel.

If we processed packets on the capture thread, we would stall the kernel's buffer and silently drop packets before we ever see them. The solution is a **producer-consumer pipeline**:

```
Producer (1 thread):  captures packets as fast as the kernel delivers them
Queue    (bounded):   absorbs bursts, provides backpressure signal
Consumers (N threads): process packets in parallel
```

### The queue as a pressure valve

```java
// Capture thread (producer) — NEVER blocks
if (!queue.offer(entry)) {
    droppedPackets.incrementAndGet(); // explicit visible drop
    // log warning every 100 drops
}

// Worker thread (consumer) — blocks until work available
QueueEntry entry = queue.poll(200, TimeUnit.MILLISECONDS);
// 200ms timeout lets us check the running flag and exit cleanly
```

`offer()` vs `put()` is a critical choice:
- `put()` blocks the producer thread when the queue is full → capture stalls → kernel drops packets silently
- `offer()` returns false immediately → we count and log the drop → capture continues at full speed

### Worker isolation

Each worker thread runs its own `PacketProcessor.process()` call. There is **no shared mutable state inside a single processing call** — the `PacketInfo` object is created per-packet and only accessed by one worker at a time.

The only shared state is:
- `FlowTracker.flowTable` — `ConcurrentHashMap`, handles concurrent reads/writes safely
- `PacketStore.buffer` — `ConcurrentLinkedDeque`, lock-free
- `RuleEngine.rules` — `ConcurrentHashMap`, concurrent reads safe

### Thread lifecycle and graceful shutdown

```java
// Stop sequence:
running.set(false);          // workers see this and drain the queue
handle.breakLoop();          // Pcap4J exits its capture loop
workerPool.shutdown();
workerPool.awaitTermination(3, TimeUnit.SECONDS); // drain queue
workerPool.shutdownNow();    // force if needed
```

---

## 7. Flow Tracking

### What is a flow?

A **flow** is a single bidirectional conversation between two network endpoints, identified by the 5-tuple. A web page load creates dozens of flows simultaneously (one per TCP connection to the server).

```
Your machine (192.168.1.100) → YouTube CDN (142.250.80.14:443)
  Packet 1:  SYN       — flow created, state = NEW
  Packet 2:  SYN-ACK   — reply seen, state = ESTABLISHED
  Packet 3:  ACK       — handshake complete
  Packet 4:  Client Hello — SNI extracted! state = CLASSIFIED
  Packet 5+: Encrypted data — SNI from cache, still classified
  Packet N:  FIN       — state = CLOSED
```

### FlowKey — Java record

```java
public record FlowKey(
    String srcIp, int srcPort,
    String dstIp, int dstPort,
    Protocol protocol
) {}
```

A Java `record` gives `equals()` + `hashCode()` + `toString()` for free. Records are immutable — perfect for `ConcurrentHashMap` keys where a mutable key would silently break lookups.

### Thread safety in FlowRecord

```java
public class FlowRecord {
    // AtomicLong: hot counters written by N worker threads simultaneously
    // CAS operation — lock-free, single CPU instruction
    private final AtomicLong totalPackets = new AtomicLong(0);
    private final AtomicLong totalBytes   = new AtomicLong(0);

    // volatile: written ONCE (by the first worker to see the Client Hello),
    // then READ by all subsequent workers. volatile ensures CPU cache coherence.
    // No lock needed because it's a single write → many reads pattern.
    private volatile String sni;
    private volatile String application;
    private volatile FlowState state = FlowState.NEW;
}
```

**Why not `synchronized`?** Because `synchronized` creates a global bottleneck. Every worker thread would queue up waiting for the lock on each `FlowRecord.recordPacket()` call. At 100,000 packets/second across 4 workers, that's 400,000 lock contentions per second.

`AtomicLong` uses a **Compare-And-Swap (CAS)** instruction — one CPU operation, no lock, no context switch.

### Flow garbage collection

```java
@Scheduled(fixedDelay = 30_000)
public void evictIdleFlows() {
    long timeoutMs = flowTimeoutSeconds * 1_000;  // default 120s
    long closedMs  = 10_000;  // CLOSED flows evicted after 10s

    flowTable.entrySet().removeIf(e -> {
        FlowRecord f = e.getValue();
        return (f.getState() == FlowState.CLOSED)
            ? f.isIdle(closedMs)   // TCP FIN seen → evict fast
            : f.isIdle(timeoutMs); // idle connection → evict slowly
    });
}
```

Without this, the `ConcurrentHashMap` grows forever. After 8 hours of network traffic on a busy server, it would hold millions of stale flow entries and eventually cause an `OutOfMemoryError`.

---

## 8. SNI Extraction

### The TLS Client Hello byte format

```
[TLS Record Header — 5 bytes]
  Byte 0:    Content-Type = 0x16 (Handshake)
  Bytes 1-2: Version = 0x0301 (TLS 1.0 compat header)
  Bytes 3-4: Record length

[Handshake Header — 4 bytes]
  Byte 5:    Handshake-Type = 0x01 (Client Hello)
  Bytes 6-8: Handshake length (3-byte big-endian)

[Client Hello Body]
  Bytes 9-10:  Client version
  Bytes 11-42: Random (32 bytes, fixed)
  Byte 43:     Session ID length (variable)
  ...Session ID data...
  2 bytes:     Cipher Suites length
  ...Cipher Suites data...
  1 byte:      Compression Methods length
  ...Compression Methods data...

[Extensions]
  2 bytes: Total extensions length
  For each extension:
    2 bytes: Extension type
    2 bytes: Extension data length
    ...Extension data...

  Extension type 0x0000 = SNI:
    2 bytes: SNI list length
    1 byte:  Name type = 0x00 (hostname)
    2 bytes: Hostname length
    N bytes: Hostname ASCII   ← "www.youtube.com"
```

### Our parser

```java
private Optional<String> parseSni(byte[] data) {
    try {
        // Guard: must be a TLS Handshake Client Hello
        if (data[0] != 0x16) return Optional.empty();
        if (data[5] != 0x01) return Optional.empty();

        int pos = 43; // skip to session ID

        // Skip variable-length fields
        int sessionLen = data[pos] & 0xFF; pos += 1 + sessionLen;
        int cipherLen  = readUint16(data, pos); pos += 2 + cipherLen;
        int compLen    = data[pos] & 0xFF; pos += 1 + compLen;

        // Walk extensions
        int extLen = readUint16(data, pos); pos += 2;
        int extEnd = pos + extLen;

        while (pos + 4 <= extEnd) {
            int extType = readUint16(data, pos); pos += 2;
            int extDataLen = readUint16(data, pos); pos += 2;

            if (extType == 0x0000) { // SNI extension
                return parseSniExtension(data, pos);
            }
            pos += extDataLen;
        }
    } catch (ArrayIndexOutOfBoundsException e) {
        // Truncated packet — silently return empty
    }
    return Optional.empty();
}
```

No external library. Pure Java byte manipulation. Returns `Optional.empty()` instead of throwing for malformed packets — crucial because production traffic contains fragmented, truncated, and malformed packets constantly.

---

## 9. Rule Engine

### Supported rule types

| Type | Match on | Example | Wildcard |
|---|---|---|---|
| `BLOCK_IP` | Source or destination IP | `192.168.1.50` | No |
| `BLOCK_DOMAIN` | SNI hostname or app label | `*.tiktok.com` | Yes (`*.`) |
| `BLOCK_PORT` | Destination port | `3306` | No |
| `BLOCK_PROTOCOL` | Transport protocol | `UDP` | No |

### Rule matching flow

```
Packet arrives at RuleEngine.apply()
  │
  ├─ For each enabled rule:
  │    │
  │    ├─ BLOCK_IP?       → srcIp.equals(ruleIp) || dstIp.equals(ruleIp)
  │    ├─ BLOCK_PORT?     → dstPort == cachedPort  [pre-parsed at add-time]
  │    ├─ BLOCK_PROTOCOL? → protocol.equalsIgnoreCase(ruleProto)
  │    └─ BLOCK_DOMAIN?   → wildcardMatch(ruleDomain, sni)
  │                          or wildcardMatch(ruleDomain, application)
  │
  └─ First match → return Optional<Rule>
     No match   → return Optional.empty()
```

### Thread safety

```java
// Rules stored in ConcurrentHashMap — safe for:
// - Concurrent reads from N worker threads
// - Adding rules via REST API while workers are running
// - Removing rules via REST API while workers are running
private final ConcurrentHashMap<String, Rule> rules = new ConcurrentHashMap<>();

// Port values pre-parsed once at add-time — not on every packet
private final ConcurrentHashMap<String, Integer> parsedPortCache = new ConcurrentHashMap<>();
```

### Flow-level blocking

Once a flow is identified and blocked, the decision is **cached on the FlowRecord**:

```java
// PacketProcessor.process() — Step 3
FlowRecord flow = flowTracker.track(packet);

// If flow was already blocked (e.g. on a previous packet), skip rule check
if (flow.isBlocked()) {
    packet.setBlocked(true);
    return; // fast path — no rule scan needed
}
```

This means for a YouTube connection with 100 packets, we only run the full rule scan **once** (on the Client Hello packet). The other 99 packets are blocked via the cached flow state in O(1).

---

## 10. Frontend Dashboard

### Architecture

The dashboard is a **single HTML file** (`src/main/resources/static/index.html`) served directly by Spring Boot. No separate frontend server, no npm, no build step. Open `http://localhost:8080` and it works.

```
Browser ──HTTP──► Spring Boot ──serves──► index.html
                      │
Browser ──WS────► /ws (STOMP) ──delivers──► live PacketInfo JSON
                      │
Browser ──HTTP──► /api/... ──returns──► JSON (polling every 2s)
```

### Panels

```
┌─────────────────┬───────────────────────────────┬──────────────────┐
│   LEFT PANEL    │        CENTER PANEL            │   RIGHT PANEL    │
│                 │                                │                  │
│  Stats Cards    │  ┌──────────────────────────┐ │  Capture Control │
│  - Total pkts   │  │  Filter Bar              │ │  - Live / File   │
│  - Blocked      │  │  Src IP | Dst IP | Proto │ │  - Start / Stop  │
│  - Flows        │  │  Port   | ⛔Blocked      │ │  - Status widget │
│  - Dropped      │  └──────────────────────────┘ │                  │
│                 │                                │  Rule Panel      │
│  App Chart      │  Live Packet Table             │  - Add rule      │
│  (donut)        │  ─ Time                        │  - Rule type     │
│                 │  ─ Source IP                   │  - Rule value    │
│  Active Flows   │  ─ Destination IP              │  - Active rules  │
│  (5-tuple list) │  ─ Protocol badge              │                  │
│                 │  ─ Ports                       │                  │
│                 │  ─ Application (SNI)           │                  │
│                 │  ─ Size                        │                  │
│                 │  ─ Status (blocked/allowed)    │                  │
│                 │                                │                  │
│                 │  ─────── live ticker ──────── │                  │
└─────────────────┴───────────────────────────────┴──────────────────┘
```

### Real-time update strategy

Two mechanisms work together:

1. **WebSocket (STOMP)** — every processed packet is pushed immediately. This is what powers the live packet table. Zero polling delay.
2. **REST polling (every 2s)** — fetches aggregate stats, flow table, and rules. These change less frequently and don't need sub-second latency.

```javascript
// WebSocket: packet stream
stomp.subscribe('/topic/packets', msg => {
    const pkt = JSON.parse(msg.body);
    setPackets(prev => [pkt, ...prev].slice(0, 500)); // newest first
});

// REST polling: stats + flows + rules
setInterval(fetchAll, 2000);
```

---

## 11. Key Design Decisions

### Why `LinkedBlockingQueue` and not `ArrayBlockingQueue`?

`LinkedBlockingQueue` uses **two separate locks** — one for the head (consumer) and one for the tail (producer). This means producers and consumers never block each other simultaneously.

`ArrayBlockingQueue` uses a **single lock** for both operations. Under high throughput, the producer and consumer contend on the same lock, halving effective throughput.

For a system where the producer (capture thread) and consumer (worker threads) operate simultaneously at high speed, `LinkedBlockingQueue` is the correct choice.

### Why `offer()` and not `put()`?

`put()` blocks the calling thread when the queue is full. The calling thread here is the **Pcap4J listener** — the thread that receives packets from the OS kernel.

If this thread blocks, the kernel's packet buffer fills up and packets are dropped **silently** at the kernel level, with no counter, no log, no visibility.

`offer()` returns `false` immediately. We increment `droppedPackets` and log a warning. The operator sees the drop and can tune worker count or queue size. Explicit > silent.

### Why `ConcurrentHashMap` and not `HashMap` with `synchronized`?

`ConcurrentHashMap` uses **lock striping** — the map is divided into 16 (by default) independent segments, each with its own lock. Two threads updating different keys can proceed simultaneously as long as their keys hash to different segments.

`synchronized(HashMap)` uses a **single monitor lock** — all threads queue up regardless of which key they need.

At 4 worker threads × 100,000 pps, the flow table receives 400,000 concurrent operations per second. Lock striping reduces contention by ~16×.

### Why `AtomicLong` and not `volatile long`?

```java
// volatile long — BROKEN
private volatile long count = 0;
count++; // This is: READ count, ADD 1, WRITE count
         // Three operations — not atomic
         // Thread A and Thread B both read 5, both write 6 — one increment lost

// AtomicLong — CORRECT
private final AtomicLong count = new AtomicLong(0);
count.incrementAndGet(); // Single CAS instruction — atomic at CPU level
```

`volatile` guarantees **visibility** (changes are immediately visible to other threads) but not **atomicity** (the operation itself is still multiple steps). For counters written by multiple threads, you need both — only `AtomicLong` provides that without a lock.

### Why scheduled flow eviction?

Without eviction, the `ConcurrentHashMap` is an **unbounded data structure** that grows with every unique 5-tuple seen. On a corporate network gateway:

- Average session lifetime: ~30 seconds
- Traffic rate: 10,000 new flows per second
- Without eviction: 10,000 × 60s × 60m × 8h = **2.88 billion FlowRecord objects**

That is an `OutOfMemoryError` within hours. The scheduled eviction is not optional — it is the difference between a toy demo and a system that runs in production.

### Why a separate service layer (not controllers calling CaptureEngine directly)?

Controllers deal with HTTP concerns (parsing request bodies, returning HTTP status codes). The service layer deals with business logic (translating checked exceptions, orchestrating multiple calls).

If `CaptureEngine.startCapture()` throws a `PcapNativeException` and controllers catch it directly, the controller now contains network-layer exception handling — a wrong layer. The service layer absorbs this by wrapping it in a `RuntimeException` that Spring's `@ExceptionHandler` can handle uniformly.

---

## 12. How to Run

### Prerequisites

- **Java 21+**
- **Maven 3.8+**
- **libpcap** installed:
  ```bash
  # Ubuntu/Debian
  sudo apt install libpcap-dev

  # macOS
  brew install libpcap

  # Windows
  # Install Npcap: https://npcap.com/
  ```

### Build

```bash
git clone <repo-url>
cd dpi-java
mvn clean package -DskipTests
```

### Run (live capture — requires root/admin)

```bash
# Linux/macOS
sudo java -jar target/dpi-engine-1.0.0.jar

# Windows (run as Administrator)
java -jar target\dpi-engine-1.0.0.jar
```

### Run (PCAP file replay — no root needed)

```bash
java -jar target/dpi-engine-1.0.0.jar
# Then via API or dashboard:
curl -X POST http://localhost:8080/api/capture/start \
  -H "Content-Type: application/json" \
  -d '{"pcapFilePath": "/path/to/capture.pcap"}'
```

### Access the dashboard

```
Dashboard:   http://localhost:8080
Swagger UI:  http://localhost:8080/swagger-ui.html
API Docs:    http://localhost:8080/api-docs
```

### Configuration (`application.properties`)

```properties
# Number of parallel worker threads
dpi.capture.worker-threads=4

# Queue capacity between capture and workers
dpi.capture.queue-size=5000

# Ring buffer size (max packets kept in memory)
dpi.capture.ring-buffer-size=50000

# Flow timeout before eviction (seconds)
dpi.flow.timeout-seconds=120

# Network interface (use "any" for all on Linux)
dpi.capture.interface=any

# Allowed WebSocket origins (change for production)
dpi.websocket.allowed-origins=http://localhost:8080
```

### Adding rules via API

```bash
# Block an IP
curl -X POST http://localhost:8080/api/rules \
  -H "Content-Type: application/json" \
  -d '{"type":"BLOCK_IP","value":"192.168.1.50","description":"Suspicious host"}'

# Block a domain (wildcard)
curl -X POST http://localhost:8080/api/rules \
  -H "Content-Type: application/json" \
  -d '{"type":"BLOCK_DOMAIN","value":"*.tiktok.com"}'

# Block a port
curl -X POST http://localhost:8080/api/rules \
  -H "Content-Type: application/json" \
  -d '{"type":"BLOCK_PORT","value":"3306","description":"Block MySQL"}'
```

---

## 13. API Reference

| Method | Endpoint | Description |
|---|---|---|
| `POST` | `/api/capture/start` | Start live or file capture |
| `POST` | `/api/capture/stop` | Stop capture |
| `GET` | `/api/capture/status` | Engine status, queue size, dropped count |
| `GET` | `/api/capture/interfaces` | List available network interfaces |
| `GET` | `/api/packets` | Query packets (filters: srcIp, dstIp, protocol, srcPort, dstPort, blocked) |
| `GET` | `/api/packets/stats` | Aggregate statistics |
| `GET` | `/api/flows` | Active flow table |
| `GET` | `/api/flows/count` | Number of active flows |
| `GET` | `/api/rules` | List all rules |
| `POST` | `/api/rules` | Add a blocking rule |
| `DELETE` | `/api/rules/{id}` | Remove a rule |

### Start capture request body

```json
{
  "pcapFilePath": "/path/to/file.pcap"
}
```
Omit `pcapFilePath` (or send `null`) for live interface capture.

### Add rule request body

```json
{
  "type": "BLOCK_DOMAIN",
  "value": "*.tiktok.com",
  "description": "Block TikTok (optional)"
}
```

### Packet stats response

```json
{
  "totalPackets": 15420,
  "totalBytes": 18534200,
  "blockedPackets": 340,
  "tcpPackets": 12100,
  "udpPackets": 3200,
  "icmpPackets": 120,
  "bufferedPackets": 5000,
  "droppedFromBuffer": 0
}
```

---

## 14. Project Structure

### Repository layout

```
dpi-fullstack-project/                          ← project root
│
├── README.md                                   ← this file
│
├── frontend/
│   └── index.html                              ← React dashboard (standalone, no build step)
│                                                 Open directly in browser OR
│                                                 serve via backend at localhost:8080
│
└── backend/                                    ← complete Spring Boot application
    ├── pom.xml
    └── src/
        ├── main/
        │   ├── java/com/dpi/
        │   │   ├── DpiApplication.java           Entry point + @EnableScheduling
        │   │   │
        │   │   ├── capture/
        │   │   │   └── CaptureEngine.java        Pcap4J loop + BlockingQueue + workers
        │   │   │
        │   │   ├── engine/
        │   │   │   └── PacketProcessor.java      5-step DPI pipeline per packet
        │   │   │
        │   │   ├── parser/
        │   │   │   └── PacketParser.java         Ethernet → IP → TCP/UDP field extraction
        │   │   │
        │   │   ├── sni/
        │   │   │   ├── SniExtractor.java         TLS byte-level parser
        │   │   │   └── ApplicationClassifier.java SNI/port → app name
        │   │   │
        │   │   ├── flow/
        │   │   │   └── FlowTracker.java          ConcurrentHashMap + @Scheduled GC
        │   │   │
        │   │   ├── rules/
        │   │   │   └── RuleEngine.java           ConcurrentHashMap + wildcard matching
        │   │   │
        │   │   ├── storage/
        │   │   │   └── PacketStore.java          ConcurrentLinkedDeque ring buffer
        │   │   │
        │   │   ├── websocket/
        │   │   │   ├── PacketBroadcaster.java    SimpMessagingTemplate STOMP push
        │   │   │   └── WebSocketConfig.java      STOMP endpoint + CORS config
        │   │   │
        │   │   ├── model/
        │   │   │   ├── PacketInfo.java           Single pipeline data object
        │   │   │   ├── FlowKey.java              Java record — 5-tuple key
        │   │   │   ├── FlowRecord.java           AtomicLong + volatile fields
        │   │   │   ├── FlowState.java            NEW / ESTABLISHED / CLASSIFIED / CLOSED
        │   │   │   ├── Rule.java                 Blocking rule entity
        │   │   │   ├── RuleType.java             BLOCK_IP / PORT / DOMAIN / PROTOCOL
        │   │   │   └── Protocol.java             TCP / UDP / ICMP + IANA numbers
        │   │   │
        │   │   ├── service/
        │   │   │   ├── CaptureService.java       Exception translation layer
        │   │   │   ├── PacketService.java        Filter builder + getRecent fast path
        │   │   │   ├── FlowService.java          Sorted flow list
        │   │   │   └── RuleService.java          Rule CRUD
        │   │   │
        │   │   ├── controller/
        │   │   │   ├── CaptureController.java    POST /api/capture/start|stop
        │   │   │   ├── PacketController.java     GET /api/packets
        │   │   │   ├── FlowController.java       GET /api/flows
        │   │   │   ├── RuleController.java       CRUD /api/rules
        │   │   │   └── GlobalExceptionHandler.java @RestControllerAdvice
        │   │   │
        │   │   └── dto/
        │   │       └── Dtos.java                 Request/response bodies
        │   │
        │   └── resources/
        │       ├── application.properties        All config in one place
        │       └── static/
        │           └── index.html               ← same React dashboard, served by Spring Boot
        │
        └── test/java/com/dpi/
            ├── SniExtractorTest.java             Synthetic TLS byte tests
            ├── FlowTrackerTest.java              Concurrency tests (10-thread)
            └── RuleEngineTest.java               All 4 rule types + wildcard
```

### Why two copies of `index.html`?

| Location | Purpose |
|---|---|
| `frontend/index.html` | Standalone — open directly in any browser while developing. No server required. Point it at `localhost:8080` and it works. |
| `backend/src/main/resources/static/index.html` | Production — Spring Boot serves this at `http://localhost:8080`. One command starts everything. |

Both files are identical. Edit one → copy to the other.

---

## Integration Guide

### How frontend and backend connect

The dashboard communicates with the backend via two channels:

```
Browser (frontend/index.html)
    │
    ├── HTTP REST  ──► http://localhost:8080/api/**
    │   (polling every 2 seconds for stats, flows, rules)
    │
    └── WebSocket  ──► ws://localhost:8080/ws  (STOMP)
        (live packet stream — pushed immediately on each packet)
```

No proxy, no environment variables, no configuration needed. The backend URL is hardcoded in `index.html` as `http://localhost:8080`.

### Running the full stack

**Step 1 — Start the backend**

```bash
cd backend
mvn clean package -DskipTests
sudo java -jar target/dpi-engine-1.0.0.jar
```

> `sudo` is required for live packet capture (raw socket access). For PCAP file replay, `sudo` is not needed.

**Step 2 — Open the dashboard**

Option A — served by Spring Boot (recommended):
```
http://localhost:8080
```

Option B — open the standalone file directly:
```bash
open frontend/index.html    # macOS
xdg-open frontend/index.html  # Linux
# Windows: double-click the file
```

> When opening as a local file, the browser will still connect to `http://localhost:8080` for API calls. The backend must be running.

### Changing the backend URL

If you deploy the backend to a different host/port, update this constant at the top of `index.html`:

```javascript
// Line ~20 in frontend/index.html
const API  = (path) => `http://localhost:8080${path}`;
const WS_URL = 'http://localhost:8080/ws';
```

Change both lines to point to your backend host.

### WebSocket CORS

The backend allows connections from `localhost:8080` and `localhost:3000` by default. To allow the standalone `frontend/index.html` (served from `file://`), update `application.properties`:

```properties
# backend/src/main/resources/application.properties
dpi.websocket.allowed-origins=http://localhost:8080,http://localhost:3000,*
```

---

## 15. Interview Q&A

These are the exact questions you will be asked. Each answer demonstrates a specific depth of understanding.

---

**Q1. Walk me through your project.**

> "I built a real-time network monitoring system that inspects live network traffic to identify applications and enforce blocking rules. The core pipeline works like this: Pcap4J captures raw packets from the network interface and pushes them onto a bounded `LinkedBlockingQueue`. A pool of 4 worker threads drains the queue concurrently — each worker parses the packet headers, extracts the domain name from TLS handshakes (SNI), classifies the application, updates a flow state table, and checks blocking rules. Results are stored in a ring buffer and pushed live to a React dashboard via WebSocket. The interesting engineering decisions are all in the concurrency model — how we ensure the capture thread never blocks, and how we safely share flow state between worker threads."

---

**Q2. Why did you use `BlockingQueue` instead of just calling the processor directly?**

> "The capture thread receives packets from the OS kernel. If it blocks for any reason — even for a few milliseconds — the kernel's buffer fills up and packets are dropped silently. No counter, no log, no way to know. By putting packets on a `BlockingQueue` with a non-blocking `offer()` call, the capture thread always runs at full speed. If the queue fills up, we drop explicitly — we increment a counter and log a warning. The operator sees it and can tune the worker count. Explicit, visible failure beats silent data loss."

---

**Q3. Why `LinkedBlockingQueue` and not `ArrayBlockingQueue`?**

> "`LinkedBlockingQueue` uses two separate locks — one for the head (consumer side) and one for the tail (producer side). The capture thread produces to the tail; the workers consume from the head. With two locks, they never block each other. `ArrayBlockingQueue` uses a single lock for both operations, so at high throughput the producer and all consumers contend on the same monitor."

---

**Q4. Why `ConcurrentHashMap`? Why not `HashMap` with `synchronized`?**

> "`ConcurrentHashMap` uses lock striping — by default 16 segments, each with its own lock. Two worker threads updating keys that hash to different segments proceed simultaneously. `synchronized(HashMap)` serializes all threads through one monitor. At 4 workers processing 100k packets per second, the flow table receives 400k concurrent operations. Lock striping reduces contention by a factor of 16."

---

**Q5. Explain `AtomicLong` vs `volatile long`.**

> "`volatile long` makes the field immediately visible across CPU caches when written. But `count++` is three operations — read, increment, write. If thread A and thread B both read `5` before either writes, both write `6` and one increment is lost. `AtomicLong.incrementAndGet()` is a single Compare-And-Swap CPU instruction. The CPU atomically checks if the value is still what it read before writing — if not, it retries. No lock, no context switch, correct under any concurrency."

---

**Q6. What is SNI and why can you read it even though HTTPS is encrypted?**

> "SNI is Server Name Indication — a TLS extension where the client includes the destination hostname in the Client Hello message, before any encryption is negotiated. This is by design: a single IP address can host thousands of websites (virtual hosting), and the server needs to know which SSL certificate to present before it can establish encryption. So the domain name travels in plaintext in the very first packet of every HTTPS connection. We parse the raw TLS record bytes to find extension type `0x0000` and read the hostname."

---

**Q7. How does your SNI extractor handle malformed packets?**

> "The parser catches `ArrayIndexOutOfBoundsException` at the top level and returns `Optional.empty()` — it never throws. Production networks constantly have truncated packets (captured at a snaplen limit), retransmitted fragments, and malformed data from misbehaving clients. If any field is shorter than expected, we silently give up and let the packet proceed without SNI classification. The system degrades gracefully — unclassified traffic flows through as `UNKNOWN` rather than crashing a worker thread."

---

**Q8. Why do you mark flows BLOCKED instead of checking rules on every packet?**

> "Rule checking involves iterating all active rules and string comparisons. If a flow has 100 packets and we know from packet 4 (the Client Hello) that it's YouTube-blocked, there's no value in re-running the rule scan 96 more times. Once a flow is marked blocked on the `FlowRecord`, subsequent packets skip the rule engine entirely and are blocked via the cached state — O(1) lookup instead of O(rules) scan. For a busy network with many active rules, this is a significant optimization."

---

**Q9. What happens if you don't evict flows from the ConcurrentHashMap?**

> "The map grows without bound. On a busy corporate network with 10,000 new connections per second, after 8 hours you have tens of millions of `FlowRecord` objects — each holding timestamps, counters, strings. That's gigabytes of heap. The system would eventually throw `OutOfMemoryError`. My `@Scheduled` eviction runs every 30 seconds and removes flows idle longer than 120 seconds, or 10 seconds if they've received a FIN/RST. The `removeIf()` method on `ConcurrentHashMap` does this safely — it's atomic per-entry and doesn't need an external lock."

---

**Q10. Why is your ring buffer eviction a 'soft limit'?**

> "Two worker threads can both pass the `size() >= maxCapacity` check before either calls `pollFirst()`, so both evict one entry and both add one — net effect is buffer shrinks by one instead of staying stable. I chose not to fix this with a `synchronized` block because that would create a global lock on every single packet write — the hottest path in the system. The consequence is a brief under-fill, never an overflow or data loss. For a monitoring ring buffer, this tradeoff is correct. I documented it explicitly with a comment in the code so the next engineer understands the decision."

---

**Q11. How would you scale this horizontally?**

> "Replace the `LinkedBlockingQueue` with a Kafka topic. Multiple capture instances publish to the same topic. A fleet of consumer services drain the topic, each holding a partition of the flow table. Replace the in-memory `ConcurrentHashMap` with Redis (TTL = flow timeout) so the entire consumer fleet shares one flow table. The WebSocket broadcast becomes a publish to a Redis Pub/Sub channel that all dashboard instances subscribe to. The core architecture — producer, queue, consumers, state store, broadcast — stays identical."

---

**Q12. Why a separate service layer? Why not have controllers call CaptureEngine directly?**

> "Controllers deal with HTTP — parsing request bodies, returning status codes. `CaptureEngine.startCapture()` throws `PcapNativeException` — a network-layer checked exception. If the controller catches it, network exception handling lives in the HTTP layer, which is wrong. The service layer is the translation boundary: it catches `PcapNativeException` and wraps it in a `RuntimeException` that Spring's `GlobalExceptionHandler` converts to a clean HTTP 500 response. Each layer has one responsibility."

---

**Q13. What would you add for production readiness?**

> "Three things immediately: First, Micrometer metrics exposed via `/actuator/prometheus` — packets processed per second, queue depth, flow table size, rule match rate. This lets you set alerts when queue depth grows (workers can't keep up) or when rule matches spike (possible attack). Second, circuit breaker on the WebSocket broadcaster — if no clients are connected, skip the `convertAndSend()` call entirely. Third, persistent rules using Spring Data JPA so rules survive a restart. The storage layer is already abstracted enough that adding a `RuleRepository.save()` call to `RuleService.addRule()` is the only change needed."

---

**Q14. There's a TOCTOU race in your PacketStore. Why didn't you fix it?**

> "The race is: two threads both see `buffer.size() >= maxCapacity`, both call `pollFirst()`, both call `addLast()` — buffer briefly undershoots capacity by one. Fixing it requires a `synchronized` block around the check+evict+add trio, which creates a global write lock on every packet store operation — the highest-frequency operation in the system. This is a monitoring ring buffer, not a financial ledger. A brief under-fill is operationally invisible. I documented the decision and the reasoning explicitly. Choosing to not fix a known issue with a documented rationale is different from not knowing it exists."

---

**Q15. Why does your blocked log statement use `INFO` instead of `DEBUG`?**

> "Because an operator running this system in production uses the default log level. Rule matches are security-relevant events — an administrator who set a rule to block a suspicious IP needs to see when it's firing without needing to change log configuration. `DEBUG` level is for development and troubleshooting. `INFO` is for operationally significant events that a running-system operator cares about. Log levels are a contract with your operators."

---

## 16. Future Improvements

### Persistence layer
```
Add Spring Data JPA + PostgreSQL.
Rules should survive restarts.
Historical packet data queryable by time range.
```

### Metrics + Alerting
```
Micrometer + Prometheus + Grafana
Alerts: queue depth > 80%, drop rate > 1%, new rule match spike
```

### QUIC/HTTP3 support
```
QUIC runs over UDP on port 443.
SNI is inside the QUIC Initial packet (CRYPTO frame), partially encrypted.
Requires a QUIC-specific parser for ClientHello.
```

### Geo-IP enrichment
```
Annotate packets with country/ASN using MaxMind GeoLite2.
Add "top countries" chart to dashboard.
Block by country via BLOCK_GEO rule type.
```

### Machine learning anomaly detection
```
Sliding-window packet rate per source IP.
Entropy-based port scan detection (many unique ports in short time window).
Baseline traffic model — alert on deviation.
```

### Distributed deployment (Kafka-based)
```
Capture nodes → Kafka topic partitioned by 5-tuple hash
Consumer group → shared flow table in Redis (TTL = flow timeout)
WebSocket gateway → subscribes to Redis Pub/Sub
Dashboard → connects to WebSocket gateway
```

### Export formats
```
PCAP export of blocked flows (for post-incident forensics)
CSV/JSON export of session logs
Syslog integration for SIEM pipelines
```

---

## Summary

This project demonstrates five core backend engineering concepts in a single, cohesive system:

1. **Concurrent pipeline design** — producer-consumer with explicit backpressure
2. **Lock-free data structures** — `ConcurrentHashMap`, `AtomicLong`, `ConcurrentLinkedDeque`
3. **Stateful stream processing** — flow tracking across packet sequences
4. **Protocol parsing** — raw byte manipulation at the TLS record layer
5. **Real-time push architecture** — WebSocket / STOMP server-side broadcasting

The architecture mirrors what production systems like **Cisco Stealthwatch**, **Palo Alto Cortex**, and **AWS VPC Flow Logs** do internally — just without the distributed infrastructure layer. That layer (Kafka + Redis) is the natural next step.

---

*Built with Java 21 · Spring Boot 3.2 · Pcap4J 1.8 · React 18*

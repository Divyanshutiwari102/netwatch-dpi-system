# NetWatch — Real-Time Network Monitoring Dashboard

A production-grade Next.js 16 frontend for the Spring Boot DPI backend.

## Stack

| Layer | Technology |
|---|---|
| Framework | Next.js 16 (App Router) |
| Language | TypeScript 5 |
| Styling | Tailwind CSS v4 |
| State | Zustand 5 |
| WebSocket | @stomp/stompjs + SockJS |
| Charts | Chart.js 4 |
| Virtual scroll | @tanstack/react-virtual 3 |
| Auth | JWT (jose) |

## Quick Start

```bash
# 1. Start Spring Boot backend on port 8080
#    (the frontend proxies /api/* and /ws/* through Next.js rewrites)

# 2. Install and run the frontend
npm install
npm run dev

# Open http://localhost:3000
# Login: admin@netwatch.local / netwatch123
```

## Project Structure

```
netwatch/
├── app/
│   ├── api/auth/login/route.ts   ← JWT login endpoint
│   ├── dashboard/page.tsx         ← protected 3-panel dashboard
│   ├── login/page.tsx             ← login form
│   ├── globals.css                ← design tokens + animations
│   └── layout.tsx
├── components/
│   ├── controls/ControlsPanel.tsx ← capture controls + rules
│   ├── layout/Header.tsx          ← WS status + live stat chips
│   ├── layout/Toasts.tsx          ← toast notifications
│   ├── packets/
│   │   ├── FilterBar.tsx          ← search + filter toolbar
│   │   ├── PacketTable.tsx        ← virtual-scroll table (50k+ rows)
│   │   └── PacketTooltip.tsx      ← hover detail card
│   ├── stats/StatsPanel.tsx       ← sparklines + donut + flows
│   └── ui/index.tsx               ← Badge, Button, Input, Select, StatCard
├── hooks/
│   ├── useAuth.ts                 ← JWT auth state
│   ├── usePolling.ts              ← 2s REST polling
│   └── useWebSocket.ts            ← STOMP connection lifecycle
├── lib/
│   ├── api.ts                     ← all REST calls
│   ├── auth.ts                    ← JWT sign/verify + credentials
│   ├── utils.ts                   ← formatters, cn(), stableColor()
│   └── websocket.ts               ← STOMP manager with reconnect
├── store/index.ts                 ← Zustand store (ring buffer, history)
└── types/index.ts                 ← all TypeScript types
```

## Architecture Decisions

### Virtual scroll
`@tanstack/react-virtual` renders only ~18 DOM rows regardless of how many
packets are buffered (up to 2,000). Each row is absolutely positioned at
`vRow.start` px from the top of the scroll container — the correct pattern for
react-virtual. A single `translateY` wrapper (a common mistake) breaks when
the first visible index > 0.

### No re-render per packet
The backend sends batches of up to 50 `WsPacketSummary` objects every 300ms
as a single STOMP frame. `addBatch()` in Zustand processes the entire array in
one `set()` call — one React render per frame, not one per packet.

### Memoised rows
`PacketRow` is wrapped in `React.memo()`. Because packets are prepended to the
ring buffer (newest first), rows that scroll off the top are simply evicted —
rows still on screen are structurally identical and React skips them entirely.

### Chart updates
Charts are created once and mutated via `chart.update('none')` on every polling
tick. `'none'` disables Chart.js animations so there is no easing flicker at
the 2-second update rate.

### Auth
Login page → `POST /api/auth/login` (Next.js route handler) → JWT signed with
`jose` → stored in `localStorage`. On every dashboard mount `useAuth` reads the
token and re-verifies it client-side before rendering.

## Backend requirements

The backend must be running on `http://localhost:8080` with:

- `GET  /api/capture/status`
- `POST /api/capture/start`
- `POST /api/capture/stop`
- `GET  /api/capture/interfaces`
- `GET  /api/packets/stats`
- `GET  /api/packets`
- `GET  /api/packets/export`
- `GET  /api/flows`
- `GET  /api/rules`
- `POST /api/rules`
- `DELETE /api/rules/:id`
- `WS  /ws` — STOMP endpoint, topic `/topic/packets`
  - Sends `List<WsPacketSummary>` as JSON array every 300ms

## Production build

```bash
npm run build
npm start
```

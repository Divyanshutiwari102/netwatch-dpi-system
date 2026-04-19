/**
 * websocket.js — STOMP/SockJS connection manager with batch support.
 *
 * ─── What changed ─────────────────────────────────────────────────────────────
 * The backend now sends batched arrays: List<WsPacketSummary> as a JSON array.
 * Previously it sent one PacketInfo object per STOMP frame.
 *
 * The onMessage handler now:
 *   1. Parses the body
 *   2. Normalises to an array (handles both old single-object and new array format)
 *   3. Normalises field names: capturedAtMs → capturedAt for UI compatibility
 *   4. Calls onPacket(packet) for each item
 *
 * ─── Connection states ────────────────────────────────────────────────────────
 *   CONNECTING   → SockJS/STOMP handshake in progress (amber blinking dot)
 *   CONNECTED    → receiving data (green pulsing dot)
 *   DISCONNECTED → connection lost (red dot, toast shown, retrying in 4s)
 *
 * ─── Reconnect ────────────────────────────────────────────────────────────────
 * Auto-reconnects forever with 4-second delays. Prevents double-scheduling
 * when both STOMP onError and SockJS onclose fire for the same disconnection.
 */

const WS_ENDPOINT        = '/ws';
const TOPIC_PACKETS      = '/topic/packets';
const RECONNECT_DELAY_MS = 4000;

window.WS = {
  createWebSocketManager({ onPacket, onStateChange }) {
    let stomp       = null;
    let retryCount  = 0;
    let retryTimer  = null;
    let active      = true;

    function setState(state) {
      console.log(`[WS] ${state} (retries: ${retryCount})`);
      onStateChange(state, retryCount);
    }

    function connect() {
      if (!active) return;
      setState('CONNECTING');

      // Relative URL works from localhost:8080 and any production domain
      const sock = new SockJS(WS_ENDPOINT);
      stomp = Stomp.over(sock);
      stomp.debug = null; // suppress verbose STOMP frame logs

      stomp.connect(
        {},

        // ── onConnect ────────────────────────────────────────────────────────
        function onConnected() {
          retryCount = 0;
          setState('CONNECTED');

          stomp.subscribe(TOPIC_PACKETS, function onMessage(message) {
            try {
              const parsed = JSON.parse(message.body);

              // Normalise: backend sends an array; guard against legacy single-object
              const packets = Array.isArray(parsed) ? parsed : [parsed];

              packets.forEach(pkt => {
                // Field normalisation: WsPacketSummary uses capturedAtMs (long),
                // PacketInfo uses capturedAt (ISO string). Unify to capturedAt.
                if (pkt.capturedAtMs !== undefined && pkt.capturedAt === undefined) {
                  pkt.capturedAt = pkt.capturedAtMs;
                }
                onPacket(pkt);
              });
            } catch (e) {
              console.warn('[WS] Failed to parse message:', e);
            }
          });
        },

        // ── onError ──────────────────────────────────────────────────────────
        function onError(err) {
          console.warn('[WS] STOMP error:', err);
          scheduleReconnect();
        }
      );

      // Catch raw SockJS close (e.g. backend process killed — bypasses STOMP onError)
      sock.onclose = function() {
        if (active) {
          console.warn('[WS] SockJS socket closed');
          scheduleReconnect();
        }
      };
    }

    function scheduleReconnect() {
      if (!active || retryTimer) return; // prevent double-schedule
      setState('DISCONNECTED');
      retryCount++;
      console.log(`[WS] Reconnecting in ${RECONNECT_DELAY_MS / 1000}s (attempt ${retryCount})...`);
      retryTimer = setTimeout(() => {
        retryTimer = null;
        connect();
      }, RECONNECT_DELAY_MS);
    }

    function disconnect() {
      active = false;
      if (retryTimer) { clearTimeout(retryTimer); retryTimer = null; }
      if (stomp) {
        try { stomp.disconnect(); } catch (e) { /* ignore */ }
        stomp = null;
      }
    }

    return { connect, disconnect };
  }
};

package com.dpi.websocket;

import com.dpi.model.PacketInfo;

/**
 * WsPacketSummary — lightweight packet DTO sent over WebSocket.
 *
 * ─── Why not send PacketInfo directly? ───────────────────────────────────────
 * Full PacketInfo serialises to ~800–1,200 bytes of JSON because it carries
 * fields the dashboard never uses: srcMac, dstMac, tcpFlags, ttl,
 * payloadBytes, flowKey, networkInterface, capturedAt (ISO-8601 string).
 *
 * This summary carries only the 11 fields the UI actually renders, at roughly
 * 180–250 bytes each — a 4–6× reduction in payload size per packet.
 *
 * When we batch 50 of these per STOMP frame the total size is ~10 KB, well
 * within the configured 256 KB message limit.
 *
 * ─── capturedAtMs ────────────────────────────────────────────────────────────
 * An epoch-millisecond long instead of an Instant (ISO-8601 string).
 * Saves ~10 bytes per packet and avoids string parsing in the browser —
 * new Date(epochMillis) is a direct number conversion.
 *
 * ─── Java record ─────────────────────────────────────────────────────────────
 * Immutable, equals/hashCode/toString for free, no Lombok needed.
 * Jackson serialises records automatically in Spring Boot 3.x.
 */
public record WsPacketSummary(
        long    id,
        long    capturedAtMs,   // epoch millis — lighter than ISO-8601 string
        String  srcIp,
        String  dstIp,
        String  protocol,       // "TCP" / "UDP" / "ICMP" / "OTHER"
        int     srcPort,
        int     dstPort,
        String  application,    // classified app name, e.g. "YouTube", "DNS"
        String  sni,            // TLS SNI hostname, null when not extracted
        int     totalBytes,
        boolean blocked,
        String  blockedBy       // e.g. "BLOCK_DOMAIN:*.tiktok.com", null when allowed
) {
    /**
     * Build a summary from a fully-processed PacketInfo.
     * Called on the worker thread — must be fast (no allocations beyond the record itself).
     */
    public static WsPacketSummary from(PacketInfo p) {
        return new WsPacketSummary(
                p.getId(),
                p.getCapturedAt() != null ? p.getCapturedAt().toEpochMilli() : 0L,
                p.getSrcIp(),
                p.getDstIp(),
                p.getProtocol() != null ? p.getProtocol().name() : "OTHER",
                p.getSrcPort(),
                p.getDstPort(),
                p.getApplication(),
                p.getSni(),
                p.getTotalBytes(),
                p.isBlocked(),
                p.getBlockedBy()
        );
    }
}

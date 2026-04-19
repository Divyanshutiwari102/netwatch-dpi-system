package com.dpi.model;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;

/**
 * PacketInfo — the single data object that travels through the entire pipeline.
 *
 * Created by CaptureEngine → enriched by PacketParser → classified by
 * SniExtractor → checked by RuleEngine → stored in PacketStore.
 *
 * Keeping everything in one flat object makes the code easy to follow
 * in interviews: you always know where any piece of data lives.
 */
@Data
@Builder
public class PacketInfo {

    // ── Identity ──────────────────────────────────────────────────────────────
    /** Auto-incrementing ID assigned by CaptureEngine */
    private long id;

    /** When the packet was captured (from the pcap timestamp) */
    private Instant capturedAt;

    /** Network interface this arrived on (e.g., "eth0", "en0") */
    private String networkInterface;

    // ── Layer 2 ───────────────────────────────────────────────────────────────
    private String srcMac;
    private String dstMac;

    // ── Layer 3 (IP) ─────────────────────────────────────────────────────────
    private String srcIp;
    private String dstIp;
    private int    ttl;

    // ── Layer 4 (Transport) ───────────────────────────────────────────────────
    /** TCP, UDP, ICMP, or OTHER */
    private Protocol protocol;
    private int      srcPort;   // 0 for ICMP
    private int      dstPort;   // 0 for ICMP

    /** TCP flags (SYN=0x02, ACK=0x10, FIN=0x01, RST=0x04, PSH=0x08) */
    private int tcpFlags;

    // ── Size ──────────────────────────────────────────────────────────────────
    /** Total wire-length of the packet in bytes */
    private int totalBytes;

    /** Payload bytes after the transport header */
    private int payloadBytes;

    // ── Application Layer (DPI results) ───────────────────────────────────────
    /**
     * Server Name Indication extracted from TLS Client Hello.
     * Null when not a TLS connection or handshake not captured.
     */
    private String sni;

    /**
     * Human-readable application label derived from SNI or port.
     * Examples: "YouTube", "Netflix", "HTTPS", "DNS"
     */
    private String application;

    // ── Rule engine outcome ───────────────────────────────────────────────────
    /** True if any blocking rule matched this packet */
    private boolean blocked;

    /** The rule that caused the block (e.g. "IP:192.168.1.5", "DOMAIN:*.tiktok.com") */
    private String blockedBy;

    // ── Flow reference ────────────────────────────────────────────────────────
    /**
     * Flow key = "srcIp:srcPort-dstIp:dstPort-PROTO"
     * Ties this packet back to its entry in the FlowTracker.
     */
    private String flowKey;

    // ── Helpers ───────────────────────────────────────────────────────────────

    /** Returns a compact summary useful for WebSocket streaming and logs */
    public String toSummary() {
        return String.format("[%s] %s:%d → %s:%d  %s  %d bytes%s",
                protocol,
                srcIp, srcPort,
                dstIp, dstPort,
                application != null ? application : "",
                totalBytes,
                blocked ? "  ⛔ BLOCKED by " + blockedBy : "");
    }
}

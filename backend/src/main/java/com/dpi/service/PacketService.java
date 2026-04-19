package com.dpi.service;

import com.dpi.model.PacketInfo;
import com.dpi.model.Protocol;
import com.dpi.storage.PacketStore;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Map;

/**
 * PacketService — query, aggregate, and export captured packets.
 *
 * ─── CSV improvements ─────────────────────────────────────────────────────────
 * Column order: Time, Src IP, Dst IP, Protocol, Src Port, Dst Port,
 *               Application, SNI, Bytes, Status
 *
 * - Time: ISO-8601 with millis (2025-04-18T14:23:01.456Z) — unambiguous, sortable
 * - SNI clearly visible as its own column, not buried in Application
 * - Status: BLOCKED(rule) or ALLOWED
 * - All values are CSV-safe (quoted, commas escaped)
 */
@Service
@RequiredArgsConstructor
public class PacketService {

    private final PacketStore packetStore;

    private static final DateTimeFormatter CSV_TIME_FMT =
            DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss.SSS'Z'")
                    .withZone(ZoneId.of("UTC"));

    // ── Query ─────────────────────────────────────────────────────────────────

    public List<PacketInfo> getPackets(int limit, String srcIp, String dstIp,
                                       String protocol, Integer srcPort,
                                       Integer dstPort, Boolean blocked) {
        Protocol proto = null;
        if (protocol != null && !protocol.isBlank()) {
            try { proto = Protocol.valueOf(protocol.toUpperCase()); }
            catch (IllegalArgumentException ignored) { /* return all */ }
        }

        // Clamp limit to safe range
        int safeLimit = Math.max(1, Math.min(limit, 1000));

        if (srcIp == null && dstIp == null && proto == null
                && srcPort == null && dstPort == null && blocked == null) {
            return packetStore.getRecent(safeLimit);
        }

        return packetStore.query(
                new PacketStore.PacketFilter(srcIp, dstIp, proto, srcPort, dstPort, blocked),
                safeLimit
        );
    }

    public Map<String, Object> getStats() {
        PacketStore.PacketStats s = packetStore.getStats();
        // Expose as a flat map so the JSON is directly consumable by the UI
        return Map.ofEntries(
                Map.entry("totalPackets",     s.getTotalPackets()),
                Map.entry("totalBytes",       s.getTotalBytes()),
                Map.entry("blockedPackets",   s.getBlockedPackets()),
                Map.entry("tcpPackets",       s.getTcpPackets()),
                Map.entry("udpPackets",       s.getUdpPackets()),
                Map.entry("icmpPackets",      s.getIcmpPackets()),
                Map.entry("bufferedPackets",  s.getBufferedPackets()),
                Map.entry("droppedFromBuffer",s.getDroppedFromBuffer()),
                Map.entry("packetsPerSecond", s.getPacketsPerSecond()),
                Map.entry("bytesPerSecond",   s.getBytesPerSecond())
        );
    }

    // ── CSV Export ────────────────────────────────────────────────────────────

    /**
     * Generate a CSV string for the given packet list.
     *
     * Columns: Time, Src IP, Dst IP, Protocol, Src Port, Dst Port,
     *          Application, SNI, Bytes, Status
     *
     * Called from PacketController on GET /api/packets/export
     */
    public String toCsv(List<PacketInfo> packets) {
        StringBuilder sb = new StringBuilder(packets.size() * 120);
        sb.append("Time,Src IP,Dst IP,Protocol,Src Port,Dst Port,Application,SNI,Bytes,Status\n");

        for (PacketInfo p : packets) {
            sb.append(csv(formatTime(p)))
                    .append(',').append(csv(p.getSrcIp()))
                    .append(',').append(csv(p.getDstIp()))
                    .append(',').append(csv(p.getProtocol() != null ? p.getProtocol().name() : ""))
                    .append(',').append(p.getSrcPort())
                    .append(',').append(p.getDstPort())
                    .append(',').append(csv(p.getApplication()))
                    .append(',').append(csv(p.getSni()))
                    .append(',').append(p.getTotalBytes())
                    .append(',').append(csv(statusLabel(p)))
                    .append('\n');
        }
        return sb.toString();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private String formatTime(PacketInfo p) {
        if (p.getCapturedAt() == null) return "";
        return CSV_TIME_FMT.format(p.getCapturedAt());
    }

    private String statusLabel(PacketInfo p) {
        if (!p.isBlocked()) return "ALLOWED";
        String rule = p.getBlockedBy() != null ? p.getBlockedBy() : "RULE";
        return "BLOCKED(" + rule + ")";
    }

    /** Wrap a value in CSV double-quotes and escape internal quotes. */
    private String csv(String value) {
        if (value == null || value.isBlank()) return "\"\"";
        return "\"" + value.replace("\"", "\"\"") + "\"";
    }
}

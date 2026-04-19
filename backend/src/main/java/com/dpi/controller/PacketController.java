package com.dpi.controller;

import com.dpi.dto.Dtos;
import com.dpi.model.PacketInfo;
import com.dpi.service.PacketService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.Parameter;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;

/**
 * PacketController — query, filter, and export captured packets.
 *
 * GET /api/packets           → list recent packets (with optional filters)
 * GET /api/packets/stats     → aggregate statistics
 * GET /api/packets/export    → CSV download of recent/filtered packets
 */
@RestController
@RequestMapping("/api/packets")
@RequiredArgsConstructor
@Tag(name = "Packets", description = "Query, filter, and export captured packets")
public class PacketController {

    private final PacketService packetService;

    private static final DateTimeFormatter FILE_TS =
            DateTimeFormatter.ofPattern("yyyyMMdd_HHmmss").withZone(ZoneId.of("UTC"));

    /**
     * List captured packets with optional filters.
     */
    @GetMapping
    @Operation(summary = "List packets",
            description = "Returns captured packets newest-first, up to 'limit' (max 1000)")
    public ResponseEntity<Dtos.ApiResponse> getPackets(
            @Parameter(description = "Filter by source IP")
            @RequestParam(required = false) String srcIp,

            @Parameter(description = "Filter by destination IP")
            @RequestParam(required = false) String dstIp,

            @Parameter(description = "Filter by protocol: TCP, UDP, ICMP")
            @RequestParam(required = false) String protocol,

            @Parameter(description = "Filter by source port")
            @RequestParam(required = false) Integer srcPort,

            @Parameter(description = "Filter by destination port")
            @RequestParam(required = false) Integer dstPort,

            @Parameter(description = "If true, return only blocked packets")
            @RequestParam(required = false) Boolean blocked,

            @Parameter(description = "Maximum results to return (1–1000, default 100)")
            @RequestParam(defaultValue = "100") int limit
    ) {
        var packets = packetService.getPackets(
                limit, srcIp, dstIp, protocol, srcPort, dstPort, blocked);

        return ResponseEntity.ok(
                Dtos.ApiResponse.ok("Found " + packets.size() + " packets", packets));
    }

    /**
     * Aggregate statistics (pps, bps, totals, protocol breakdown).
     */
    @GetMapping("/stats")
    @Operation(summary = "Get aggregate packet statistics")
    public ResponseEntity<Dtos.ApiResponse> getStats() {
        return ResponseEntity.ok(
                Dtos.ApiResponse.ok("Statistics", packetService.getStats()));
    }

    /**
     * Export packets as CSV download.
     *
     * Columns: Time, Src IP, Dst IP, Protocol, Src Port, Dst Port,
     *          Application, SNI, Bytes, Status
     *
     * Supports the same filter parameters as GET /api/packets.
     * The frontend's "↓ CSV" button calls this endpoint so that large
     * exports include all filtered server-side data, not just what's
     * currently rendered in the browser.
     */
    @GetMapping("/export")
    @Operation(summary = "Export packets as CSV",
            description = "Downloads a CSV file with packet data matching the given filters")
    public ResponseEntity<byte[]> exportCsv(
            @RequestParam(required = false) String srcIp,
            @RequestParam(required = false) String dstIp,
            @RequestParam(required = false) String protocol,
            @RequestParam(required = false) Integer srcPort,
            @RequestParam(required = false) Integer dstPort,
            @RequestParam(required = false) Boolean blocked,
            @RequestParam(defaultValue = "1000") int limit
    ) {
        List<PacketInfo> packets = packetService.getPackets(
                limit, srcIp, dstIp, protocol, srcPort, dstPort, blocked);

        String csv      = packetService.toCsv(packets);
        byte[] bytes    = csv.getBytes(java.nio.charset.StandardCharsets.UTF_8);
        String filename = "netwatch_" + FILE_TS.format(Instant.now()) + ".csv";

        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=\"" + filename + "\"")
                .header(HttpHeaders.CACHE_CONTROL, "no-cache, no-store")
                .contentType(MediaType.parseMediaType("text/csv;charset=UTF-8"))
                .body(bytes);
    }
}

package com.dpi.dto;

import com.dpi.model.RuleType;
import lombok.Data;

/**
 * DTOs (Data Transfer Objects) for REST API request and response bodies.
 *
 * Keeping these separate from the domain model means:
 *  - API contracts can evolve independently of the internal model
 *  - Validation annotations stay in the DTO, not the domain object
 *  - No JPA/Jackson annotations bleed into business logic
 */
public class Dtos {

    // ── Capture ───────────────────────────────────────────────────────────────

    /** Request body for POST /api/capture/start */
    @Data
    public static class StartCaptureRequest {
        /**
         * Optional path to a .pcap file.
         * If null/blank, capture from the live interface defined in application.properties.
         */
        private String pcapFilePath;
    }

    /** Response body for GET /api/capture/status */
    @Data
    public static class CaptureStatusResponse {
        private boolean running;
        private int     queueSize;
        private long    droppedPackets;
        private String  message;
    }

    // ── Rules ─────────────────────────────────────────────────────────────────

    /** Request body for POST /api/rules */
    @Data
    public static class AddRuleRequest {
        /**
         * Rule type. One of: BLOCK_IP, BLOCK_DOMAIN, BLOCK_PORT, BLOCK_PROTOCOL
         */
        private RuleType type;

        /**
         * The value to match against.
         * Examples:
         *   BLOCK_IP       → "192.168.1.50"
         *   BLOCK_DOMAIN   → "*.tiktok.com"
         *   BLOCK_PORT     → "3306"
         *   BLOCK_PROTOCOL → "UDP"
         */
        private String value;

        /** Optional human-readable note, e.g. "Block database access from guest VLAN" */
        private String description;
    }

    // ── Packets ───────────────────────────────────────────────────────────────

    /** Query parameters for GET /api/packets */
    @Data
    public static class PacketQueryParams {
        private String  srcIp;
        private String  dstIp;
        private String  protocol;   // "TCP", "UDP", "ICMP"
        private Integer srcPort;
        private Integer dstPort;
        private Boolean blocked;
        private int     limit = 100;
    }

    // ── Generic ───────────────────────────────────────────────────────────────

    /** Generic success/error response wrapper */
    @Data
    public static class ApiResponse {
        private boolean success;
        private String  message;
        private Object  data;

        public static ApiResponse ok(String message) {
            ApiResponse r = new ApiResponse();
            r.success = true;
            r.message = message;
            return r;
        }

        public static ApiResponse ok(String message, Object data) {
            ApiResponse r = ok(message);
            r.data = data;
            return r;
        }

        public static ApiResponse error(String message) {
            ApiResponse r = new ApiResponse();
            r.success = false;
            r.message = message;
            return r;
        }
    }
}

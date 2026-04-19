package com.dpi.model;

import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

/**
 * Rule — a single packet-filtering rule stored in the RuleEngine.
 *
 * A rule has a type and a value:
 *
 *   BLOCK_IP       →  value = "192.168.1.50"
 *   BLOCK_DOMAIN   →  value = "*.tiktok.com"    (wildcard supported)
 *   BLOCK_PORT     →  value = "3306"
 *   BLOCK_PROTOCOL →  value = "UDP"
 *
 * Rules are matched in the order: IP → PORT → PROTOCOL → DOMAIN
 */
@Data
@Builder
public class Rule {

    @Builder.Default
    private String id = UUID.randomUUID().toString();

    private RuleType type;
    private String   value;       // the thing to match
    private String   description; // optional human-readable note

    @Builder.Default
    private Instant createdAt = Instant.now();

    @Builder.Default
    private boolean enabled = true;

    /** Returns a compact label used in PacketInfo.blockedBy */
    public String label() {
        return type.name() + ":" + value;
    }
}

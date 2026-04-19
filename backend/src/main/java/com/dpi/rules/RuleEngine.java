package com.dpi.rules;

import com.dpi.model.PacketInfo;
import com.dpi.model.Rule;
import com.dpi.model.RuleType;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Component;

import java.util.Collection;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;

/**
 * RuleEngine — checks a packet against all active rules and returns
 * the first matching blocking rule (if any).
 *
 * ─── Rule evaluation order ────────────────────────────────────────────────────
 *   1. BLOCK_IP       — fastest (simple string equality)
 *   2. BLOCK_PORT     — fast (int comparison)
 *   3. BLOCK_PROTOCOL — fast (enum comparison)
 *   4. BLOCK_DOMAIN   — slightly slower (wildcard string matching)
 *
 * ─── Thread safety ────────────────────────────────────────────────────────────
 * Rules are stored in a ConcurrentHashMap keyed by rule ID.
 * Multiple worker threads call apply() concurrently; ConcurrentHashMap.values()
 * returns a weakly-consistent view safe for concurrent reads.
 * Adding/removing a rule while workers are running is safe.
 */
@Slf4j
@Component
public class RuleEngine {

    // Key: rule.getId(), Value: the Rule object
    private final ConcurrentHashMap<String, Rule> rules = new ConcurrentHashMap<>();

    /**
     * Pre-parsed port cache: rule ID → integer port value.
     *
     * WHY: matchesPort() is called on every single packet for every BLOCK_PORT rule.
     * Integer.parseInt() on every evaluation is wasteful — the port value never
     * changes after the rule is created. We parse once at add-time and cache the
     * result here. On a 4-worker pipeline at 100k pps that's 400k parseInt() calls
     * per second eliminated.
     */
    private final ConcurrentHashMap<String, Integer> parsedPortCache = new ConcurrentHashMap<>();

    // ── Rule management ───────────────────────────────────────────────────────

    public void addRule(Rule rule) {
        // Pre-parse port value once at add-time — not on every packet
        if (rule.getType() == RuleType.BLOCK_PORT) {
            try {
                int port = Integer.parseInt(rule.getValue());
                parsedPortCache.put(rule.getId(), port);
            } catch (NumberFormatException e) {
                log.warn("Rule {} has invalid port value '{}' — rule will never match",
                         rule.getId(), rule.getValue());
            }
        }
        rules.put(rule.getId(), rule);
        log.info("Rule added: {} → {}", rule.getType(), rule.getValue());
    }

    public boolean removeRule(String ruleId) {
        Rule removed = rules.remove(ruleId);
        if (removed != null) {
            parsedPortCache.remove(ruleId); // clean up cache entry
            log.info("Rule removed: {} → {}", removed.getType(), removed.getValue());
            return true;
        }
        return false;
    }

    public Collection<Rule> getAllRules() {
        return rules.values();
    }

    public int size() {
        return rules.size();
    }

    // ── Rule application ──────────────────────────────────────────────────────

    /**
     * Check whether this packet matches any active rule.
     *
     * @return Optional containing the matching Rule, or empty if allowed.
     */
    public Optional<Rule> apply(PacketInfo packet) {
        for (Rule rule : rules.values()) {
            if (!rule.isEnabled()) continue;

            if (matches(rule, packet)) {
                return Optional.of(rule);
            }
        }
        return Optional.empty();
    }

    // ── Matching logic ────────────────────────────────────────────────────────

    private boolean matches(Rule rule, PacketInfo packet) {
        return switch (rule.getType()) {
            case BLOCK_IP       -> matchesIp(rule.getValue(), packet);
            case BLOCK_PORT     -> matchesPort(rule, packet);
            case BLOCK_PROTOCOL -> matchesProtocol(rule.getValue(), packet);
            case BLOCK_DOMAIN   -> matchesDomain(rule.getValue(), packet);
        };
    }

    /**
     * IP rule: block if source OR destination IP equals the rule value.
     * Example rule value: "192.168.1.50"
     */
    private boolean matchesIp(String ruleIp, PacketInfo packet) {
        return ruleIp.equals(packet.getSrcIp()) || ruleIp.equals(packet.getDstIp());
    }

    /**
     * Port rule: block if destination port matches.
     * Uses pre-parsed cache — no parseInt on the hot path.
     */
    private boolean matchesPort(Rule rule, PacketInfo packet) {
        Integer cachedPort = parsedPortCache.get(rule.getId());
        return cachedPort != null && cachedPort == packet.getDstPort();
    }

    /**
     * Protocol rule: block if the packet's protocol matches (case-insensitive).
     * Example rule value: "UDP"
     */
    private boolean matchesProtocol(String ruleProto, PacketInfo packet) {
        return ruleProto.equalsIgnoreCase(packet.getProtocol().name());
    }

    /**
     * Domain rule: matches against the packet's SNI or application field.
     *
     * Supports wildcards:
     *   "*.tiktok.com"   matches "www.tiktok.com", "api.tiktok.com"
     *   "youtube.com"    matches only exact "youtube.com"
     *   "TikTok"         matches against the application name (for port-classified flows)
     *
     * Example rule value: "*.facebook.com" or "TikTok"
     */
    private boolean matchesDomain(String ruleDomain, PacketInfo packet) {
        String sni         = packet.getSni();
        String application = packet.getApplication();

        // Try matching against SNI first (most accurate)
        if (sni != null && !sni.isBlank()) {
            if (wildcardMatch(ruleDomain, sni)) return true;
        }

        // Try matching against the application label (e.g. "TikTok", "YouTube")
        if (application != null && !application.isBlank()) {
            if (wildcardMatch(ruleDomain, application)) return true;
        }

        return false;
    }

    /**
     * Simple wildcard matcher supporting leading "*." prefix.
     *
     * "*.example.com" matches any subdomain of example.com
     * "example.com"   requires an exact match
     */
    private boolean wildcardMatch(String pattern, String value) {
        if (pattern.startsWith("*.")) {
            // wildcard: pattern = "*.tiktok.com", match any subdomain
            String suffix = pattern.substring(1); // ".tiktok.com"
            return value.toLowerCase().endsWith(suffix.toLowerCase())
                || value.equalsIgnoreCase(pattern.substring(2)); // bare "tiktok.com"
        }
        return pattern.equalsIgnoreCase(value);
    }
}

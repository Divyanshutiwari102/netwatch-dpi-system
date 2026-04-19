package com.dpi;

import com.dpi.model.*;
import com.dpi.rules.RuleEngine;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * RuleEngineTest — validates all four rule types and wildcard domain matching.
 * Pure unit test — no Spring context needed.
 */
class RuleEngineTest {

    private RuleEngine ruleEngine;

    @BeforeEach
    void setUp() {
        ruleEngine = new RuleEngine();
    }

    // ── IP blocking ────────────────────────────────────────────────────────────

    @Test
    @DisplayName("Blocks packet from a blocked source IP")
    void blocksSourceIp() {
        ruleEngine.addRule(rule(RuleType.BLOCK_IP, "10.0.0.5"));

        PacketInfo packet = packet("10.0.0.5", "8.8.8.8", Protocol.TCP, 54321, 443, null, null);
        Optional<Rule> result = ruleEngine.apply(packet);

        assertThat(result).isPresent();
        assertThat(result.get().getType()).isEqualTo(RuleType.BLOCK_IP);
    }

    @Test
    @DisplayName("Blocks packet to a blocked destination IP")
    void blocksDestinationIp() {
        ruleEngine.addRule(rule(RuleType.BLOCK_IP, "1.2.3.4"));

        PacketInfo packet = packet("192.168.1.10", "1.2.3.4", Protocol.TCP, 54321, 80, null, null);
        assertThat(ruleEngine.apply(packet)).isPresent();
    }

    @Test
    @DisplayName("Allows packet when no IP rule matches")
    void allowsUnblockedIp() {
        ruleEngine.addRule(rule(RuleType.BLOCK_IP, "10.0.0.5"));

        PacketInfo packet = packet("192.168.1.100", "8.8.8.8", Protocol.TCP, 12345, 443, null, null);
        assertThat(ruleEngine.apply(packet)).isEmpty();
    }

    // ── Port blocking ──────────────────────────────────────────────────────────

    @Test
    @DisplayName("Blocks packet to a blocked destination port")
    void blocksPort() {
        ruleEngine.addRule(rule(RuleType.BLOCK_PORT, "3306"));

        PacketInfo packet = packet("192.168.1.5", "10.0.0.1", Protocol.TCP, 54321, 3306, null, null);
        assertThat(ruleEngine.apply(packet)).isPresent();
    }

    @Test
    @DisplayName("Does not block packet to a different port")
    void allowsDifferentPort() {
        ruleEngine.addRule(rule(RuleType.BLOCK_PORT, "3306"));

        PacketInfo packet = packet("192.168.1.5", "10.0.0.1", Protocol.TCP, 54321, 443, null, null);
        assertThat(ruleEngine.apply(packet)).isEmpty();
    }

    // ── Protocol blocking ─────────────────────────────────────────────────────

    @Test
    @DisplayName("Blocks all UDP traffic when UDP rule is active")
    void blocksUdpProtocol() {
        ruleEngine.addRule(rule(RuleType.BLOCK_PROTOCOL, "UDP"));

        PacketInfo packet = packet("192.168.1.5", "8.8.8.8", Protocol.UDP, 53000, 53, null, null);
        assertThat(ruleEngine.apply(packet)).isPresent();
    }

    @Test
    @DisplayName("Allows TCP when only UDP is blocked")
    void allowsTcpWhenUdpBlocked() {
        ruleEngine.addRule(rule(RuleType.BLOCK_PROTOCOL, "UDP"));

        PacketInfo packet = packet("192.168.1.5", "8.8.8.8", Protocol.TCP, 54321, 443, null, null);
        assertThat(ruleEngine.apply(packet)).isEmpty();
    }

    // ── Domain / SNI blocking ─────────────────────────────────────────────────

    @Test
    @DisplayName("Blocks exact SNI match")
    void blocksExactSni() {
        ruleEngine.addRule(rule(RuleType.BLOCK_DOMAIN, "youtube.com"));

        PacketInfo packet = packet("192.168.1.5", "142.250.80.14", Protocol.TCP, 54321, 443,
                                   "youtube.com", null);
        assertThat(ruleEngine.apply(packet)).isPresent();
    }

    @Test
    @DisplayName("Blocks wildcard SNI match: *.tiktok.com matches www.tiktok.com")
    void blocksWildcardSni() {
        ruleEngine.addRule(rule(RuleType.BLOCK_DOMAIN, "*.tiktok.com"));

        PacketInfo packet = packet("192.168.1.5", "1.2.3.4", Protocol.TCP, 54321, 443,
                                   "www.tiktok.com", null);
        assertThat(ruleEngine.apply(packet)).isPresent();
    }

    @Test
    @DisplayName("Blocks by application label when SNI is null")
    void blocksApplicationLabel() {
        ruleEngine.addRule(rule(RuleType.BLOCK_DOMAIN, "TikTok"));

        PacketInfo packet = packet("192.168.1.5", "1.2.3.4", Protocol.TCP, 54321, 443,
                                   null, "TikTok");
        assertThat(ruleEngine.apply(packet)).isPresent();
    }

    @Test
    @DisplayName("Does not block when SNI does not match wildcard")
    void allowsNonMatchingWildcard() {
        ruleEngine.addRule(rule(RuleType.BLOCK_DOMAIN, "*.tiktok.com"));

        PacketInfo packet = packet("192.168.1.5", "1.2.3.4", Protocol.TCP, 54321, 443,
                                   "www.youtube.com", null);
        assertThat(ruleEngine.apply(packet)).isEmpty();
    }

    // ── Rule lifecycle ────────────────────────────────────────────────────────

    @Test
    @DisplayName("Allows traffic after a rule is removed")
    void removingRuleAllowsTraffic() {
        Rule r = rule(RuleType.BLOCK_IP, "10.0.0.5");
        ruleEngine.addRule(r);

        PacketInfo packet = packet("10.0.0.5", "8.8.8.8", Protocol.TCP, 54321, 443, null, null);
        assertThat(ruleEngine.apply(packet)).isPresent(); // blocked

        ruleEngine.removeRule(r.getId());
        assertThat(ruleEngine.apply(packet)).isEmpty();   // now allowed
    }

    @Test
    @DisplayName("Disabled rule is not evaluated")
    void disabledRuleIsIgnored() {
        Rule r = rule(RuleType.BLOCK_IP, "10.0.0.5");
        r.setEnabled(false);
        ruleEngine.addRule(r);

        PacketInfo packet = packet("10.0.0.5", "8.8.8.8", Protocol.TCP, 54321, 443, null, null);
        assertThat(ruleEngine.apply(packet)).isEmpty();
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private Rule rule(RuleType type, String value) {
        return Rule.builder().type(type).value(value).build();
    }

    private PacketInfo packet(String srcIp, String dstIp, Protocol proto,
                              int srcPort, int dstPort, String sni, String app) {
        return PacketInfo.builder()
                .srcIp(srcIp).dstIp(dstIp).protocol(proto)
                .srcPort(srcPort).dstPort(dstPort)
                .sni(sni).application(app)
                .totalBytes(100)
                .build();
    }
}

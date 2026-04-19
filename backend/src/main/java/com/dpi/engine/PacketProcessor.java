package com.dpi.engine;

import com.dpi.flow.FlowTracker;
import com.dpi.model.FlowRecord;
import com.dpi.model.PacketInfo;
import com.dpi.rules.RuleEngine;
import com.dpi.sni.ApplicationClassifier;
import com.dpi.sni.SniExtractor;
import com.dpi.storage.PacketStore;
import com.dpi.websocket.PacketBroadcaster;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.pcap4j.packet.Packet;
import org.springframework.stereotype.Component;

/**
 * PacketProcessor — the core DPI processing unit.
 *
 * Each worker thread in the thread pool runs this same processor.
 * It takes a raw Pcap4J {@link Packet} and a partially-filled
 * {@link PacketInfo} (from PacketParser), then:
 *
 *   Step 1 – SNI extraction  →  reads TLS Client Hello bytes
 *   Step 2 – Classification  →  maps SNI/port → app name
 *   Step 3 – Flow tracking   →  updates the 5-tuple flow table
 *   Step 4 – Rule check      →  decides ALLOW or BLOCK
 *   Step 5 – Store + Emit    →  saves to ring buffer, pushes to WebSocket
 *
 * Being a @Component means Spring can inject all dependencies —
 * no factory boilerplate needed.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PacketProcessor {

    private final SniExtractor        sniExtractor;
    private final ApplicationClassifier classifier;
    private final FlowTracker         flowTracker;
    private final RuleEngine          ruleEngine;
    private final PacketStore         packetStore;
    private final PacketBroadcaster   broadcaster;

    /**
     * Process a single packet through the full DPI pipeline.
     *
     * @param raw    the raw Pcap4J packet (needed for SNI byte-level parsing)
     * @param packet the partially-filled PacketInfo from PacketParser
     */
    public void process(Packet raw, PacketInfo packet) {

        // ── Step 1: SNI Extraction ───────────────────────────────────────────
        // TLS Client Hello only appears on port 443 (HTTPS) and occasionally
        // 8443 (HTTPS-Alt). Guarding here avoids calling the extractor — and
        // allocating its Optional return — for the majority of packets (HTTP,
        // DNS, SSH, etc.) that can never carry an SNI.
        //
        // The extractor already returns empty() quickly for non-TLS bytes,
        // but avoiding the call entirely is measurably faster at high pps.
        if (packet.getDstPort() == 443 || packet.getDstPort() == 8443
                || packet.getSrcPort() == 443) {
            sniExtractor.extract(raw).ifPresent(packet::setSni);
        }

        // ── Step 2: Application Classification ──────────────────────────────
        String application = classifier.classify(packet.getSni(), packet.getDstPort());
        packet.setApplication(application);

        // ── Step 3: Flow Tracking ────────────────────────────────────────────
        FlowRecord flow = flowTracker.track(packet);

        // Propagate cached SNI from an earlier packet on this flow
        if (packet.getSni() == null && flow.getSni() != null) {
            packet.setSni(flow.getSni());
            packet.setApplication(flow.getApplication());
        }

        // Push new DPI result back into the flow record
        if (packet.getSni() != null && flow.getSni() == null) {
            flow.classify(packet.getSni(), packet.getApplication());
        }

        // ── Step 4: Rule Engine ──────────────────────────────────────────────
        ruleEngine.apply(packet).ifPresent(rule -> {
            packet.setBlocked(true);
            packet.setBlockedBy(rule.label());
            flow.markBlocked();
            // INFO not DEBUG — rule matches are operationally significant events.
            // An operator running the system must see these without changing log level.
            log.info("[BLOCKED] {} — rule: {}", packet.toSummary(), rule.label());
        });

        // ── Step 5: Store + Broadcast ────────────────────────────────────────
        packetStore.store(packet);
        broadcaster.broadcast(packet);

        log.trace("Processed: {}", packet.toSummary());
    }
}

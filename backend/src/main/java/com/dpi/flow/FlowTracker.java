package com.dpi.flow;

import com.dpi.model.FlowKey;
import com.dpi.model.FlowRecord;
import com.dpi.model.PacketInfo;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.Collection;
import java.util.concurrent.ConcurrentHashMap;

/**
 * FlowTracker — maintains the live flow table.
 *
 * ─── What is a flow? ────────────────────────────────────────────────────────
 * A flow is a sequence of packets sharing the same 5-tuple:
 *   (srcIp, srcPort, dstIp, dstPort, protocol)
 * Example: your browser talking to 142.250.80.14:443 over TCP.
 *
 * ─── Design ──────────────────────────────────────────────────────────────────
 * We use a ConcurrentHashMap so multiple worker threads can update different
 * flow entries simultaneously without locking each other out.
 *
 * The map key is FlowKey (a Java record — immutable, with correct equals/hashCode).
 * The value is FlowRecord — holds stats, state, and DPI results for that flow.
 *
 * ─── Garbage Collection ───────────────────────────────────────────────────────
 * @Scheduled kicks off a GC sweep every 30 seconds.
 * Any flow idle for more than dpi.flow.timeout-seconds is removed.
 */
@Slf4j
@Component
public class FlowTracker {

    private final ConcurrentHashMap<FlowKey, FlowRecord> flowTable = new ConcurrentHashMap<>();

    @Value("${dpi.flow.timeout-seconds:120}")
    private long flowTimeoutSeconds;

    /**
     * Called by PacketProcessor for every parsed packet.
     *
     * Looks up (or creates) the FlowRecord for this packet's 5-tuple,
     * updates its statistics, and returns it for further enrichment.
     */
    public FlowRecord track(PacketInfo packet) {
        FlowKey key = FlowKey.from(packet);

        // computeIfAbsent is atomic — safe to call from multiple threads
        FlowRecord flow = flowTable.computeIfAbsent(key, FlowRecord::new);

        // Update counters (AtomicLong inside FlowRecord — thread-safe)
        flow.recordPacket(packet.getTotalBytes());

        // Transition NEW → ESTABLISHED when we see a reply (reverse direction)
        if (flow.getState() == com.dpi.model.FlowState.NEW) {
            // If either direction's reverse key already exists, mark established
            if (flowTable.containsKey(key.reverse())) {
                flow.markEstablished();
            }
        }

        // Handle TCP FIN/RST — mark the flow as closed so GC picks it up sooner
        if (packet.getProtocol() == com.dpi.model.Protocol.TCP) {
            int flags = packet.getTcpFlags();
            boolean fin = (flags & 0x01) != 0;
            boolean rst = (flags & 0x04) != 0;
            if (fin || rst) {
                flow.markClosed();
            }
        }

        return flow;
    }

    /** Returns all currently tracked flows (snapshot — safe to iterate) */
    public Collection<FlowRecord> getAllFlows() {
        return new ArrayList<>(flowTable.values());
    }

    /** How many flows are currently being tracked */
    public int size() {
        return flowTable.size();
    }

    /**
     * Scheduled garbage collection — runs every 30 seconds.
     *
     * Two eviction policies:
     *
     *   CLOSED flows  → removed after 10 seconds of inactivity.
     *     FIN/RST packets mark the flow CLOSED immediately. Keeping them
     *     for 120 seconds wastes memory — the connection is done.
     *     10 seconds is enough for any late-arriving retransmissions.
     *
     *   All other flows → removed after dpi.flow.timeout-seconds (default 120s).
     *     UDP and ESTABLISHED TCP flows may have long idle periods
     *     (e.g. keepalive timers) — we give them the full timeout.
     *
     * removeIf() on ConcurrentHashMap is atomic per-entry and safe to call
     * while worker threads are inserting/updating other entries.
     */
    @Scheduled(fixedDelay = 30_000)
    public void evictIdleFlows() {
        long timeoutMs       = flowTimeoutSeconds * 1_000;
        long closedTimeoutMs = 10_000;

        int[] counts = {0}; // single-element array trick for lambda counter

        flowTable.entrySet().removeIf(e -> {
            FlowRecord f = e.getValue();
            boolean evict = (f.getState() == com.dpi.model.FlowState.CLOSED)
                    ? f.isIdle(closedTimeoutMs)
                    : f.isIdle(timeoutMs);
            if (evict) counts[0]++;
            return evict;
        });

        if (counts[0] > 0) {
            log.info("[FlowGC] Evicted {} idle/closed flows. Active flows remaining: {}",
                     counts[0], flowTable.size());
        } else {
            log.debug("[FlowGC] Sweep complete — no flows evicted. Active: {}", flowTable.size());
        }
    }
}

package com.dpi.model;

import lombok.Getter;
import lombok.ToString;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;

/**
 * FlowRecord — one entry in the flow table for a single 5-tuple.
 *
 * Multiple worker threads can update packet/byte counters concurrently,
 * so we use AtomicLong for lock-free increments.
 *
 * Everything else (sni, application, state) is written once by the first
 * worker that processes a packet for this flow, so volatile is enough.
 */
@Getter
@ToString
public class FlowRecord {

    private final FlowKey key;
    private final Instant firstSeen;

    /** Updated every time a new packet arrives for this flow */
    private volatile Instant lastSeen;

    // ── Counters (lock-free) ───────────────────────────────────────────────
    private final AtomicLong totalPackets = new AtomicLong(0);
    private final AtomicLong totalBytes   = new AtomicLong(0);

    // ── DPI results (set once) ─────────────────────────────────────────────
    private volatile String sni;
    private volatile String application;

    // ── State ──────────────────────────────────────────────────────────────
    private volatile FlowState state = FlowState.NEW;
    private volatile boolean   blocked = false;

    public FlowRecord(FlowKey key) {
        this.key       = key;
        this.firstSeen = Instant.now();
        this.lastSeen  = this.firstSeen;
    }

    /**
     * Called every time a packet is matched to this flow.
     * Thread-safe: AtomicLong increments + volatile write.
     */
    public void recordPacket(int bytes) {
        totalPackets.incrementAndGet();
        totalBytes.addAndGet(bytes);
        lastSeen = Instant.now();
    }

    /** DPI worker calls this when it successfully extracts the SNI */
    public void classify(String sni, String application) {
        this.sni         = sni;
        this.application = application;
        this.state       = FlowState.CLASSIFIED;
    }

    public void markEstablished() { this.state = FlowState.ESTABLISHED; }
    public void markBlocked()     { this.blocked = true; }
    public void markClosed()      { this.state = FlowState.CLOSED; }

    /**
     * Returns true if this flow has had no traffic for longer than
     * the given timeout.  Called by the FlowTracker GC sweep.
     */
    public boolean isIdle(long timeoutMs) {
        return Instant.now().toEpochMilli() - lastSeen.toEpochMilli() > timeoutMs;
    }

    /** Duration in milliseconds since the flow was first seen */
    public long durationMs() {
        return Instant.now().toEpochMilli() - firstSeen.toEpochMilli();
    }
}

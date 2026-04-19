package com.dpi.websocket;

import com.dpi.model.PacketInfo;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.messaging.simp.SimpMessagingTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedQueue;
import java.util.concurrent.atomic.AtomicLong;

/**
 * PacketBroadcaster — batched, sampled WebSocket broadcaster.
 *
 * ─── Root cause of the buffer overflow ───────────────────────────────────────
 * The previous implementation called convertAndSend() for every packet.
 * At 50k pps across 4 worker threads: 50k STOMP enqueue operations/second,
 * each carrying a full PacketInfo (~1 KB JSON). The STOMP broker's in-memory
 * queue and the browser's WebSocket receive buffer both overflowed.
 *
 * ─── Fix 1 — Sampling ────────────────────────────────────────────────────────
 * Forward only 1 in N packets (dpi.ws.sample-rate, default 5).
 * Blocked packets ALWAYS bypass the gate — operators must see every rule hit.
 *
 * ─── Fix 2 — Batching ────────────────────────────────────────────────────────
 * A @Scheduled method drains the staging queue every 300ms and sends one
 * STOMP frame containing up to 50 summaries as a JSON array.
 * Result: ≤3 STOMP frames/second instead of 50,000.
 *
 * ─── Fix 3 — WsPacketSummary ─────────────────────────────────────────────────
 * 11-field record instead of 18-field PacketInfo. ~200 bytes vs ~1000 bytes.
 * 50-packet batch ≈ 10 KB — well within the 256 KB message limit.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class PacketBroadcaster {

    private final SimpMessagingTemplate messagingTemplate;

    @Value("${dpi.ws.sample-rate:5}")
    private int sampleRate;

    @Value("${dpi.ws.max-batch-size:50}")
    private int maxBatchSize;

    // Staging queue — ConcurrentLinkedQueue is lock-free (never blocks on offer/poll)
    private final ConcurrentLinkedQueue<WsPacketSummary> pending = new ConcurrentLinkedQueue<>();

    // Metrics
    private final AtomicLong receiveCounter = new AtomicLong(0);
    private final AtomicLong broadcastCount = new AtomicLong(0);
    private final AtomicLong batchCount     = new AtomicLong(0);

    /**
     * Hot path — called by N worker threads simultaneously.
     * Non-blocking: one CAS increment + one conditional queue offer.
     */
    public void broadcast(PacketInfo packet) {
        long n = receiveCounter.incrementAndGet();
        // Always forward blocked packets; sample everything else
        if (!packet.isBlocked() && (n % sampleRate != 0)) return;
        pending.offer(WsPacketSummary.from(packet));
    }

    /**
     * Scheduled flush — runs on Spring's task scheduler thread, isolated from workers.
     * Drains up to maxBatchSize summaries and sends them as a single STOMP message.
     */
    @Scheduled(fixedDelayString = "${dpi.ws.batch-interval-ms:300}")
    public void flushBatch() {
        if (pending.isEmpty()) return;

        List<WsPacketSummary> batch = new ArrayList<>(maxBatchSize);
        WsPacketSummary item;
        while (batch.size() < maxBatchSize && (item = pending.poll()) != null) {
            batch.add(item);
        }
        if (batch.isEmpty()) return;

        try {
            messagingTemplate.convertAndSend("/topic/packets", batch);
            broadcastCount.addAndGet(batch.size());
            long b = batchCount.incrementAndGet();
            if (b % 200 == 0) {
                log.debug("[WS] {} batches, {} packets broadcast of {} received",
                        b, broadcastCount.get(), receiveCounter.get());
            }
        } catch (Exception e) {
            log.warn("[WS] Batch flush failed: {}", e.getMessage());
        }
    }

    public long getTotalBroadcast()   { return broadcastCount.get(); }
    public long getTotalBatchesSent() { return batchCount.get(); }
    public long getTotalReceived()    { return receiveCounter.get(); }
    public int  getPendingQueueSize() { return pending.size(); }
}

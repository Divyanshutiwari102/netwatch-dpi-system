package com.dpi.storage;

import com.dpi.model.PacketInfo;
import com.dpi.model.Protocol;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.ConcurrentLinkedDeque;
import java.util.concurrent.atomic.AtomicLong;

/**
 * PacketStore — thread-safe in-memory ring buffer + aggregate statistics.
 *
 * ─── Data structure ───────────────────────────────────────────────────────────
 * ConcurrentLinkedDeque as a bounded ring buffer:
 *   - addLast() when capacity not reached → O(1)
 *   - pollFirst() + addLast() when full   → O(1) eviction of oldest entry
 *   - No global lock — ConcurrentLinkedDeque is lock-free
 *
 * ─── TOCTOU note ──────────────────────────────────────────────────────────────
 * Two concurrent threads can both pass the size() >= maxCapacity check and
 * both call pollFirst() — evicting 2 entries for 1 add. This is a known soft
 * race: the buffer briefly undershoots capacity by the number of simultaneous
 * writers. We accept this tradeoff: a synchronized block would serialize all
 * writes through a single lock on the hottest path in the system.
 *
 * ─── Metrics ──────────────────────────────────────────────────────────────────
 * Aggregate counters (totalPackets, totalBytes, etc.) use AtomicLong for
 * lock-free concurrent increments from all worker threads.
 *
 * Packets/sec and bytes/sec use a 1-second sliding window:
 *   - windowPackets/windowBytes accumulate during the window
 *   - @Scheduled snapshots them every second → packetsPerSecond / bytesPerSecond
 *   - The dashboard reads these via /api/packets/stats every 2 seconds
 */
@Slf4j
@Component
public class PacketStore {

    @Value("${dpi.capture.ring-buffer-size:50000}")
    private int maxCapacity;

    // ── Ring buffer ───────────────────────────────────────────────────────────
    private final ConcurrentLinkedDeque<PacketInfo> buffer = new ConcurrentLinkedDeque<>();

    // ── Lifetime counters ─────────────────────────────────────────────────────
    private final AtomicLong totalPackets     = new AtomicLong(0);
    private final AtomicLong totalBytes       = new AtomicLong(0);
    private final AtomicLong blockedCount     = new AtomicLong(0);
    private final AtomicLong tcpCount         = new AtomicLong(0);
    private final AtomicLong udpCount         = new AtomicLong(0);
    private final AtomicLong icmpCount        = new AtomicLong(0);
    private final AtomicLong droppedFromBuffer = new AtomicLong(0);

    // ── 1-second rate window ──────────────────────────────────────────────────
    // Accumulated during the current 1-second window (reset by computeRates())
    private final AtomicLong windowPackets = new AtomicLong(0);
    private final AtomicLong windowBytes   = new AtomicLong(0);

    // Snapshot values read by getStats() — written by computeRates(), read by many
    private volatile long packetsPerSecond = 0;
    private volatile long bytesPerSecond   = 0;

    // ── Write ─────────────────────────────────────────────────────────────────

    /**
     * Store a fully-processed packet.
     * Called by every PacketProcessor worker thread — must be fast and thread-safe.
     */
    public void store(PacketInfo packet) {
        if (buffer.size() >= maxCapacity) {
            buffer.pollFirst();
            droppedFromBuffer.incrementAndGet();
        }
        buffer.addLast(packet);

        totalPackets.incrementAndGet();
        final int bytes = packet.getTotalBytes();
        totalBytes.addAndGet(bytes);
        windowPackets.incrementAndGet();
        windowBytes.addAndGet(bytes);

        if (packet.isBlocked())                         blockedCount.incrementAndGet();
        if (packet.getProtocol() == Protocol.TCP)       tcpCount.incrementAndGet();
        else if (packet.getProtocol() == Protocol.UDP)  udpCount.incrementAndGet();
        else if (packet.getProtocol() == Protocol.ICMP) icmpCount.incrementAndGet();
    }

    // ── Rate computation ──────────────────────────────────────────────────────

    /**
     * Snapshot the 1-second window counters.
     *
     * getAndSet(0) atomically reads the accumulated count and resets it to 0
     * in a single CAS — no lock, no missed increments between the read and reset.
     *
     * @Scheduled requires @EnableScheduling (present on DpiApplication).
     */
    @Scheduled(fixedDelay = 1_000)
    public void computeRates() {
        packetsPerSecond = windowPackets.getAndSet(0);
        bytesPerSecond   = windowBytes.getAndSet(0);
    }

    // ── Read / Query ──────────────────────────────────────────────────────────

    public List<PacketInfo> getRecent(int limit) {
        PacketInfo[] snapshot = buffer.toArray(new PacketInfo[0]);
        List<PacketInfo> result = new ArrayList<>(limit);
        for (int i = snapshot.length - 1; i >= 0 && result.size() < limit; i--) {
            result.add(snapshot[i]);
        }
        return result;
    }

    public List<PacketInfo> query(PacketFilter filter, int limit) {
        PacketInfo[] snapshot = buffer.toArray(new PacketInfo[0]);
        List<PacketInfo> result = new ArrayList<>(limit);
        for (int i = snapshot.length - 1; i >= 0 && result.size() < limit; i--) {
            if (filter.matches(snapshot[i])) result.add(snapshot[i]);
        }
        return result;
    }

    // ── Stats ─────────────────────────────────────────────────────────────────

    public PacketStats getStats() {
        return PacketStats.builder()
                .totalPackets(totalPackets.get())
                .totalBytes(totalBytes.get())
                .blockedPackets(blockedCount.get())
                .tcpPackets(tcpCount.get())
                .udpPackets(udpCount.get())
                .icmpPackets(icmpCount.get())
                .bufferedPackets(buffer.size())
                .droppedFromBuffer(droppedFromBuffer.get())
                .packetsPerSecond(packetsPerSecond)
                .bytesPerSecond(bytesPerSecond)
                .build();
    }

    // ── Inner types ───────────────────────────────────────────────────────────

    public record PacketFilter(
            String srcIp, String dstIp, Protocol protocol,
            Integer srcPort, Integer dstPort, Boolean blocked
    ) {
        public boolean matches(PacketInfo p) {
            if (srcIp    != null && !srcIp.isBlank()    && !srcIp.equals(p.getSrcIp()))    return false;
            if (dstIp    != null && !dstIp.isBlank()    && !dstIp.equals(p.getDstIp()))    return false;
            if (protocol != null                         && protocol != p.getProtocol())    return false;
            if (srcPort  != null && srcPort  != 0        && srcPort  != p.getSrcPort())     return false;
            if (dstPort  != null && dstPort  != 0        && dstPort  != p.getDstPort())     return false;
            if (blocked  != null                         && blocked  != p.isBlocked())      return false;
            return true;
        }
    }

    @lombok.Builder
    @lombok.Data
    public static class PacketStats {
        private long totalPackets;
        private long totalBytes;
        private long blockedPackets;
        private long tcpPackets;
        private long udpPackets;
        private long icmpPackets;
        private int  bufferedPackets;
        private long droppedFromBuffer;
        /** Packets captured in the last 1-second window. Updated by @Scheduled every 1s. */
        private long packetsPerSecond;
        /** Bytes captured in the last 1-second window. Updated by @Scheduled every 1s. */
        private long bytesPerSecond;
    }
}

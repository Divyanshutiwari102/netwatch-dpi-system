package com.dpi;

import com.dpi.flow.FlowTracker;
import com.dpi.model.*;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicInteger;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * FlowTrackerTest — verifies flow creation, stats aggregation,
 * and thread-safe concurrent access from multiple worker threads.
 */
class FlowTrackerTest {

    private FlowTracker tracker;

    @BeforeEach
    void setUp() {
        tracker = new FlowTracker();
    }

    @Test
    @DisplayName("Creates a new flow for a new 5-tuple")
    void createsNewFlow() {
        PacketInfo p = packet("192.168.1.1", 54321, "93.184.216.34", 443, Protocol.TCP);
        FlowRecord flow = tracker.track(p);

        assertThat(flow).isNotNull();
        assertThat(flow.getKey().srcIp()).isEqualTo("192.168.1.1");
        assertThat(flow.getTotalPackets().get()).isEqualTo(1);
        assertThat(tracker.size()).isEqualTo(1);
    }

    @Test
    @DisplayName("Returns the same flow for subsequent packets with the same 5-tuple")
    void returnsExistingFlow() {
        PacketInfo p1 = packet("10.0.0.1", 1234, "8.8.8.8", 53, Protocol.UDP);
        PacketInfo p2 = packet("10.0.0.1", 1234, "8.8.8.8", 53, Protocol.UDP);

        FlowRecord f1 = tracker.track(p1);
        FlowRecord f2 = tracker.track(p2);

        assertThat(f1).isSameAs(f2);
        assertThat(f1.getTotalPackets().get()).isEqualTo(2);
        assertThat(tracker.size()).isEqualTo(1); // still one flow
    }

    @Test
    @DisplayName("Creates separate flows for different 5-tuples")
    void createsSeparateFlows() {
        tracker.track(packet("10.0.0.1", 1111, "8.8.8.8", 443, Protocol.TCP));
        tracker.track(packet("10.0.0.2", 2222, "8.8.8.8", 443, Protocol.TCP));
        tracker.track(packet("10.0.0.1", 1111, "8.8.8.8",  53, Protocol.UDP));

        assertThat(tracker.size()).isEqualTo(3);
    }

    @Test
    @DisplayName("Accumulates byte counts correctly")
    void accumulatesBytes() {
        PacketInfo p1 = packet("1.1.1.1", 100, "2.2.2.2", 80, Protocol.TCP);
        p1.setTotalBytes(1400); // simulate full-size TCP segment
        PacketInfo p2 = packet("1.1.1.1", 100, "2.2.2.2", 80, Protocol.TCP);
        p2.setTotalBytes(300);

        tracker.track(p1);
        FlowRecord flow = tracker.track(p2);

        assertThat(flow.getTotalBytes().get()).isEqualTo(1700);
    }

    @Test
    @DisplayName("Thread-safe: 10 threads tracking the same flow see consistent packet count")
    void threadSafe_concurrentTracking() throws InterruptedException {
        int threadCount  = 10;
        int packetsEach  = 1000;

        ExecutorService pool = Executors.newFixedThreadPool(threadCount);
        CountDownLatch latch = new CountDownLatch(threadCount);

        for (int t = 0; t < threadCount; t++) {
            pool.submit(() -> {
                for (int i = 0; i < packetsEach; i++) {
                    tracker.track(packet("5.5.5.5", 9999, "6.6.6.6", 443, Protocol.TCP));
                }
                latch.countDown();
            });
        }

        latch.await(10, TimeUnit.SECONDS);
        pool.shutdown();

        // One flow, exactly threadCount * packetsEach total packets
        assertThat(tracker.size()).isEqualTo(1);
        assertThat(tracker.getAllFlows().iterator().next().getTotalPackets().get())
                .isEqualTo((long) threadCount * packetsEach);
    }

    @Test
    @DisplayName("Thread-safe: 10 threads creating different flows with no data races")
    void threadSafe_concurrentFlowCreation() throws InterruptedException {
        int threadCount = 10;
        AtomicInteger errors = new AtomicInteger(0);
        ExecutorService pool = Executors.newFixedThreadPool(threadCount);
        CountDownLatch latch = new CountDownLatch(threadCount);

        for (int t = 0; t < threadCount; t++) {
            final int threadId = t;
            pool.submit(() -> {
                try {
                    // Each thread creates a unique flow
                    tracker.track(packet("10.0.0." + threadId, 1000 + threadId,
                                        "8.8.8.8", 443, Protocol.TCP));
                } catch (Exception e) {
                    errors.incrementAndGet();
                } finally {
                    latch.countDown();
                }
            });
        }

        latch.await(5, TimeUnit.SECONDS);
        pool.shutdown();

        assertThat(errors.get()).isZero();
        assertThat(tracker.size()).isEqualTo(threadCount);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private PacketInfo packet(String srcIp, int srcPort, String dstIp, int dstPort, Protocol proto) {
        PacketInfo p = PacketInfo.builder()
                .srcIp(srcIp).srcPort(srcPort)
                .dstIp(dstIp).dstPort(dstPort)
                .protocol(proto)
                .totalBytes(100)
                .flowKey(srcIp + ":" + srcPort + "-" + dstIp + ":" + dstPort + "-" + proto)
                .build();
        return p;
    }
}

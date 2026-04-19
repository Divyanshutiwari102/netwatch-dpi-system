package com.dpi.capture;

import com.dpi.engine.PacketProcessor;
import com.dpi.model.PacketInfo;
import com.dpi.parser.PacketParser;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.pcap4j.core.*;
import org.pcap4j.packet.Packet;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.*;
import java.util.concurrent.atomic.AtomicBoolean;
import java.util.concurrent.atomic.AtomicLong;

/**
 * CaptureEngine — manages the full packet capture and processing pipeline.
 *
 * ─── Pipeline ─────────────────────────────────────────────────────────────────
 *
 *   [Network Interface]   ← Pcap4J opens a native libpcap/Npcap handle
 *          │
 *   [Listener Thread]     ← single thread — MUST NEVER BLOCK
 *          │  offer() to bounded BlockingQueue
 *          ▼
 *   [LinkedBlockingQueue] ← decouples capture from processing
 *          │  N worker threads drain concurrently
 *          ▼
 *   [Worker Thread Pool]  ← PacketProcessor.process() per packet
 *
 * ─── Interface selection (cross-platform) ────────────────────────────────────
 * "any" only exists on Linux. On Windows (Npcap) and macOS it causes an
 * "interface not found" error. On Windows, auto-select also used to pick
 * Bluetooth adapters (they have IP addresses but no useful traffic).
 *
 * The new selectInterface() uses a scoring function:
 *   +200  Wi-Fi / Ethernet / WLAN (preferred keywords in name or description)
 *   +100  Has at least one IP address assigned
 *   -500  Bluetooth, Hyper-V, VMware, VirtualBox, ISATAP, Teredo, TAP, pseudo
 *   -1000 Loopback
 *
 * The adapter with the highest non-negative score wins.
 * Explicitly configured names bypass scoring entirely.
 */
@Slf4j
@Component
@RequiredArgsConstructor
public class CaptureEngine {

    private final PacketParser    packetParser;
    private final PacketProcessor packetProcessor;

    // ── Config ────────────────────────────────────────────────────────────────

    /**
     * Set to a real interface name to pin to a specific adapter.
     * "auto" (default) → use selectInterface() scoring.
     * "any"            → treated as "auto" (Linux-only, not safe cross-platform).
     */
    @Value("${dpi.capture.interface:auto}")
    private String configuredInterface;

    @Value("${dpi.capture.snaplen:65535}")
    private int snapLen;

    @Value("${dpi.capture.timeout-ms:10}")
    private int readTimeoutMs;

    @Value("${dpi.capture.worker-threads:4}")
    private int workerThreads;

    @Value("${dpi.capture.queue-size:5000}")
    private int queueCapacity;

    // ── Internal State ────────────────────────────────────────────────────────

    private final AtomicBoolean     running               = new AtomicBoolean(false);
    private volatile PcapHandle     handle;
    private BlockingQueue<QueueEntry> queue;
    private Thread                  captureThread;
    private ExecutorService         workerPool;
    private volatile String         selectedInterfaceName = "unknown";
    private volatile boolean        fileCapture           = false;

    // AtomicLong — NOT volatile long.
    // droppedPackets++ is three operations (read/add/write), not atomic.
    // AtomicLong.incrementAndGet() is a single CAS — always correct under concurrency.
    private final AtomicLong droppedPackets = new AtomicLong(0);

    // ── Public API ────────────────────────────────────────────────────────────

    public synchronized void startCapture() throws PcapNativeException, NotOpenException {
        if (running.get()) throw new IllegalStateException("Capture is already running");

        PcapNetworkInterface nif = selectInterface();
        selectedInterfaceName = nif.getName();

        String desc = Optional.ofNullable(nif.getDescription())
                .filter(s -> !s.isBlank()).orElse("no description");
        log.info("[Capture] Selected interface: {} ({})", selectedInterfaceName, desc);

        handle = nif.openLive(snapLen, PcapNetworkInterface.PromiscuousMode.PROMISCUOUS, readTimeoutMs);

        queue      = new LinkedBlockingQueue<>(queueCapacity);
        workerPool = buildWorkerPool();
        fileCapture = false;
        running.set(true);

        for (int i = 0; i < workerThreads; i++) {
            final int id = i;
            workerPool.submit(() -> workerLoop(id));
        }

        captureThread = new Thread(this::captureLoop, "pcap4j-capture");
        captureThread.setDaemon(true);
        captureThread.start();

        log.info("[Capture] Started — interface={}, workers={}, queue={}",
                selectedInterfaceName, workerThreads, queueCapacity);
    }

    public synchronized void startFromFile(String filePath) throws PcapNativeException, NotOpenException {
        if (running.get()) throw new IllegalStateException("Capture is already running");

        log.info("[Capture] Reading from file: {}", filePath);
        handle = Pcaps.openOffline(filePath);

        queue                 = new LinkedBlockingQueue<>(queueCapacity);
        workerPool            = buildWorkerPool();
        fileCapture           = true;
        selectedInterfaceName = "pcap-file";
        running.set(true);

        for (int i = 0; i < workerThreads; i++) {
            final int id = i;
            workerPool.submit(() -> workerLoop(id));
        }

        captureThread = new Thread(this::captureLoop, "pcap4j-file-reader");
        captureThread.setDaemon(true);
        captureThread.start();
    }

    public synchronized void stopCapture() {
        if (!running.get()) return;
        log.info("[Capture] Stopping...");
        running.set(false);

        if (handle != null && handle.isOpen()) {
            try { handle.breakLoop(); Thread.sleep(200); handle.close(); }
            catch (Exception e) { log.warn("[Capture] Handle close error: {}", e.getMessage()); }
            handle = null;
        }
        if (captureThread != null) captureThread.interrupt();

        workerPool.shutdown();
        try {
            if (!workerPool.awaitTermination(3, TimeUnit.SECONDS)) workerPool.shutdownNow();
        } catch (InterruptedException e) {
            workerPool.shutdownNow();
            Thread.currentThread().interrupt();
        }
        log.info("[Capture] Stopped. Queue-full drops: {}", droppedPackets.get());
    }

    public boolean isRunning()            { return running.get(); }
    public long    getDroppedPackets()    { return droppedPackets.get(); }
    public int     getQueueSize()         { return queue != null ? queue.size() : 0; }
    public String  getSelectedInterface() { return selectedInterfaceName; }

    public static List<String> listInterfaces() {
        try {
            List<String> names = new ArrayList<>();
            for (PcapNetworkInterface nif : Pcaps.findAllDevs()) {
                String loop = nif.isLoopBack() ? " [loopback]" : "";
                String desc = Optional.ofNullable(nif.getDescription())
                        .filter(s -> !s.isBlank()).map(s -> " — " + s).orElse("");
                names.add(nif.getName() + desc + loop);
            }
            return names;
        } catch (PcapNativeException e) {
            log.error("[Capture] Could not list interfaces", e);
            return List.of();
        }
    }

    // ── Interface selection ───────────────────────────────────────────────────

    /**
     * Select the best available network interface.
     *
     * Priority order:
     *   1. Explicit name in dpi.capture.interface (not "auto"/"any") → use directly
     *   2. Scored auto-detection:
     *      a. Highest-scoring non-negative adapter (see scoreInterface())
     *      b. Any non-loopback adapter (last resort)
     *      c. Any adapter (edge case: loopback-only containers)
     *
     * ─── Scoring ────────────────────────────────────────────────────────────
     *   +200  Name or description contains Wi-Fi / Ethernet / WLAN keyword
     *   +100  Has at least one assigned IP address
     *   -500  Known virtual / noise adapter (Bluetooth, Hyper-V, VMware, etc.)
     *   -1000 Loopback
     *
     * This scoring was designed from real Windows Npcap adapter lists where
     * Bluetooth adapters had IP addresses (score +100 in old code) but
     * generated zero useful network traffic.
     */
    private PcapNetworkInterface selectInterface() throws PcapNativeException {
        List<PcapNetworkInterface> devs = Pcaps.findAllDevs();

        if (devs.isEmpty()) {
            throw new RuntimeException(
                    "No network interfaces found. Ensure Npcap (Windows) or libpcap (Linux/macOS) is installed.");
        }

        // ── Case 1: explicit name configured ─────────────────────────────────
        boolean isAuto = configuredInterface == null
                || configuredInterface.isBlank()
                || configuredInterface.equalsIgnoreCase("auto")
                || configuredInterface.equalsIgnoreCase("any");

        if (!isAuto) {
            log.info("[Capture] Using configured interface: {}", configuredInterface);
            return devs.stream()
                    .filter(d -> d.getName().equals(configuredInterface))
                    .findFirst()
                    .orElseThrow(() -> new IllegalArgumentException(
                            "Interface '" + configuredInterface + "' not found. Available: "
                            + devs.stream().map(PcapNetworkInterface::getName).toList()
                            + " — check dpi.capture.interface in application.properties"));
        }

        // ── Case 2: auto-detect with scoring ─────────────────────────────────
        log.info("[Capture] Auto-detecting interface from {} candidate(s):", devs.size());
        devs.forEach(d -> {
            int score = scoreInterface(d);
            log.info("[Capture]   {:3d}  {}  ({})",
                    score,
                    d.getName(),
                    Optional.ofNullable(d.getDescription()).orElse("?"));
        });

        return devs.stream()
                .filter(d -> scoreInterface(d) >= 0)
                .max(Comparator.comparingInt(this::scoreInterface))
                // Fallback 1: any non-loopback (score was negative — virtual adapter)
                .or(() -> devs.stream().filter(d -> !d.isLoopBack()).findFirst())
                // Fallback 2: absolute last resort
                .or(() -> devs.stream().findFirst())
                .orElseThrow(() -> new RuntimeException(
                        "No usable interface found after scanning " + devs.size() + " adapter(s)."));
    }

    /**
     * Score an interface for auto-selection preference.
     *
     * Higher = more preferred.  Negative = reject from auto-selection.
     *
     * REJECT keywords (score -500):
     *   bluetooth, hyper-v, vmware, virtualbox, vbox, isatap, teredo,
     *   wan miniport, pseudo, tap-windows, npcap loopback
     *
     *   These describe virtual adapters, transition tunnels, or wireless
     *   Bluetooth PAN adapters — none carry useful LAN/WAN traffic.
     *
     * PREFER keywords (score +200):
     *   wi-fi, wifi, wireless, ethernet, wlan
     *   These are the physical adapters you actually want to monitor.
     */
    private int scoreInterface(PcapNetworkInterface dev) {
        if (dev.isLoopBack()) return -1000;

        String desc    = Optional.ofNullable(dev.getDescription()).orElse("").toLowerCase();
        String name    = dev.getName().toLowerCase();
        String combined = desc + " " + name;

        // Hard-reject virtual/noise adapters
        String[] rejectKeywords = {
            "bluetooth", "hyper-v", "vmware", "virtualbox", "vbox",
            "isatap", "teredo", "wan miniport", "pseudo",
            "tap-windows", "npcap loopback adapter", "microsoft wi-fi direct",
            "virtual", "vpn", "tunnel"
        };
        for (String kw : rejectKeywords) {
            if (combined.contains(kw)) {
                log.debug("[Capture] Rejecting '{}' — matched reject keyword '{}'", dev.getName(), kw);
                return -500;
            }
        }

        int score = 0;

        // Has IP addresses → likely an active, configured adapter
        if (dev.getAddresses() != null && !dev.getAddresses().isEmpty()) {
            score += 100;
        }

        // Physical adapter keywords — strongly preferred over unrecognised adapters
        String[] preferKeywords = { "wi-fi", "wifi", "wireless", "ethernet", "wlan", "en0", "en1" };
        for (String kw : preferKeywords) {
            if (combined.contains(kw)) {
                score += 200;
                break;
            }
        }

        return score;
    }

    // ── Internal loops ────────────────────────────────────────────────────────

    private void captureLoop() {
        try {
            final String ifLabel = fileCapture ? "pcap-file" : selectedInterfaceName;

            PacketListener listener = packet -> {
                if (!running.get()) return;

                Instant ts = Instant.ofEpochMilli(handle.getTimestamp().getTime());
                PacketInfo info = packetParser.parse(packet, ifLabel, ts);
                if (info == null) return;

                if (!queue.offer(new QueueEntry(packet, info))) {
                    long dropped = droppedPackets.incrementAndGet();
                    if (dropped == 1 || dropped % 100 == 0) {
                        log.warn("[DROP] Queue full ({}/{}) — {} total drops. "
                                + "Increase dpi.capture.worker-threads or queue-size",
                                queue.size(), queueCapacity, dropped);
                    }
                }
            };

            handle.loop(-1, listener);

        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            log.info("[Capture] Loop interrupted");
        } catch (PcapNativeException | NotOpenException e) {
            log.error("[Capture] Loop error: {}", e.getMessage(), e);
        } finally {
            running.set(false);
            log.info("[Capture] Loop exited");
        }
    }

    private void workerLoop(int workerId) {
        log.info("[Capture] Worker-{} started", workerId);
        while (running.get() || !queue.isEmpty()) {
            try {
                QueueEntry entry = queue.poll(200, TimeUnit.MILLISECONDS);
                if (entry == null) continue;
                packetProcessor.process(entry.raw(), entry.info());
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                break;
            } catch (Exception e) {
                log.error("[Capture] Worker-{} error: {}", workerId, e.getMessage(), e);
            }
        }
        log.info("[Capture] Worker-{} stopped", workerId);
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private ExecutorService buildWorkerPool() {
        AtomicLong counter = new AtomicLong(0);
        return Executors.newFixedThreadPool(workerThreads, r -> {
            Thread t = new Thread(r, "dpi-worker-" + counter.getAndIncrement());
            t.setDaemon(true);
            return t;
        });
    }

    private record QueueEntry(Packet raw, PacketInfo info) {}
}

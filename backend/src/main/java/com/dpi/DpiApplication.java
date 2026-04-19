package com.dpi;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * DpiApplication — entry point.
 *
 * Architecture (simple pipeline):
 *
 *   [Network / PCAP file]
 *          │
 *    [CaptureEngine]          ← Pcap4J listen loop (single thread)
 *          │  puts PacketInfo objects into a BlockingQueue
 *    [BlockingQueue<PacketInfo>]
 *          │  N worker threads drain the queue
 *    [PacketProcessor × N]    ← parse + flow-track + SNI + rules (thread pool)
 *          │  results written to
 *    [PacketStore]            ← in-memory ring buffer (thread-safe)
 *          │  pushed to WebSocket clients
 *    [WebSocketBroadcaster]   ← STOMP /topic/packets
 *
 *   REST API controllers expose:
 *     GET  /api/packets        – query stored packets (with filter params)
 *     GET  /api/packets/stats  – aggregate stats
 *     GET  /api/flows          – active flow table
 *     POST /api/capture/start  – start capture
 *     POST /api/capture/stop   – stop capture
 *     GET  /api/rules          – list rules
 *     POST /api/rules          – add rule
 *     DELETE /api/rules/{id}   – remove rule
 */
@SpringBootApplication
@EnableScheduling  // used by FlowTracker GC and ring-buffer trim
public class DpiApplication {

    public static void main(String[] args) {
        SpringApplication.run(DpiApplication.class, args);
    }
}

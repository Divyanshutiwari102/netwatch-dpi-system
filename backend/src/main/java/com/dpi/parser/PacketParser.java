package com.dpi.parser;

import com.dpi.model.PacketInfo;
import com.dpi.model.Protocol;
import lombok.extern.slf4j.Slf4j;
import org.pcap4j.packet.*;
import org.pcap4j.packet.namednumber.EtherType;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.concurrent.atomic.AtomicLong;

/**
 * PacketParser — converts a raw Pcap4J {@link Packet} into a clean {@link PacketInfo}.
 *
 * Pcap4J already parses each layer for us; our job here is simply to pull out
 * the fields we care about and put them into our own model object.
 *
 * Layer walk:
 *   EthernetPacket  (Layer 2)
 *     └── IpV4Packet (Layer 3)
 *           └── TcpPacket / UdpPacket / IcmpV4CommonPacket  (Layer 4)
 *                 └── raw payload bytes  (Layer 7 — inspected by SniExtractor)
 */
@Slf4j
@Component
public class PacketParser {

    /** Monotonically increasing packet ID — used to order packets in the UI */
    private final AtomicLong idCounter = new AtomicLong(0);

    /**
     * Parse a Pcap4J Packet into a PacketInfo.
     *
     * @param raw       the raw packet from the Pcap4J listener
     * @param ifaceName the interface name it was captured on
     * @param timestamp capture timestamp (from Pcap4J timestamp)
     * @return populated PacketInfo, or null if we can't parse it (non-IP, malformed, etc.)
     */
    public PacketInfo parse(Packet raw, String ifaceName, Instant timestamp) {

        // ── Step 1: require an Ethernet frame ──────────────────────────────
        EthernetPacket eth = raw.get(EthernetPacket.class);
        if (eth == null) return null;

        // ── Step 2: require IPv4 (we skip IPv6, ARP, etc. for simplicity) ──
        IpV4Packet ip = raw.get(IpV4Packet.class);
        if (ip == null) return null;

        IpV4Packet.IpV4Header ipHeader = ip.getHeader();

        // ── Step 3: build the partial PacketInfo with L2 + L3 fields ───────
        PacketInfo.PacketInfoBuilder builder = PacketInfo.builder()
                .id(idCounter.incrementAndGet())
                .capturedAt(timestamp)
                .networkInterface(ifaceName)
                // L2
                .srcMac(eth.getHeader().getSrcAddr().toString())
                .dstMac(eth.getHeader().getDstAddr().toString())
                // L3
                .srcIp(ipHeader.getSrcAddr().getHostAddress())
                .dstIp(ipHeader.getDstAddr().getHostAddress())
                .ttl(ipHeader.getTtlAsInt())
                // Size
                .totalBytes(raw.length());

        // ── Step 4: parse transport layer ───────────────────────────────────
        int ianaProto = ipHeader.getProtocol().value();
        Protocol protocol = Protocol.fromIana(ianaProto);
        builder.protocol(protocol);

        switch (protocol) {
            case TCP -> parseTcp(raw, builder);
            case UDP -> parseUdp(raw, builder);
            case ICMP -> builder.srcPort(0).dstPort(0).payloadBytes(0);
            default  -> builder.srcPort(0).dstPort(0).payloadBytes(0);
        }

        PacketInfo packet = builder.build();

        // ── Step 5: compute the flow key for this packet ────────────────────
        packet.setFlowKey(buildFlowKey(packet));

        return packet;
    }

    // ── Private helpers ───────────────────────────────────────────────────────

    private void parseTcp(Packet raw, PacketInfo.PacketInfoBuilder b) {
        TcpPacket tcp = raw.get(TcpPacket.class);
        if (tcp == null) {
            b.srcPort(0).dstPort(0).payloadBytes(0);
            return;
        }
        TcpPacket.TcpHeader h = tcp.getHeader();

        // Encode TCP flags into a single byte the same way Wireshark does
        int flags = 0;
        if (h.getSyn()) flags |= 0x02;
        if (h.getAck()) flags |= 0x10;
        if (h.getFin()) flags |= 0x01;
        if (h.getRst()) flags |= 0x04;
        if (h.getPsh()) flags |= 0x08;
        if (h.getUrg()) flags |= 0x20;

        Packet payload = tcp.getPayload();
        int payloadLen = (payload != null) ? payload.length() : 0;

        b.srcPort(h.getSrcPort().valueAsInt())
         .dstPort(h.getDstPort().valueAsInt())
         .tcpFlags(flags)
         .payloadBytes(payloadLen);
    }

    private void parseUdp(Packet raw, PacketInfo.PacketInfoBuilder b) {
        UdpPacket udp = raw.get(UdpPacket.class);
        if (udp == null) {
            b.srcPort(0).dstPort(0).payloadBytes(0);
            return;
        }
        UdpPacket.UdpHeader h = udp.getHeader();

        Packet payload = udp.getPayload();
        int payloadLen = (payload != null) ? payload.length() : 0;

        b.srcPort(h.getSrcPort().valueAsInt())
         .dstPort(h.getDstPort().valueAsInt())
         .payloadBytes(payloadLen);
    }

    /**
     * Build the canonical flow key string.
     * Format: "srcIp:srcPort-dstIp:dstPort-PROTO"
     * This string is stored on PacketInfo and used to look up FlowRecord.
     */
    private String buildFlowKey(PacketInfo p) {
        return p.getSrcIp() + ":" + p.getSrcPort()
             + "-" + p.getDstIp() + ":" + p.getDstPort()
             + "-" + p.getProtocol();
    }
}

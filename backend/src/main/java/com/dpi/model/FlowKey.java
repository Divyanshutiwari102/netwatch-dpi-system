package com.dpi.model;

/**
 * FlowKey — immutable 5-tuple that uniquely identifies a network flow.
 *
 * Used as the key in FlowTracker's ConcurrentHashMap.
 *
 * Java records give us equals() + hashCode() + toString() for free,
 * which makes this the perfect candidate.
 *
 * Example:  FlowKey[srcIp=192.168.1.5, srcPort=54321,
 *                   dstIp=142.250.80.14, dstPort=443, protocol=TCP]
 */
public record FlowKey(
        String   srcIp,
        int      srcPort,
        String   dstIp,
        int      dstPort,
        Protocol protocol
) {

    /** Build a FlowKey directly from a PacketInfo object */
    public static FlowKey from(PacketInfo p) {
        return new FlowKey(p.getSrcIp(), p.getSrcPort(),
                           p.getDstIp(), p.getDstPort(),
                           p.getProtocol());
    }

    /**
     * Returns the reverse direction key.
     * Used to look up a flow when a reply packet arrives
     * (server → client direction).
     */
    public FlowKey reverse() {
        return new FlowKey(dstIp, dstPort, srcIp, srcPort, protocol);
    }

    /** Compact readable form used in logs and API responses */
    @Override
    public String toString() {
        return srcIp + ":" + srcPort + " → " + dstIp + ":" + dstPort + " [" + protocol + "]";
    }
}

package com.dpi.model;

/**
 * Protocol — IANA transport-layer protocol numbers we care about.
 */
public enum Protocol {
    TCP(6),
    UDP(17),
    ICMP(1),
    OTHER(-1);

    private final int ianaNumber;

    Protocol(int n) { this.ianaNumber = n; }

    public int getIanaNumber() { return ianaNumber; }

    public static Protocol fromIana(int n) {
        for (Protocol p : values()) {
            if (p.ianaNumber == n) return p;
        }
        return OTHER;
    }
}

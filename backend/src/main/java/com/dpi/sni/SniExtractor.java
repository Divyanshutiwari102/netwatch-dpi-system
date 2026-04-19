package com.dpi.sni;

import lombok.extern.slf4j.Slf4j;
import org.pcap4j.packet.Packet;
import org.pcap4j.packet.TcpPacket;
import org.springframework.stereotype.Component;

import java.nio.charset.StandardCharsets;
import java.util.Optional;

/**
 * SniExtractor — pulls the Server Name Indication from a TLS Client Hello.
 *
 * ─── Why SNI matters ────────────────────────────────────────────────────────
 * When a browser opens an HTTPS connection it sends a TLS "Client Hello"
 * message BEFORE any encryption happens.  Inside that message is the SNI
 * extension which contains the plain-text domain name the client wants to
 * reach (e.g. "www.youtube.com").  We can read this without decrypting
 * anything — it is unencrypted by design so routers/CDNs can route traffic.
 *
 * ─── TLS Client Hello structure (simplified) ────────────────────────────────
 *
 *  [TLS Record Header]         5 bytes
 *    Content Type = 0x16 (Handshake)
 *    Version      = 0x0301 (TLS 1.0 compat)
 *    Length       = 2 bytes
 *
 *  [Handshake Header]          4 bytes
 *    Type   = 0x01 (Client Hello)
 *    Length = 3 bytes
 *
 *  [Client Hello Body]
 *    Version    = 2 bytes
 *    Random     = 32 bytes
 *    Session ID = 1 byte length + data
 *    Cipher Suites = 2 byte length + data
 *    Compression = 1 byte length + data
 *
 *  [Extensions]               2 byte total length
 *    [Extension 0]
 *      Type   = 2 bytes   ← we look for 0x0000 (SNI)
 *      Length = 2 bytes
 *      [SNI list]
 *        List length = 2 bytes
 *        Name type   = 1 byte (0x00 = hostname)
 *        Name length = 2 bytes
 *        Name        = ASCII bytes   ← THIS IS WHAT WE WANT
 *    [Extension 1] ...
 *
 * ─────────────────────────────────────────────────────────────────────────────
 */
@Slf4j
@Component
public class SniExtractor {

    // TLS constants
    private static final byte CONTENT_TYPE_HANDSHAKE = 0x16;
    private static final byte HANDSHAKE_CLIENT_HELLO = 0x01;
    private static final int  EXTENSION_TYPE_SNI     = 0x0000;
    private static final byte SNI_TYPE_HOSTNAME      = 0x00;

    /**
     * Attempt to extract the SNI from a captured packet.
     *
     * @param raw the raw Pcap4J packet
     * @return the SNI hostname, or empty if not found / not a TLS Client Hello
     */
    public Optional<String> extract(Packet raw) {
        // 1. Only TCP packets can carry TLS
        TcpPacket tcp = raw.get(TcpPacket.class);
        if (tcp == null) return Optional.empty();

        // 2. Only packets with payload (not pure ACKs)
        Packet payload = tcp.getPayload();
        if (payload == null) return Optional.empty();

        byte[] data = payload.getRawData();
        if (data == null || data.length < 5) return Optional.empty();

        // 3. Check for TLS Handshake record
        return parseSni(data);
    }

    /**
     * Package-private entry point used by unit tests to parse raw bytes directly
     * without needing to construct a full Pcap4J packet stack.
     */
    Optional<String> extractFromBytes(byte[] data) {
        if (data == null || data.length < 5) return Optional.empty();
        return parseSni(data);
    }

    /**
     * Core parsing logic — walks through the TLS record to find the SNI extension.
     * Returns empty Optional instead of throwing on malformed data.
     */
    private Optional<String> parseSni(byte[] data) {
        try {
            int pos = 0;

            // ── TLS Record Layer ─────────────────────────────────────────────
            if (data[pos] != CONTENT_TYPE_HANDSHAKE) return Optional.empty();
            pos += 1; // skip Content Type

            // Version (2 bytes) — we accept any TLS version
            pos += 2;

            // Record length (2 bytes)
            int recordLength = readUint16(data, pos);
            pos += 2;

            if (pos + recordLength > data.length) return Optional.empty();

            // ── Handshake Layer ──────────────────────────────────────────────
            if (data[pos] != HANDSHAKE_CLIENT_HELLO) return Optional.empty();
            pos += 1; // Handshake type

            // Handshake length (3 bytes — big-endian 24-bit int)
            pos += 3;

            // Client Version (2 bytes)
            pos += 2;

            // Random (32 bytes — fixed)
            pos += 32;

            // Session ID (1 byte length + variable data)
            int sessionIdLen = data[pos] & 0xFF;
            pos += 1 + sessionIdLen;

            // Cipher Suites (2 byte length + data)
            int cipherSuitesLen = readUint16(data, pos);
            pos += 2 + cipherSuitesLen;

            // Compression Methods (1 byte length + data)
            int compressionLen = data[pos] & 0xFF;
            pos += 1 + compressionLen;

            // ── Extensions ────────────────────────────────────────────────────
            if (pos + 2 > data.length) return Optional.empty();

            int extensionsLen = readUint16(data, pos);
            pos += 2;

            int extensionsEnd = pos + extensionsLen;

            // Walk each extension until we find type 0x0000 (SNI)
            while (pos + 4 <= extensionsEnd) {
                int extType   = readUint16(data, pos);     pos += 2;
                int extLength = readUint16(data, pos);     pos += 2;

                if (extType == EXTENSION_TYPE_SNI) {
                    return parseSniExtension(data, pos);
                }

                pos += extLength; // skip non-SNI extensions
            }

        } catch (ArrayIndexOutOfBoundsException e) {
            // Truncated or malformed packet — silently ignore
            log.trace("Malformed TLS record, cannot extract SNI");
        }

        return Optional.empty();
    }

    /**
     * Parse the SNI extension body starting at {@code pos}.
     * Returns the first hostname found (type 0x00).
     */
    private Optional<String> parseSniExtension(byte[] data, int pos) {
        // SNI List Length (2 bytes)
        int sniListLen = readUint16(data, pos);
        pos += 2;

        int listEnd = pos + sniListLen;

        while (pos + 3 <= listEnd) {
            byte nameType  = data[pos];     pos += 1;
            int  nameLen   = readUint16(data, pos); pos += 2;

            if (nameType == SNI_TYPE_HOSTNAME && pos + nameLen <= data.length) {
                String sni = new String(data, pos, nameLen, StandardCharsets.US_ASCII);
                log.debug("SNI extracted: {}", sni);
                return Optional.of(sni);
            }
            pos += nameLen;
        }

        return Optional.empty();
    }

    /** Read a 2-byte big-endian unsigned short from byte array */
    private int readUint16(byte[] data, int offset) {
        return ((data[offset] & 0xFF) << 8) | (data[offset + 1] & 0xFF);
    }
}

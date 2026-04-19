package com.dpi;

import com.dpi.sni.SniExtractor;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.pcap4j.packet.*;
import org.pcap4j.packet.namednumber.*;

import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * SniExtractorTest — validates TLS Client Hello parsing without any network I/O.
 *
 * We build a synthetic byte array that mimics a real TLS Client Hello
 * with an SNI extension, then verify the extractor returns the correct hostname.
 */
class SniExtractorTest {

    private SniExtractor extractor;

    @BeforeEach
    void setUp() {
        extractor = new SniExtractor();
    }

    @Test
    @DisplayName("Returns empty for non-TCP packet")
    void returnsEmptyForNonTcp() {
        // Pass a raw UnknownPacket — no TCP layer
        Packet raw = UnknownPacket.newPacket(new byte[]{0x00}, 0, 1);
        Optional<String> result = extractor.extract(raw);
        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("Correctly extracts SNI from synthetic TLS Client Hello bytes")
    void extractsSniFromTlsClientHello() {
        // Build a synthetic TLS Client Hello payload containing SNI = "www.example.com"
        String expectedSni  = "www.example.com";
        byte[] tlsPayload   = buildTlsClientHello(expectedSni);

        // Wrap in a Pcap4J packet with a TCP layer so the extractor can find it
        Packet tcpPayload   = UnknownPacket.newPacket(tlsPayload, 0, tlsPayload.length);
        TcpPacket tcpPacket = TcpPacket.newPacket(buildTcpBytes(tlsPayload), 0, 20 + tlsPayload.length);

        // We test the byte-level parsing directly since constructing a full Pcap4J
        // stack (Ethernet → IP → TCP) requires extensive builder chains.
        // The parseSni method is package-private for testability.
        // Here we use a subclass trick to call the internal logic:
        Optional<String> result = extractor.extractFromBytes(tlsPayload);

        assertThat(result).isPresent();
        assertThat(result.get()).isEqualTo(expectedSni);
    }

    @Test
    @DisplayName("Returns empty for non-TLS payload (HTTP traffic)")
    void returnsEmptyForHttp() {
        byte[] httpPayload = "GET / HTTP/1.1\r\nHost: example.com\r\n\r\n".getBytes();
        Optional<String> result = extractor.extractFromBytes(httpPayload);
        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("Returns empty for empty payload")
    void returnsEmptyForEmpty() {
        Optional<String> result = extractor.extractFromBytes(new byte[0]);
        assertThat(result).isEmpty();
    }

    @Test
    @DisplayName("Returns empty for truncated TLS record")
    void returnsEmptyForTruncatedRecord() {
        // Only 3 bytes — way too short to be a valid TLS record
        byte[] truncated = {0x16, 0x03, 0x01};
        Optional<String> result = extractor.extractFromBytes(truncated);
        assertThat(result).isEmpty();
    }

    // ── Helpers ────────────────────────────────────────────────────────────────

    /**
     * Build a minimal but valid TLS 1.2 Client Hello with one SNI extension.
     * This matches the exact binary format parsed by SniExtractor.
     */
    private byte[] buildTlsClientHello(String sni) {
        byte[] sniBytes    = sni.getBytes();
        int    sniLen      = sniBytes.length;

        // Sizes bottom-up:
        // SNI entry:         1 (name type) + 2 (name len) + sniLen
        // SNI list:          2 (list len)  + 3 + sniLen
        // SNI extension:     2 (type) + 2 (ext len) + 2 (list len) + 3 + sniLen
        // Extensions block:  2 (total ext len) + SNI extension
        // Client Hello body: 2 (version) + 32 (random) + 1 (sess ID len)
        //                  + 2 (cipher len) + 2 (ciphers) + 1 (comp len) + 1 (comp)
        //                  + extensions block
        // Handshake header:  1 (type) + 3 (len) + body
        // TLS Record header: 1 + 2 + 2 + handshake

        int sniExtBodyLen  = 2 + 1 + 2 + sniLen;   // list-len + name-type + name-len + name
        int sniExtLen      = 4 + sniExtBodyLen;     // ext-type + ext-len + body
        int extensionsLen  = sniExtLen;
        int helloBodyLen   = 2 + 32 + 1 + 2 + 2 + 1 + 1 + 2 + extensionsLen;
        int handshakeLen   = 1 + 3 + helloBodyLen;
        int recordLen      = handshakeLen;

        byte[] buf = new byte[5 + handshakeLen];
        int pos = 0;

        // TLS Record
        buf[pos++] = 0x16;              // Content Type: Handshake
        buf[pos++] = 0x03;              // Version: TLS 1.2 (major)
        buf[pos++] = 0x03;              // Version: TLS 1.2 (minor)
        buf[pos++] = (byte)(recordLen >> 8);
        buf[pos++] = (byte)(recordLen);

        // Handshake Header
        buf[pos++] = 0x01;              // Type: Client Hello
        buf[pos++] = 0x00;              // Length (3 bytes big-endian)
        buf[pos++] = (byte)(helloBodyLen >> 8);
        buf[pos++] = (byte)(helloBodyLen);

        // Client Hello: version
        buf[pos++] = 0x03; buf[pos++] = 0x03;  // TLS 1.2

        // Random: 32 zero bytes
        for (int i = 0; i < 32; i++) buf[pos++] = 0x00;

        // Session ID: empty
        buf[pos++] = 0x00;

        // Cipher Suites: one cipher (TLS_RSA_WITH_AES_128_CBC_SHA = 0x002F)
        buf[pos++] = 0x00; buf[pos++] = 0x02;  // length = 2
        buf[pos++] = 0x00; buf[pos++] = 0x2F;  // cipher suite

        // Compression: null (0x00)
        buf[pos++] = 0x01;  // length = 1
        buf[pos++] = 0x00;  // no compression

        // Extensions total length
        buf[pos++] = (byte)(extensionsLen >> 8);
        buf[pos++] = (byte)(extensionsLen);

        // SNI Extension header (type = 0x0000)
        buf[pos++] = 0x00; buf[pos++] = 0x00;              // ext type
        buf[pos++] = (byte)(sniExtBodyLen >> 8);            // ext length
        buf[pos++] = (byte)(sniExtBodyLen);

        // SNI List
        int sniListLen = 1 + 2 + sniLen;                   // name-type + name-len + name
        buf[pos++] = (byte)(sniListLen >> 8);
        buf[pos++] = (byte)(sniListLen);

        buf[pos++] = 0x00;                                  // Name type: hostname
        buf[pos++] = (byte)(sniLen >> 8);
        buf[pos++] = (byte)(sniLen);
        System.arraycopy(sniBytes, 0, buf, pos, sniLen);

        return buf;
    }

    private byte[] buildTcpBytes(byte[] payload) {
        // Minimal 20-byte TCP header (no options) + payload
        byte[] tcpBytes = new byte[20 + payload.length];
        tcpBytes[12] = 0x50; // data offset = 5 (20 bytes)
        System.arraycopy(payload, 0, tcpBytes, 20, payload.length);
        return tcpBytes;
    }
}

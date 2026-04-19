package com.dpi.websocket;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.messaging.simp.config.MessageBrokerRegistry;
import org.springframework.web.socket.config.annotation.EnableWebSocketMessageBroker;
import org.springframework.web.socket.config.annotation.StompEndpointRegistry;
import org.springframework.web.socket.config.annotation.WebSocketMessageBrokerConfigurer;
import org.springframework.web.socket.config.annotation.WebSocketTransportRegistration;

/**
 * WebSocketConfig — STOMP broker wiring and transport limits.
 *
 * ─── Buffer overflow fix ──────────────────────────────────────────────────────
 * The previous overflow was caused by two things:
 *   1. Per-packet broadcasting → fixed in PacketBroadcaster (batching)
 *   2. Default WebSocket transport limits too small for batch messages
 *
 * Default Spring limits:
 *   - messageSizeLimit:    64 KB  (a 50-packet batch at ~200 B each = ~10 KB → fine)
 *   - sendBufferSizeLimit: 512 KB (per-client; increased to 2 MB for safety)
 *   - sendTimeLimit:       10 s   (increased to 20 s for slow browsers)
 *
 * With batching these limits are almost never hit, but configuring them
 * explicitly prevents surprises when sample-rate is reduced (more data).
 *
 * ─── CORS / Allowed Origins ───────────────────────────────────────────────────
 * Defaults to localhost only. Override in production:
 *   dpi.websocket.allowed-origins=https://your-dashboard.company.com
 */
@Configuration
@EnableWebSocketMessageBroker
public class WebSocketConfig implements WebSocketMessageBrokerConfigurer {

    @Value("${dpi.websocket.allowed-origins:http://localhost:8080,http://localhost:3000}")
    private String[] allowedOrigins;

    @Override
    public void configureMessageBroker(MessageBrokerRegistry registry) {
        registry.enableSimpleBroker("/topic");
        registry.setApplicationDestinationPrefixes("/app");
    }

    @Override
    public void registerStompEndpoints(StompEndpointRegistry registry) {
        registry.addEndpoint("/ws").setAllowedOriginPatterns(allowedOrigins);
        registry.addEndpoint("/ws").setAllowedOriginPatterns(allowedOrigins).withSockJS();
    }

    /**
     * Configure WebSocket transport limits.
     *
     * messageSizeLimit:    Maximum size of a single inbound or outbound STOMP message.
     *                      256 KB handles a 50-packet batch with headroom.
     *
     * sendBufferSizeLimit: Per-client outbound buffer. If a client is slow to ACK,
     *                      messages accumulate here.  2 MB gives slow browsers
     *                      several seconds of backlog before disconnecting.
     *                      Without this, a briefly laggy tab causes "buffer exceeded".
     *
     * sendTimeLimit:       Time before a slow client is disconnected.
     *                      20 s is generous — real browser tabs process much faster.
     */
    @Override
    public void configureWebSocketTransport(WebSocketTransportRegistration registration) {
        registration
                .setMessageSizeLimit(256 * 1024)        // 256 KB per message
                .setSendBufferSizeLimit(2 * 1024 * 1024) // 2 MB per-client send buffer
                .setSendTimeLimit(20_000);                // 20s before slow-client disconnect
    }
}

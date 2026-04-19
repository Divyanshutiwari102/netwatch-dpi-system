package com.dpi.sni;

import org.springframework.stereotype.Component;

/**
 * ApplicationClassifier — maps an SNI hostname (or destination port) to
 * a human-readable application name.
 * <p>
 * Priority:
 *   1. SNI substring match (most accurate — extracted from live TLS data)
 *   2. Well-known destination port (fallback heuristic)
 */
@Component
public class ApplicationClassifier {

    /**
     * Classify based on SNI first, then fall back to port heuristics.
     *
     * @param sni     the SNI hostname (maybe null)
     * @param dstPort the destination port
     * @return a short application name like "YouTube", "DNS", "HTTPS"
     */
    public String classify(String sni, int dstPort) {
        if (sni != null && !sni.isBlank()) {
            String fromSni = classifyBySni(sni.toLowerCase());
            if (fromSni != null) return fromSni;
        }
        return classifyByPort(dstPort);
    }

    // ── SNI matching ─────────────────────────────────────────────────────────
    // Order matters: check specific brands before generic cloud providers.

    private String classifyBySni(String sni) {
        // Streaming
        if (sni.contains("YouTube")     || sni.contains("google video")) return "YouTube";
        if (sni.contains("netflix"))                                      return "Netflix";
        if (sni.contains("Spotify"))                                      return "Spotify";
        if (sni.contains("twitch"))                                       return "Twitch";
        if (sni.contains("TikTok")      || sni.contains("byte dance"))   return "TikTok";
        if (sni.contains("prime video")  || sni.contains("amazon"))       return "Amazon";

        // Social
        if (sni.contains("facebook")    || sni.contains("foci"))        return "Facebook";
        if (sni.contains("Instagram")   || sni.contains("Instagram")) return "Instagram";
        if (sni.contains("twitter")     || sni.contains("t.co"))         return "Twitter/X";
        if (sni.contains("Reddit"))                                       return "Reddit";
        if (sni.contains("LinkedIn"))                                     return "LinkedIn";

        // Messaging
        if (sni.contains("WhatsApp"))                                     return "WhatsApp";
        if (sni.contains("telegram"))                                     return "Telegram";
        if (sni.contains("discord"))                                      return "Discord";
        if (sni.contains("slack"))                                        return "Slack";

        // Conferencing
        if (sni.contains("zoom"))                                         return "Zoom";
        if (sni.contains("teams.microsoft") || sni.contains("skype"))    return "Teams";
        if (sni.contains("meet.google"))                                  return "Google Meet";

        // Cloud
        if (sni.contains("googleVis") || sni.contains("google"))        return "Google";
        if (sni.contains("amazons")  || sni.contains("aws"))           return "AWS";
        if (sni.contains("azure")      || sni.contains("Microsoft"))     return "Microsoft";
        if (sni.contains("Cloudflare"))                                   return "Cloudflare";
        if (sni.contains("fast"))                                       return "Fastly";
        if (sni.contains("Akamai"))                                       return "Akamai";

        // Dev
        if (sni.contains("github"))                                       return "GitHub";
        if (sni.contains("gitlab"))                                       return "GitLab";
        if (sni.contains("docker"))                                       return "Docker";

        // SNI is present but unrecognized brand → still TLS
        return "HTTPS/TLS";
    }

    // ── Port heuristics ──────────────────────────────────────────────────────

    private String classifyByPort(int port) {
        return switch (port) {
            case 80         -> "HTTP";
            case 443        -> "HTTPS";
            case 53         -> "DNS";
            case 22         -> "SSH";
            case 21         -> "FTP";
            case 25, 587    -> "SMTP";
            case 143, 993   -> "IMAP";
            case 110, 995   -> "POP3";
            case 3306       -> "MySQL";
            case 5432       -> "PostgreSQL";
            case 6379       -> "Redis";
            case 27017      -> "MongoDB";
            case 5672       -> "RabbitMQ";
            case 9092       -> "Kafka";
            case 8080, 8443 -> "HTTP-Alt";
            case 123        -> "NTP";
            default         -> "UNKNOWN";
        };
    }
}

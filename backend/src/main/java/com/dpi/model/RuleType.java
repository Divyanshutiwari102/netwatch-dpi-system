package com.dpi.model;

/** The category of a filtering rule. */
public enum RuleType {
    BLOCK_IP,        // match on source or destination IP address
    BLOCK_DOMAIN,    // match on SNI / application domain (wildcard *.example.com)
    BLOCK_PORT,      // match on destination port number
    BLOCK_PROTOCOL   // match on transport protocol (TCP, UDP, ICMP)
}

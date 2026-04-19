package com.dpi.model;

/**
 * FlowState — simple lifecycle state for a tracked network flow.
 *
 * NEW        → first packet seen (e.g. TCP SYN)
 * ESTABLISHED→ bidirectional traffic seen
 * CLASSIFIED → DPI determined the application (e.g. YOUTUBE via SNI)
 * CLOSED     → FIN/RST seen or flow timed out
 */
public enum FlowState {
    NEW,
    ESTABLISHED,
    CLASSIFIED,
    CLOSED
}

package com.dpi.service;

import com.dpi.flow.FlowTracker;
import com.dpi.model.FlowRecord;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;

import java.util.Collection;
import java.util.Comparator;
import java.util.List;

/**
 * FlowService — exposes the live flow table for the REST controller.
 */
@Service
@RequiredArgsConstructor
public class FlowService {

    private final FlowTracker flowTracker;

    /** Returns all active flows, sorted by most-recently-seen first */
    public List<FlowRecord> getFlows(int limit) {
        return flowTracker.getAllFlows().stream()
                .sorted(Comparator.comparing(FlowRecord::getLastSeen).reversed())
                .limit(Math.min(limit, 500))
                .toList();
    }

    public int getActiveFlowCount() {
        return flowTracker.size();
    }
}

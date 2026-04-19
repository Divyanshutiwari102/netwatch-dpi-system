package com.dpi.controller;

import com.dpi.dto.Dtos;
import com.dpi.service.FlowService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * FlowController — inspect the live 5-tuple flow table.
 *
 * GET /api/flows          → list currently tracked flows
 * GET /api/flows/count    → number of active flows
 */
@RestController
@RequestMapping("/api/flows")
@RequiredArgsConstructor
@Tag(name = "Flows", description = "View the live 5-tuple connection flow table")
public class FlowController {

    private final FlowService flowService;

    @GetMapping
    @Operation(summary = "List active flows (newest first, max 500)")
    public ResponseEntity<Dtos.ApiResponse> getFlows(
            @RequestParam(defaultValue = "100") int limit) {
        return ResponseEntity.ok(
                Dtos.ApiResponse.ok("Active flows", flowService.getFlows(limit)));
    }

    @GetMapping("/count")
    @Operation(summary = "Get number of currently tracked flows")
    public ResponseEntity<Dtos.ApiResponse> getCount() {
        return ResponseEntity.ok(
                Dtos.ApiResponse.ok("Flow count", flowService.getActiveFlowCount()));
    }
}

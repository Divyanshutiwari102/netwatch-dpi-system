package com.dpi.controller;

import com.dpi.dto.Dtos;
import com.dpi.service.RuleService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * RuleController — manage packet-filtering rules.
 *
 * GET    /api/rules        → list all rules
 * POST   /api/rules        → add a new rule
 * DELETE /api/rules/{id}   → remove a rule by ID
 */
@RestController
@RequestMapping("/api/rules")
@RequiredArgsConstructor
@Tag(name = "Rules", description = "Manage IP/domain/port/protocol blocking rules")
public class RuleController {

    private final RuleService ruleService;

    @GetMapping
    @Operation(summary = "List all active rules")
    public ResponseEntity<Dtos.ApiResponse> getAllRules() {
        return ResponseEntity.ok(
                Dtos.ApiResponse.ok("Rules", ruleService.getAllRules()));
    }

    /**
     * Add a blocking rule.
     *
     * Request body examples:
     *
     *   Block an IP:
     *   { "type": "BLOCK_IP", "value": "192.168.1.50", "description": "Suspicious host" }
     *
     *   Block a domain (wildcard):
     *   { "type": "BLOCK_DOMAIN", "value": "*.tiktok.com" }
     *
     *   Block a port:
     *   { "type": "BLOCK_PORT", "value": "3306", "description": "No DB access from guests" }
     *
     *   Block a protocol:
     *   { "type": "BLOCK_PROTOCOL", "value": "UDP" }
     */
    @PostMapping
    @Operation(summary = "Add a blocking rule")
    public ResponseEntity<Dtos.ApiResponse> addRule(
            @RequestBody Dtos.AddRuleRequest request) {

        if (request.getType() == null || request.getValue() == null
                || request.getValue().isBlank()) {
            return ResponseEntity.badRequest()
                    .body(Dtos.ApiResponse.error("'type' and 'value' are required"));
        }

        var rule = ruleService.addRule(
                request.getType(),
                request.getValue(),
                request.getDescription());

        return ResponseEntity.ok(
                Dtos.ApiResponse.ok("Rule added: " + rule.label(), rule));
    }

    @DeleteMapping("/{id}")
    @Operation(summary = "Remove a rule by ID")
    public ResponseEntity<Dtos.ApiResponse> removeRule(@PathVariable String id) {
        boolean removed = ruleService.removeRule(id);
        if (removed) {
            return ResponseEntity.ok(Dtos.ApiResponse.ok("Rule " + id + " removed"));
        } else {
            return ResponseEntity.notFound().build();
        }
    }
}

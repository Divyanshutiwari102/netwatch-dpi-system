package com.dpi.controller;

import com.dpi.dto.Dtos;
import com.dpi.service.CaptureService;
import io.swagger.v3.oas.annotations.Operation;
import io.swagger.v3.oas.annotations.tags.Tag;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

/**
 * CaptureController — REST endpoints for controlling the capture engine.
 *
 * POST /api/capture/start   → start live or file capture
 * POST /api/capture/stop    → stop the current capture session
 * GET  /api/capture/status  → current engine status
 * GET  /api/capture/interfaces → list available network interfaces
 */
@RestController
@RequestMapping("/api/capture")
@RequiredArgsConstructor
@Tag(name = "Capture", description = "Start/stop packet capture and check engine status")
public class CaptureController {

    private final CaptureService captureService;

    @PostMapping("/start")
    @Operation(summary = "Start capture",
               description = "Start live interface capture, or replay from a PCAP file if pcapFilePath is provided")
    public ResponseEntity<Dtos.ApiResponse> start(
            @RequestBody(required = false) Dtos.StartCaptureRequest request) {
        try {
            if (request != null && request.getPcapFilePath() != null
                    && !request.getPcapFilePath().isBlank()) {
                captureService.startFileCapture(request.getPcapFilePath());
                return ResponseEntity.ok(Dtos.ApiResponse.ok(
                        "Capture started from file: " + request.getPcapFilePath()));
            } else {
                captureService.startLiveCapture();
                return ResponseEntity.ok(Dtos.ApiResponse.ok("Live capture started"));
            }
        } catch (IllegalStateException e) {
            return ResponseEntity.badRequest()
                    .body(Dtos.ApiResponse.error(e.getMessage()));
        } catch (RuntimeException e) {
            return ResponseEntity.internalServerError()
                    .body(Dtos.ApiResponse.error("Capture failed: " + e.getMessage()));
        }
    }

    @PostMapping("/stop")
    @Operation(summary = "Stop capture")
    public ResponseEntity<Dtos.ApiResponse> stop() {
        captureService.stopCapture();
        return ResponseEntity.ok(Dtos.ApiResponse.ok("Capture stopped"));
    }

    @GetMapping("/status")
    @Operation(summary = "Get capture engine status")
    public ResponseEntity<Dtos.ApiResponse> status() {
        CaptureService.CaptureStatus status = captureService.getStatus();
        return ResponseEntity.ok(Dtos.ApiResponse.ok("OK", status));
    }

    @GetMapping("/interfaces")
    @Operation(summary = "List available network interfaces")
    public ResponseEntity<Dtos.ApiResponse> interfaces() {
        return ResponseEntity.ok(
                Dtos.ApiResponse.ok("Available interfaces", captureService.listInterfaces()));
    }
}

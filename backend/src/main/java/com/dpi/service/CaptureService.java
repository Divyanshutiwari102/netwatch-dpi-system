package com.dpi.service;

import com.dpi.capture.CaptureEngine;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.pcap4j.core.NotOpenException;
import org.pcap4j.core.PcapNativeException;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * CaptureService — service layer between the REST controller and CaptureEngine.
 *
 * Controllers should never call CaptureEngine directly.
 * This layer translates PcapNativeException into friendly RuntimeException
 * (which Spring's @ExceptionHandler can convert to HTTP 500 responses).
 */
@Slf4j
@Service
@RequiredArgsConstructor
public class CaptureService {

    private final CaptureEngine captureEngine;

    public void startLiveCapture() {
        try {
            captureEngine.startCapture();
        } catch (PcapNativeException | NotOpenException e) {
            throw new RuntimeException("Failed to start capture: " + e.getMessage(), e);
        }
    }

    public void startFileCapture(String filePath) {
        try {
            captureEngine.startFromFile(filePath);
        } catch (PcapNativeException | NotOpenException e) {
            throw new RuntimeException("Failed to read PCAP file: " + e.getMessage(), e);
        }
    }

    public void stopCapture() {
        captureEngine.stopCapture();
    }

    public boolean isCapturing() {
        return captureEngine.isRunning();
    }

    public CaptureStatus getStatus() {
        return new CaptureStatus(
                captureEngine.isRunning(),
                captureEngine.getQueueSize(),
                captureEngine.getDroppedPackets()
        );
    }

    public List<String> listInterfaces() {
        return CaptureEngine.listInterfaces();
    }

    public record CaptureStatus(boolean running, int queueSize, long droppedPackets) {}
}

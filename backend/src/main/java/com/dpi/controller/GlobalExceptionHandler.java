package com.dpi.controller;

import com.dpi.dto.Dtos;
import lombok.extern.slf4j.Slf4j;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;

/**
 * GlobalExceptionHandler — catches uncaught exceptions from any controller
 * and returns a clean JSON error response instead of a stack trace.
 *
 * This is standard Spring Boot error handling — annotate with
 * @RestControllerAdvice and declare @ExceptionHandler methods.
 */
@Slf4j
@RestControllerAdvice
public class GlobalExceptionHandler {

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Dtos.ApiResponse> handleBadInput(IllegalArgumentException e) {
        return ResponseEntity.badRequest()
                .body(Dtos.ApiResponse.error(e.getMessage()));
    }

    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Dtos.ApiResponse> handleBadState(IllegalStateException e) {
        return ResponseEntity.badRequest()
                .body(Dtos.ApiResponse.error(e.getMessage()));
    }

    @ExceptionHandler(RuntimeException.class)
    public ResponseEntity<Dtos.ApiResponse> handleRuntime(RuntimeException e) {
        log.error("Unhandled exception: {}", e.getMessage(), e);
        return ResponseEntity.internalServerError()
                .body(Dtos.ApiResponse.error("Internal error: " + e.getMessage()));
    }
}

# ADR 0005 — SSE for the error-log tail

- **Status:** Accepted
- **Date:** 2026-05-31

## Context
The error-log viewer needs near-real-time updates without heavy infra.

## Decision
Use Server-Sent Events (`GET /api/logs/stream`) polling new rows; no WebSocket server.

## Consequences
Simple, one-way, fits a single process. Reconnect handled by the browser EventSource.

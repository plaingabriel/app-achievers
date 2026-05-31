# ADR 0005: SSE for the live error-log viewer

- **Status:** Accepted
- **Date:** 2026-05-27

## Context

The error-log table is a one-way tail: the server pushes new rows, the client displays them with filtering. Under 50 concurrent viewers. Must be simple and proxy-friendly behind nginx.

## Decision

Server-Sent Events. A `GET /api/logs/stream` endpoint streams new rows; the client consumes with `EventSource`. Filters (level, emitter, free-text, time range) apply on the initial query and the stream. Polling (5s) is the documented fallback if SSE ever misbehaves.

## Consequences

- ~10 lines of server code, native browser support, one Node connection per viewer (trivial at this scale).
- One-way only — client actions stay normal HTTP, which is fine for a log tail.
- nginx must disable proxy buffering on the stream location.

## Alternatives considered

WebSockets (bidirectional overkill, more failure modes), long-polling (superseded by SSE) — rejected.

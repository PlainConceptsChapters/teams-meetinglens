# Observability

## Logging schema
Structured logs must include:
- `timestamp`
- `level`
- `message`
- `correlationId`
- `operation`
- `component`
- `tenantId` (redacted/truncated)
- `userId` (redacted/truncated)
- `meetingId` (redacted/truncated)
- `graphRequestId` (when applicable)
- `openAiRequestId` (when applicable)

## Correlation IDs
- Generate a request-scoped correlation ID at the channel entry point.
- Propagate the correlation ID to all downstream services (Graph, OpenAI).

## Tracing expectations
- Create spans for Teams -> App -> Graph -> OpenAI calls.
- Include retry counts and latency metrics in span attributes.

## Metrics (minimum)
- Request latency (p50/p95/p99)
- Graph call rate + error rate
- OpenAI call rate + error rate
- Transcript retrieval success/availability rate

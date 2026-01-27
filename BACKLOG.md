# Backlog

This backlog is the single source of truth for project status. Every Epic, Feature, and Task includes an explicit status.

## Status snapshot

| Item | Status |
| --- | --- |
| Milestone M0: Docs only | Done |
| Milestone M1: Repo skeleton + CI | Done |
| Milestone M2: Auth + Graph calendar | Done |
| Milestone M3: Meetings & transcripts | Done |
| Milestone M4: Summarization & Q&A | Done |
| Epic E1: Foundation & repo hygiene | Done |
| Epic E2: Auth & identity (OBO) | Done |
| Epic E3: Graph meetings & transcripts | Done |
| Epic E4: LLM summarization & Q&A | Done |
| Epic E5: Observability & security | Done |
| Epic E6: Teams channel layer & bot integration | Done (Added based on research context) |

## Definition of done
- Documentation updated
- Unit tests for modular components
- Security checklist reviewed

## Milestones

### M0: Docs only
- Status: Done
- Acceptance criteria:
  - README, BACKLOG, and AGENTS exist and align with repository goals
  - Skills documented under `.copilots/skills/`

### M1: Repo skeleton + CI
- Status: Done
- Acceptance criteria:
  - Minimal TypeScript/Node.js repo scaffold in place
  - GitHub Actions pipelines for linting, tests, and security checks described and configured
  - Baseline unit test harness documented

### M2: Auth + Graph calendar
- Status: Done
- Acceptance criteria:
  - OBO authentication flow implemented with delegated permissions
  - Calendar search and meeting resolution APIs available via a service layer
  - Unit tests for auth and Graph wrappers

### M3: Meetings & transcripts
- Status: Done
- Acceptance criteria:
  - Meeting lookup and transcript retrieval supported where permitted
  - Transcript availability clearly handled with error states
  - Unit tests for transcript retrieval and parsing

### M4: Summarization & Q&A
- Status: Done
- Acceptance criteria:
  - Summarization pipeline for meetings is available through domain services
  - Q&A over transcripts supported with guardrails
  - Unit tests for summarization, chunking, and caching

## Epics, features, stories / tasks

### Epic E1: Foundation & repo hygiene
- Status: Done
- Acceptance criteria:
  - Documentation set complete and internally linked
  - Public repo policy in place for security and contributions

#### Feature E1.F1: Documentation baseline
- Status: Done
- Acceptance criteria:
  - README, BACKLOG, AGENTS meet requirements
  - Skills documented under `.copilots/skills/`

##### Task E1.F1.T1: Author README
- Status: Done
- Acceptance criteria:
  - README includes architecture, security, observability, and roadmap link

##### Task E1.F1.T2: Author BACKLOG
- Status: Done
- Acceptance criteria:
  - Backlog includes milestones, risks, ADR placeholders, and status snapshot

##### Task E1.F1.T3: Author AGENTS
- Status: Done
- Acceptance criteria:
  - Agent responsibilities and collaboration rules documented

##### Task E1.F1.T4: Add skills docs
- Status: Done
- Acceptance criteria:
  - developer, quality, manager skill files created and linked

---

### Epic E2: Auth & identity (OBO)
- Status: Done
- Acceptance criteria:
  - OBO flow documented and implemented
  - Delegated permissions set aligned with least privilege

#### Feature E2.F1: Entra ID app registration
- Status: Done
- Acceptance criteria:
  - Bot app registration documented with required Graph scopes
  - Consent flows described for tenant admins and users

##### Task E2.F1.T1: Define required Graph scopes
- Status: Done
- Acceptance criteria:
  - Scope list is minimal and mapped to use cases
  - Notes:
    - Start with delegated `Calendars.Read` for calendar search and event details.
    - Add `OnlineMeetings.Read` only if meeting resolution needs meeting metadata.
    - Include `User.Read` for basic identity context; avoid write scopes.

##### Task E2.F1.T2: Document OBO token exchange
- Status: Done
- Acceptance criteria:
  - Token exchange sequence documented with security considerations
  - Notes:
    - Validate inbound Teams/Bot token and tenant before OBO exchange.
    - Use MSAL OBO flow to request Graph token with minimal scopes.
    - Avoid logging tokens; only log redacted correlation IDs.

#### Feature E2.F2: Auth service module
- Status: Done
- Acceptance criteria:
  - Token caching and refresh strategy specified
  - Unit tests defined for token acquisition paths

##### Task E2.F2.T1: Define token cache strategy
- Status: Done
- Acceptance criteria:
  - Cache TTL and eviction rules documented
  - Notes:
    - Cache key: tenantId + userId + scopes; in-memory only by default.
    - TTL from token exp minus skew; refresh on 401 or near-expiry.

##### Task E2.F2.T2: Define error handling taxonomy
- Status: Done
- Acceptance criteria:
  - Error types and user-facing messages documented
  - Notes:
    - AuthError: token exchange/validation failures -> "Please sign in again."
    - PermissionDenied: missing scopes/consent -> "Admin consent required."
    - Throttled: 429/Retry-After -> "Too many requests, try later."
    - NotFound/InvalidRequest: malformed inputs -> "Meeting not found."

---

### Epic E3: Graph meetings & transcripts
- Status: In Progress
- Acceptance criteria:
  - Calendar search and meeting resolution APIs available
  - Transcript retrieval paths defined and gated by permissions

#### Feature E3.F1: Calendar search
- Status: Done
- Acceptance criteria:
  - Query patterns and paging behavior defined
  - Unit tests for Graph query builder

##### Task E3.F1.T1: Define calendar query patterns
- Status: Done
- Acceptance criteria:
  - Query scenarios covered (time range, organizer, subject)
  - Notes:
    - Default to `calendarView` queries with a bounded start/end range.
    - Support optional filters: organizer email, subject keyword, isCancelled.
    - Enforce max window and page size to avoid over-fetching.

##### Task E3.F1.T2: Define paging and throttling policy
- Status: Done
- Acceptance criteria:
  - Backoff and retry guidelines documented
  - Notes:
    - Follow `@odata.nextLink` for paging; stop at client-defined max pages.
    - Respect `Retry-After` on 429/503 and apply exponential backoff.

#### Feature E3.F2: Meeting resolution
- Status: Done
- Acceptance criteria:
  - Resolve meeting identifiers across user and calendar contexts
  - Unit tests for resolver logic

##### Task E3.F2.T1: Define meeting identity model
- Status: Done
- Acceptance criteria:
  - Meeting identity fields and resolution rules documented
  - Notes:
    - Required fields: calendarEventId, start/end, organizer, subject.
    - Optional fields: onlineMeetingId, joinUrl for linkage when present.
    - Resolution priority: explicit meeting id > joinUrl > time/subject.

#### Feature E3.F3: Transcript retrieval
- Status: Done
- Acceptance criteria:
  - Transcript availability checks and fallback messaging
  - Unit tests for transcript retrieval and parsing

##### Task E3.F3.T1: Define transcript access policy
- Status: Done
- Acceptance criteria:
  - Access checks and error messages documented
  - Notes:
    - Default to `/me/onlineMeetings/{id}/transcripts` with delegated permissions.
    - Treat empty transcript lists as "not available" and surface a clear user message.
    - On 404 for content, retry with alternate content formats before failing.

---

### Epic E4: LLM summarization & Q&A
- Status: Done
- Acceptance criteria:
  - Summarization and Q&A pipelines defined with guardrails
  - Unit tests for chunking, prompt assembly, and output validation

#### Feature E4.F0: LLM orchestration and tool calling
- Status: Done (Added based on research context)
- Acceptance criteria:
  - Intent resolution and tool routing documented
  - Tool execution policy defined (allowed tools, parameters, and limits)
  - Prompt-injection and tool-misuse mitigations documented

##### Task E4.F0.T1: Define tool calling contract
- Status: Done (Added based on research context)
- Acceptance criteria:
  - Tool registry and input/output schemas documented
  - Allowed operations and rate limits documented
  - Notes:
    - `LlmClient` interface defines allowed completion operations.
    - JSON-only output schema enforced via parsers in `llm/schema.ts`.

##### Task E4.F0.T2: Define prompt-injection mitigations
- Status: Done (Added based on research context)
- Acceptance criteria:
  - Guardrails for tool misuse and data exfiltration documented
  - Redaction and safe completion guidance documented
  - Notes:
    - Guardrails include sensitive-data redaction and disallowed answer checks.

#### Feature E4.F1: Summarization pipeline
- Status: Done
- Acceptance criteria:
  - Chunking strategy and prompt templates documented
  - Output schema for summary and key points defined

##### Task E4.F1.T1: Define chunking rules
- Status: Done
- Acceptance criteria:
  - Token limits and overlap rules documented
  - Notes:
    - Chunking utility uses max tokens + overlap settings with defaults.

##### Task E4.F1.T2: Define summary schema
- Status: Done
- Acceptance criteria:
  - Summary output format and validation checks documented
  - Notes:
    - Summary schema enforced by `parseSummaryResult` with required fields.

#### Feature E4.F2: Q&A over transcripts
- Status: Done
- Acceptance criteria:
  - Retrieval and answer synthesis approach defined
  - Guardrails for hallucination and PII leakage documented

##### Task E4.F2.T1: Define question intent routing
- Status: Done
- Acceptance criteria:
  - Q&A routing logic and fallbacks documented
  - Notes:
    - Q&A selects relevant cues by keyword overlap and falls back on NotFound.

---

### Epic E5: Observability & security
- Status: Done
- Acceptance criteria:
  - Logging, metrics, and tracing strategy defined
  - Security checklist and compliance guardrails documented

#### Feature E5.F1: Logging and tracing
- Status: Done
- Acceptance criteria:
  - Structured log schema and correlation IDs documented
  - Trace propagation across Graph and OpenAI calls

##### Task E5.F1.T1: Define log redaction rules
- Status: Done
- Acceptance criteria:
  - PII redaction rules documented
  - Notes:
    - Redact emails, phone numbers, SSNs, auth tokens, and transcript content by default.
    - Log only hash or truncated identifiers for user/meeting IDs.

#### Feature E5.F2: Security checklist
- Status: Done
- Acceptance criteria:
  - Threat model checklist documented
  - Dependency and secrets scanning plan documented

##### Task E5.F2.T1: Define secrets handling policy
- Status: Done
- Acceptance criteria:
  - Key rotation and vault usage documented
  - Notes:
    - Use Azure Key Vault in non-local environments; no secrets in code or logs.
    - Rotate client secrets and API keys on a defined cadence (e.g., 90 days).

---

### Epic E6: Teams channel layer & bot integration
- Status: Done (Added based on research context)
- Acceptance criteria:
  - Teams bot handlers remain thin with no business logic
  - Channel inputs mapped to application orchestration contracts
  - Correlation IDs and error handling propagated from channel to services

#### Feature E6.F1: Bot handler boundaries
- Status: Done (Added based on research context)
- Acceptance criteria:
  - Handler responsibilities documented (routing, validation, auth context)
  - No domain logic inside handlers

##### Task E6.F1.T1: Define channel input model
- Status: Done (Added based on research context)
- Acceptance criteria:
  - Input normalization rules documented for messages and commands
  - Mapping to application-layer request contracts documented
  - Notes:
    - Normalized fields documented in `docs/teams-channel.md`.
    - Commands use prefix-based routing to application services.

##### Task E6.F1.T2: Define handler error responses
- Status: Done (Added based on research context)
- Acceptance criteria:
  - User-facing error taxonomy documented
  - Safe fallback messaging documented
  - Notes:
    - Error taxonomy and safe responses documented in `docs/teams-channel.md`.

## Risk register

| Risk | Impact | Mitigation | Status |
| --- | --- | --- | --- |
| Graph permissions are over-scoped or denied | High | Use least privilege mapping, pre-consent guidance | Planned |
| Transcript availability is inconsistent | High | Explicit fallback messaging and availability checks | Proposed |
| Licensing constraints for transcripts | Medium | Document licensing prerequisites and gating | Proposed |
| Token expiration and OBO cache misses | Medium | Cache strategy with refresh and retry | Planned |
| Teams platform limitations (bot scope, tenant policies) | Medium | Document constraints early, add admin guidance | Planned |
| Prompt injection or tool misuse leads to data exposure | High | Tool execution policy, prompt-injection mitigations, redaction | Proposed (Added based on research context) |
| Accidental transcript leakage in logs | High | Strict redaction rules, no transcript logging | Proposed (Added based on research context) |

## Decision log (ADR placeholders)
- ADR-0001: Architecture layering and service boundaries (Status: Proposed)
- ADR-0002: Graph permission scope selection (Status: Proposed)
- ADR-0003: Transcript handling and storage policy (Status: Proposed)
- ADR-0004: LLM prompt strategy and guardrails (Status: Proposed)
- ADR-0005: Observability schema and redaction rules (Status: Proposed)

## Related documentation
- `README.md`
- `AGENTS.md`
- `.copilots/skills/developer.md`
- `.copilots/skills/quality.md`
- `.copilots/skills/manager.md`

# AGENTS

This document defines the Codex agents used for this repository and how they collaborate. Agents must update `BACKLOG.md` status for any Epic, Feature, or Task they change.

## Architecture Agent
- Mission: Define system boundaries, interfaces, and cross-cutting concerns.
- Responsibilities: Layering, service contracts, data flow, risk evaluation, and ADRs.
- Inputs: Product requirements, security constraints, backlog status.
- Outputs: Architecture diagrams (textual), ADRs, updated backlog items.
- Explicit non-goals: Writing production code; implementing CI.
- Validation checklist:
  - Architecture matches Teams + Graph + OpenAI integration goals
  - Least-privilege auth boundaries defined
  - Testability constraints documented
- BACKLOG updates: Moves architecture-related items between Proposed, Planned, and In Progress, and marks Done when docs and tests are complete.

## Developer Agent
- Mission: Produce modular, testable implementation plans and specifications.
- Responsibilities: Service interfaces, helper design, error handling, and dependency boundaries.
- Inputs: Architecture decisions, backlog tasks, skills documentation.
- Outputs: Implementation notes, API contracts, unit test outlines.
- Explicit non-goals: End-to-end UI tests; changing architecture unilaterally.
- Validation checklist:
  - Modular services with clear responsibilities
  - Unit test plan for every helper/service
  - No persistent transcript storage by default
- BACKLOG updates: Sets status to In Progress when implementation planning begins; Done after documentation and unit-test plan updates.

## Quality Agent
- Mission: Ensure testability, CI guardrails, and release-quality standards.
- Responsibilities: Testing strategy, linting gates, coverage expectations, and defect triage.
- Inputs: Backlog, architecture constraints, developer plans.
- Outputs: Test plans, CI gate definitions, quality checklist updates.
- Explicit non-goals: Writing production features.
- Validation checklist:
  - Unit tests required for modular components
  - CI plan includes linting, tests, and security checks
  - End-to-end Teams UI tests explicitly excluded for now
- BACKLOG updates: Updates quality-related features and ensures status is accurate.

## Manager Agent
- Mission: Maintain scope, priority, and documentation discipline.
- Responsibilities: Milestone planning, backlog health, and status consistency.
- Inputs: Backlog, risk register, ADRs.
- Outputs: Prioritized backlog, milestone status changes, risk updates.
- Explicit non-goals: Architectural decisions or code changes.
- Validation checklist:
  - Every item has a status
  - Milestones align with epics and features
  - Risks have owners and mitigations
- BACKLOG updates: Owns status snapshot accuracy and milestone updates.

## Security & Compliance Agent
- Mission: Protect user data, ensure least-privilege access, and document compliance boundaries.
- Responsibilities: Security checklist, threat modeling, data handling policies, and review gates.
- Inputs: Architecture docs, auth flows, backlog risks.
- Outputs: Security guidance, policy updates, backlog risk changes.
- Explicit non-goals: Building security tools or writing code.
- Validation checklist:
  - No transcript persistence by default
  - Redaction rules defined for logs
  - OAuth2 OBO flow documented and reviewed
- BACKLOG updates: Updates security-related tasks, risks, and mitigations.

## Observability Agent
- Mission: Define telemetry standards for reliability and auditability.
- Responsibilities: Logging schema, metrics definitions, tracing strategy.
- Inputs: Architecture and infrastructure plans.
- Outputs: Observability documentation and backlog updates.
- Explicit non-goals: Implementing telemetry code.
- Validation checklist:
  - Correlation IDs defined end-to-end
  - Metrics cover Graph calls, OpenAI usage, and errors
  - Traces span Teams -> Graph -> OpenAI
- BACKLOG updates: Manages observability-related items and acceptance criteria.

## Collaboration rules
- Agents communicate changes by updating `BACKLOG.md` status and adding concise notes where relevant.
- Architectural decisions are recorded as ADR placeholders in `BACKLOG.md` until formal ADR files are introduced.
- Ownership is tracked by assigning a primary agent to each Epic/Feature in backlog notes.
- Any status change requires updating the status snapshot table.
- Never edit `.env`; update `.env.example` only.

## Related documentation
- `README.md`
- `BACKLOG.md`
- `.copilots/skills/developer.md`
- `.copilots/skills/quality.md`
- `.copilots/skills/manager.md`

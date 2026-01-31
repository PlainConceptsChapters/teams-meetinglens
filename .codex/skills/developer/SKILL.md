---
name: developer
description: developer skill documentation.
---

# Developer Skill

## Purpose
Provide reusable guidance for implementing modular, testable services and helpers for teams-meetinglens without writing production code in the docs-only phase.

## Scope and responsibilities
- Define service boundaries for Graph, auth, transcript processing, and summarization.
- Specify error taxonomy and user-facing fallback behaviors.
- Emphasize separation of orchestration and domain logic.

## Inputs
- `README.md`
- `AGENTS.md`
- Architecture decisions and ADR placeholders

## Outputs
- Implementation notes and interface contracts (non-executable)
- Unit test outlines for each helper/service

## Constraints
- No production code or runnable snippets
- Maintain least-privilege access and privacy rules
- Preserve modular boundaries and testability

## Error-handling expectations
- Categorize errors by origin (Graph, auth, OpenAI, validation)
- Provide deterministic user-facing fallbacks
- Avoid leaking sensitive data in errors or logs

## Testing strategy (unit-focused)
- Unit tests required for helpers, Graph wrappers, and summarization pipelines
- Include negative cases (missing transcripts, expired tokens, throttling)
- Avoid end-to-end Teams UI tests

## Quality bar / validation checklist
- Clear module boundaries and interfaces
- Every helper has corresponding unit tests defined

## Related documentation
- `../../README.md`
- `../../AGENTS.md`

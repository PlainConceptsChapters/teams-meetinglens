# Quality Skill

## Purpose
Define quality gates, unit-focused testing strategy, and CI expectations for teams-meetinglens.

## Scope and responsibilities
- Document test strategy and coverage expectations
- Define CI/CD gates (linting, tests, security checks)
- Ensure security and privacy constraints are validated

## Inputs
- `README.md`
- `AGENTS.md`
- Risk register and ADR placeholders

## Outputs
- Unit test plan updates and checklist items
- CI gate definitions (documentation-only)

## Constraints
- No production code or runnable pipelines
- No end-to-end Teams UI tests at this stage
- Keep guidance aligned with least-privilege and privacy requirements

## Error-handling expectations
- Require negative test cases for auth, Graph throttling, and missing transcripts
- Ensure logs are redacted and errors avoid sensitive data

## Testing strategy (unit-focused)
- Unit tests for Graph wrappers, auth handlers, transcript parsing, and summarization
- Boundary tests for token limits and chunking logic
- Mock external systems (Graph, OpenAI)

## Quality bar / validation checklist
- CI gates include linting, unit tests, and security scanning
- All modular services have unit tests defined
- Backlog status is consistent and updated

## Related documentation
- `../../README.md`
- `../../AGENTS.md`

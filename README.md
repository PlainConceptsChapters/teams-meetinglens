# teams-meetinglens

AI-powered Microsoft Teams bot that retrieves meetings and transcripts via Microsoft Graph and generates summaries, key points, and answers using Azure OpenAI.

## Overview
teams-meetinglens is an enterprise-grade Microsoft Teams bot built for secure meeting discovery, transcript access (when permitted), and natural-language summarization and Q&A. The implementation will be in TypeScript/Node.js, but this repository currently contains documentation only.

## Core capabilities
- Calendar search
- Meeting resolution
- Transcript retrieval (when permitted)
- Summarization and Q&A

## High-level architecture
- Channel layer (Teams bot)
- Application / orchestration layer
- Domain services
- Infrastructure (Graph, OpenAI, auth)
- LLM orchestration (tools, prompts, guardrails)

## Authentication & authorization
- Azure Entra ID
- OAuth2 On-Behalf-Of (OBO) flow
- Delegated Microsoft Graph permissions
- Principle of least privilege

## Data handling & privacy
- No transcript persistence by default
- Redacted logs
- Memory-only processing unless explicitly configured later

## Observability
- Structured logging
- Correlation IDs for user, request, and conversation scope
- Metrics and tracing plan (request latency, Graph call rate, token usage, error rate)

## Configuration & environments
- Local / dev / prod parity with explicit environment separation
- Environment variables for runtime configuration
- Azure Key Vault for secrets management in non-local environments

Illustrative (non-executable) configuration keys:

```text
TEAMS_APP_ID=
AZURE_TENANT_ID=
GRAPH_SCOPES=
AZURE_OPENAI_ENDPOINT=
AZURE_OPENAI_DEPLOYMENT=
KEY_VAULT_URI=
LOG_LEVEL=
```

## Non-goals (for now)
- End-to-end Teams UI automation tests
- Cross-tenant meeting sharing or transcript export
- Long-term transcript storage or indexing
- Multi-language summarization (beyond English)

## Roadmap
See `BACKLOG.md` for milestones, epics, and status. The backlog is the single source of truth.

## Contribution guidelines
- Keep the architecture modular and testable
- Update documentation when behavior changes
- Add unit tests for helpers and services
- Avoid adding end-to-end Teams UI tests at this stage

## Security reporting
Please report security issues privately following the guidance in `AGENTS.md`.

## License
See `LICENSE`.

## Related documentation
- `BACKLOG.md`
- `AGENTS.md`
- `.copilots/skills/developer.md`
- `.copilots/skills/quality.md`
- `.copilots/skills/manager.md`

# teams-meetinglens

AI-powered Microsoft Teams bot that retrieves meetings and transcripts via Microsoft Graph and generates summaries, key points, and answers using Azure OpenAI.

## Overview
teams-meetinglens is an enterprise-grade Microsoft Teams bot built for secure meeting discovery, transcript access (when permitted), and natural-language summarization and Q&A. The implementation is in TypeScript/Node.js.

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
TEAMS_BOT_ID=
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
- Human-curated localization beyond English (responses are auto-translated)

## Roadmap
See `BACKLOG.md` for milestones, epics, and status. The backlog is the single source of truth.

## Contribution guidelines
- Keep the architecture modular and testable
- Update documentation when behavior changes
- Add unit tests for helpers and services
- Avoid adding end-to-end Teams UI tests at this stage

## Developer setup (Azure)
To contribute locally, you need your own Entra ID app registration with delegated Graph permissions.

Create an app registration and configure:
- Platform: Web
- Redirect URI: `http://localhost:3000`
- Client secret for local auth-code testing

Required delegated Microsoft Graph permissions:
- `Calendars.Read`
- `Calendars.Read.Shared`
- `OnlineMeetings.Read`
- `OnlineMeetingTranscript.Read.All` (admin consent required)
- `User.Read`

After adding permissions, grant admin consent in your tenant. Then populate `.env` with your tenant/app values.

Azure OpenAI (Foundry) setup:
- Create an Azure AI Foundry (Azure OpenAI) resource in your subscription.
- Deploy a chat model (e.g., GPT-4o/4.1) and note the deployment name.
- Capture the endpoint and API key from the resource.
- Populate `AZURE_OPENAI_ENDPOINT`, `AZURE_OPENAI_API_KEY`, `AZURE_OPENAI_DEPLOYMENT`, and `AZURE_OPENAI_API_VERSION`.
  - Recommended models: `gpt-4.1-mini` (default), `gpt-4.1-nano` (fast/low-cost).
  - Cheapest option: `gpt-4.1-nano` on Global Standard deployment.

## Development (repo skeleton)
This repository uses npm with ESLint, Prettier, TypeScript, and Vitest. The scripts below are the baseline harness for unit tests and static checks.

```text
npm run lint
npm run typecheck
npm test
```

## Local auth + Graph smoke tests
These scripts validate Entra ID auth configuration and Graph access in a local environment.

Prerequisites:
- Configure Entra ID app registration with delegated permissions.
- Ensure redirect URI `http://localhost:3000` is added for the app registration.
- Populate `.env` with values from your tenant/app.
 - Add Azure OpenAI settings to `.env` when testing summarization/Q&A.

Commands:

```text
npm run auth:code
npm run auth:transcript
npm run auth:graph-token
npm run llm:smoke
npm run bot:dev
npm run teamsapp:pack
```

## Localization (i18n)
User-facing bot text is stored in English only (`src/i18n/en.json`). At runtime the bot detects the user's language and uses Azure OpenAI to translate replies back to that language. Use `/language <code>` to override detection (example: `es`, `ro`, `fr`).

Commands always start with `/` and are not translated (for example, `/summary`, `/qa`, `/agenda`).

To update or extend copy:
1. Edit `src/i18n/en.json` with the English source text.
2. Run tests to ensure all required keys are present.

Note:
- Translation depends on Azure OpenAI being configured for the bot host.

Notes:
- `auth:code` completes an auth-code flow and calls `/me/calendarView`.
- `auth:transcript` completes an auth-code flow and then fetches transcripts for a given `onlineMeetingId` or `joinUrl`.
- `llm:smoke` runs a local Azure OpenAI smoke test (summary + Q&A).
- `bot:dev` starts the local Teams bot host.
- `teamsapp:pack` creates a Teams app package zip under `teamsapp/`.
- `teamsapp:build` renders `teamsapp/manifest.json` from `teamsapp/manifest.template.json` using `TEAMS_APP_ID`.

Azure OpenAI variables (for summarization/Q&A):
- `AZURE_OPENAI_ENDPOINT`
- `AZURE_OPENAI_API_KEY`
- `AZURE_OPENAI_DEPLOYMENT`
- `AZURE_OPENAI_API_VERSION`

Testing scope reminder:
- Unit tests are required for modular components (Graph wrappers, transcript processing, summarization, caching)
- End-to-end Teams UI or Bot Framework tests are out of scope initially

## Security reporting
Please report security issues privately following the guidance in `AGENTS.md`.

## License
See `LICENSE`.

## Related documentation
- `BACKLOG.md`
- `AGENTS.md`
- `docs/observability.md`
- `docs/security.md`
- `docs/teams-channel.md`
- `docs/bot-runtime.md`
- `docs/azure-bot.md`
- `.copilots/skills/developer.md`
- `.copilots/skills/quality.md`
- `.copilots/skills/manager.md`

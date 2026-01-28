# Bot Runtime (Teams)

## Overview
This host receives Teams activities via Bot Framework and routes them to the `TeamsCommandRouter`.

## Local dev prerequisites
- Azure Bot registration (App ID + password)
- Teams app manifest configured with messaging endpoint
- Dev tunnel (ngrok or dev tunnel) to expose `http://localhost:3978/api/messages`

## Environment variables
- `TEAMS_APP_ID`
- `TEAMS_APP_PASSWORD`
- `BOT_PORT` (default: 3978)
- `BOT_ENDPOINT_PATH` (default: `/api/messages`)
- `BOT_MENTION_TEXT` (optional, e.g., `@meetinglens`)
- `BOT_TRANSCRIPT_TEXT` (optional, inline transcript for dev)
- `BOT_TRANSCRIPT_FILE` (optional, path to transcript text file)
- `GRAPH_ACCESS_TOKEN` (optional, delegated Graph token for agenda search in dev)
- `BOT_OAUTH_CONNECTION` (optional, OAuth connection name for Teams SSO)

When `BOT_OAUTH_CONNECTION` is set, the bot uses the Teams SSO token to call Graph on behalf of the user.

Azure Bot OAuth connection fields:
- Provider: Azure Active Directory v2
- Client ID: Entra App ID
- Client secret: secret value
- Tenant ID: Entra tenant GUID
- Scopes: Calendars.Read OnlineMeetings.Read OnlineMeetingTranscript.Read.All User.Read
- Token Exchange URL: Application ID URI (api://<app-id>)

Manifest SSO fields:
- webApplicationInfo.id: Entra App ID (same as TEAMS_BOT_ID)
- webApplicationInfo.resource: Application ID URI (set TEAMS_APP_RESOURCE)

## Run locally
```text
npm run bot:dev
```

## Teams app package
```text
npm run teamsapp:pack
```

## Tunnel
Example with ngrok:
```text
ngrok http 3978
```
Use the HTTPS URL as the bot messaging endpoint in Azure Bot + Teams manifest.

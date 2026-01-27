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

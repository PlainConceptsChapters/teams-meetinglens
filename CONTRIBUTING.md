# Contributing

Thanks for contributing to teams-meetinglens! This repo focuses on secure, testable building blocks for a Teams bot that retrieves meetings/transcripts and summarizes them via Azure OpenAI.

## Ground rules
- Keep the architecture modular and testable.
- Update documentation when behavior changes.
- Add unit tests for helpers and services.
- Avoid end-to-end Teams UI automation tests at this stage.
- Never edit `.env`; update `.env.example` only.

## Developer setup (local)
See `README.md` for required Entra ID and Azure OpenAI configuration, plus smoke-test scripts.

## Testing in Microsoft Teams (sideload)
Use these steps to install the bot in Teams for local testing.

Prerequisites:
- Entra app registration with delegated Graph permissions.
- Azure Bot resource linked to the Entra app registration.
- Dev tunnel (ngrok or VS Code dev tunnel) for your local bot host.
- `TEAMS_APP_ID` set so the Teams manifest can be generated automatically.

### Getting the Teams App ID and Password
You need the App (client) ID and a client secret (used as the Teams app password).

From Entra ID:
1. Open Azure portal -> Microsoft Entra ID -> App registrations.
2. Select your bot app registration.
3. Copy the **Application (client) ID** -> this is **both** `AZURE_CLIENT_ID` and `TEAMS_BOT_ID`.
   - Reason: the Teams bot (Bot Framework) and Graph/OBO auth are backed by the same Entra app registration, so they share one client ID.
4. Go to **Certificates & secrets** -> **New client secret**.
5. Copy the secret **Value** -> this is `TEAMS_APP_PASSWORD`.

From Azure Bot registration:
1. Open Azure portal -> your Azure Bot resource.
2. Under **Configuration**, note the **Microsoft App ID** (same as Entra App ID).
3. Use the client secret you created in Entra as the **Microsoft App Password**.

### Configure Graph API permissions (delegated)
1. Open Azure portal -> Microsoft Entra ID -> App registrations -> your app.
2. Go to **API permissions** -> **Add a permission** -> **Microsoft Graph** -> **Delegated permissions**.
3. Add:
   - `Calendars.Read`
   - `OnlineMeetings.Read`
   - `OnlineMeetingTranscript.Read.All`
   - `User.Read`
4. Click **Grant admin consent** for your tenant.

### Creating an Azure Bot resource
1. In the Azure portal, click **Create a resource** and search for **Azure Bot**.
2. Choose **Azure Bot** (Bot Channels Registration) and click **Create**.
3. Fill in:
   - **Bot handle**: a friendly name (e.g., `meetinglens-dev`).
   - **Subscription / Resource Group / Region**: select your dev environment.
   - **Type of App**: **Single Tenant**.
   - **Microsoft App ID**: use the App (client) ID from your Entra app registration.
4. Click **Create** to provision the bot.
5. Open the bot resource -> **Channels** -> add **Microsoft Teams**.

Steps:
1. Populate `.env` with your Entra and Teams values:
   - `TEAMS_APP_ID`: **Teams App ID** from Developer Portal (this goes in manifest `id`).
   - `TEAMS_BOT_ID`: **Entra App (client) ID** (this goes in manifest `bots[0].botId`).
   - `TEAMS_APP_PASSWORD`: Entra client secret (bot password).
   - `MICROSOFT_APP_TYPE`: `SingleTenant`.
   - `MICROSOFT_APP_TENANT_ID`: your Entra tenant id (same as `AZURE_TENANT_ID`).
   - Common mistake: swapping `TEAMS_APP_ID` and `TEAMS_BOT_ID` will break upload/routing.
   - Optional local testing:
     - `BOT_TRANSCRIPT_TEXT`: inline transcript text for local testing.
     - `BOT_TRANSCRIPT_FILE`: path to a transcript text file for local testing.
     - `BOT_MENTION_TEXT`: bot mention text to strip (e.g., `@meetinglens`).
     - `GRAPH_ACCESS_TOKEN`: delegated Graph access token for agenda search in local dev.
     - Get a token with: `npm run auth:graph-token`
     - For Teams SSO, set `BOT_OAUTH_CONNECTION` to the OAuth connection name configured in Azure Bot.
2. Configure a dev tunnel to expose `http://localhost:3978/api/messages`.
3. In Azure Bot registration, set the messaging endpoint to your tunnel URL + `/api/messages`.
   - Azure portal -> your Azure Bot resource -> Configuration -> Messaging endpoint.
   - Use the HTTPS tunnel URL and keep the path `/api/messages` (example: `https://<tunnel>.ngrok.app/api/messages`).
4. Generate the Teams app manifest from your `.env`:
   - `npm run teamsapp:build`
   - This renders `teamsapp/manifest.json` from `teamsapp/manifest.template.json` using `TEAMS_APP_ID`.
5. Start the local bot host:
   - `npm run bot:dev`
6. Package the Teams app:
   - `npm run teamsapp:pack`
   - This creates `teamsapp/teamsapp.zip`.
7. In Microsoft Teams:
   - Apps -> Manage your apps -> Upload an app -> Upload a custom app.
   - Select `teamsapp/teamsapp.zip`.
8. Add the app to a personal chat or team and send a message to verify the bot responds.

### Teams SSO (delegated Graph, recommended)
To ensure users only access their own data, use delegated Graph via Teams SSO:
1. In Azure Bot resource -> **Configuration** -> **Add OAuth Connection Settings**.
2. Provider: **Azure Active Directory v2**.
3. Fill fields:
   - Client ID: Entra App ID.
   - Client secret: secret **value** from Entra -> Certificates & secrets.
   - Tenant ID: your Entra tenant GUID.
   - Scopes: `Calendars.Read OnlineMeetings.Read OnlineMeetingTranscript.Read.All User.Read`.
   - Token Exchange URL: your **Application ID URI** (Entra -> Expose an API), typically `api://<app-id>`.
4. Note the **OAuth connection name** and set `BOT_OAUTH_CONNECTION` in `.env`.
5. Update the Teams app manifest `webApplicationInfo` with your **Entra App ID** and **Application ID URI**.
   - `webApplicationInfo.id`: Entra App ID (same as `TEAMS_BOT_ID`).
   - `webApplicationInfo.resource`: Application ID URI (set `TEAMS_APP_RESOURCE`).
6. Rebuild and re-upload the Teams app package.

Notes:
- If the bot can't be reached, re-check the tunnel URL and Azure Bot messaging endpoint.
- Make sure the App ID in the manifest matches the Azure Bot/Entra App ID.

## Localization
Bot text is authored in English only (`src/i18n/en.json`). The bot detects the user's language and uses Azure OpenAI to translate responses at runtime. Use `/language <code>` to override detection (example: `es`, `ro`, `fr`).
Commands always start with `/` and are not translated (for example, `/summary`, `/qa`, `/agenda`).

## Related docs
- `docs/bot-runtime.md`
- `docs/azure-bot.md`
- `docs/teams-channel.md`

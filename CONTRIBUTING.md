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
3. Copy the **Application (client) ID** -> this is **both** `AZURE_CLIENT_ID` and `TEAMS_APP_ID`.
   - Reason: the Teams bot (Bot Framework) and Graph/OBO auth are backed by the same Entra app registration, so they share one client ID.
4. Go to **Certificates & secrets** -> **New client secret**.
5. Copy the secret **Value** -> this is `TEAMS_APP_PASSWORD`.

From Azure Bot registration:
1. Open Azure portal -> your Azure Bot resource.
2. Under **Configuration**, note the **Microsoft App ID** (same as Entra App ID).
3. Use the client secret you created in Entra as the **Microsoft App Password**.

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
1. Populate `.env` with your Entra and Teams values (including `TEAMS_APP_ID` and `TEAMS_APP_PASSWORD`).
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

Notes:
- If the bot can't be reached, re-check the tunnel URL and Azure Bot messaging endpoint.
- Make sure the App ID in the manifest matches the Azure Bot/Entra App ID.

## Related docs
- `docs/bot-runtime.md`
- `docs/azure-bot.md`
- `docs/teams-channel.md`

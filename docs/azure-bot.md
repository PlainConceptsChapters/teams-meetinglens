# Azure Bot Registration

## Create bot resource
- Create an Azure Bot resource linked to your Entra app registration.
- Enable the Microsoft Teams channel.

## Configure messaging endpoint
- Use your dev tunnel URL with `/api/messages`.
- Example: `https://<tunnel>.ngrok.app/api/messages`

## Credentials
- Use the App ID and client secret from Entra for `TEAMS_APP_ID` and `TEAMS_APP_PASSWORD`.

## Teams app manifest
- Set `botId` and `webApplicationInfo.id` to the App ID.
- Package `teamsapp/manifest.json` with icon files.

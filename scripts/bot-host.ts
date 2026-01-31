import 'dotenv/config';
import fs from 'node:fs/promises';
import crypto from 'node:crypto';
import express, { Request, Response } from 'express';
import {
  TeamsActivityHandler,
  CloudAdapter,
  ConfigurationBotFrameworkAuthentication,
  TurnContext
} from 'botbuilder';
import { Attachment, Mention } from 'botframework-schema';
import { AzureOpenAiClient } from '../src/llm/azureOpenAiClient.js';
import { ChannelRequest } from '../src/teams/types.js';
import { buildAgendaCard, buildSignInCard } from './bot/cards.js';
import {
  agendaMaxItems,
  agendaMaxTranscriptChecks,
  botMentionText,
  calendarMaxPages,
  graphAccessToken,
  graphBaseUrl,
  oauthConnection,
  requireEnv,
  selectionTtlMs,
  systemTimeZone
} from './bot/config.js';
import { loadTranslations, createI18n } from './bot/i18n.js';
const isLogoutCommand = (text: string) => text.trim().toLowerCase().startsWith('/logout');
import { logEvent } from './bot/logging.js';
import { buildGraphServicesForRequest, getMeetingTranscriptService, runGraphDebug } from './bot/graph.js';
import { createRouter } from './bot/router.js';

const port = Number(process.env.BOT_PORT ?? process.env.PORT ?? 3978);
const endpointPath = process.env.BOT_ENDPOINT_PATH ?? '/api/messages';

const botFrameworkAuthentication = new ConfigurationBotFrameworkAuthentication({
  MicrosoftAppId: requireEnv('TEAMS_BOT_ID'),
  MicrosoftAppPassword: requireEnv('TEAMS_APP_PASSWORD'),
  MicrosoftAppType: process.env.MICROSOFT_APP_TYPE ?? 'SingleTenant',
  MicrosoftAppTenantId: process.env.MICROSOFT_APP_TENANT_ID ?? process.env.AZURE_TENANT_ID
});
const adapter = new CloudAdapter(botFrameworkAuthentication);

const buildTranscript = async (): Promise<{ raw: string; cues: [] }> => {
  if (process.env.BOT_TRANSCRIPT_TEXT) {
    return { raw: process.env.BOT_TRANSCRIPT_TEXT, cues: [] };
  }
  if (process.env.BOT_TRANSCRIPT_FILE) {
    const text = await fs.readFile(process.env.BOT_TRANSCRIPT_FILE, 'utf8');
    return { raw: text, cues: [] };
  }
  return { raw: '', cues: [] };
};

const buildLlmClient = (deploymentOverride?: string) => {
  return new AzureOpenAiClient({
    endpoint: requireEnv('AZURE_OPENAI_ENDPOINT'),
    apiKey: requireEnv('AZURE_OPENAI_API_KEY'),
    deployment: deploymentOverride ?? requireEnv('AZURE_OPENAI_DEPLOYMENT'),
    apiVersion: requireEnv('AZURE_OPENAI_API_VERSION')
  });
};

const buildSummaryLlmClient = () => {
  const deployment = process.env.AZURE_OPENAI_SUMMARY_DEPLOYMENT ?? process.env.AZURE_OPENAI_DEPLOYMENT;
  return buildLlmClient(deployment);
};

const translations = await loadTranslations();
const { t, translateOutgoing, translateToEnglish, resolvePreferredLanguage, buildHelpText } = createI18n(
  translations,
  buildLlmClient
);

const buildGraphServices = (request: ChannelRequest) =>
  buildGraphServicesForRequest(request, graphBaseUrl, graphAccessToken, {
    maxTranscriptChecks: agendaMaxTranscriptChecks,
    maxPages: calendarMaxPages
  });
const getTranscriptService = (request: ChannelRequest) =>
  getMeetingTranscriptService(request, graphBaseUrl, graphAccessToken);
const runGraphDebugForRequest = (request: ChannelRequest) =>
  runGraphDebug(request, graphBaseUrl, graphAccessToken, {
    maxTranscriptChecks: agendaMaxTranscriptChecks,
    maxItems: agendaMaxItems,
    maxPages: calendarMaxPages
  });

const router = createRouter({
  botMentionText,
  oauthConnection,
  graphAccessToken,
  systemTimeZone,
  t,
  translateOutgoing,
  translateToEnglish,
  resolvePreferredLanguage,
  buildHelpText,
  buildSignInCard,
  buildAgendaCard,
  buildTranscript,
  buildGraphServicesForRequest: buildGraphServices,
  getMeetingTranscriptService: getTranscriptService,
  runGraphDebug: runGraphDebugForRequest,
  buildLlmClient,
  buildSummaryLlmClient,
  agendaMaxItems,
  selectionTtlMs
});

type ActivityAttachment = Attachment & { contentLength?: number };

class TeamsBot extends TeamsActivityHandler {
  constructor() {
    super();
    this.onMessage(async (context: TurnContext, next: () => Promise<void>) => {
      const activity = context.activity;
      const value = activity.value as { command?: string; selection?: string } | undefined;
      const commandText =
        value?.command === 'select' && value.selection ? `/select ${value.selection}` : undefined;
      const incomingText = commandText ?? activity.text ?? '';
      const fromAadObjectId = (activity.from as { aadObjectId?: string } | undefined)?.aadObjectId;
      let graphToken: string | undefined;
      let signInLink: string | undefined;
      const magicCodeMatch = (activity.text ?? '').trim().match(/^\d{6}$/);
      const magicCode = magicCodeMatch ? magicCodeMatch[0] : '';
      if (oauthConnection) {
        const claimsIdentity = context.turnState.get(adapter.BotIdentityKey);
        if (claimsIdentity) {
          try {
            const userTokenClient = await botFrameworkAuthentication.createUserTokenClient(claimsIdentity);
            const token = await userTokenClient.getUserToken(
              activity.from?.id ?? '',
              oauthConnection,
              activity.channelId ?? '',
              magicCode
            );
            graphToken = token?.token;
            if (!graphToken) {
              const signInResource = await userTokenClient.getSignInResource(oauthConnection, activity, '');
              signInLink = signInResource?.signInLink;
            }
          } catch {
            graphToken = undefined;
            signInLink = undefined;
          }
        }
      }

      const request: ChannelRequest = {
        channelId: activity.channelId ?? 'msteams',
        conversationId: activity.conversation?.id ?? '',
        messageId: activity.id ?? '',
        fromUserId: fromAadObjectId ?? activity.from?.id ?? '',
        fromUserName: activity.from?.name ?? undefined,
        tenantId: activity.conversation?.tenantId ?? activity.channelData?.tenant?.id,
        text: commandText ?? activity.text ?? '',
        correlationId: crypto.randomUUID(),
        graphToken,
        signInLink,
        meetingId:
          (activity.channelData as { meeting?: { id?: string; meetingId?: string } } | undefined)?.meeting?.id ??
          (activity.channelData as { meeting?: { id?: string; meetingId?: string } } | undefined)?.meeting?.meetingId ??
          (activity.channelData as { meetingId?: string } | undefined)?.meetingId,
        meetingJoinUrl:
          (activity.channelData as { meeting?: { joinUrl?: string; joinWebUrl?: string } } | undefined)?.meeting
            ?.joinUrl ??
          (activity.channelData as { meeting?: { joinUrl?: string; joinWebUrl?: string } } | undefined)?.meeting
            ?.joinWebUrl ??
          (activity.channelData as { joinUrl?: string } | undefined)?.joinUrl,
        attachments: (activity.attachments as ActivityAttachment[] | undefined)?.map((attachment) => ({
          name: attachment.name,
          contentType: attachment.contentType,
          size: attachment.contentLength,
          url: attachment.contentUrl
        })),
        mentions: activity.entities
          ?.filter((entity): entity is Mention => entity.type === 'mention')
          .map((entity) => ({
            id: entity.mentioned?.id,
            name: entity.mentioned?.name,
            text: entity.text
          })),
        value,
        timestamp: activity.timestamp?.toISOString(),
        locale: activity.locale ?? (activity.channelData as { locale?: string } | undefined)?.locale ?? undefined
      };

      logEvent(request, 'incoming_message', {
        correlationId: request.correlationId,
        channelId: request.channelId,
        command: commandText ?? undefined,
        textLength: request.text.length,
        hasAttachments: Boolean(request.attachments?.length),
        hasMentions: Boolean(request.mentions?.length),
        locale: request.locale
      });

      if (magicCodeMatch) {
        const preferred = await resolvePreferredLanguage(request);
        const message = graphToken ? t('auth.signedIn') : t('auth.codeInvalid');
        await context.sendActivity(await translateOutgoing(message, preferred));
        await next();
        return;
      }

      if (isLogoutCommand(incomingText)) {
        const preferred = await resolvePreferredLanguage(request);
        if (!oauthConnection) {
          await context.sendActivity(await translateOutgoing(t('auth.signOutNotConfigured'), preferred));
          await next();
          return;
        }
        const claimsIdentity = context.turnState.get(adapter.BotIdentityKey);
        if (!claimsIdentity) {
          await context.sendActivity(await translateOutgoing(t('auth.signOutNotConfigured'), preferred));
          await next();
          return;
        }
        try {
          const userTokenClient = await botFrameworkAuthentication.createUserTokenClient(claimsIdentity);
          await userTokenClient.signOutUser(activity.from?.id ?? '', oauthConnection, activity.channelId ?? '');
        } catch {
          await context.sendActivity(await translateOutgoing(t('auth.signOutNotConfigured'), preferred));
          await next();
          return;
        }
        await context.sendActivity(await translateOutgoing(t('auth.signedOut'), preferred));
        await next();
        return;
      }

      let loadingActivityId: string | undefined;
      let loadingTimer: NodeJS.Timeout | undefined;
      const trimmedIncoming = incomingText.trim().toLowerCase();
      const shouldShowSummaryLoading =
        trimmedIncoming.startsWith('/summary') && (graphToken || graphAccessToken);
      const shouldShowAgendaLoading =
        trimmedIncoming.startsWith('/agenda') && (graphToken || graphAccessToken);
      if (shouldShowSummaryLoading || shouldShowAgendaLoading) {
        const preferred = await resolvePreferredLanguage(request);
        await context.sendActivity({ type: 'typing' });
        const loadingText = shouldShowAgendaLoading ? t('agenda.loadingText') : t('summary.loadingText');
        const loadingMore = shouldShowAgendaLoading ? t('agenda.loadingMore') : t('summary.loadingMore');
        const loadingActivity = await context.sendActivity({
          text: await translateOutgoing(loadingText, preferred)
        });
        loadingActivityId = loadingActivity?.id;
        loadingTimer = setTimeout(async () => {
          try {
            await context.updateActivity({
              id: loadingActivityId,
              type: 'message',
              conversation: activity.conversation,
              text: await translateOutgoing(loadingMore, preferred)
            });
          } catch {
            // Ignore update failures for interim progress.
          }
        }, 4000);
      }

      const response = await router.handle(request);
      const metadata = response.metadata?.adaptiveCard;
      const signIn = response.metadata?.signinLink;
      const followupText = response.metadata?.followupText;
      const outgoing = metadata
        ? {
            text: response.text,
            attachments: [JSON.parse(metadata)]
          }
        : signIn
          ? {
              text: response.text,
              attachments: [buildSignInCard(response.text, t('auth.signInCta'), signIn)]
            }
          : { text: response.text };

      logEvent(request, 'outgoing_message', {
        correlationId: request.correlationId,
        textLength: response.text.length,
        hasCard: Boolean(metadata),
        hasSignIn: Boolean(signIn)
      });

      if (loadingTimer) {
        clearTimeout(loadingTimer);
      }
      if (loadingActivityId) {
        try {
          await context.updateActivity({
            id: loadingActivityId,
            type: 'message',
            conversation: activity.conversation,
            ...outgoing
          });
        } catch {
          await context.sendActivity(outgoing);
        }
      } else {
        await context.sendActivity(outgoing);
      }

      if (signIn && followupText) {
        await context.sendActivity(followupText);
      }
      await next();
    });
  }
}

const bot = new TeamsBot();

const app = express();
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.post(endpointPath, (req: Request, res: Response) => {
  adapter.process(req, res, async (turnContext) => {
    await bot.run(turnContext);
  });
});

app.listen(port, () => {
  console.log(`Bot host listening on http://localhost:${port}${endpointPath}`);
});

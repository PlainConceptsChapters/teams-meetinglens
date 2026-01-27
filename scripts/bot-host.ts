import fs from 'node:fs/promises';
import express from 'express';
import {
  TeamsActivityHandler,
  CloudAdapter,
  ConfigurationServiceClientCredentialFactory
} from 'botbuilder';
import { AzureOpenAiClient, QaService, SummarizationService } from '../src/index.js';
import { TeamsCommandRouter } from '../src/teams/router.js';
import { ChannelRequest } from '../src/teams/types.js';

const requireEnv = (key: string): string => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key} environment variable.`);
  }
  return value;
};

const port = Number(process.env.BOT_PORT ?? 3978);
const endpointPath = process.env.BOT_ENDPOINT_PATH ?? '/api/messages';
const botMentionText = process.env.BOT_MENTION_TEXT;

const credentials = new ConfigurationServiceClientCredentialFactory({
  MicrosoftAppId: requireEnv('TEAMS_APP_ID'),
  MicrosoftAppPassword: requireEnv('TEAMS_APP_PASSWORD')
});
const adapter = new CloudAdapter(credentials);

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

const buildLlmClient = () => {
  return new AzureOpenAiClient({
    endpoint: requireEnv('AZURE_OPENAI_ENDPOINT'),
    apiKey: requireEnv('AZURE_OPENAI_API_KEY'),
    deployment: requireEnv('AZURE_OPENAI_DEPLOYMENT'),
    apiVersion: requireEnv('AZURE_OPENAI_API_VERSION')
  });
};

const router = new TeamsCommandRouter({
  botMentionText,
  routes: [
    {
      command: 'summary',
      handler: async () => {
        const transcript = await buildTranscript();
        if (!transcript.raw) {
          return { text: 'Transcript not configured for local dev.' };
        }
        const client = buildLlmClient();
        const summarizer = new SummarizationService({ client });
        const result = await summarizer.summarize(transcript);
        return { text: result.summary };
      }
    },
    {
      command: 'qa',
      handler: async (request) => {
        const transcript = await buildTranscript();
        if (!transcript.raw) {
          return { text: 'Transcript not configured for local dev.' };
        }
        const client = buildLlmClient();
        const qa = new QaService({ client });
        const result = await qa.answerQuestion(request.text, transcript);
        return { text: result.answer };
      }
    }
  ],
  defaultHandler: async (request) => {
    const transcript = await buildTranscript();
    if (!transcript.raw) {
      return { text: 'Transcript not configured for local dev.' };
    }
    const client = buildLlmClient();
    const qa = new QaService({ client });
    const result = await qa.answerQuestion(request.text, transcript);
    return { text: result.answer };
  }
});

class TeamsBot extends TeamsActivityHandler {
  async onMessage(context, next) {
    const activity = context.activity;
    const request: ChannelRequest = {
      channelId: activity.channelId ?? 'msteams',
      conversationId: activity.conversation?.id ?? '',
      messageId: activity.id ?? '',
      fromUserId: activity.from?.id ?? '',
      fromUserName: activity.from?.name ?? undefined,
      tenantId: activity.conversation?.tenantId ?? activity.channelData?.tenant?.id,
      text: activity.text ?? '',
      attachments: activity.attachments?.map((attachment) => ({
        name: attachment.name,
        contentType: attachment.contentType,
        size: attachment.contentLength,
        url: attachment.contentUrl
      })),
      mentions: activity.entities
        ?.filter((entity) => entity.type === 'mention')
        .map((entity) => ({
          id: entity.mentioned?.id,
          name: entity.mentioned?.name,
          text: entity.text
        })),
      timestamp: activity.timestamp?.toISOString(),
      locale: activity.locale ?? undefined
    };

    const response = await router.handle(request);
    await context.sendActivity(response.text);
    await next();
  }
}

const bot = new TeamsBot();

const app = express();
app.post(endpointPath, (req, res) => {
  adapter.process(req, res, async (turnContext) => {
    await bot.run(turnContext);
  });
});

app.listen(port, () => {
  console.log(`Bot host listening on http://localhost:${port}${endpointPath}`);
});

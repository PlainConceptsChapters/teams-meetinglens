import fs from 'node:fs/promises';
import { AzureOpenAiClient, QaService, SummarizationService } from '../src/index.js';

const loadEnv = async () => {
  const env = { ...process.env };
  try {
    const content = await fs.readFile('.env', 'utf8');
    for (const line of content.split(/\r?\n/)) {
      if (!line || line.trim().startsWith('#')) {
        continue;
      }
      const index = line.indexOf('=');
      if (index < 0) {
        continue;
      }
      const key = line.slice(0, index).trim();
      const value = line.slice(index + 1).trim();
      if (!(key in env) && value.length > 0) {
        env[key] = value;
      }
    }
  } catch {
    // .env is optional
  }
  return env;
};

const requireValue = (env: Record<string, string | undefined>, key: string): string => {
  const value = env[key];
  if (!value) {
    throw new Error(`Missing ${key}. Set it in .env or environment variables.`);
  }
  return value;
};

const main = async () => {
  const env = await loadEnv();

  const client = new AzureOpenAiClient({
    endpoint: requireValue(env, 'AZURE_OPENAI_ENDPOINT'),
    apiKey: requireValue(env, 'AZURE_OPENAI_API_KEY'),
    deployment: requireValue(env, 'AZURE_OPENAI_DEPLOYMENT'),
    apiVersion: requireValue(env, 'AZURE_OPENAI_API_VERSION')
  });

  const summarizer = new SummarizationService({ client });
  const qa = new QaService({ client });

  const transcript = {
    raw:
      'Alice will deliver the deck by Friday. Bob will update the roadmap next week. The team agreed to revisit the budget.',
    cues: []
  };

  const summary = await summarizer.summarize(transcript);
  console.log('\nSummary result:');
  console.log(summary);

  const answer = await qa.answerQuestion('What are the action items?', transcript);
  console.log('\nQ&A result:');
  console.log(answer);
};

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});

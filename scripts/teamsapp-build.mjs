import 'dotenv/config';
import fs from 'node:fs/promises';
import path from 'node:path';

const requireEnv = (key) => {
  const value = process.env[key];
  if (!value) {
    throw new Error(`Missing ${key} environment variable.`);
  }
  return value;
};

const appId = requireEnv('TEAMS_APP_ID');
const botId = requireEnv('TEAMS_BOT_ID');
const templatePath = path.join('teamsapp', 'manifest.template.json');
const outputPath = path.join('teamsapp', 'manifest.json');

const template = await fs.readFile(templatePath, 'utf8');
const rendered = template.replaceAll('${TEAMS_APP_ID}', appId).replaceAll('${TEAMS_BOT_ID}', botId);

await fs.writeFile(outputPath, rendered, 'utf8');
console.log(`Wrote ${outputPath} from ${templatePath}.`);

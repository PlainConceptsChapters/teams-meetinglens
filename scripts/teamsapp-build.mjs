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
const resource = process.env.TEAMS_APP_RESOURCE ?? `api://${botId}`;
const templatePath = path.join('teamsapp', 'manifest.template.json');
const outputPath = path.join('teamsapp', 'manifest.json');

const template = await fs.readFile(templatePath, 'utf8');
const parseVersion = (value) => {
  const match = value.match(/^(\d+)\.(\d+)\.(\d+)$/);
  if (!match) {
    return { major: 1, minor: 0, patch: 0 };
  }
  return { major: Number(match[1]), minor: Number(match[2]), patch: Number(match[3]) };
};

const bumpMinor = (value) => {
  const { major, minor } = parseVersion(value);
  return `${major}.${minor + 1}.0`;
};

const templateJson = JSON.parse(template);
let nextVersion = templateJson.version ?? '1.0.0';
try {
  const existing = await fs.readFile(outputPath, 'utf8');
  const existingJson = JSON.parse(existing);
  if (existingJson?.version) {
    nextVersion = bumpMinor(existingJson.version);
  }
} catch {
  nextVersion = bumpMinor(nextVersion);
}

const rendered = template
  .replaceAll('${TEAMS_APP_ID}', appId)
  .replaceAll('${TEAMS_BOT_ID}', botId)
  .replaceAll('${TEAMS_APP_RESOURCE}', resource);

const manifestJson = JSON.parse(rendered);
manifestJson.version = nextVersion;
await fs.writeFile(outputPath, JSON.stringify(manifestJson, null, 2), 'utf8');
console.log(`Wrote ${outputPath} from ${templatePath}.`);

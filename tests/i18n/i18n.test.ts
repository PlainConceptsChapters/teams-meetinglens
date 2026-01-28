import { describe, expect, it } from 'vitest';
import fs from 'node:fs/promises';
import path from 'node:path';

const readJson = async (filePath: string) => {
  const raw = await fs.readFile(filePath, 'utf8');
  return JSON.parse(raw) as Record<string, unknown>;
};

const get = (obj: Record<string, unknown>, keyPath: string): unknown => {
  return keyPath.split('.').reduce<unknown>((acc, key) => {
    if (acc && typeof acc === 'object' && key in (acc as Record<string, unknown>)) {
      return (acc as Record<string, unknown>)[key];
    }
    return undefined;
  }, obj);
};

const requiredKeys = [
  'help.title',
  'help.agenda',
  'help.select',
  'help.summary',
  'help.qa',
  'help.language',
  'help.how',
  'help.contribute',
  'help.help',
  'help.whoami',
  'help.graphdebug',
  'help.logs',
  'help.examplesTitle',
  'help.examples',
  'howItWorks',
  'contribute',
  'languageSet',
  'languagePrompt',
  'agenda.title',
  'agenda.intro',
  'agenda.none',
  'agenda.noneWithTranscript',
  'agenda.cannotAccess',
  'agenda.transcriptAvailable',
  'agenda.noTranscript',
  'agenda.organizer',
  'agenda.untitled',
  'agenda.unknownTime',
  'selection.needAgenda',
  'selection.invalid',
  'selection.selected',
  'transcript.notConfigured',
  'transcript.notAvailable',
  'meeting.notFound',
  'fallback.unknown',
  'date.today',
  'auth.signIn',
  'auth.signInCta',
  'auth.codeInvalid',
  'auth.signedIn',
  'debug.title',
  'debug.user',
  'debug.tenant',
  'debug.graphToken',
  'debug.oauth',
  'debug.graphOk',
  'debug.graphError',
  'logs.enabled',
  'logs.disabled',
  'logs.statusOn',
  'logs.statusOff'
];

describe('i18n catalogs', () => {
  it('contain all required keys', async () => {
    const root = path.resolve(process.cwd(), 'src', 'i18n');
    const en = await readJson(path.join(root, 'en.json'));

    for (const key of requiredKeys) {
      expect(get(en, key)).toBeTypeOf('string');
    }
  });
});

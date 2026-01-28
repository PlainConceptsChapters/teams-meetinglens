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
  'help.examplesTitle',
  'help.examples',
  'howItWorks',
  'contribute',
  'languageSet',
  'languagePrompt',
  'agenda.title',
  'agenda.intro',
  'agenda.none',
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
  'transcript.notAvailable'
];

describe('i18n catalogs', () => {
  it('contain all required keys', async () => {
    const root = path.resolve(process.cwd(), 'src', 'i18n');
    const [en, es, ro] = await Promise.all([
      readJson(path.join(root, 'en.json')),
      readJson(path.join(root, 'es.json')),
      readJson(path.join(root, 'ro.json'))
    ]);

    for (const key of requiredKeys) {
      expect(get(en, key)).toBeTypeOf('string');
      expect(get(es, key)).toBeTypeOf('string');
      expect(get(ro, key)).toBeTypeOf('string');
    }
  });
});

import { describe, expect, it } from 'vitest';
import { TranslationService } from '../../src/llm/translationService.js';
import { LlmMessage } from '../../src/llm/types.js';

const createClient = () => {
  let calls = 0;
  return {
    client: {
      complete: async (messages: LlmMessage[]) => {
        calls += 1;
        const system = messages[0]?.content ?? '';
        if (system.includes('Detect the language')) {
          return '{"language":"es"}';
        }
        const user = messages[messages.length - 1]?.content ?? '';
        if (user.includes('Target language: es')) {
          return '{"translated":"hola"}';
        }
        return '{"translated":"hello"}';
      }
    },
    get calls() {
      return calls;
    }
  };
};

describe('TranslationService', () => {
  it('detects language codes from text', async () => {
    const { client } = createClient();
    const service = new TranslationService({ client });
    const language = await service.detectLanguage('hola');
    expect(language).toBe('es');
  });

  it('translates when target language is not English', async () => {
    const { client } = createClient();
    const service = new TranslationService({ client });
    const translated = await service.translate('hello', 'es');
    expect(translated).toBe('hola');
  });

  it('skips translation when target language is English', async () => {
    const mock = createClient();
    const service = new TranslationService({ client: mock.client });
    const translated = await service.translate('hello', 'en');
    expect(translated).toBe('hello');
    expect(mock.calls).toBe(0);
  });
});

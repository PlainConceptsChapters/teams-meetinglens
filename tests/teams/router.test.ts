import { describe, expect, it } from 'vitest';
import { TeamsCommandRouter } from '../../src/teams/router.js';

const baseRequest = {
  channelId: 'c1',
  conversationId: 'conv',
  messageId: 'm1',
  fromUserId: 'u1',
  text: '/summary agenda'
};

describe('TeamsCommandRouter', () => {
  it('routes to command handler', async () => {
    const router = new TeamsCommandRouter({
      routes: [
        {
          command: 'summary',
          handler: async (request) => ({ text: `summary:${request.text}` })
        }
      ],
      defaultHandler: async () => ({ text: 'default' })
    });

    const response = await router.handle(baseRequest as any);
    expect(response.text).toBe('summary:agenda');
  });

  it('falls back to default handler when no command', async () => {
    const router = new TeamsCommandRouter({
      routes: [],
      defaultHandler: async (_req, remainder) => ({ text: `default:${remainder}` })
    });

    const response = await router.handle({ ...baseRequest, text: 'hello' } as any);
    expect(response.text).toBe('default:hello');
  });
});

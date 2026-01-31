import { describe, expect, it, vi } from 'vitest';
import type { TurnContext } from 'botbuilder';
import { createProgressController } from '../../scripts/bot/progress.js';

describe('progress controller', () => {
  it('sends updates when asked and finishes at 100%', async () => {
    const sendActivity = vi.fn().mockResolvedValue({ id: '1' });
    const updateActivity = vi.fn().mockResolvedValue({});
    const context = { sendActivity, updateActivity } as unknown as TurnContext;

    const controller = createProgressController({
      context,
      translate: async (text) => text,
      doneLabel: 'Done',
      delayMs: 0
    });

    await controller.update({ label: 'Working', percent: 10 });
    expect(sendActivity).toHaveBeenCalledTimes(2);
    expect(sendActivity.mock.calls[1][0].text).toContain('[#---------] 10%');

    await controller.update({ label: 'Working', percent: 50 });
    expect(updateActivity).toHaveBeenCalledTimes(1);
    expect(updateActivity.mock.calls[0][0].text).toContain('50%');

    await controller.finish({ text: 'Final output' });
    expect(updateActivity).toHaveBeenCalledTimes(3);
    const lastCall = updateActivity.mock.calls.at(-1)?.[0];
    expect(lastCall.text).toBe('Final output');
  });
});

import type { Activity, TurnContext } from 'botbuilder';
import type { ConversationAccount } from 'botframework-schema';

export interface ProgressControllerOptions {
  context: TurnContext;
  conversation?: ConversationAccount;
  translate: (text: string) => Promise<string>;
  doneLabel: string;
  delayMs?: number;
}

export interface ProgressUpdate {
  label: string;
  percent: number;
}

export interface ProgressController {
  update: (update: ProgressUpdate) => Promise<void>;
  finish: (outgoing: Partial<Activity>) => Promise<void>;
  cancel: () => void;
}

const clampPercent = (value: number, max = 99) => {
  if (Number.isNaN(value)) {
    return 0;
  }
  return Math.max(0, Math.min(max, Math.round(value)));
};

export const buildProgressBar = (percent: number, width = 10) => {
  const clamped = clampPercent(percent, 100);
  const filled = Math.round((clamped / 100) * width);
  const bar = `${'#'.repeat(filled)}${'-'.repeat(width - filled)}`;
  return `[${bar}] ${clamped}%`;
};

export const createProgressController = (options: ProgressControllerOptions): ProgressController => {
  const { context, conversation, translate, doneLabel, delayMs = 1000 } = options;
  let activityId: string | undefined;
  let timer: NodeJS.Timeout | undefined;
  let pending: ProgressUpdate | undefined;
  let started = false;

  const sendProgress = async (update: ProgressUpdate, useMax = 99) => {
    const label = await translate(update.label);
    const percent = clampPercent(update.percent, useMax);
    const text = `${label}\n${buildProgressBar(percent)}`;
    if (!activityId) {
      const response = await context.sendActivity({ text });
      activityId = response?.id;
      return;
    }
    await context.updateActivity({
      id: activityId,
      type: 'message',
      conversation,
      text
    });
  };

  const startIfNeeded = async () => {
    if (started || !pending) {
      return;
    }
    started = true;
    try {
      await context.sendActivity({ type: 'typing' });
      await sendProgress(pending);
    } catch {
      // Ignore progress failures.
    }
  };

  const update = async (updatePayload: ProgressUpdate) => {
    pending = { ...updatePayload, percent: clampPercent(updatePayload.percent, 99) };
    if (!started) {
      if (delayMs === 0) {
        await startIfNeeded();
        return;
      }
      if (!timer) {
        timer = setTimeout(() => {
          void startIfNeeded();
        }, delayMs);
      }
      return;
    }
    try {
      await sendProgress(pending);
    } catch {
      // Ignore progress failures.
    }
  };

  const finish = async (outgoing: Partial<Activity>) => {
    if (timer) {
      clearTimeout(timer);
    }
    if (activityId) {
      try {
        const doneText = `${await translate(doneLabel)}\n${buildProgressBar(100)}`;
        await context.updateActivity({
          id: activityId,
          type: 'message',
          conversation,
          text: doneText
        });
        await context.updateActivity({
          id: activityId,
          type: 'message',
          conversation,
          ...outgoing
        });
        return;
      } catch {
        // Fall through to send a new activity.
      }
    }
    await context.sendActivity(outgoing);
  };

  const cancel = () => {
    if (timer) {
      clearTimeout(timer);
    }
  };

  return { update, finish, cancel };
};
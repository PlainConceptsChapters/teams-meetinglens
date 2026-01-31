import type { Activity, TurnContext } from 'botbuilder';
import type { ConversationAccount } from 'botframework-schema';

export interface ProgressControllerOptions {
  context: TurnContext;
  conversation?: ConversationAccount;
  label: string;
  translate: (text: string) => Promise<string>;
  doneLabel: string;
  delayMs?: number;
  intervalMs?: number;
}

export interface ProgressController {
  finish: (outgoing: Partial<Activity>) => Promise<void>;
  cancel: () => void;
}

export const buildProgressBar = (percent: number, width = 10) => {
  const clamped = Math.max(0, Math.min(100, Math.round(percent)));
  const filled = Math.round((clamped / 100) * width);
  const bar = `${'█'.repeat(filled)}${'-'.repeat(width - filled)}`;
  return `[${bar}] ${clamped}%`;
};

export const createProgressController = (options: ProgressControllerOptions): ProgressController => {
  const {
    context,
    conversation,
    label,
    translate,
    doneLabel,
    delayMs = 1000,
    intervalMs = 1500
  } = options;
  let activityId: string | undefined;
  let timer: NodeJS.Timeout | undefined;
  let interval: NodeJS.Timeout | undefined;
  let percent = 0;
  let started = false;

  const start = async () => {
    if (started) {
      return;
    }
    started = true;
    await context.sendActivity({ type: 'typing' });
    percent = 10;
    const text = `${await translate(label)}\n${buildProgressBar(percent)}`;
    const response = await context.sendActivity({ text });
    activityId = response?.id;
    interval = setInterval(async () => {
      try {
        percent = Math.min(95, percent + 7);
        const updated = `${await translate(label)}\n${buildProgressBar(percent)}`;
          await context.updateActivity({
            id: activityId,
            type: 'message',
            conversation,
            text: updated
          });
      } catch {
        // Ignore update failures for progress.
      }
    }, intervalMs);
  };

  const scheduleStart = () => {
    timer = setTimeout(() => {
      void start();
    }, delayMs);
  };

  const finish = async (outgoing: Partial<Activity>) => {
    if (timer) {
      clearTimeout(timer);
    }
    if (interval) {
      clearInterval(interval);
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
    if (interval) {
      clearInterval(interval);
    }
  };

  scheduleStart();

  return { finish, cancel };
};

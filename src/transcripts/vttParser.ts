import { TranscriptCue } from '../types/transcript.js';

const stripTags = (input: string): string => input.replace(/<[^>]+>/g, '');

export const parseWebVtt = (raw: string): TranscriptCue[] => {
  const lines = raw.split(/\r?\n/);
  const cues: TranscriptCue[] = [];
  let index = 0;

  while (index < lines.length && lines[index].trim().length === 0) {
    index += 1;
  }
  if (lines[index]?.trim().toUpperCase().startsWith('WEBVTT')) {
    index += 1;
  }

  while (index < lines.length) {
    while (index < lines.length && lines[index].trim().length === 0) {
      index += 1;
    }
    if (index >= lines.length) {
      break;
    }

    const timeLine = lines[index];
    if (!timeLine.includes('-->')) {
      index += 1;
      continue;
    }
    const [start, end] = timeLine.split('-->').map((part) => part.trim().split(' ')[0]);
    index += 1;

    const textLines: string[] = [];
    while (index < lines.length && lines[index].trim().length > 0) {
      textLines.push(lines[index]);
      index += 1;
    }

    if (!start || !end) {
      continue;
    }

    const rawText = textLines.join(' ');
    const speakerMatch = rawText.match(/<v\s+([^>]+)>/i);
    const speaker = speakerMatch ? speakerMatch[1].trim() : undefined;
    const text = stripTags(rawText).trim();

    cues.push({ start, end, speaker, text });
  }

  return cues;
};

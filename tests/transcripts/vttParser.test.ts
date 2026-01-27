import { describe, expect, it } from 'vitest';
import { parseWebVtt } from '../../src/transcripts/vttParser.js';

const SAMPLE = `WEBVTT

00:00:01.000 --> 00:00:02.000
<v Alice>hello there</v>

00:00:03.000 --> 00:00:04.000
world`;

describe('parseWebVtt', () => {
  it('parses cues and speaker tags', () => {
    const cues = parseWebVtt(SAMPLE);
    expect(cues).toHaveLength(2);
    expect(cues[0]).toEqual({
      start: '00:00:01.000',
      end: '00:00:02.000',
      speaker: 'Alice',
      text: 'hello there'
    });
    expect(cues[1]).toEqual({
      start: '00:00:03.000',
      end: '00:00:04.000',
      speaker: undefined,
      text: 'world'
    });
  });
});

import { describe, expect, it } from 'vitest';
import { chunkText } from '../../src/llm/chunker.js';

const buildText = (words: number) => Array.from({ length: words }, (_, i) => `word${i}`).join(' ');

describe('chunkText', () => {
  it('splits text into multiple chunks when maxTokens is small', () => {
    const text = buildText(200);
    const chunks = chunkText(text, 50, 0);
    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks.every((chunk) => chunk.text.length > 0)).toBe(true);
  });
});

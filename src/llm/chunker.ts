export interface ChunkedText {
  index: number;
  text: string;
}

const estimateTokens = (text: string): number => Math.ceil(text.length / 4);

export const chunkText = (text: string, maxTokens: number, overlapTokens: number): ChunkedText[] => {
  if (!text) {
    return [];
  }
  if (maxTokens <= 0) {
    throw new Error('maxTokens must be positive.');
  }

  const words = text.split(/\s+/).filter(Boolean);
  const chunks: ChunkedText[] = [];
  let start = 0;
  let index = 0;

  while (start < words.length) {
    let end = start;
    let buffer = '';
    while (end < words.length) {
      const next = buffer.length ? `${buffer} ${words[end]}` : words[end];
      if (estimateTokens(next) > maxTokens) {
        break;
      }
      buffer = next;
      end += 1;
    }

    if (!buffer) {
      buffer = words[start];
      end = start + 1;
    }

    chunks.push({ index, text: buffer });
    index += 1;

    if (end >= words.length) {
      break;
    }

    const overlapWords = Math.max(0, Math.floor((overlapTokens / maxTokens) * (end - start)));
    start = overlapWords > 0 ? Math.max(end - overlapWords, start + 1) : end;
  }

  return chunks;
};

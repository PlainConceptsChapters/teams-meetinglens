import { describe, expect, it } from 'vitest';

import { isReady } from '../src/index.js';

describe('scaffold', () => {
  it('exposes a ready signal for the harness', () => {
    expect(isReady()).toBe(true);
  });
});

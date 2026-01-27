import { describe, expect, it } from 'vitest';
import { redactSensitive } from '../../src/llm/guardrails.js';


describe('guardrails', () => {
  it('redacts emails and phone numbers', () => {
    const result = redactSensitive('contact me at user@example.com or +1 555 111 2222');
    expect(result.text).toContain('[redacted-email]');
    expect(result.text).toContain('[redacted-phone]');
    expect(result.redacted).toBe(true);
  });
});

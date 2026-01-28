export interface RedactionResult {
  text: string;
  redacted: boolean;
}

const EMAIL_REGEX = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const PHONE_REGEX = /(\+?\d[\d\s().-]{7,}\d)/g;
const SSN_REGEX = /\b\d{3}-\d{2}-\d{4}\b/g;

export const redactSensitive = (input: string): RedactionResult => {
  let redacted = false;
  let output = input.replace(EMAIL_REGEX, () => {
    redacted = true;
    return '[redacted-email]';
  });
  output = output.replace(PHONE_REGEX, () => {
    redacted = true;
    return '[redacted-phone]';
  });
  output = output.replace(SSN_REGEX, () => {
    redacted = true;
    return '[redacted-ssn]';
  });
  return { text: output, redacted };
};

export const containsDisallowedAnswer = (answer: string): boolean => {
  return answer.toLowerCase().includes('i can\'t access the transcript') || answer.toLowerCase().includes('as an ai');
};

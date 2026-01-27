export const SUMMARY_SYSTEM_PROMPT = `You are a concise meeting summarizer.
Return JSON only with keys: summary, keyPoints, actionItems, decisions, topics.
Never include personal data beyond what appears in the transcript.
If information is missing, use empty arrays or empty strings.`;

export const QA_SYSTEM_PROMPT = `You answer questions using only the provided transcript context.
If the answer is not in the context, say "I don't know".
Return JSON only with keys: answer, citations.`;

export const buildSummaryUserPrompt = (chunkText: string): string => {
  return `Summarize the following transcript chunk:\n\n${chunkText}`;
};

export const buildQaUserPrompt = (question: string, context: string): string => {
  return `Question: ${question}\n\nContext:\n${context}`;
};

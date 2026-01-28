const languageNames: Record<string, string> = {
  en: 'English',
  es: 'Spanish',
  ro: 'Romanian'
};

const noAnswerText: Record<string, string> = {
  en: "I don't know",
  es: 'No lo sé',
  ro: 'Nu știu'
};

export const buildSummarySystemPrompt = (language = 'en'): string => {
  const languageName = languageNames[language] ?? languageNames.en;
  return `You are a concise meeting summarizer.
Return JSON only with keys: summary, keyPoints, actionItems, decisions, topics.
Never include personal data beyond what appears in the transcript.
If information is missing, use empty arrays or empty strings.
Respond in ${languageName}.`;
};

export const buildQaSystemPrompt = (language = 'en'): string => {
  const languageName = languageNames[language] ?? languageNames.en;
  const fallback = noAnswerText[language] ?? noAnswerText.en;
  return `You answer questions using only the provided transcript context.
If the answer is not in the context, say "${fallback}".
Return JSON only with keys: answer, citations.
Respond in ${languageName}.`;
};

export const buildSummaryUserPrompt = (chunkText: string): string => {
  return `Summarize the following transcript chunk:\n\n${chunkText}`;
};

export const buildQaUserPrompt = (question: string, context: string): string => {
  return `Question: ${question}\n\nContext:\n${context}`;
};

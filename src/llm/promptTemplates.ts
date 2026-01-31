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
Return JSON only with keys: summary, keyPoints, actionItems, decisions, topics, templateData.
Do not include markdown, code fences, or extra commentary.
templateData must be an object with keys:
- meetingHeader { meetingTitle, companiesParties, date, duration, linkReference }
- actionItemsDetailed [ { action, owner, dueDate, notes } ]
- meetingPurpose
- keyPointsDetailed [ { title, explanation } ]
- topicsDetailed [ { topic, issueDescription, observations, rootCause, impact } ]
- pathForward { definitionOfSuccess, agreedNextAttempt, decisionPoint, checkpointDate }
- nextSteps { partyA { name, steps }, partyB { name, steps } }
Keep the summary concise. Use at most 5 action items, 5 key points, 4 topics, 3 observations per topic, and 4 steps per party.
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
Do not include markdown, code fences, or extra commentary.
Respond in ${languageName}.`;
};

export const buildSummaryUserPrompt = (chunkText: string): string => {
  return `Summarize the following transcript chunk:\n\n${chunkText}`;
};

export const buildSummaryMergeSystemPrompt = (language = 'en'): string => {
  const languageName = languageNames[language] ?? languageNames.en;
  return `You merge partial meeting summaries into one final summary.
Return JSON only with keys: summary, keyPoints, actionItems, decisions, topics, templateData.
Do not include markdown, code fences, or extra commentary.
templateData must be an object with keys:
- meetingHeader { meetingTitle, companiesParties, date, duration, linkReference }
- actionItemsDetailed [ { action, owner, dueDate, notes } ]
- meetingPurpose
- keyPointsDetailed [ { title, explanation } ]
- topicsDetailed [ { topic, issueDescription, observations, rootCause, impact } ]
- pathForward { definitionOfSuccess, agreedNextAttempt, decisionPoint, checkpointDate }
- nextSteps { partyA { name, steps }, partyB { name, steps } }
Keep the summary concise. Use at most 5 action items, 5 key points, 4 topics, 3 observations per topic, and 4 steps per party.
Never include personal data beyond what appears in the partial summaries.
If information is missing, use empty arrays or empty strings.
Respond in ${languageName}.`;
};

export const buildSummaryMergeUserPrompt = (partials: unknown[]): string => {
  return `Merge the following partial summaries into one final summary:\n\n${JSON.stringify(partials)}`;
};

export const buildQaUserPrompt = (question: string, context: string): string => {
  return `Question: ${question}\n\nContext:\n${context}`;
};

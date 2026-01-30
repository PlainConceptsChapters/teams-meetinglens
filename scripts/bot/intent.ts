const normalize = (text: string) => text.trim().toLowerCase();

export const isLogoutCommand = (text: string) => normalize(text).startsWith('/logout');

export const isAgendaIntent = (text: string): boolean => {
  const lower = normalize(text);
  return (
    lower.includes('agenda') ||
    lower.includes('calendar') ||
    lower.includes('meetings') ||
    lower.includes('check my agenda') ||
    lower.includes('mi agenda') ||
    lower.includes('mi calendario') ||
    lower.includes('reuniones') ||
    lower.includes('agenda mea') ||
    lower.includes('calendarul meu') ||
    lower.includes('intalniri')
  );
};

export const isSummaryIntent = (text: string): boolean => {
  const lower = normalize(text);
  return (
    lower.startsWith('/summary') ||
    lower.includes('summarize') ||
    lower.includes('summary') ||
    lower.includes('key points') ||
    lower.includes('most important')
  );
};

export const isHowIntent = (text: string): boolean => {
  const lower = normalize(text);
  return lower.includes('how it works') || lower.includes('/how');
};

export const isHelpIntent = (text: string): boolean => {
  const lower = normalize(text);
  return lower.includes('/help') || lower.includes('help');
};

export const isWhoamiIntent = (text: string): boolean => {
  const lower = normalize(text);
  return lower.includes('/whoami') || lower.includes('who am i') || lower.includes('whoami');
};

export const isGraphDebugIntent = (text: string): boolean => {
  const lower = normalize(text);
  return lower.includes('/graphdebug') || lower.includes('graph debug');
};

export const isTodayIntent = (text: string): boolean => {
  const lower = normalize(text);
  return lower.includes('what day is it') || lower.includes('what date') || lower.includes('today');
};

export const isContributeIntent = (text: string): boolean => {
  const lower = normalize(text);
  return lower.includes('/contribute') || lower.includes('contribute') || lower.includes('repo');
};

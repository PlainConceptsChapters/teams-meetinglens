export const buildAgendaCard = (title: string, items: { index: number; title: string; details: string }[]) => {
  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: title,
          weight: 'Bolder',
          size: 'Medium'
        },
        ...items.flatMap((item) => [
          {
            type: 'TextBlock',
            text: `${item.index}. ${item.title}`,
            weight: 'Bolder',
            wrap: true
          },
          {
            type: 'TextBlock',
            text: item.details,
            isSubtle: true,
            wrap: true,
            spacing: 'Small'
          }
        ])
      ],
      actions: items.map((item) => ({
        type: 'Action.Submit',
        title: `${item.index}. ${item.title}`,
        data: { command: 'select', selection: String(item.index) }
      }))
    }
  };
};

export const buildSignInCard = (prompt: string, cta: string, signInLink: string) => {
  return {
    contentType: 'application/vnd.microsoft.card.adaptive',
    content: {
      type: 'AdaptiveCard',
      version: '1.4',
      body: [
        {
          type: 'TextBlock',
          text: prompt,
          wrap: true
        }
      ],
      actions: [
        {
          type: 'Action.OpenUrl',
          title: cta,
          url: signInLink
        }
      ]
    }
  };
};

import {
  AuthError,
  InvalidRequestError,
  NotFoundError,
  OutputValidationError,
  PermissionDeniedError,
  ThrottledError
} from '../errors/index.js';
import { ChannelRequest, ChannelResponse, CommandRoute } from './types.js';
import { extractCommand, normalizeChannelRequest } from './normalize.js';

export interface TeamsRouterOptions {
  routes: CommandRoute[];
  defaultHandler: (request: ChannelRequest, remainder: string) => Promise<ChannelResponse>;
  botMentionText?: string;
}

const mapErrorToResponse = (error: unknown): ChannelResponse => {
  if (error instanceof InvalidRequestError) {
    return { text: "I couldn't read that request. Please rephrase." };
  }
  if (error instanceof NotFoundError) {
    return { text: "I couldn't find a matching meeting or transcript." };
  }
  if (error instanceof PermissionDeniedError) {
    return { text: "You don't have permission for that." };
  }
  if (error instanceof ThrottledError) {
    return { text: 'Too many requests. Please try again later.' };
  }
  if (error instanceof AuthError) {
    return { text: 'Please sign in again.' };
  }
  if (error instanceof OutputValidationError) {
    return { text: "I couldn't produce a safe response." };
  }
  return { text: 'Something went wrong. Please try again.' };
};

export class TeamsCommandRouter {
  private readonly routes: Map<string, CommandRoute>;
  private readonly defaultHandler: TeamsRouterOptions['defaultHandler'];
  private readonly botMentionText?: string;

  constructor(options: TeamsRouterOptions) {
    this.routes = new Map(options.routes.map((route) => [route.command.toLowerCase(), route]));
    this.defaultHandler = options.defaultHandler;
    this.botMentionText = options.botMentionText;
  }

  async handle(request: ChannelRequest): Promise<ChannelResponse> {
    try {
      const normalized = normalizeChannelRequest(request, { botMentionText: this.botMentionText });
      const { command, remainder } = extractCommand(normalized.text);
      if (!command) {
        return await this.defaultHandler(normalized, remainder);
      }
      const route = this.routes.get(command);
      if (!route) {
        throw new InvalidRequestError('Unknown command.');
      }
      return await route.handler({ ...normalized, text: remainder });
    } catch (error) {
      return mapErrorToResponse(error);
    }
  }
}

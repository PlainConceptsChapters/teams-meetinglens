# Teams Channel Layer

## Handler boundaries
- Handlers own routing, validation, and auth context extraction.
- No domain logic in handlers; delegate to application services.
- Include correlation IDs on all downstream calls.

## Channel input model
Normalized request shape for incoming Teams activity:
- `channelId`
- `conversationId`
- `messageId`
- `fromUserId`
- `fromUserName`
- `tenantId`
- `text`
- `attachments[]` (name, contentType, size, url)
- `mentions[]` (name, id)
- `timestamp`
- `locale`

## Normalization rules
- Strip bot mention text from the leading message content.
- Collapse multiple whitespace to single spaces.
- Reject empty or whitespace-only inputs.
- Limit max message size (e.g., 4k chars) and truncate with notice.
- Validate attachment content types; ignore unsupported types.

## Routing
- Commands are prefix-based (e.g., `/summary`, `/qa`, `/meeting`).
- If no command detected, treat as default Q&A.
- Maintain a single mapping from command -> application service method.

## Error taxonomy and responses
- `ValidationError`: "I couldn't read that request. Please rephrase."
- `NotFoundError`: "I couldn't find a matching meeting or transcript."
- `PermissionDeniedError`: "You don't have permission for that."
- `ThrottledError`: "Too many requests. Please try again later."
- `AuthError`: "Please sign in again."
- `OutputValidationError`: "I couldn't produce a safe response."
- Fallback: "Something went wrong. Please try again."

## Safety
- Never include raw transcript content in bot responses unless requested.
- Do not echo PII from logs or error messages.

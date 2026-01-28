# Security

## Log redaction rules
- Redact emails, phone numbers, SSNs, and access tokens.
- Do not log transcript content; log only counts or hashes if needed.
- Truncate tenant/user/meeting IDs in logs.

## Secrets handling policy
- Store secrets in Azure Key Vault in non-local environments.
- Never commit secrets to the repo or logs.
- Rotate client secrets and API keys regularly (e.g., every 90 days).

## Dependency & secret scanning
- Enable dependency scanning in CI.
- Run secrets scanning on pull requests.

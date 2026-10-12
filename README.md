# OneAuth

OneAuth is the authentication and developer portal application in this repository. It is built with Next.js and provides organization-scoped application registration and OAuth 2.0 / OpenID Connect integration routes.

## Quick start

From this directory:

    npm install
    cp .env.example .env
    # Configure database, Redis/rate limiting, email, issuer, and signing keys.
    npm run dev

The development server runs on http://localhost:3001. The Developer Portal is at /developer.

## Documentation

See **[OneAuth Developer Guide](docs/DEVELOPER-GUIDE.md)** for the overall walkthrough, including:

- Local setup and OIDC signing-key configuration
- Registering applications and managing redirect URIs
- Development vs. production credentials and client types
- OAuth scopes and Authorization Code + PKCE
- Exchanging codes for tokens and reading UserInfo claims
- Validating ID tokens, refresh-token rotation, introspection, and revocation
- API keys, organization access, endpoints, troubleshooting, and security guidance

## Useful commands

    npm test
    npx tsc --noEmit
    npm run lint
    npm run build
    npm run db:check

Run tests and a production build before deploying. Make sure the database schema/migrations and environment secrets are configured for the target environment.

## Security

Never commit .env, private signing keys, client secrets, API keys, access tokens, refresh tokens, or authorization codes. Use separate application registrations and secrets for Development and Production. Do not treat a decoded JWT as verified until its signature and claims have been validated.

## Implementation status

OAuth/OIDC routes and developer tooling exist in this codebase, but feature availability depends on correct deployment configuration and successful end-to-end testing. Verify discovery, token exchange, UserInfo, revocation, and any protected API/MCP integration against the exact deployment before relying on it in production.

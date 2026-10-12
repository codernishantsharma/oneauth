# Database infrastructure

This project uses Prisma ORM 8's contract and migration CLI with PostgreSQL hosted by Supabase. Prisma is the only application database layer; Supabase Auth and the Supabase JavaScript client are not used.

## Environment

Copy `.env.example` to `.env` and set:

- `DATABASE_URL`: pooled Supabase PostgreSQL connection for the application runtime.
- `DIRECT_URL`: direct PostgreSQL connection for Prisma CLI schema operations. The CLI falls back to `DATABASE_URL` if this is unset.
- `UPSTASH_REDIS_REST_URL` and `UPSTASH_REDIS_REST_TOKEN`: Upstash Redis HTTPS REST endpoint and bearer token. The server-only Redis helper uses the official `@upstash/redis` client with these values; a direct TCP Redis URL is not required.

`.env` and `.env.local` are ignored by Git. Never expose these values to client-side code.

## Prisma contract and migrations

[`src/prisma/contract.prisma`](src/prisma/contract.prisma) is the configured source of truth for OneAuth's identity, credentials, sessions, OAuth/OIDC, verification and recovery, developer, organization, and security data. The older `prisma/prisma.schema` file is not referenced by `prisma.config.ts`.

The contract stores password hashes (Argon2id), token/code/API-key/recovery-code hashes, and authenticated-encryption ciphertext for recoverable secrets such as TOTP and webhook secrets. OIDC private signing keys are represented by a secure external key reference. Security-event and audit metadata must contain only redacted, non-secret data. Temporary OAuth state, challenges, replay markers, and rate-limit state belong in Redis rather than permanent tables.

Every application table opts into PostgreSQL row-level security, matching the configured Supabase database behavior. No client-facing policies are defined yet, so RLS fails closed; application server connections must use the configured privileged backend role until later tasks add explicit policies.

Prisma 8 emits `contract.json` and `contract.d.ts` from the contract. Use the installed CLI workflow:

```bash
npm run db:generate       # Emit contract artifacts
npm run db:update         # Apply the contract directly to a development database
npm run db:migrate:plan   # Plan an on-disk migration
npm run db:migrate        # Apply planned migrations
npm run db:status         # Inspect migration status
```

The migration planner writes versioned migrations under `migrations/app/`; review and apply planned migrations rather than using `db update` as a deployment step. Prisma 8's CLI does not expose the older `db push` or Prisma Studio commands.

## Connection checks

```bash
npm run db:check
npm run redis:check
```

The PostgreSQL check uses Prisma's raw-query API against `public.users` and verifies that the configured backend role can bypass RLS; application tables have no client-facing policies yet. The Redis check performs `SET`/`GET` through Upstash's REST API on a unique `oneauth:connection-test` key with a 15-second expiry and removes it during cleanup. Both clients are server-only.

# VortiqLabs Agent dynamic URLs

OneAuth owns the registry for one active Cloudflare Tunnel per OneAuth user. The Agent OAuth client is pinned server-side to `oa_jveGzDNEj0by9neUceFrElkYfvGZHq4f`; calls also require the granted `tunnel:manage` scope.

## Development issuer

For the current Codespaces development environment, set both `NEXT_PUBLIC_APP_URL` and `ONEAUTH_ISSUER_URL` to `https://turbo-train-696qp5w5x4grh45qx-3001.app.github.dev`. Keep the Agent tunnel hostname separate: it is provisioned through Cloudflare and routes to the local Agent service on port 3000. Update these settings if the Codespaces URL changes.

## API
- `POST /api/agent/tunnel` provisions a tunnel if the authenticated user has none; otherwise it returns the existing URL.
- `GET /api/agent/tunnel` returns the existing URL and counts this authenticated check as activity.
- The tunnel hostname routes to `http://localhost:3000` on the machine running `cloudflared`. The Agent must run the returned tunnel token locally and store it in OS secret storage, never in source code or logs.

Only a successful authenticated call to these endpoints updates `last_used_at`. To count real traffic through the public hostname as activity too, the Agent's MCP service must call an authenticated OneAuth heartbeat endpoint; passive Cloudflare DNS/TLS requests are not proof of actual use.

## Expiration
The `POST /api/cron/agent-tunnel-cleanup` endpoint removes at most 100 URLs per run when `last_used_at` is older than 60 days. Configure a daily scheduler to POST with `Authorization: Bearer $ONEAUTH_CRON_SECRET`. Keep this secret server-side. Failed deletions remain ACTIVE and will be retried on the next run.

## Required server environment
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN` (server-only; tunnel and DNS permissions)
- `CLOUDFLARE_ZONE_ID`
- `CLOUDFLARE_TUNNEL_DOMAIN=nishantapps.in`
- `ONEAUTH_CRON_SECRET` (long random value)

Apply `migrations/app/20261011T1200_agent_tunnels.sql` to the production database before deploying the API routes. Add `tunnel:manage` to the OAuth scope allowlist and to the VortiqLabs Agent client's allowed scopes, then have the client request it. Configure a daily cron call to the cleanup endpoint. Do not expose the Cloudflare API token to the extension.

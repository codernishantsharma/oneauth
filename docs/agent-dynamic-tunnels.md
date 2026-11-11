# VortiqLabs Agent MCP URLs

OneAuth stores one active public MCP hostname per OneAuth user in PostgreSQL (`public.agent_domains`). OneAuth does not create DNS records or operate the MCP data plane. Provisioning requires the Agent OAuth client's `tunnel:manage` scope.

## DNS and gateway

Set `AGENT_GATEWAY_BASE_DOMAIN=mcp.nishantapps.in`. Configure `*.mcp.nishantapps.in` at your DNS provider to point to the public MCP Mesh gateway. The gateway terminates TLS, resolves the requested hostname through OneAuth's private registry, and routes only to the authenticated live Agent WebSocket associated with that assignment.

The Agent opens an authenticated outbound persistent WebSocket to MCP Mesh. There is no local HTTP listener, `127.0.0.1` target, or local port allocation. The gateway must authenticate the Agent connection, bind it to the verified OneAuth user/agent identity, handle reconnects, and reject inactive or mismatched hostname assignments.

## API

- `POST /api/agent/tunnel` allocates or returns the authenticated user's MCP hostname.
- `GET /api/agent/tunnel` returns the active hostname.
- `POST /api/internal/agent-gateway/resolve` resolves an exact active hostname for MCP Mesh using `Authorization: Bearer <AGENT_GATEWAY_SHARED_SECRET>`.
- `POST /api/cron/agent-tunnel-cleanup` expires stale assignments and requires `ONEAUTH_CRON_SECRET`.

## Database

`20261103T153000_agent_domain_registry.sql` creates the provider-independent hostname registry. `20261103T160000_agent_domains_remove_local_port.sql` removes the obsolete local port column. Apply pending migrations before deploying.

## Environment

- `AGENT_GATEWAY_BASE_DOMAIN=mcp.nishantapps.in`
- `AGENT_GATEWAY_SHARED_SECRET` — high-entropy secret shared only by OneAuth and MCP Mesh.
- `ONEAUTH_CRON_SECRET` — secret for scheduled cleanup.
- Existing database connection settings.

Never expose either secret to browser clients or the Agent extension.

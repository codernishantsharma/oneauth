# MCP Mesh gateway and OneAuth hostname registry

OneAuth owns durable hostname-to-user assignments in `public.agent_domains`; MCP Mesh owns the live connection registry and request data plane. Configure wildcard DNS `*.mcp.nishantapps.in` to the public MCP Mesh gateway.

## Private hostname resolver

`POST /api/internal/agent-gateway/resolve` accepts `Authorization: Bearer <AGENT_GATEWAY_SHARED_SECRET>` and JSON `{ "hostname": "mcp-example123.mcp.nishantapps.in" }`. It returns `agentId`, `userId`, `hostname`, and `status` only for an exact active assignment. Responses are non-cacheable.

## Routing model

Each desktop Agent establishes an authenticated outbound persistent WebSocket to MCP Mesh. The gateway binds that live connection to the authenticated OneAuth identity, resolves incoming hostnames against OneAuth, and forwards MCP requests over the matching live WebSocket. There is no local port or localhost forwarding. A client must never choose an arbitrary user ID, Agent ID, or connection target. On disconnect, the gateway marks the Agent offline and rejects requests until it reconnects and reauthenticates.

`AGENT_GATEWAY_SHARED_SECRET` is server-to-server only. Rotate it on OneAuth and MCP Mesh together.

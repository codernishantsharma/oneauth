# Shared Agent tunnel gateway

The Cloudflare Tunnel is shared by all active Agent hostname records. The wildcard
ingress sends matching hostnames to the OneAuth gateway origin, while explicit
ingress rules for unrelated applications must remain ahead of the broad wildcard.

## Private hostname resolver

The gateway/broker may resolve a requested hostname by calling:

`POST /api/internal/agent-gateway/resolve`

Headers:

`Authorization: Bearer <AGENT_GATEWAY_SHARED_SECRET>`
`Content-Type: application/json`

Body:

```json
{ "hostname": "mcp-example123.nishantapps.in" }
```

The resolver returns an `agentId`, `userId`, `hostname`, and `status` only for an
exact active registry row on the configured shared tunnel. It returns 401 without
the internal secret, 404 for malformed/unregistered/deleted hostnames, and 503 if
the registry is unavailable. Responses are non-cacheable.

Set `AGENT_GATEWAY_SHARED_SECRET` to a high-entropy secret shared only between
OneAuth and the gateway process. Do not expose it to browser clients or the VS Code
extension. Rotate it on both services together.

## Important routing boundary

The resolver is the authorization/identity lookup, not a data-plane proxy. The
VS Code Agent runs on the user's computer; a `127.0.0.1:<port>` URL on the OneAuth
server cannot reach that computer. End-to-end routing requires each extension to
establish an authenticated outbound persistent connection to the gateway/broker,
and the broker to associate that live connection with the authenticated user ID.
The gateway must authorize the requested hostname against the resolver result
before forwarding traffic, and must never let a client choose another user's
connection or target by supplying an arbitrary user ID or port.

The Cloudflare ingress configurator preserves existing explicit rules and replaces
only the managed broad wildcard and catch-all 404 entries.

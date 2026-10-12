import "server-only";
import { randomBytes } from "node:crypto";

const API = "https://api.cloudflare.com/client/v4";
export const SHARED_AGENT_TUNNEL_ID = "05da5c33-2dfa-4473-b576-d3b2fb28754f";

function config() {
  const accountId = process.env.CLOUDFLARE_ACCOUNT_ID;
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const zoneId = process.env.CLOUDFLARE_ZONE_ID;
  const domain = (process.env.CLOUDFLARE_TUNNEL_DOMAIN ?? "nishantapps.in").trim().toLowerCase();
  if (!accountId || !apiToken || !zoneId || !/^[a-z0-9.-]+$/.test(domain)) {
    throw new Error("Cloudflare tunnel provisioning is not configured.");
  }
  return { accountId, apiToken, zoneId, domain };
}

async function cf<T>(path: string, init: RequestInit = {}): Promise<T> {
  const c = config();
  const response = await fetch(API + path, {
    ...init,
    headers: { Authorization: `Bearer ${c.apiToken}`, "Content-Type": "application/json", ...(init.headers ?? {}) },
    cache: "no-store",
  });
  const body = await response.json().catch(() => null) as { success?: boolean; result?: T; errors?: { message?: string }[] } | null;
  if (!response.ok || !body?.success) throw new Error(body?.errors?.[0]?.message ?? `Cloudflare API failed (${response.status}).`);
  return body.result as T;
}

export function tunnelHostname(username: string) {
  const { domain } = config();
  const normalized = username.toLowerCase().replace(/[^a-z0-9-]/g, "").replace(/^-+|-+$/g, "").slice(0, 32) || "user";
  const suffix = randomBytes(3).toString("hex");
  return `mcp-${normalized}${suffix}.${domain}`;
}

/**
 * Ensure the wildcard hostname reaches the shared gateway without deleting
 * explicit ingress rules already configured for unrelated applications.
 */
export async function configureSharedAgentGateway() {
  const c = config();
  const tunnels = await cf<{ id: string; deleted_at?: string | null }[]>(
    `/accounts/${c.accountId}/cfd_tunnel?is_deleted=false`,
  );
  const tunnel = tunnels.find((item) => item.id === SHARED_AGENT_TUNNEL_ID && !item.deleted_at);
  if (!tunnel) throw new Error("The configured shared Agent tunnel was not found in this Cloudflare account.");

  type IngressRule = { hostname?: string; path?: string; service: string; originRequest?: Record<string, unknown> };
  const current = await cf<{ config?: { ingress?: IngressRule[] } }>(
    `/accounts/${c.accountId}/cfd_tunnel/${SHARED_AGENT_TUNNEL_ID}/configurations`,
  );
  const ingress = Array.isArray(current.config?.ingress) ? current.config!.ingress! : [];
  // Replace only the broad wildcard rule managed by this feature. Keep explicit
  // host/path rules for other apps and keep the catch-all 404 as the final rule.
  const preserved = ingress.filter((rule) =>
    !(rule.hostname === `*.${c.domain}` && !rule.path) &&
    !(rule.hostname === undefined && rule.service === "http_status:404"),
  );
  preserved.push({ hostname: `*.${c.domain}`, service: `http://localhost:${process.env.PORT ?? "3001"}` });
  preserved.push({ service: "http_status:404" });

  await cf(`/accounts/${c.accountId}/cfd_tunnel/${SHARED_AGENT_TUNNEL_ID}/configurations`, {
    method: "PUT",
    body: JSON.stringify({ config: { ingress: preserved } }),
  });
}

export async function getSharedAgentTunnelToken() {
  const c = config();
  return cf<string>(`/accounts/${c.accountId}/cfd_tunnel/${SHARED_AGENT_TUNNEL_ID}/token`);
}

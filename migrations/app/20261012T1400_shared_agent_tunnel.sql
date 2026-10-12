-- Move Agent hostname records behind the existing shared Cloudflare Tunnel.
-- This migration does not touch live Cloudflare DNS records or delete old tunnels.
ALTER TABLE public.agent_tunnels DROP CONSTRAINT IF EXISTS agent_tunnels_tunnel_id_key;
DROP INDEX IF EXISTS public.agent_tunnels_tunnel_id_key;

UPDATE public.agent_tunnels
SET tunnel_id = '05da5c33-2dfa-4473-b576-d3b2fb28754f',
    updated_at = now()
WHERE status = 'ACTIVE'
  AND tunnel_id <> '05da5c33-2dfa-4473-b576-d3b2fb28754f';

-- Multiple users may now share the same tunnel while retaining unique hostnames.
CREATE INDEX IF NOT EXISTS agent_tunnels_shared_tunnel_idx
  ON public.agent_tunnels(tunnel_id) WHERE status='ACTIVE';

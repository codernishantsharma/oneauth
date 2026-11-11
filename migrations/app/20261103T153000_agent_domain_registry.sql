-- Replace the provider-specific Agent tunnel registry with a DNS-provider-
-- independent hostname registry. Existing assignments are preserved.
DO $$
BEGIN
  IF to_regclass('public.agent_tunnels') IS NOT NULL
     AND to_regclass('public.agent_domains') IS NULL THEN
    ALTER TABLE public.agent_tunnels RENAME TO agent_domains;
  END IF;
END $$;

ALTER TABLE public.agent_domains
  DROP CONSTRAINT IF EXISTS agent_tunnels_tunnel_id_key;
DROP INDEX IF EXISTS public.agent_tunnels_tunnel_id_key;
DROP INDEX IF EXISTS public.agent_tunnels_shared_tunnel_idx;
DROP INDEX IF EXISTS public.agent_tunnels_active_local_port_key;
ALTER TABLE public.agent_domains DROP COLUMN IF EXISTS tunnel_id;

DO $$
BEGIN
  IF to_regclass('public.agent_tunnels_pkey') IS NOT NULL THEN
    ALTER INDEX public.agent_tunnels_pkey RENAME TO agent_domains_pkey;
  END IF;
  IF to_regclass('public.agent_tunnels_one_active_per_user') IS NOT NULL THEN
    ALTER INDEX public.agent_tunnels_one_active_per_user RENAME TO agent_domains_one_active_per_user;
  END IF;
  IF to_regclass('public.agent_tunnels_expiry_idx') IS NOT NULL THEN
    ALTER INDEX public.agent_tunnels_expiry_idx RENAME TO agent_domains_expiry_idx;
  END IF;
  IF to_regclass('public.agent_tunnels_hostname_key') IS NOT NULL THEN
    ALTER INDEX public.agent_tunnels_hostname_key RENAME TO agent_domains_hostname_key;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS agent_domains_expiry_idx
  ON public.agent_domains(last_used_at) WHERE status='ACTIVE';

INSERT INTO public.oauth_scopes (id, name, description, is_default, created_at)
VALUES (gen_random_uuid(), 'tunnel:manage', 'Provision and manage the authenticated user’s VortiqLabs Agent hostname assignment.', false, now())
ON CONFLICT (name) DO UPDATE SET description=EXCLUDED.description;

-- Grant the scope to the known Agent OAuth client only if it is registered.
INSERT INTO public.oauth_client_scopes (id, oauth_client_id, scope_name, created_at)
SELECT gen_random_uuid(), c.id, 'tunnel:manage', now()
FROM public.oauth_clients c
WHERE c.name = 'VortiqLabs Agent' AND c.client_type = 'DESKTOP'
  AND c.is_active = true AND c.deleted_at IS NULL
ON CONFLICT (oauth_client_id, scope_name) DO NOTHING;

-- OneAuth-owned registry for VortiqLabs Agent public tunnel URLs.
CREATE TABLE IF NOT EXISTS public.agent_tunnels (
  id uuid PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  tunnel_id text NOT NULL UNIQUE,
  hostname text NOT NULL UNIQUE,
  status text NOT NULL DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE','DELETED')),
  created_at timestamptz NOT NULL DEFAULT now(),
  last_used_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);
CREATE UNIQUE INDEX IF NOT EXISTS agent_tunnels_one_active_per_user
  ON public.agent_tunnels(user_id) WHERE status='ACTIVE';
CREATE INDEX IF NOT EXISTS agent_tunnels_expiry_idx
  ON public.agent_tunnels(last_used_at) WHERE status='ACTIVE';

-- Register the least-privilege scope and grant it only to the named Agent client.
INSERT INTO public.oauth_scopes (id, name, description, is_default, created_at)
VALUES (gen_random_uuid(), 'tunnel:manage', 'Provision and manage the authenticated user’s VortiqLabs Agent tunnel URL.', false, now())
ON CONFLICT (name) DO NOTHING;

INSERT INTO public.oauth_client_scopes (id, oauth_client_id, scope_name, created_at)
SELECT gen_random_uuid(), c.id, 'tunnel:manage', now()
FROM public.oauth_clients c
WHERE c.client_id = 'oa_jveGzDNEj0by9neUceFrElkYfvGZHq4f'
  AND c.is_active = true AND c.deleted_at IS NULL
ON CONFLICT (oauth_client_id, scope_name) DO NOTHING;

-- Active shared-gateway Agent assignments must not be issued the same port.
CREATE UNIQUE INDEX IF NOT EXISTS agent_tunnels_active_local_port_key
  ON public.agent_tunnels(local_port) WHERE status = 'ACTIVE';

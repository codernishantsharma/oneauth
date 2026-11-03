-- Agent traffic is proxied over authenticated persistent WebSocket sessions.
-- The hostname registry must not store a local TCP listener port.
ALTER TABLE public.agent_domains DROP COLUMN IF EXISTS local_port;

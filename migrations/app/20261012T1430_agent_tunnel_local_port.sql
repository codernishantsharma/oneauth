-- Store the port actually selected by the local Agent listener.
ALTER TABLE public.agent_tunnels
  ADD COLUMN IF NOT EXISTS local_port integer NOT NULL DEFAULT 43127
  CHECK (local_port BETWEEN 1 AND 65535);

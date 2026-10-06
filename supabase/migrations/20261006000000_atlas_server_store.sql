-- Durable server-side key/value store for deployments without a writable filesystem
-- (Vercel serverless). Server-only access: never expose the service-role key to the browser.
create table if not exists public.atlas_store (
 key text primary key,
 value jsonb not null default '{}'::jsonb,
 updated_at timestamptz not null default now()
);
alter table public.atlas_store enable row level security;
revoke all on public.atlas_store from anon, authenticated;
grant all on public.atlas_store to service_role;

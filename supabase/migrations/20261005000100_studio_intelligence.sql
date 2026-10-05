-- Server-only access. Never place service-role credentials in the browser.
create table if not exists public.p57_documents (
 id uuid primary key default gen_random_uuid(),
 kind text not null check (kind in ('settings','insight','artifact','conversation','memory','followup')),
 title text not null default '',
 page integer not null default 0 check(page between 0 and 13),
 body jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now()
);
create index if not exists p57_documents_kind_page on public.p57_documents(kind,page);
alter table public.p57_documents enable row level security;
revoke all on public.p57_documents from anon, authenticated;
grant all on public.p57_documents to service_role;

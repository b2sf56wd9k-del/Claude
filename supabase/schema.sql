-- Ascensão: tabela única de documentos sincronizados.
-- Rode este arquivo uma vez em Supabase → SQL Editor.
--   personal:<id do usuário>  dados do jogo e de saúde (só o dono lê)
--   finance:<id do usuário>   gastos (dono + e-mails em "members")

create table if not exists public.docs (
  id text primary key,
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  members text[] not null default '{}',
  data jsonb not null,
  updated_at timestamptz not null default now()
);

alter table public.docs enable row level security;

drop policy if exists docs_access on public.docs;
create policy docs_access on public.docs
  for all to authenticated
  using (owner = auth.uid() or lower(auth.jwt() ->> 'email') = any (members))
  with check (owner = auth.uid() or lower(auth.jwt() ->> 'email') = any (members));

-- VX Capital Finance - Orcamentos (Sprint 5)
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar e executar

-- Catalogo de servicos com preco fixo
create table if not exists public.services (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  price numeric(14,2) not null default 0,
  unit text default 'unidade',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Orcamentos
create table if not exists public.quotes (
  id uuid primary key default gen_random_uuid(),
  number integer generated always as identity,
  title text not null,
  client_id uuid references public.clients(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  status text not null default 'rascunho' check (status in ('rascunho','enviado','aprovado','recusado','expirado')),
  valid_until date,
  notes text,
  discount numeric(14,2) not null default 0,
  total numeric(14,2) not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Itens do orcamento (personalizados ou vinculados a um servico do catalogo)
create table if not exists public.quote_items (
  id uuid primary key default gen_random_uuid(),
  quote_id uuid not null references public.quotes(id) on delete cascade,
  service_id uuid references public.services(id) on delete set null,
  description text not null,
  quantity numeric(14,2) not null default 1,
  unit_price numeric(14,2) not null default 0,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists quotes_client_idx on public.quotes (client_id);
create index if not exists quotes_project_idx on public.quotes (project_id);
create index if not exists quote_items_quote_idx on public.quote_items (quote_id);
create index if not exists quote_items_service_idx on public.quote_items (service_id);

alter table public.services enable row level security;
alter table public.quotes enable row level security;
alter table public.quote_items enable row level security;

drop policy if exists "services_all_authenticated" on public.services;
create policy "services_all_authenticated" on public.services for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "quotes_all_authenticated" on public.quotes;
create policy "quotes_all_authenticated" on public.quotes for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

drop policy if exists "quote_items_all_authenticated" on public.quote_items;
create policy "quote_items_all_authenticated" on public.quote_items for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

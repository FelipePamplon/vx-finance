-- VX Capital Finance - Schema base (Sprint 2)
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar e executar

-- Perfis (estende auth.users)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text,
  role text not null default 'financeiro' check (role in ('admin','financeiro','socio','leitura')),
  created_at timestamptz not null default now()
);

-- Contas bancarias
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  bank text not null,
  agency text,
  account text,
  type text not null default 'corrente' check (type in ('corrente','poupanca','investimento','caixa')),
  balance numeric(14,2) not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Categorias
create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  color text not null default '#94A3B8',
  icon text,
  type text not null check (type in ('receita','despesa')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Clientes
create table if not exists public.clients (
  id uuid primary key default gen_random_uuid(),
  company text not null,
  contact text,
  email text,
  phone text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Projetos
create table if not exists public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  client_id uuid references public.clients(id) on delete set null,
  budget numeric(14,2) default 0,
  status text not null default 'ativo' check (status in ('ativo','pausado','concluido','cancelado')),
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Socios
create table if not exists public.partners (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  email text,
  share numeric(5,2) not null default 0,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

-- Transacoes (fluxo de caixa)
create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  description text not null,
  amount numeric(14,2) not null,
  type text not null check (type in ('receita','despesa')),
  date date not null default current_date,
  account_id uuid references public.accounts(id) on delete set null,
  category_id uuid references public.categories(id) on delete set null,
  project_id uuid references public.projects(id) on delete set null,
  client_id uuid references public.clients(id) on delete set null,
  partner_id uuid references public.partners(id) on delete set null,
  status text not null default 'pendente' check (status in ('pendente','pago','cancelado')),
  attachment_url text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

create index if not exists transactions_date_idx on public.transactions (date desc);
create index if not exists transactions_account_idx on public.transactions (account_id);
create index if not exists transactions_category_idx on public.transactions (category_id);

-- Row Level Security
alter table public.profiles enable row level security;
alter table public.accounts enable row level security;
alter table public.categories enable row level security;
alter table public.clients enable row level security;
alter table public.projects enable row level security;
alter table public.partners enable row level security;
alter table public.transactions enable row level security;

-- Sistema interno (single-tenant): qualquer usuario autenticado pode ler/escrever.
-- Granularidade por papel (admin/financeiro/socio/leitura) fica para sprint de seguranca avancada.
drop policy if exists "profiles_select_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select using (auth.uid() = id);
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_update_own" on public.profiles for update using (auth.uid() = id);
drop policy if exists "profiles_insert_own" on public.profiles;
create policy "profiles_insert_own" on public.profiles for insert with check (auth.uid() = id);

drop policy if exists "accounts_all_authenticated" on public.accounts;
create policy "accounts_all_authenticated" on public.accounts for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "categories_all_authenticated" on public.categories;
create policy "categories_all_authenticated" on public.categories for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "clients_all_authenticated" on public.clients;
create policy "clients_all_authenticated" on public.clients for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "projects_all_authenticated" on public.projects;
create policy "projects_all_authenticated" on public.projects for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "partners_all_authenticated" on public.partners;
create policy "partners_all_authenticated" on public.partners for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');
drop policy if exists "transactions_all_authenticated" on public.transactions;
create policy "transactions_all_authenticated" on public.transactions for all
  using (auth.role() = 'authenticated') with check (auth.role() = 'authenticated');

-- Cria automaticamente um profile ao registrar um novo usuario
create or replace function public.handle_new_user()
returns trigger as $$
begin
  insert into public.profiles (id, name, role)
  values (new.id, new.raw_user_meta_data->>'name', 'financeiro');
  return new;
end;
$$ language plpgsql security definer set search_path = public;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

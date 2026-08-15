-- VX Capital Finance - RLS por papel (Sprint 6)
-- Antes desta migration, qualquer usuario autenticado podia fazer TUDO: um usuario
-- marcado como "leitura" na tela de Usuarios conseguia apagar todos os lancamentos.
-- Aqui os papeis passam a valer de verdade, no banco.
--
--   admin      -> le e escreve tudo, e o unico que altera papeis de usuario
--   financeiro -> le e escreve os dados financeiros
--   socio      -> somente leitura
--   leitura    -> somente leitura
--
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar e executar

-- 1) Funcoes auxiliares.
--    SECURITY DEFINER e essencial: elas leem public.profiles ignorando o RLS da
--    propria tabela, o que evita recursao infinita quando uma policy de profiles
--    chama is_admin().
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce((select role from public.profiles where id = auth.uid()) = 'admin', false);
$$;

create or replace function public.can_write()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select role from public.profiles where id = auth.uid()) in ('admin','financeiro'),
    false
  );
$$;

-- 2) Tabelas de negocio: leitura para qualquer autenticado, escrita so para
--    admin/financeiro.
do $$
declare
  t text;
begin
  foreach t in array array[
    'accounts','categories','clients','projects','partners',
    'transactions','services','quotes','quote_items'
  ]
  loop
    -- remove a policy permissiva antiga
    execute format('drop policy if exists %I on public.%I', t || '_all_authenticated', t);

    execute format('drop policy if exists %I on public.%I', t || '_select', t);
    execute format(
      'create policy %I on public.%I for select using (auth.role() = ''authenticated'')',
      t || '_select', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_insert', t);
    execute format(
      'create policy %I on public.%I for insert with check (public.can_write())',
      t || '_insert', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_update', t);
    execute format(
      'create policy %I on public.%I for update using (public.can_write()) with check (public.can_write())',
      t || '_update', t
    );

    execute format('drop policy if exists %I on public.%I', t || '_delete', t);
    execute format(
      'create policy %I on public.%I for delete using (public.can_write())',
      t || '_delete', t
    );
  end loop;
end
$$;

-- 3) Profiles: cada um ve o proprio perfil; admin ve todos (necessario para a
--    tela de Usuarios listar a equipe).
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_select" on public.profiles;
create policy "profiles_select" on public.profiles
  for select using (auth.uid() = id or public.is_admin());

drop policy if exists "profiles_update_own" on public.profiles;
drop policy if exists "profiles_update" on public.profiles;
create policy "profiles_update" on public.profiles
  for update using (auth.uid() = id or public.is_admin())
  with check (auth.uid() = id or public.is_admin());

-- 4) Trava de escalacao de privilegio: sem isso, a policy acima permitiria que
--    um usuario "leitura" editasse o proprio perfil e se promovesse a admin.
create or replace function public.prevent_role_escalation()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.role is distinct from old.role and not public.is_admin() then
    raise exception 'Apenas administradores podem alterar papeis de usuario';
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_role_escalation on public.profiles;
create trigger profiles_prevent_role_escalation
  before update on public.profiles
  for each row execute function public.prevent_role_escalation();

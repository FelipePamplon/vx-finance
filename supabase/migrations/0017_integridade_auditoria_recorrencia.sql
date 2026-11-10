-- VX Capital Finance - Integridade no banco, trilha de auditoria e recorrencia
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar e executar
--
-- CONTEXTO
-- Auditoria do sistema (ADR-0003). Ate aqui toda regra de consistencia vivia so
-- na tela: o banco aceitava qualquer coisa. Os erros corrigidos nas migrations
-- 0008 a 0016 (estorno como receita, categoria de tipo errado, lancamento
-- cancelado com data de pagamento) eram todos estados que o banco deveria ter
-- recusado. Esta migration move as regras para onde elas nao podem ser
-- contornadas, e acrescenta o que faltava para gerir: auditoria, recorrencia,
-- conta ativa/encerrada, valor de contrato do projeto e saldo calculado no banco.
--
-- Tudo aditivo: nenhuma coluna removida, nenhum saldo alterado.

-- ---------------------------------------------------------------------------
-- 1) Limpeza dos dados que violariam as regras novas
-- ---------------------------------------------------------------------------
-- Lancamento que nao esta pago nao tem data de pagamento.
update public.transactions set paid_date = null
where status <> 'pago' and paid_date is not null;

-- Rendimento da aplicacao automatica do Bradesco estava como receita "Outros",
-- ou seja, dentro da receita operacional e da BASE DO SIMPLES. E resultado
-- financeiro, igual ao rendimento do CDB.
update public.transactions
set category_id = (select id from public.categories
                   where name = 'Rendimento de aplicações' and type = 'receita' limit 1)
where type = 'receita' and description like 'RENTAB.INVEST%';

-- "Pix enviado devolvido" da 99 e estorno de corrida: despesa negativa, como os
-- demais estornos (migration 0010), e nao receita.
update public.transactions
set type = 'despesa', amount = -amount,
    category_id = (select id from public.categories
                   where name = 'Transporte' and type = 'despesa' limit 1)
where type = 'receita' and amount > 0 and description ilike 'Pix enviado devolvido%';

-- Categorizacao com evidencia (reversivel na tela):
--   Marcela Stelmann = contabilidade. O lancamento fantasma "MUDANÇA DE PORTE",
--   categoria Contadora, R$ 450,00 em 22/07, era o Pix de R$ 450,00 para ela no
--   mesmo dia; os demais pagamentos sao mensais e de valor parecido.
update public.transactions
set category_id = (select id from public.categories
                   where name = 'Contabilidade' and type = 'despesa' limit 1)
where type = 'despesa' and status <> 'cancelado' and description ilike '%marcela stelmann%';

--   Movida (locadora) e Posto Dallas (combustivel) = transporte.
update public.transactions
set category_id = (select id from public.categories
                   where name = 'Transporte' and type = 'despesa' limit 1)
where type = 'despesa' and category_id is null
  and (description ilike '%movida%' or description ilike '%posto dallas%');

-- DAS-MEI de janeiro pago em 18/02 estava em "Taxas": e o mesmo imposto fixo de
-- R$ 86,05 (5% do salario minimo + R$ 5 de ISS) pago todo mes ate agosto.
update public.transactions
set category_id = (select id from public.categories
                   where name = 'Simples Nacional (DAS)' and type = 'despesa' limit 1)
where type = 'despesa' and amount = 86.05 and description ilike '%ministerio da fazenda%';

-- Imposto sobre faturamento entra pela COMPETENCIA. Os DAS estavam lancados com
-- competencia = data do pagamento, e o DAS pago no mes M refere-se a M-1. Lido
-- assim, a Posicao Fiscal mostrava setembro sem imposto e outubro com o dobro.
-- A data do pagamento (que e a que bate com o extrato) fica em paid_date.
update public.transactions
set date = (date_trunc('month', paid_date) - interval '1 day')::date
where status = 'pago' and date = paid_date
  and category_id = (select id from public.categories
                     where name = 'Simples Nacional (DAS)' and type = 'despesa' limit 1);

-- ---------------------------------------------------------------------------
-- 2) Colunas novas
-- ---------------------------------------------------------------------------
alter table public.transactions
  add column if not exists updated_at timestamptz,
  add column if not exists updated_by uuid references auth.users(id),
  -- Parcelas e recorrencias geradas juntas compartilham o mesmo grupo.
  add column if not exists recurrence_group uuid,
  add column if not exists installment_no integer,
  add column if not exists installment_total integer;

create index if not exists transactions_recurrence_idx on public.transactions (recurrence_group);
create index if not exists transactions_project_idx on public.transactions (project_id);
create index if not exists transactions_client_idx on public.transactions (client_id);
create index if not exists transactions_partner_idx on public.transactions (partner_id);

-- Conta encerrada continua no historico, mas sai das listas de lancamento.
alter table public.accounts add column if not exists is_active boolean not null default true;
update public.accounts set is_active = false where bank ilike '%encerrada%';

-- Projeto: "budget" e o custo orcado; faltava o valor do contrato para saber a
-- margem prevista.
alter table public.projects add column if not exists contract_value numeric(14,2) not null default 0;

-- ---------------------------------------------------------------------------
-- 3) Regras de integridade
-- ---------------------------------------------------------------------------
-- Valor nunca e zero; negativo so em despesa (estorno).
alter table public.transactions drop constraint if exists transactions_amount_check;
alter table public.transactions add constraint transactions_amount_check
  check (amount <> 0 and (type = 'despesa' or amount > 0));

-- Normaliza o que a tela pode esquecer e recusa o que nao tem conserto.
create or replace function public.transactions_guard()
returns trigger
language plpgsql
set search_path = public
as $$
declare
  cat_type text;
  cat_name text;
begin
  -- Transferencia nao tem categoria.
  if new.type = 'transferencia' then
    new.category_id := null;
  end if;

  -- Categoria precisa ser do mesmo tipo do lancamento. Sem isso, uma despesa
  -- com categoria de receita some de um lado do DRE e aparece no outro.
  if new.category_id is not null then
    select type, name into cat_type, cat_name from public.categories where id = new.category_id;
    if cat_type is distinct from new.type then
      raise exception 'A categoria "%" é de % e não pode ser usada em um lançamento de %.',
        cat_name, cat_type, new.type;
    end if;
  end if;

  -- Data de pagamento acompanha o status.
  if new.status = 'pago' then
    new.paid_date := coalesce(new.paid_date, new.date);
  else
    new.paid_date := null;
  end if;

  new.due_date := coalesce(new.due_date, new.date);

  if tg_op = 'UPDATE' then
    new.updated_at := now();
    new.updated_by := coalesce(auth.uid(), new.updated_by);
  end if;

  return new;
end;
$$;

drop trigger if exists transactions_guard_trg on public.transactions;
create trigger transactions_guard_trg
  before insert or update on public.transactions
  for each row execute function public.transactions_guard();

-- Trocar o tipo de uma categoria em uso quebraria os lancamentos dela.
create or replace function public.categories_guard()
returns trigger
language plpgsql
set search_path = public
as $$
begin
  if new.type is distinct from old.type
     and exists (select 1 from public.transactions where category_id = old.id) then
    raise exception 'A categoria "%" já tem lançamentos e não pode mudar de tipo. Crie outra categoria.', old.name;
  end if;
  return new;
end;
$$;

drop trigger if exists categories_guard_trg on public.categories;
create trigger categories_guard_trg
  before update on public.categories
  for each row execute function public.categories_guard();

-- ---------------------------------------------------------------------------
-- 4) Trilha de auditoria: quem mudou o que, e como estava antes
-- ---------------------------------------------------------------------------
create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  table_name text not null,
  record_id uuid,
  action text not null check (action in ('INSERT','UPDATE','DELETE')),
  changed_by uuid,
  changed_at timestamptz not null default now(),
  old_data jsonb,
  new_data jsonb
);

create index if not exists audit_log_record_idx on public.audit_log (table_name, record_id, changed_at desc);

alter table public.audit_log enable row level security;
drop policy if exists audit_log_select on public.audit_log;
create policy audit_log_select on public.audit_log for select using (auth.role() = 'authenticated');
-- Sem policy de escrita: so o gatilho (security definer) grava. Ninguem edita
-- nem apaga o historico pela API.

create or replace function public.audit_row()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'UPDATE' and to_jsonb(new) - 'updated_at' - 'updated_by' = to_jsonb(old) - 'updated_at' - 'updated_by' then
    return new; -- nada mudou de verdade
  end if;

  insert into public.audit_log (table_name, record_id, action, changed_by, old_data, new_data)
  values (
    tg_table_name,
    case when tg_op = 'DELETE' then old.id else new.id end,
    tg_op,
    auth.uid(),
    case when tg_op = 'INSERT' then null else to_jsonb(old) end,
    case when tg_op = 'DELETE' then null else to_jsonb(new) end
  );
  return coalesce(new, old);
end;
$$;

do $$
declare t text;
begin
  foreach t in array array['transactions','accounts','categories','partners','projects'] loop
    execute format('drop trigger if exists %I on public.%I', t || '_audit_trg', t);
    execute format(
      'create trigger %I after insert or update or delete on public.%I for each row execute function public.audit_row()',
      t || '_audit_trg', t);
  end loop;
end
$$;

-- ---------------------------------------------------------------------------
-- 5) Saldo por conta calculado no banco
--    As telas somavam os lancamentos no navegador a partir de uma consulta sem
--    paginacao. O PostgREST corta em 1.000 linhas SEM AVISAR: ao passar disso o
--    Saldo Atual ficaria errado em silencio. A visao abaixo e a fonte unica.
--    security_invoker: respeita o RLS de quem consulta.
-- ---------------------------------------------------------------------------
create or replace view public.v_account_balances
with (security_invoker = true) as
select
  a.id, a.bank, a.agency, a.account, a.type, a.is_active,
  a.balance as opening_balance,
  coalesce(sum(case
    when t.type = 'receita' then t.amount
    when t.type = 'despesa' then -t.amount
    when t.type = 'transferencia' and t.account_id = a.id then -t.amount
    when t.type = 'transferencia' and t.transfer_account_id = a.id then t.amount
    else 0 end), 0) as movement,
  a.balance + coalesce(sum(case
    when t.type = 'receita' then t.amount
    when t.type = 'despesa' then -t.amount
    when t.type = 'transferencia' and t.account_id = a.id then -t.amount
    when t.type = 'transferencia' and t.transfer_account_id = a.id then t.amount
    else 0 end), 0) as current_balance,
  max(t.date) as last_movement
from public.accounts a
left join public.transactions t
  on (t.account_id = a.id or t.transfer_account_id = a.id) and t.status = 'pago'
group by a.id;

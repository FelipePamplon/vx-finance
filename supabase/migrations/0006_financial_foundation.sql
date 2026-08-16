-- VX Capital Finance - Fundacao financeira (Sprint 6)
-- Vencimento (contas a pagar/receber), data de pagamento e transferencia entre contas.
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar e executar

-- 1) Novas colunas
-- ATENCAO: transfer_account_id cria uma SEGUNDA chave estrangeira de transactions
-- para accounts. A partir daqui, todo select do PostgREST que embute `accounts(...)`
-- precisa nomear a constraint (ex.: accounts!transactions_account_id_fkey(bank)),
-- senao a consulta falha por ambiguidade e a tela volta vazia.
alter table public.transactions
  add column if not exists due_date date,
  add column if not exists paid_date date,
  add column if not exists transfer_account_id uuid references public.accounts(id) on delete set null;

-- 2) Backfill preservando exatamente a semantica atual dos lancamentos ja existentes:
--    antes desta migration, "date" acumulava os tres papeis (competencia, vencimento e pagamento).
update public.transactions set due_date = date where due_date is null;
update public.transactions set paid_date = date where status = 'pago' and paid_date is null;

-- 3) Liberar o tipo "transferencia".
--    Transferencia move dinheiro entre contas proprias: nao e receita nem despesa
--    e por isso fica fora do DRE e do resultado.
alter table public.transactions drop constraint if exists transactions_type_check;
alter table public.transactions add constraint transactions_type_check
  check (type in ('receita','despesa','transferencia'));

-- 4) Integridade da transferencia: exige origem e destino distintos, e proibe
--    transfer_account_id em lancamentos que nao sao transferencia.
--    (CHECK passa quando avalia NULL, por isso cada condicao e explicita.)
alter table public.transactions drop constraint if exists transactions_transfer_check;
alter table public.transactions add constraint transactions_transfer_check
  check (
    (type <> 'transferencia' and transfer_account_id is null)
    or (
      type = 'transferencia'
      and account_id is not null
      and transfer_account_id is not null
      and transfer_account_id <> account_id
    )
  );

-- 5) Indices para a tela de contas a pagar/receber (busca por vencimento em aberto)
create index if not exists transactions_due_date_idx on public.transactions (due_date);
create index if not exists transactions_status_due_idx on public.transactions (status, due_date);
create index if not exists transactions_transfer_account_idx on public.transactions (transfer_account_id);

-- VX Capital Finance - Conciliacao do extrato Inter 05/08/2026 a 02/11/2026
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar e executar
--
-- CONTEXTO
-- O painel mostrava Saldo Atual de R$ 74.530,70 enquanto a conta corrente do Inter
-- (ag. 0001-9 / c/c 52120527-1) fechava o extrato em R$ 6.885,94. Conciliando linha a
-- linha o extrato oficial do periodo, a diferenca se decompoe em tres causas:
--
--   1) 26 lancamentos do extrato nunca foram registrados (13/08 a 27/10/2026). Entre eles
--      estao as maiores saidas do periodo - distribuicoes aos socios, Receita Federal de
--      R$ 4.084,30 e as aplicacoes no CDB - e tambem uma entrada de R$ 63.652,66.
--      Como as grandes saidas faltavam e as entradas estavam lancadas, o saldo inflava.
--
--   2) As aplicacoes e resgates de CDB vinham sendo tratadas como dinheiro que sai do
--      grupo, quando na verdade sao transferencia entre contas proprias (conta corrente
--      <-> Inter CDB). Aqui elas entram como type='transferencia', que e neutra no caixa
--      consolidado e fica fora do DRE.
--
--   3) A divergencia de R$ 698,77 que existia ANTES do extrato (o sistema marcava
--      R$ 2.004,17 em 04/08/2026 contra R$ 1.305,40 reais) tem causa identificada:
--      os resgates de "Cdb Credito" de 13/08 (R$ 202,06 + R$ 496,71 = R$ 698,77) provam
--      que esse valor estava aplicado no CDB antes de 05/08, mas as aplicacoes
--      correspondentes nunca foram registradas - o dinheiro aparecia na conta corrente
--      quando na verdade estava no CDB. Elas sao reconstituidas abaixo em 04/08/2026
--      (ultimo dia antes do extrato; a data exata nao consta no documento fornecido).
--      Nao e um ajuste arbitrario: e a contrapartida dos resgates que o extrato comprova.
--
-- Todos os inserts sao guardados por NOT EXISTS, logo rodar de novo nao duplica nada.

-- ---------------------------------------------------------------------------
-- 1) Conta de investimento que recebe as aplicacoes de CDB
-- ---------------------------------------------------------------------------
insert into public.accounts (bank, agency, account, type, balance)
select 'Inter CDB', '0001-9', '52120527-1', 'investimento', 0
where not exists (select 1 from public.accounts where bank = 'Inter CDB');

-- ---------------------------------------------------------------------------
-- 2) Categoria das retiradas dos socios (o extrato mostra Pix nominais a eles)
-- ---------------------------------------------------------------------------
insert into public.categories (name, color, type)
select 'Sócios / Distribuição', '#EF4444', 'despesa'
where not exists (
  select 1 from public.categories where name = 'Sócios / Distribuição' and type = 'despesa'
);

-- ---------------------------------------------------------------------------
-- 3) Lancamentos do extrato + reconstituicao das aplicacoes de CDB anteriores
-- ---------------------------------------------------------------------------
with ref as (
  select
    (select id from public.accounts where bank = 'Inter' limit 1)     as cc,
    (select id from public.accounts where bank = 'Inter CDB' limit 1) as cdb,
    (select id from public.clients  where company = 'Finconsult' limit 1) as finconsult
),
cat as (
  select
    (select id from public.categories where name = 'Taxas' and type = 'despesa' limit 1)                  as taxas,
    (select id from public.categories where name = 'Tel. - Internet' and type = 'despesa' limit 1)        as telecom,
    (select id from public.categories where name = 'Fornecedores' and type = 'despesa' limit 1)           as fornecedores,
    (select id from public.categories where name = 'Aluguel' and type = 'despesa' limit 1)                as aluguel,
    (select id from public.categories where name = 'Software' and type = 'despesa' limit 1)               as software,
    (select id from public.categories where name = 'Outros - Saída' and type = 'despesa' limit 1)         as outros_saida,
    (select id from public.categories where name = 'Sócios / Distribuição' and type = 'despesa' limit 1)  as socios,
    (select id from public.categories where name = 'Serviço de consultoria' and type = 'receita' limit 1) as consultoria
),
novos (data, descricao, valor, tipo, conta, destino, categoria, cliente) as (
  values
    -- Contrapartida dos resgates de 13/08: o que estava aplicado no CDB antes do extrato.
    ('2026-08-04'::date, 'Aplicação Cdb Credito Banco Inter S A (reconstituída na conciliação: contrapartida do resgate de 13/08)', 202.06, 'transferencia', 'cc', 'cdb', null, null),
    ('2026-08-04'::date, 'Aplicação Cdb Credito Banco Inter S A (reconstituída na conciliação: contrapartida do resgate de 13/08)', 496.71, 'transferencia', 'cc', 'cdb', null, null),

    -- Agosto/2026
    ('2026-08-13'::date, 'Resgate Cdb Credito Banco Inter S A',                      202.06,   'transferencia', 'cdb', 'cc',  null,           null),
    ('2026-08-13'::date, 'Resgate Cdb Credito Banco Inter S A',                      496.71,   'transferencia', 'cdb', 'cc',  null,           null),
    ('2026-08-17'::date, 'Pix enviado - Receita Federal',                             86.05,   'despesa',       'cc',  null,  'taxas',        null),
    ('2026-08-18'::date, 'Recarga - Claro',                                           30.00,   'despesa',       'cc',  null,  'telecom',      null),
    ('2026-08-18'::date, 'Pix enviado - Marcela Stelmann Costa Da Silva',            450.00,   'despesa',       'cc',  null,  'fornecedores', null),
    ('2026-08-29'::date, 'Compra no débito - Doitcoworking Belem Bra',               175.00,   'despesa',       'cc',  null,  'aluguel',      null),

    -- Setembro/2026
    ('2026-09-03'::date, 'Pix enviado - Yandra Franca Chagas',                      6000.00,   'despesa',       'cc',  null,  'socios',       null),
    ('2026-09-03'::date, 'Pix enviado - Felipe Caldas Pamplona',                    2000.00,   'despesa',       'cc',  null,  'socios',       null),
    ('2026-09-03'::date, 'Pix enviado - Djalma Freitas Cardoso',                    6000.00,   'despesa',       'cc',  null,  'socios',       null),
    ('2026-09-03'::date, 'Pix enviado - Gleydson Pacheco Sousa',                    6000.00,   'despesa',       'cc',  null,  'socios',       null),
    ('2026-09-10'::date, 'Pix enviado - Marcela Stelmann Costa Da Silva',            400.00,   'despesa',       'cc',  null,  'fornecedores', null),
    ('2026-09-14'::date, 'Aplicação Cdb Credito Banco Inter S A',                    200.00,   'transferencia', 'cc',  'cdb', null,           null),
    ('2026-09-14'::date, 'Aplicação Cdb Credito Banco Inter S A (2ª do dia)',        200.00,   'transferencia', 'cc',  'cdb', null,           null),
    ('2026-09-14'::date, 'Resgate Cdb Credito Banco Inter S A',                      113.85,   'transferencia', 'cdb', 'cc',  null,           null),
    ('2026-09-14'::date, 'Pagamento efetuado - Pagamento Fatura - VX CAPITAL LTDA',  113.85,   'despesa',       'cc',  null,  'outros_saida', null),
    ('2026-09-18'::date, 'Pix enviado - Pagar Me Pagamentos',                         20.99,   'despesa',       'cc',  null,  'software',     null),
    ('2026-09-22'::date, 'Pix enviado - Marcela Stelmann Costa Da Silva',            270.00,   'despesa',       'cc',  null,  'fornecedores', null),
    ('2026-09-27'::date, 'Aplicação Cdb Porq Dd Pj Banco Inter S A',               40000.00,   'transferencia', 'cc',  'cdb', null,           null),

    -- Outubro/2026
    ('2026-10-06'::date, 'Pix enviado - Pedro Paulo Santos Moreira',                  84.00,   'despesa',       'cc',  null,  'outros_saida', null),
    ('2026-10-09'::date, 'Pix enviado - Marcela Stelmann Costa Da Silva',            400.00,   'despesa',       'cc',  null,  'fornecedores', null),
    ('2026-10-14'::date, 'Pagamento efetuado - Pagamento Fatura - FELIPE CALDAS PAMPLONA', 197.04, 'despesa',   'cc',  null,  'outros_saida', null),
    ('2026-10-15'::date, 'Compra no débito - Estilo Bistro Belem Bra',               660.74,   'despesa',       'cc',  null,  'outros_saida', null),
    ('2026-10-19'::date, 'Pix enviado - Receita Federal',                           4084.30,   'despesa',       'cc',  null,  'taxas',        null),
    ('2026-10-21'::date, 'Pix recebido - Finconsult',                              63652.66,   'receita',       'cc',  null,  'consultoria',  'finconsult'),
    ('2026-10-21'::date, 'Aplicação Cdb Porq Dd Pj Banco Inter S A',               35000.00,   'transferencia', 'cc',  'cdb', null,           null),
    ('2026-10-21'::date, 'Pix enviado - Felipe Caldas Pamplona',                   13000.00,   'despesa',       'cc',  null,  'socios',       null),
    ('2026-10-21'::date, 'Pix enviado - Djalma Freitas Cardoso',                   14000.00,   'despesa',       'cc',  null,  'socios',       null),
    ('2026-10-22'::date, 'Pix enviado - Gleydson Pacheco Sousa',                   14000.00,   'despesa',       'cc',  null,  'socios',       null),
    ('2026-10-22'::date, 'Resgate Cdb Porq Dd Pj Banco Inter S A',                 14000.00,   'transferencia', 'cdb', 'cc',  null,           null),
    ('2026-10-26'::date, 'Pix enviado - Cakto Pagamentos Ltda',                        21.99, 'despesa',        'cc',  null,  'software',     null),
    ('2026-10-27'::date, 'Pix enviado - Tms Digital',                                  38.80, 'despesa',        'cc',  null,  'software',     null)
)
insert into public.transactions
  (description, amount, type, date, due_date, paid_date, account_id, transfer_account_id, category_id, client_id, status)
select
  n.descricao,
  n.valor,
  n.tipo,
  n.data,
  n.data,
  n.data,
  case n.conta when 'cc' then ref.cc when 'cdb' then ref.cdb end,
  case n.destino when 'cc' then ref.cc when 'cdb' then ref.cdb else null end,
  case n.categoria
    when 'taxas' then cat.taxas
    when 'telecom' then cat.telecom
    when 'fornecedores' then cat.fornecedores
    when 'aluguel' then cat.aluguel
    when 'software' then cat.software
    when 'outros_saida' then cat.outros_saida
    when 'socios' then cat.socios
    when 'consultoria' then cat.consultoria
  end,
  case n.cliente when 'finconsult' then ref.finconsult end,
  'pago'
from novos n cross join ref cross join cat
where not exists (
  select 1 from public.transactions t
  where t.date = n.data
    and t.amount = n.valor
    and t.type = n.tipo
    and t.description = n.descricao
);

-- ---------------------------------------------------------------------------
-- 4) Correcao de data: o extrato mostra o convenio PM BELEM de R$ 597,16 em
--    28/08/2026, nao em 14/08. O valor e a conta estavam certos.
-- ---------------------------------------------------------------------------
update public.transactions
set date = '2026-08-28', due_date = '2026-08-28', paid_date = '2026-08-28',
    description = 'Pagamento de Convênio - PM BELEM (TLPL)'
where description = 'Pagamento TLPL'
  and amount = 597.16
  and date = '2026-08-14';

-- ---------------------------------------------------------------------------
-- 5) Recebimento da Finconsult lancado em duplicidade.
--    A previsao de 26/07 (Bradesco, pendente) e o mesmo dinheiro que entrou de
--    fato em 03/09 no Inter, ja registrado. Fica como cancelado para preservar o
--    historico sem contar duas vezes.
-- ---------------------------------------------------------------------------
update public.transactions
set status = 'cancelado',
    description = description || ' [cancelado na conciliação: duplicidade do crédito recebido em 03/09/2026 no Inter]'
where amount = 68071.84
  and date = '2026-07-26'
  and status = 'pendente';

-- ---------------------------------------------------------------------------
-- 6) Bradesco: conta encerrada, saldo real zero (confirmado pelo usuario).
--    O historico do Bradesco nao tem extrato para conferir, entao o residuo de
--    R$ 1.978,51 e absorvido no saldo inicial - que e exatamente o campo de
--    abertura da conta - em vez de virar uma despesa ficticia no DRE.
-- ---------------------------------------------------------------------------
update public.accounts
set balance = 0 - (
      select coalesce(sum(case
        when t.type = 'receita' then t.amount
        when t.type = 'despesa' then -t.amount
        when t.type = 'transferencia' and t.account_id = accounts.id then -t.amount
        when t.type = 'transferencia' and t.transfer_account_id = accounts.id then t.amount
        else 0 end), 0)
      from public.transactions t
      where t.status = 'pago'
        and (t.account_id = accounts.id or t.transfer_account_id = accounts.id)
    ),
    bank = 'Bradesco (encerrada)'
where bank = 'Bradesco';

-- VX Capital Finance - Saldos reais dos CDBs do Inter (posicao de 02/11/2026)
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar e executar
--
-- CONTEXTO
-- A migration 0008 conciliou a conta corrente contra o extrato e jogou todas as
-- aplicacoes de CDB numa conta unica "Inter CDB", fechando em R$ 61.286,15. Esse
-- numero era so o principal que o extrato da conta corrente comprova ter saido e
-- nao voltado - faltava o que ja estava aplicado antes de 05/08/2026 e o
-- rendimento, que nao aparecem naquele documento.
--
-- A posicao real do app do Inter em 02/11/2026 mostra DOIS produtos distintos:
--
--   CDB Porquinho Dia a Dia PJ      CDB Credito (garantia do cartao)
--     bruto    61.429,10              bruto      496,47
--     ganhos      369,20              ganhos       8,65
--     IR/IOF      132,49              IR/IOF       1,93
--     liquido  61.296,61              liquido    494,54
--
-- Dois cruzamentos independentes confirmam a leitura:
--   a) principal do CDB Credito = bruto - ganhos = 487,82, exatamente igual ao
--      "Limite total" exibido na tela de limite investido do cartao;
--   b) liquido = bruto - IR/IOF nos dois produtos.
--
-- Dai sai o que faltava em cada conta:
--
--   CDB Credito:   principal real 487,82 - movimentos registrados 286,15 = 201,67
--   CDB Porquinho: principal real 61.059,90 - movimentos registrados 61.000,00 = 59,90
--
-- Esses R$ 261,57 e dinheiro que ja estava aplicado antes do inicio do extrato.
-- Entra como saldo inicial de cada conta (o campo "Saldo inicial" da tela de
-- Contas e, por definicao, o que existia antes do primeiro lancamento
-- registrado). Nao mexe na conta corrente: o extrato fixa a abertura dela em
-- 05/08/2026 em R$ 1.305,40, e esse dinheiro ja tinha saido antes disso.

-- ---------------------------------------------------------------------------
-- 1) Separar os dois produtos. Sao CDBs diferentes: o Porquinho e caixa livre,
--    o Credito e garantia do cartao e so libera conforme a fatura e paga.
-- ---------------------------------------------------------------------------
update public.accounts
set bank = 'Inter CDB Crédito', balance = 201.67
where bank = 'Inter CDB';

insert into public.accounts (bank, agency, account, type, balance)
select 'Inter CDB Porquinho', '0001-9', '52120527-1', 'investimento', 59.90
where not exists (select 1 from public.accounts where bank = 'Inter CDB Porquinho');

-- Lancamentos do Porquinho migram para a conta nova; os de "Cdb Credito" ficam.
update public.transactions
set account_id = (select id from public.accounts where bank = 'Inter CDB Porquinho' limit 1)
where account_id = (select id from public.accounts where bank = 'Inter CDB Crédito' limit 1)
  and description ilike '%Porq%';

update public.transactions
set transfer_account_id = (select id from public.accounts where bank = 'Inter CDB Porquinho' limit 1)
where transfer_account_id = (select id from public.accounts where bank = 'Inter CDB Crédito' limit 1)
  and description ilike '%Porq%';

-- ---------------------------------------------------------------------------
-- 2) Categorias do rendimento e do imposto
-- ---------------------------------------------------------------------------
insert into public.categories (name, color, type)
select v.name, v.color, v.type from (values
  ('Rendimento de aplicações', '#22C55E', 'receita'),
  ('IR/IOF sobre aplicações',  '#EF4444', 'despesa')
) as v(name, color, type)
where not exists (
  select 1 from public.categories c where c.name = v.name and c.type = v.type
);

-- ---------------------------------------------------------------------------
-- 3) Rendimento acumulado e IR/IOF, posicao de 02/11/2026.
--    O rendimento e receita de verdade; o IR/IOF so e cobrado no resgate, entao
--    entra como provisao para que o saldo da conta mostre o valor LIQUIDO - o
--    que sobra se o dinheiro for sacado hoje, que e o numero verde do app.
--    No dia do resgate, o imposto ja estara provisionado aqui: lance o resgate
--    pelo valor bruto e estorne esta provisao, para nao contar o imposto duas vezes.
-- ---------------------------------------------------------------------------
with contas as (
  select
    (select id from public.accounts where bank = 'Inter CDB Porquinho' limit 1) as porquinho,
    (select id from public.accounts where bank = 'Inter CDB Crédito' limit 1)   as credito
),
cat as (
  select
    (select id from public.categories where name = 'Rendimento de aplicações' and type = 'receita' limit 1) as rendimento,
    (select id from public.categories where name = 'IR/IOF sobre aplicações' and type = 'despesa' limit 1)   as imposto
),
novos (descricao, valor, tipo, conta, categoria) as (
  values
    ('Rendimento acumulado CDB Porquinho Dia a Dia PJ (posição de 02/11/2026)', 369.20, 'receita', 'porquinho', 'rendimento'),
    ('IR/IOF provisionado sobre CDB Porquinho (estornar no resgate)',           132.49, 'despesa', 'porquinho', 'imposto'),
    ('Rendimento acumulado CDB Crédito Banco Inter (posição de 02/11/2026)',      8.65, 'receita', 'credito',   'rendimento'),
    ('IR/IOF provisionado sobre CDB Crédito (estornar no resgate)',               1.93, 'despesa', 'credito',   'imposto')
)
insert into public.transactions
  (description, amount, type, date, due_date, paid_date, account_id, category_id, status)
select
  n.descricao, n.valor, n.tipo,
  '2026-11-02'::date, '2026-11-02'::date, '2026-11-02'::date,
  case n.conta when 'porquinho' then contas.porquinho when 'credito' then contas.credito end,
  case n.categoria when 'rendimento' then cat.rendimento when 'imposto' then cat.imposto end,
  'pago'
from novos n cross join contas cross join cat
where not exists (
  select 1 from public.transactions t where t.description = n.descricao
);

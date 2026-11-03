-- VX Capital Finance - Conciliacao do extrato Bradesco 10/07/2026 a 08/09/2026
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar e executar
--
-- CONTEXTO
-- Extrato do Bradesco ag. 2700 / c/c 16332-5, titular
-- 64.341.655 DJALMA FREITAS CARDOSO (CNPJ 64.341.655/0001-06).
-- A cadeia de saldo das 24 linhas esta integra: abre em R$ 10.080,91 em
-- 10/07/2026 e fecha em R$ 0,00 em 27/08/2026.
--
-- TRES CONFIRMACOES DOCUMENTAIS
--
--   1) O ULTIMO lancamento da conta e um Pix de -R$ 4.393,54 com destino
--      "VX CAPITAL LTDA", em 27/08. E a transferencia Bradesco -> Inter que
--      estava em duvida (ver migration 0011): prova documental, nao mais
--      palavra do titular. E o titular da conta Bradesco ser aquele CNPJ
--      explica por que o Pix chega no extrato do Inter com nome de terceiro.
--
--   2) A conta realmente fecha em ZERO, e foi esvaziada exatamente por essa
--      transferencia para o Inter. O "Bradesco encerrado em R$ 0,00" deixa de
--      ser premissa do usuario e passa a ser fato do extrato.
--
--   3) O movimento ja registrado no sistema ate 09/07/2026 soma exatamente
--      R$ 10.080,91 - identico a abertura que o extrato prova. Ou seja, o
--      historico de fevereiro a julho do Bradesco estava CORRETO. O plug de
--      abertura de R$ 471,49 criado nas migrations anteriores era desnecessario
--      e vai a zero. Nenhuma conta do sistema tem mais saldo inicial inventado.
--
-- DIVERGENCIAS (4 dias de 9)

-- ---------------------------------------------------------------------------
-- 1) "MUDANÇA DE PORTE" de R$ 450,00 em 22/07 nao existe. Ponto final.
--    A migration 0012 a moveu para o Bradesco por nao estar no extrato do
--    Inter, supondo que tivesse saido daqui. O extrato do Bradesco mostra UM
--    unico lancamento de R$ 450,00 em 22/07 - o Pix para Marcela Stelmann, que
--    ja estava registrado. Logo a "Mudança de porte" nao saiu de conta nenhuma:
--    e um lancamento que nunca aconteceu. Fica cancelado, preservando a trilha.
-- ---------------------------------------------------------------------------
update public.transactions
set status = 'cancelado',
    account_id = (select id from public.accounts where bank like 'Bradesco%' limit 1),
    description = 'MUDANÇA DE PORTE [cancelado na conciliação: não consta nem no extrato do Inter (01/03-31/07) nem no do Bradesco (10/07-08/09); o único R$ 450,00 de 22/07 é o Pix para Marcela Stelmann, já lançado]'
where amount = 450.00
  and date = '2026-07-22'
  and description like 'MUDANÇA DE PORTE%';

-- ---------------------------------------------------------------------------
-- 2) Data: o pagamento a Noel Antunes saiu em 27/08, nao em 29/08
-- ---------------------------------------------------------------------------
update public.transactions
set date='2026-08-27', due_date='2026-08-27', paid_date='2026-08-27'
where date='2026-08-29' and amount=1000.00
  and description like 'PAGAMENTO DOCUMENTARIO%';

-- ---------------------------------------------------------------------------
-- 3) Rendimentos da aplicacao automatica que faltavam
-- ---------------------------------------------------------------------------
with ref as (
  select
    (select id from public.accounts where bank like 'Bradesco%' limit 1) as br,
    (select id from public.categories where name='Outros' and type='receita' limit 1) as outros
),
novos (data, valor) as (
  values ('2026-07-27'::date, 4.79), ('2026-08-27'::date, 0.74), ('2026-08-27'::date, 15.96)
)
insert into public.transactions
  (description, amount, type, date, due_date, paid_date, account_id, category_id, status)
select 'RENTAB.INVEST FACILCRED*', n.valor, 'receita', n.data, n.data, n.data,
       ref.br, ref.outros, 'pago'
from novos n cross join ref
where not exists (
  select 1 from public.transactions t
  where t.date = n.data and t.amount = n.valor and t.type = 'receita'
    and t.description = 'RENTAB.INVEST FACILCRED*'
);

-- ---------------------------------------------------------------------------
-- 4) Saldo inicial do Bradesco: zero, com lastro.
--    O movimento registrado ate 09/07/2026 ja produz exatamente os R$ 10.080,91
--    que o extrato mostra na abertura de 10/07, entao nao ha nada a plugar.
-- ---------------------------------------------------------------------------
update public.accounts set balance = 0 where bank like 'Bradesco%';

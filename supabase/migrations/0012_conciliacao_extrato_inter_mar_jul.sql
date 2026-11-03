-- VX Capital Finance - Conciliacao do extrato Inter 01/03/2026 a 31/07/2026
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar e executar
--
-- CONTEXTO
-- Este extrato cobre o periodo que faltava e permite fechar o historico inteiro
-- da conta corrente. Duas constatacoes do documento:
--
--   a) A cadeia de saldo das 307 linhas esta integra e a conta ABRIU EM R$ 0,00
--      em 01/03/2026. O campo "Saldo inicial" do Inter (R$ 291,20) era um
--      numero sem lastro e passa a zero.
--   b) O extrato fecha 31/07 em R$ 1.543,94. Com o unico lancamento de 04/08 ja
--      registrado (PM BELEM, -R$ 238,54), chega-se a R$ 1.305,40 - exatamente a
--      abertura do extrato seguinte, de 05/08. Os dois documentos encaixam.
--
-- CORRECAO DE UMA CONCLUSAO ANTERIOR
-- A migration 0008 reconstituiu duas aplicacoes de CDB em 04/08/2026
-- (R$ 202,06 + R$ 496,71 = R$ 698,77) para explicar a divergencia do saldo de
-- abertura. O raciocinio era que os resgates de 13/08 provavam dinheiro aplicado
-- antes - o que era verdade -, mas a DATA estava errada: o encaixe exato entre
-- os dois extratos nao deixa espaco para nenhum lancamento em 04/08 alem do
-- PM BELEM. As aplicacoes de verdade estao neste extrato, espalhadas por
-- marco a julho. Aquelas duas linhas sao removidas aqui.
--
-- DIVERGENCIAS ENCONTRADAS (18 dias de 85; os outros 67 ja batiam)
--   - 21 movimentos de CDB Credito nunca registrados (aplicacoes e resgates);
--   - 4 transferencias do Bradesco com data trocada em um dia;
--   - 1 despesa no Inter que o extrato nao mostra (ver nota no fim).

-- ---------------------------------------------------------------------------
-- 1) Remove a reconstituicao de 04/08 que este extrato desmente
-- ---------------------------------------------------------------------------
delete from public.transactions
where date = '2026-08-04'
  and type = 'transferencia'
  and amount in (202.06, 496.71)
  and description like 'Aplicação Cdb Credito Banco Inter S A (reconstituída%';

-- ---------------------------------------------------------------------------
-- 2) Datas trocadas em um dia (o extrato manda)
-- ---------------------------------------------------------------------------
-- Os dois Pix de R$ 110,00 recebidos em 15/03 estavam como 16/03. Eram tambem
-- os "pares identicos" sinalizados como possivel duplicata no ADR-0002: nao sao
-- duplicata, sao dois recebimentos distintos de mesmo valor no mesmo dia.
update public.transactions set date='2026-03-15', due_date='2026-03-15', paid_date='2026-03-15'
where date='2026-03-16' and amount=110.00 and type='transferencia';

update public.transactions set date='2026-06-07', due_date='2026-06-07', paid_date='2026-06-07'
where date='2026-06-08' and amount=2500.00 and type='transferencia';

update public.transactions set date='2026-07-05', due_date='2026-07-05', paid_date='2026-07-05'
where date='2026-07-06' and amount=100.00 and type='transferencia';

-- ---------------------------------------------------------------------------
-- 3) "MUDANÇA DE PORTE" de R$ 450,00 em 22/07 nao existe no extrato do Inter.
--    O extrato do periodo esta completo, entao esse dinheiro nao saiu do Inter.
--    Vai para o Bradesco, a unica outra conta, preservando a despesa no DRE em
--    vez de apaga-la. O Bradesco nao tem extrato para conferir. PENDENTE DE
--    CONFIRMACAO: se a despesa nunca existiu, marcar como cancelada.
-- ---------------------------------------------------------------------------
update public.transactions
set account_id = (select id from public.accounts where bank like 'Bradesco%' limit 1),
    description = description || ' [movido para o Bradesco na conciliação: não consta no extrato do Inter de 01/03 a 31/07]'
where date='2026-07-22' and amount=450.00 and description='MUDANÇA DE PORTE';

-- ---------------------------------------------------------------------------
-- 4) Movimentos de CDB Credito do extrato, como transferencia entre contas
-- ---------------------------------------------------------------------------
with ref as (
  select
    (select id from public.accounts where bank='Inter' limit 1)            as cc,
    (select id from public.accounts where bank='Inter CDB Crédito' limit 1) as cdb
),
novos (data, valor, sentido) as (
  values
    ('2026-03-15'::date,  110.00, 'aplicacao'),
    ('2026-04-13'::date,  110.67, 'resgate'),
    ('2026-04-16'::date,  500.00, 'aplicacao'),
    ('2026-04-28'::date,  100.00, 'aplicacao'),
    ('2026-05-08'::date,  500.00, 'resgate'),
    ('2026-05-21'::date,  200.00, 'aplicacao'),
    ('2026-06-07'::date, 2610.00, 'aplicacao'),
    ('2026-06-07'::date,  200.35, 'resgate'),
    ('2026-06-07'::date,    1.75, 'resgate'),
    ('2026-06-07'::date,  100.90, 'resgate'),
    ('2026-06-11'::date,  100.00, 'aplicacao'),
    ('2026-06-12'::date,  600.00, 'aplicacao'),
    ('2026-06-15'::date,  100.00, 'aplicacao'),
    ('2026-06-19'::date, 1000.00, 'aplicacao'),
    ('2026-07-03'::date,  400.00, 'aplicacao'),
    ('2026-07-13'::date,  100.73, 'resgate'),
    ('2026-07-13'::date,    0.10, 'resgate'),
    ('2026-07-13'::date,  604.14, 'resgate'),
    ('2026-07-13'::date,  511.70, 'resgate'),
    ('2026-07-13'::date,  100.62, 'resgate'),
    ('2026-07-13'::date, 2631.47, 'resgate')
)
insert into public.transactions
  (description, amount, type, date, due_date, paid_date, account_id, transfer_account_id, status)
select
  case n.sentido when 'aplicacao' then 'Aplicação Cdb Credito Banco Inter S A'
                 else 'Resgate Cdb Credito Banco Inter S A' end,
  n.valor, 'transferencia', n.data, n.data, n.data,
  case n.sentido when 'aplicacao' then ref.cc else ref.cdb end,
  case n.sentido when 'aplicacao' then ref.cdb else ref.cc end,
  'pago'
from novos n cross join ref
where not exists (
  select 1 from public.transactions t
  where t.date = n.data and t.amount = n.valor and t.type = 'transferencia'
    and t.account_id = (case n.sentido when 'aplicacao' then ref.cc else ref.cdb end)
);

-- ---------------------------------------------------------------------------
-- 5) Saldos de abertura, agora com lastro documental
-- ---------------------------------------------------------------------------
-- Inter: o extrato prova R$ 0,00 em 01/03/2026 e nao ha lancamento anterior.
update public.accounts set balance = 0 where bank = 'Inter';

-- Inter CDB Credito: o principal real hoje e R$ 487,82 (bruto 496,47 - ganhos
-- 8,65, igual ao "Limite total" do cartao). Descontando os movimentos agora
-- registrados, sobra R$ 42,87 que ja estava aplicado antes de 01/03/2026.
update public.accounts set balance = 42.87 where bank = 'Inter CDB Crédito';

-- Bradesco: continua encerrado em zero. O plug de abertura e recalculado porque
-- a despesa de R$ 450,00 passou a pesar nesta conta.
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
    )
where bank like 'Bradesco%';

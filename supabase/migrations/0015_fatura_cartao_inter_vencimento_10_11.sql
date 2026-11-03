-- VX Capital Finance - Fatura do cartao Inter em aberto (vencimento 10/11/2026)
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar e executar
--
-- CONTEXTO
-- A posicao do CDB em 02/11/2026 mostra "Limite utilizado -R$ 296,94" no cartao
-- garantido pelo CDB Credito: e fatura em aberto, ou seja, dinheiro que a
-- empresa ja gastou e ainda vai pagar. Ficava de fora do sistema porque o
-- documento nao trazia o vencimento. Vencimento informado pelo titular: 10/11.
--
-- Entra como PENDENTE, nao como pago:
--   - nao altera o Saldo Atual (so lancamento pago conta no caixa);
--   - nao entra como despesa realizada no painel, que filtra por status;
--   - aparece na tela de Contas a Pagar, agrupado pelo vencimento, e nos
--     alertas de vencimento proximo.
--
-- Quando for paga, basta marcar como paga na tela de Contas a Pagar: o sistema
-- preenche a data de pagamento e o valor passa a abater o caixa.
--
-- NOTA: R$ 296,94 e o limite utilizado na posicao de 02/11/2026. Se a fatura
-- fechar com outro valor, ajustar antes de pagar.

insert into public.transactions
  (description, amount, type, date, due_date, paid_date, account_id, category_id, status)
select
  'Fatura cartão Inter (garantido pelo CDB Crédito) - limite utilizado em 02/11/2026',
  296.94,
  'despesa',
  '2026-11-10'::date,
  '2026-11-10'::date,
  null,
  (select id from public.accounts where bank = 'Inter' limit 1),
  (select id from public.categories where name = 'Outros - Saída' and type = 'despesa' limit 1),
  'pendente'
where not exists (
  select 1 from public.transactions t
  where t.amount = 296.94 and t.due_date = '2026-11-10'
);

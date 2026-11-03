-- VX Capital Finance - Devolucao de Pix de R$ 110,00 (15/03) como transferencia
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar e executar
--
-- CONTEXTO
-- O extrato do Bradesco de 24/02 a 25/04/2026 fechou a historia dos R$ 110,00
-- que estava em aberto no ADR-0002. A sequencia real foi:
--
--   1. Bradesco envia dois Pix de R$ 110,00 para o Inter (15/03);
--   2. um deles volta. O Inter registra "Pix recebido devolvido" -110,00 e o
--      Bradesco registra "DEVOLUCAO PIX" +110,00.
--
-- Os itens do passo 2 sao as DUAS PERNAS DA MESMA DEVOLUCAO - dinheiro saindo
-- do Inter e entrando no Bradesco -, mas estavam lancados como duas despesas
-- separadas: uma de R$ 110,00 no Inter (categorizada como "Software", inflando
-- essa categoria com um gasto que nunca existiu) e outra de -R$ 110,00 no
-- Bradesco, sem categoria. O efeito no caixa se cancelava, entao os saldos
-- estavam certos e o erro ficava invisivel - o mesmo padrao dos estornos.
--
-- Uma devolucao de transferencia e uma transferencia no sentido inverso. Vira
-- um unico lancamento Inter -> Bradesco, que e neutro no caixa consolidado e
-- fica fora do DRE. Nenhum saldo muda.
--
-- NOTA SOBRE A DATA: o Inter credita/debita em 15/03 e o Bradesco posta em
-- 16/03 (a propria descricao do Bradesco diz "15/03"). Um lancamento so tem uma
-- data, e a competencia e 15/03. A conciliacao tolera ate 2 dias de diferenca,
-- entao os dois extratos continuam batendo.

-- 1) A perna do Inter vira a transferencia completa
update public.transactions
set type = 'transferencia',
    transfer_account_id = (select id from public.accounts where bank like 'Bradesco%' limit 1),
    category_id = null,
    description = 'Devolução de Pix - retorno dos R$ 110,00 recebidos do Bradesco em 15/03 (Inter → Bradesco)'
where date = '2026-03-15'
  and amount = 110.00
  and type = 'despesa'
  and description like 'Pix recebido devolvido%';

-- 2) A perna do Bradesco deixa de valer sozinha: ja esta representada como
--    destino da transferencia acima. Fica cancelada em vez de apagada, para
--    preservar a trilha - lancamento cancelado nao entra em saldo nem no DRE.
update public.transactions
set status = 'cancelado',
    description = 'DEVOLUCAO PIX [cancelado na conciliação: é a perna do Bradesco da devolução de 15/03, agora lançada como transferência Inter → Bradesco]'
where date = '2026-03-16'
  and amount = -110.00
  and type = 'despesa'
  and description = 'DEVOLUCAO PIX';

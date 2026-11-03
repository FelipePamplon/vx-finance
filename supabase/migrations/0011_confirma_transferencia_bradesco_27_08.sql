-- VX Capital Finance - Confirma a transferencia Bradesco -> Inter de 27/08/2026
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar e executar
--
-- CONTEXTO
-- O ADR-0002 deixou em aberto o credito de R$ 4.393,54 de 27/08/2026. Ele estava
-- lancado como transferencia entre contas proprias, mas o extrato do Inter
-- descreve "Pix recebido - 64.341.655 Djalma Freitas Cardoso", nome de terceiro.
-- A duvida era se seria receita (e nao transferencia), o que mudaria o DRE de
-- agosto.
--
-- CONFIRMADO PELO USUARIO: foi transferencia do Bradesco para o Inter mesmo.
-- O que confundia e que a conta Bradesco e titulada pelo CNPJ 64.341.655
-- (Djalma Freitas Cardoso), entao um Pix saindo dela chega no extrato do Inter
-- com esse nome, e nao com o nome da VX Capital. O mesmo titular aparece na
-- fatura paga em 13/08 ("Pagamento Fatura - 64 341 655 DJALMA FREITAS CARDOSO").
--
-- Nenhum valor muda: a classificacao ja estava certa. O que muda e a descricao,
-- que passa a carregar essa explicacao para a proxima conciliacao nao levantar
-- a mesma duvida. De quebra corrige o typo "Tranferencia".

update public.transactions
set description = 'Transferência entre contas próprias Bradesco → Inter '
                  || '(no extrato do Inter aparece como "Pix recebido - 64.341.655 '
                  || 'Djalma Freitas Cardoso", titular da conta Bradesco; '
                  || 'confirmado pelo titular em 03/11/2026)'
where description = 'Tranferencia entre contas Bradesco > Inter'
  and amount = 4393.54
  and date = '2026-08-27';

# ADR-0002: Conciliação do extrato Inter e correção do saldo consolidado

**Status:** Aceito
**Data:** 2026-11-02
**Decisores:** Felipe Pamplona (admin)

## Contexto

O painel exibia **Saldo Atual de R$ 74.530,70** enquanto a conta corrente do
Inter (ag. 0001-9 / c/c 52120527-1) fechava o extrato oficial de 05/08/2026 a
02/11/2026 em **R$ 6.885,94**. O usuário relatou que o valor parecia "acima do
que deveria ter de dinheiro".

O extrato foi validado antes de qualquer alteração: as 43 linhas formam uma
cadeia de saldo íntegra (cada `saldo` = saldo anterior + `valor`), o que permite
derivar o saldo de abertura de 05/08/2026 em **R$ 1.305,40** e usar o documento
como fonte de verdade.

Conciliando linha a linha, a divergência de R$ 67.644,76 se decompôs em:

1. **26 lançamentos do extrato nunca registrados** (13/08 a 27/10/2026). As
   maiores *saídas* do período estavam entre eles — distribuições aos sócios
   (R$ 61.000,00 somados), Receita Federal de R$ 4.084,30, aplicações no CDB —
   enquanto as *entradas* estavam lançadas. O saldo inflava por assimetria.
2. **Aplicações e resgates de CDB tratadas como receita/despesa.** Aplicar no
   CDB não gasta dinheiro: move entre contas próprias.
3. **R$ 698,77 de divergência anterior ao extrato** (sistema marcava R$ 2.004,17
   em 04/08/2026 contra R$ 1.305,40 reais). Causa identificada, não arbitrária:
   os resgates de "Cdb Credito" de 13/08 (R$ 202,06 + R$ 496,71 = R$ 698,77)
   provam que esse valor estava aplicado no CDB antes de 05/08, mas as aplicações
   correspondentes nunca foram registradas — o dinheiro aparecia na conta
   corrente quando na verdade estava no CDB.
4. **Recebimento da Finconsult de R$ 68.071,84 em duplicidade:** uma previsão
   `pendente` de 26/07 no Bradesco e o crédito real de 03/09 no Inter.

Três defeitos de código deixaram tudo isso passar sem alarme — tratados junto,
porque corrigir só os dados garante que a divergência volte:

- **A conciliação bancária não lia o extrato do Inter.** `detectDelimiter`
  adivinhava o separador pela primeira linha do arquivo, que no export do Inter
  é o título `" Extrato Conta Corrente "`, sem separador nenhum. O palpite caía
  em `,` e as 43 linhas eram descartadas: a tela acusava "nenhuma linha
  reconhecida". A única ferramenta capaz de detectar o problema estava cega.
- **A conciliação comparava o extrato de uma conta contra lançamentos de todas.**
  Um valor igual em outro banco aparecia como "conciliado", e o sinal de
  transferência saía errado (a conta de destino de um resgate recebe crédito,
  não débito).
- **Painel e relatórios contavam dinheiro que não se moveu.** A previsão
  `pendente` de R$ 68.071,84 entrava como receita de julho; lançamento
  `cancelado` somava no DRE.

## Decisão

### 1. O extrato é a fonte de verdade; os 26 lançamentos faltantes foram inseridos

Migration `0008_conciliacao_extrato_inter.sql`, com `NOT EXISTS` em cada insert
(rodar de novo não duplica).

### 2. CDB como conta própria, movimentado por transferência

Aplicação = transferência `Inter -> Inter CDB`; resgate = o inverso. Neutra no
caixa consolidado e fora do DRE, conforme ADR-0001.

### 3. Os R$ 698,77 foram reconstituídos como aplicação, não como ajuste

Lançados em 04/08/2026 (último dia antes do extrato; a data exata não consta no
documento) como aplicação no CDB.

**Alternativa considerada:** jogar os R$ 698,77 num lançamento de "ajuste de
conciliação". Rejeitada: seria uma despesa fictícia no DRE para um valor que tem
contrapartida documentada. O dinheiro não foi perdido — estava no CDB, e o
extrato prova isso ao resgatá-lo em 13/08.

### 4. Bradesco encerrado via saldo inicial, não via despesa fictícia

Conta renomeada para `Bradesco (encerrada)` e o resíduo de R$ 1.978,51 absorvido
no campo `balance` (exibido como "Saldo inicial" na tela de Contas), zerando a
conta.

**Alternativa considerada:** lançar uma despesa de R$ 1.978,51. Rejeitada: não
houve despesa, e inventar uma distorce o resultado do mês. `balance` já é, por
definição, o saldo de abertura antes do primeiro lançamento registrado — é o
lugar correto para o histórico que não tem extrato para conferir.

**Limitação assumida:** o histórico do Bradesco (fev–ago/2026) não foi conferido
contra extrato porque não há documento. O saldo final está correto (zero,
confirmado pelo usuário), mas os R$ 1.978,51 não foram atribuídos a lançamentos
específicos.

### 5. Duplicidade cancelada, não excluída

A previsão de 26/07 virou `cancelado` com nota na descrição, preservando a
trilha. Isso só é seguro porque `cancelado` passou a ser excluído dos cálculos.

### 6. Painel e relatórios contam apenas dinheiro que se moveu

Painel usa `status = 'pago'` para entradas, saídas, gráfico de 12 meses e quebra
por categoria. Relatórios e DRE excluem `cancelado`.

### 7. Conciliação bancária passa a pedir a conta do extrato

Campo obrigatório na tela, `accountId` em `reconcile()`: filtra os candidatos à
conta certa, ignora cancelados e usa `signedAmountForAccount` para acertar o
sinal das transferências. Separador do CSV detectado pelo arquivo inteiro, pelo
critério de "quantas linhas produzem data + valor reconhecíveis", e coluna
numérica (Saldo) não entra mais no texto da descrição.

## Consequências

Conferido contra o extrato, com script de verificação independente:

| Conta | Saldo |
|---|---|
| Inter (corrente) | R$ 6.885,94 — **igual ao extrato** |
| Inter CDB | R$ 61.286,15 |
| Bradesco (encerrada) | R$ 0,00 |
| **Total consolidado** | **R$ 68.172,09** |

Os 25 dias com movimento fecham com o saldo do extrato, um a um, e as 43 linhas
conciliam 43/43 na tela de Conciliação Bancária.

O Saldo Atual deixa de ser R$ 74.530,70 e passa a R$ 68.172,09 — a conta
corrente bate com o banco, e a diferença em relação aos R$ 6.885,94 do extrato é
exatamente o que está aplicado no CDB, que o extrato da conta corrente não
mostra.

### Pendências conhecidas

1. **Saldo do CDB a confirmar.** R$ 61.286,15 é o que o extrato da conta corrente
   comprova ter sido aplicado e não resgatado; não inclui rendimento acumulado,
   que não aparece nesse documento. O extrato do CDB fecha o número.
2. **Pix recebido de R$ 4.393,54 em 27/08** está classificado como transferência
   do Bradesco, mas o extrato descreve "Pix recebido - 64.341.655 Djalma Freitas
   Cardoso", ou seja, CNPJ de terceiro. Não foi reclassificado por decisão
   deliberada: mudar para receita infla o resultado de agosto com base em
   inferência, e o saldo final é o mesmo das duas formas. Precisa do extrato do
   Bradesco.
3. **Possíveis duplicatas em mar–jul/2026** (sete pares idênticos de data, valor
   e descrição, R$ 28,30 líquidos no Inter). Não foram removidas: corridas de
   aplicativo repetidas no mesmo dia são plausíveis, e sem extrato do período não
   há como distinguir. Removê-las *aumentaria* o saldo, então não explicam a
   divergência original.
4. **Histórico anterior a 05/08/2026 não conferido** por falta de extratos.

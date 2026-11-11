# ADR-0003: Auditoria do sistema e reconstrução da camada de gestão

**Status:** Aceito — migration 0017 aplicada em 10/11/2026
**Data:** 2026-11-10
**Decisores:** Felipe Pamplona (admin)

## Contexto

Depois da conciliação (ADR-0002) o caixa passou a bater com o banco, mas o
diagnóstico de gestão mostrou que o sistema "registra bem e analisa mal". O
pedido foi auditar todas as inconsistências e construir o melhor sistema
possível com o que há (Next.js + Supabase).

A auditoria olhou três coisas: os dados, o código e o que o sistema deixa
acontecer sem avisar.

## O que a auditoria encontrou

### Nos dados

1. **Conta Inter negativa em −R$ 7.114,06.** Um pagamento de R$ 14.000,00 em
   04/11 foi lançado sem a entrada que o cobriu (o padrão do extrato é resgate
   de CDB no mesmo valor). Banco não deixa conta sem limite negativa: é
   lançamento faltando. **Não foi corrigido** — depende do extrato de novembro.
2. **Posição Fiscal atribuía o DAS ao mês do pagamento.** O DAS de setembro,
   pago em 19/10, caía em outubro: setembro aparecia com R$ 4.084,30 "a
   provisionar" e outubro com imposto em dobro. Erro introduzido no ADR-0002
   item 2, em produção desde 03/11.
3. **A empresa foi MEI até agosto.** Sete pagamentos mensais de R$ 86,05 são
   DAS-MEI (5% do salário mínimo de R$ 1.621 + R$ 5 de ISS). Os R$ 81.000,00 de
   fevereiro foram faturados como MEI — exatamente o limite anual — e o PGDAS-D
   de 09/2026 declara as receitas anteriores como zero. O motor fiscal tratava
   tudo como Simples e cobrava 6% sobre fevereiro.
4. Rendimento da aplicação do Bradesco (60 lançamentos) dentro da receita
   operacional e da base do Simples; 2 estornos ainda como receita; 41
   lançamentos sem categoria (R$ 22.655,40).

### No código

5. **Limite silencioso de 1.000 linhas.** Toda consulta de lista era uma
   chamada só ao PostgREST, que corta em 1.000 sem avisar. Saldo, DRE e
   relatórios eram somados no navegador em cima dessa lista: ao passar de 1.000
   lançamentos (a base tem 585 em nove meses) os números ficariam errados sem
   erro nenhum na tela.
6. **"Hoje" em UTC.** `new Date().toISOString().slice(0, 10)` em 15 lugares. Em
   Belém, das 21h em diante "hoje" já era amanhã: conta vencida três horas
   antes, pagamento com a data do dia seguinte e painel virando o mês na noite
   do último dia.
7. **Painel e DRE respondiam diferente à mesma pergunta.** O DRE já tratava
   distribuição abaixo do resultado; o painel ainda somava como despesa, então
   "burn rate" e "runway" desabavam em mês de retirada de sócio.
8. **Projeção por média.** O gráfico projetava a média dos últimos três meses —
   para recebimentos grandes e esparsos, uma receita mensal que não existe.
9. **Nenhuma regra no banco.** Categoria de receita em despesa, lançamento
   cancelado com data de pagamento, valor zero: o banco aceitava tudo. Os erros
   corrigidos nas migrations 0008–0016 eram todos estados que ele devia recusar.
10. Só o Fluxo de Caixa exportava (o DRE não); filtro só por tipo; conciliação
    apontava a falta mas não lançava; sem vínculo de sócio no formulário; sem
    recorrência; sem histórico de alteração; 15 cópias de `formatCurrency`.

## Decisão

### 1. Uma regra, um lugar

`lib/analytics.ts` concentra DRE, DRE mensal, margem por projeto, conta
corrente de sócios, concentração de clientes, extrato, posição e projeção de
caixa. `lib/fiscal.ts` concentra a apuração do Simples. Painel, relatórios e
Saúde dos Dados só exibem. É a mesma doutrina de `lib/finance.ts` (ADR-0001),
estendida do sinal para a análise.

### 2. Saldo calculado no banco, listas paginadas

Visão `v_account_balances` (`security_invoker`, respeita RLS) é a fonte do
saldo. `fetchAllRows` pagina toda lista com ordenação estável. O código tem
reserva em `lib/balances.ts`: se a visão não existir, calcula a mesma fórmula
dos lançamentos paginados — o sistema não depende da ordem migration/deploy.

### 3. Integridade no banco

Gatilho `transactions_guard`: recusa categoria de tipo diferente do lançamento;
zera categoria de transferência; mantém `paid_date` coerente com o status.
`CHECK`: valor nunca zero, negativo só em despesa (estorno). Gatilho em
`categories` impede trocar o tipo de categoria em uso.

**Alternativa considerada:** `CHECK (status = 'pago') = (paid_date is not null)`.
Rejeitada: recusar o salvamento por um detalhe que o banco sabe consertar
sozinho só gera erro na tela. O gatilho normaliza; o que não tem conserto
(categoria errada) é que levanta erro.

### 4. Trilha de auditoria

Tabela `audit_log` gravada por gatilho (`security definer`) em transactions,
accounts, categories, partners e projects: quem, quando, antes e depois. Sem
policy de escrita — ninguém edita o histórico pela API. O formulário de
lançamento mostra o histórico.

### 5. Fiscal: competência e dois regimes

- Imposto entra pela **competência** (`date`), com o pagamento em `paid_date`.
  Os DAS existentes foram reposicionados; a conciliação já sugere a competência
  certa ao lançar um DAS do extrato.
- O alerta usa o **acumulado** (devido − lançado), que não depende de em que mês
  cada pagamento foi registrado.
- `COMPANY.simples.apuracaoDesde = "2026-09"`: antes disso o mês é MEI — imposto
  fixo, receita fora da RBT12, como no PGDAS-D.

**Ponto levado à contabilidade, não decidido aqui:** a receita de 2026
(R$ 212.724,50) supera o limite do MEI (R$ 81.000) em mais de 20%. A regra geral
nessa situação é desenquadramento retroativo a janeiro, com imposto sobre a
receita do período MEI. O sistema mostra o alerta; não lança nada.

### 6. Projeção de caixa por compromissos

Saldo em conta + contas a pagar/receber na data de vencimento (vencidos contam
como hoje). Diz se o dinheiro em conta cobre e, se não, quanto resgatar da
reserva e até quando. Substitui a projeção por média.

### 7. Saúde dos Dados

Catorze conferências rodando sempre (`lib/health.ts`): conta negativa, vencidos,
Simples não lançado, limite do MEI, sem categoria, retirada sem sócio,
participação ≠ 100%, conta sem movimento há dias, pago com data futura, receita
sem cliente, custo sem projeto, concentração de receita, duplicatas e despesa
relevante sem comprovante. Apontam, não corrigem.

### 8. Operação do dia a dia

Filtro único (busca, período, conta, categoria, camada do DRE, cliente,
projeto, sócio, valor) no Fluxo de Caixa e nos Relatórios; edição em massa de
categoria/projeto/cliente; parcelamento e recorrência; sócio obrigatório em
distribuição; aviso quando o lançamento deixa a conta negativa; conciliação que
lança a linha faltante com categoria sugerida pelo histórico e reconhece
aplicação/resgate como transferência; exportação CSV/Excel/PDF em todos os
relatórios.

### 9. Telas de caixa usam a data de caixa (adendo de 11/11/2026)

Ao mover o imposto para a competência (item 5), o Fluxo de Caixa continuou
listando e filtrando por `date`. Resultado: o DAS de outubro, pago em 10/11,
saía da conta certa (o saldo fechava) mas aparecia na lista em 31/10 — fora de
novembro e longe do resgate de CDB feito no mesmo dia para cobri-lo. Para quem
olha a tela, o pagamento "não entrou na conta".

`cashDate` (`lib/finance.ts`): pago → data do pagamento; em aberto → vencimento.
O Fluxo de Caixa (tela e relatório), o período do filtro nessas telas e as
"Últimas movimentações" do painel passam a usar essa data; a linha mostra a
competência quando ela cai em outro mês. DRE, Posição Fiscal, projetos, clientes
e sócios seguem na competência. O Extrato por conta já usava a data do pagamento.

## Consequências

Relatórios: Fluxo, DRE, DRE mensal, Posição Fiscal, Projetos, Clientes, Sócios,
Extrato por conta. Suíte `npm test` com 56 verificações do motor (datas, DRE,
sócios, projetos, projeção, saúde, fiscal, filtros, conciliação), sem
dependência nova.

Depois de aplicada a migration 0017: saldos inalterados, os quatro extratos do
ADR-0002 seguem conciliando (307, 43, 84 e 24 lançamentos, pela data de
pagamento), e o gatilho recusou em teste uma categoria de receita num lançamento
de despesa. Sem categoria caiu de 41 para 37 lançamentos.

**Não verificado:** as telas não foram exercitadas num navegador autenticado —
a verificação foi por typecheck, build de produção e suíte do motor.

### Pendências

1. **Conta Inter negativa:** conciliar novembro (o resgate de 04/11).
2. **Participação de cada sócio** (hoje 0%): sem ela a conta corrente de sócios
   não calcula o direito de cada um.
3. **Vincular lançamentos a projetos** e classificar os sem categoria — as
   ferramentas (filtro + edição em massa) estão prontas; a decisão de qual
   projeto é do financeiro.
4. **Limite do MEI:** confirmar com a contabilidade.
5. Bradesco de 26/04 a 09/07 segue sem extrato (ADR-0002).

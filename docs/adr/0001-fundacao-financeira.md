# ADR-0001: Fundação financeira (vencimento, transferência, autoria e RLS por papel)

**Status:** Aceito
**Data:** 2026-08-15
**Decisores:** Felipe Pamplona (admin)

## Contexto

Auditoria do banco de produção revelou quatro problemas estruturais:

1. `transactions` só tinha o campo `date`, acumulando três papéis distintos
   (competência, vencimento e pagamento). `lib/alerts.ts` usava `date < hoje`
   como "vencida", marcando como atrasado o que ainda estava no prazo. Não havia
   como responder "o que vence essa semana?".
2. `type` só aceitava `receita`/`despesa`. Mover dinheiro entre contas próprias
   virava despesa + receita, inflando ambas e distorcendo o DRE.
3. 176 de 176 lançamentos com `created_by` nulo — sem trilha de autoria.
4. RLS era `for all using (auth.role() = 'authenticated')`: um usuário marcado
   como "leitura" na tela de Usuários podia apagar todos os lançamentos. Os
   papéis eram puramente decorativos.

## Decisão

### 1. Três datas em vez de uma

`date` (competência) · `due_date` (vencimento) · `paid_date` (pagamento).

**Alternativa considerada:** tabela separada de parcelas/vencimentos. Rejeitada:
adiciona um join a todas as telas para resolver um problema que três colunas
resolvem, num sistema de um dígito de usuários.

Backfill preservou a semântica anterior exatamente (`due_date = date` para todos,
`paid_date = date` para os pagos), então nenhum número existente mudou.

### 2. Transferência como terceiro tipo, não como par de lançamentos

Um único registro com `type = 'transferencia'`, `account_id` (origem) e
`transfer_account_id` (destino).

**Alternativa considerada:** dois registros espelhados ligados por
`transfer_group_id`. Rejeitada: dobra as linhas, e toda tela precisaria
deduplicar para não contar o mesmo dinheiro duas vezes.

**Custo aceito:** todo `type === 'receita' ? +v : -v` espalhado pelas telas
passou a estar errado. Por isso a regra foi centralizada em `lib/finance.ts`
(`signedAmountTotal`, `signedAmountForAccount`, `signedAmountOnStatement`) — se
ficasse duplicada, uma tela esqueceria e o bug voltaria silenciosamente.

Integridade garantida por CHECK constraint (origem ≠ destino; `transfer_account_id`
proibido fora de transferência). As condições são explícitas porque CHECK passa
quando avalia NULL.

### 3. `created_by` gravado no cliente

Injetado no `insert` do `create-crud-hooks` a partir de `auth.getUser()`.

**Alternativa considerada:** `default auth.uid()` na coluna, no banco. Seria mais
robusto (não dá para o cliente mentir) e vale migrar para isso depois; ficou de
fora agora para não alterar o schema das 9 tabelas num release já grande.

### 4. RLS por papel, com funções SECURITY DEFINER

`admin`/`financeiro` escrevem; `socio`/`leitura` só leem. Policies separadas por
comando (select/insert/update/delete) em vez de uma policy `for all`.

`is_admin()` e `can_write()` são SECURITY DEFINER de propósito: elas leem
`profiles` ignorando o RLS da própria tabela, o que evita recursão infinita
quando uma policy de `profiles` chama `is_admin()`.

Trigger `prevent_role_escalation` fecha o buraco óbvio: sem ela, a policy de
update permitiria que um usuário "leitura" editasse o próprio perfil e se
promovesse a admin.

## Consequências

**Fica mais fácil:** responder o que vence quando; ver saldo real por conta;
saber quem lançou o quê; dar acesso a sócio sem risco de perda de dados.

**Fica mais difícil:** todo código novo que soma valores precisa usar
`lib/finance.ts` em vez de fazer a conta na mão.

**A revisitar:**
- Mover `created_by` para `default auth.uid()` no banco.
- Lançamentos recorrentes e parcelamento (hoje digitados um a um).
- Custo/rentabilidade por projeto — 175 de 176 lançamentos ainda sem `project_id`.
- Orçamento aprovado gerando conta a receber automaticamente.

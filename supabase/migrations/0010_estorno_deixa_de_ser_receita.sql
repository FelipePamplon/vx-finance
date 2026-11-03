-- VX Capital Finance - Estorno deixa de ser receita
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar e executar
--
-- CONTEXTO
-- 35 estornos (R$ 3.500,00) estavam lancados como receita. Um estorno nao e
-- receita: e despesa que voltou. Lancado como entrada, ele inflava as DUAS
-- linhas do DRE ao mesmo tempo - Receita Bruta subia R$ 3.500,00 e as Despesas
-- continuavam com o gasto original cheio. O Resultado Liquido fechava certo
-- apenas porque os dois erros se cancelavam, mascarando o problema: a receita
-- da empresa aparecia maior do que e, e o custo de Transporte maior do que e.
--
-- Pior: a maioria estava sem categoria, entao o DRE ganhava uma linha de
-- receita "Sem categoria" que nao corresponde a nada.
--
-- DECISAO
-- Estorno vira DESPESA com valor NEGATIVO, na mesma categoria do gasto que ele
-- reverte. Assim a categoria mostra o custo liquido (Transporte = corridas
-- menos corridas estornadas) e a receita volta a ser so dinheiro de cliente.
-- A matematica de lib/finance.ts ja trata valor negativo sem caso especial:
-- despesa de -13,50 entra no caixa como +13,50, entao nenhum saldo muda.
--
-- Alternativa considerada: cancelar o par (gasto + estorno). Rejeitada porque
-- as duas linhas existem no extrato e precisam continuar conciliando.
--
-- A categoria vem do gasto original, pareado por mesmo valor, mesma conta e
-- data ate 45 dias antes. Pareou 34 dos 35; o que sobrou fica sem categoria
-- (ver nota no fim).

with estornos as (
  select t.id, t.amount, t.date, t.account_id
  from public.transactions t
  where t.type = 'receita'
    and t.amount > 0
    and (t.description ilike '%estorno%' or t.description ilike '%devolu%')
),
pareado as (
  select e.id, original.category_id as categoria_do_gasto
  from estornos e
  left join lateral (
    select o.category_id
    from public.transactions o
    where o.type = 'despesa'
      and o.amount = e.amount
      and o.amount > 0
      and o.account_id is not distinct from e.account_id
      and o.date <= e.date
      and o.date >= e.date - interval '45 days'
    order by o.date desc
    limit 1
  ) original on true
)
update public.transactions t
set type = 'despesa',
    amount = -t.amount,
    -- A categoria antiga era de receita; numa despesa ela nao faz sentido.
    category_id = p.categoria_do_gasto
from pareado p
where t.id = p.id;

-- Idempotente: depois de rodar, nenhum desses lancamentos satisfaz mais
-- "type = 'receita' and amount > 0", entao rodar de novo nao faz nada.

-- NOTA: o estorno de R$ 110,00 de 16/03/2026 no Bradesco nao encontrou gasto
-- correspondente na mesma conta e ficou sem categoria. O Bradesco nao tem
-- extrato para conferir e esta encerrado; fica registrado para revisao.

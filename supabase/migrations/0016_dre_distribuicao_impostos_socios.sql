-- VX Capital Finance - DRE em camadas: impostos e distribuicao saem do operacional
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar e executar
--
-- CONTEXTO
-- O DRE somava tudo que e despesa numa linha so, e com isso duas coisas que nao
-- sao custo da operacao entravam no resultado:
--
--   1) DISTRIBUICAO DE LUCROS - R$ 61.000,00 em 2026, 42% das "despesas".
--      Distribuicao nao e custo: e destino do lucro. Lancada como despesa, ela
--      fazia a empresa parecer quase metade do que e. Com a separacao:
--          Resultado operacional   R$ 129.124,32   (era R$ 68.124,32)
--          (-) Distribuicao        R$  61.000,00
--          = Lucro retido          R$  68.124,32
--      O caixa nao muda: distribuicao continua saindo do banco.
--
--   2) IMPOSTO SOBRE FATURAMENTO (DAS) - deducao da receita bruta, nao despesa
--      operacional. Separado, da para ver a receita liquida de verdade.
--
-- Em vez de criar um tipo novo de lancamento, a classificacao vai na CATEGORIA,
-- via `dre_section`. Motivo: o `type` governa a matematica do caixa (ADR-0001) e
-- essas duas continuam sendo saida de dinheiro como qualquer despesa - o que
-- muda e so onde aparecem no DRE. Assim nenhuma conta de saldo e afetada.
--
-- Tambem corrige: Yandra Franca Chagas e PRESTADORA DE SERVICO, nao socia
-- (informado pelo titular). Os R$ 6.000,00 dela saem de distribuicao e viram
-- custo operacional.

-- ---------------------------------------------------------------------------
-- 1) Como cada categoria entra no DRE
-- ---------------------------------------------------------------------------
alter table public.categories
  add column if not exists dre_section text not null default 'operacional';

alter table public.categories drop constraint if exists categories_dre_section_check;
alter table public.categories add constraint categories_dre_section_check
  check (dre_section in ('operacional', 'imposto', 'financeira', 'distribuicao'));

comment on column public.categories.dre_section is
  'Onde a categoria entra no DRE: operacional (receita/custo do negocio), '
  'imposto (tributo sobre faturamento, deduz da receita bruta), '
  'financeira (rendimento e IR/IOF de aplicacao: resultado financeiro, fora da '
  'operacao e FORA DA BASE DO SIMPLES) ou '
  'distribuicao (lucro distribuido aos socios, abaixo do resultado). '
  'Nao afeta saldo de conta - so a apresentacao do resultado.';

-- ---------------------------------------------------------------------------
-- 2) Categorias novas
-- ---------------------------------------------------------------------------
insert into public.categories (name, color, type, dre_section)
select v.name, v.color, v.type, v.secao from (values
  ('Simples Nacional (DAS)', '#EF4444', 'despesa', 'imposto'),
  ('Prestadores de Serviço',  '#EF4444', 'despesa', 'operacional')
) as v(name, color, type, secao)
where not exists (
  select 1 from public.categories c where c.name = v.name and c.type = v.type
);

-- Distribuicao aos socios sai do operacional
update public.categories set dre_section = 'distribuicao'
where name = 'Sócios / Distribuição' and type = 'despesa';

-- ---------------------------------------------------------------------------
-- 3) Yandra e prestadora de servico, nao socia
-- ---------------------------------------------------------------------------
update public.transactions
set category_id = (select id from public.categories
                   where name = 'Prestadores de Serviço' and type = 'despesa' limit 1)
where category_id = (select id from public.categories
                     where name = 'Sócios / Distribuição' and type = 'despesa' limit 1)
  and description ilike '%yandra%';

-- ---------------------------------------------------------------------------
-- 4) DAS vai para a categoria de imposto (hoje esta misturado em "Taxas" com
--    JUCEPA, SEFA e convenios, que sao despesa operacional de verdade)
-- ---------------------------------------------------------------------------
update public.transactions
set category_id = (select id from public.categories
                   where name = 'Simples Nacional (DAS)' and type = 'despesa' limit 1)
where type = 'despesa'
  and (description ilike '%simples nacional%' or description ilike '%receita federal%');

-- ---------------------------------------------------------------------------
-- 5) Socios. Participacao fica em 0 ate o titular informar - o sistema nao deve
--    inventar quadro societario. Com a participacao preenchida, da para comparar
--    o que cada um retirou contra o que lhe cabe.
-- ---------------------------------------------------------------------------
insert into public.partners (name, share)
select v.name, 0 from (values ('Djalma Freitas Cardoso'), ('Gleydson Pacheco Sousa'),
                              ('Felipe Caldas Pamplona')) as v(name)
where not exists (select 1 from public.partners p where p.name = v.name);

-- Liga cada retirada ao socio, para a conta corrente de socios funcionar
update public.transactions t set partner_id = p.id
from public.partners p
where t.category_id = (select id from public.categories
                       where name = 'Sócios / Distribuição' and type = 'despesa' limit 1)
  and t.partner_id is null
  and t.description ilike '%' || split_part(p.name, ' ', 1) || '%';

-- ---------------------------------------------------------------------------
-- 6) DAS de outubro, a vencer em 20/11/2026
--    Base: PGDAS-D de 09/2026 (CNPJ 64.341.655/0001-06, VX CAPITAL LTDA),
--    Anexo III, aliquota efetiva de 6,0000% - R$ 4.084,30 sobre R$ 68.071,84.
--    A RBT12 proporcionalizada para outubro (R$ 90.762,45) segue na 1a faixa,
--    entao a aliquota continua 6,00%: 63.652,66 x 6% = R$ 3.819,17.
--    Valor ESTIMADO: conferir com a contadora antes de pagar.
-- ---------------------------------------------------------------------------
insert into public.transactions
  (description, amount, type, date, due_date, paid_date, account_id, category_id, status)
select
  'DAS Simples Nacional - competência 10/2026 (estimado: 6,00% sobre R$ 63.652,66)',
  3819.17, 'despesa', '2026-10-31'::date, '2026-11-20'::date, null,
  (select id from public.accounts where bank = 'Inter' limit 1),
  (select id from public.categories where name = 'Simples Nacional (DAS)' and type = 'despesa' limit 1),
  'pendente'
where not exists (
  select 1 from public.transactions t where t.due_date = '2026-11-20' and t.amount = 3819.17
);

-- ---------------------------------------------------------------------------
-- 7) Resultado financeiro fora da operacao.
--    Rendimento de CDB nao e receita de atividade: nao entra na base do Simples
--    (so o IRRF na fonte, ja retido). Somado a receita bruta, inflaria o DAS.
-- ---------------------------------------------------------------------------
update public.categories set dre_section = 'financeira'
where name in ('Rendimento de aplicações', 'IR/IOF sobre aplicações');

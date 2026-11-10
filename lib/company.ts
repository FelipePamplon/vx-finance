/**
 * Dados da empresa usados em calculo. Ficavam embutidos nas telas (o inicio de
 * atividade estava escrito a mao dentro da pagina de relatorios).
 * Fonte: PGDAS-D de 09/2026.
 */
export const COMPANY = {
  name: "VX CAPITAL LTDA",
  cnpj: "64.341.655/0001-06",
  /** Abertura no CNPJ em 08/01/2026: liga a RBT12 proporcionalizada. */
  inicioAtividade: "2026-01",
  simples: {
    anexo: "III" as const,
    diaVencimentoDas: 20,
    /**
     * Primeira competencia com PGDAS-D. De janeiro a agosto de 2026 a empresa
     * recolheu DAS-MEI (R$ 86,05 fixos por mes); o PGDAS-D de 09/2026 declara
     * as receitas anteriores como zero.
     */
    apuracaoDesde: "2026-09",
  },
  /** Limite anual de faturamento do MEI. Conferir se a lei mudar. */
  mei: { limiteAnual: 81_000, toleranciaPct: 20 },
} as const;

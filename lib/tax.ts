/**
 * Simples Nacional - Anexo III (prestacao de servicos nao sujeita ao fator "r").
 *
 * Conferido contra o PGDAS-D de 09/2026 da VX CAPITAL LTDA (CNPJ
 * 64.341.655/0001-06): receita de R$ 68.071,84, DAS de R$ 4.084,30, aliquota
 * efetiva de 6,0000% - exatamente a 1a faixa. A composicao declarada tambem
 * bate com os percentuais de reparticao desta tabela.
 *
 * A aliquota NAO e fixa: ela sobe conforme a receita dos ultimos 12 meses
 * (RBT12). Este modulo calcula a aliquota efetiva do mes a partir do proprio
 * historico de faturamento do sistema, para que a provisao acompanhe o
 * crescimento da empresa em vez de ficar congelada nos 6%.
 *
 * LIMITE DO MODELO: e uma estimativa para planejamento de caixa, nao
 * substitui a apuracao da contabilidade. Nao trata retencao de ISS na fonte,
 * segregacao por anexo, sublimite estadual nem receitas no exterior.
 */

export interface FaixaSimples {
  /** Teto de RBT12 da faixa, em reais. */
  ate: number;
  /** Aliquota nominal da faixa. */
  nominal: number;
  /** Parcela a deduzir, em reais. */
  deducao: number;
}

/** Anexo III - Lei Complementar 123/2006, Anexo III. */
export const ANEXO_III: FaixaSimples[] = [
  { ate: 180_000, nominal: 0.06, deducao: 0 },
  { ate: 360_000, nominal: 0.112, deducao: 9_360 },
  { ate: 720_000, nominal: 0.132, deducao: 17_640 },
  { ate: 1_800_000, nominal: 0.16, deducao: 35_640 },
  { ate: 3_600_000, nominal: 0.21, deducao: 125_640 },
  { ate: 4_800_000, nominal: 0.33, deducao: 648_000 },
];

/**
 * Reparticao do DAS por tributo no Anexo III, faixas 1 a 5 (a faixa 6 reparte
 * diferente e nao recolhe ISS no DAS - fora do alcance deste modulo).
 * Conferida contra o PGDAS-D de 09/2026, tributo a tributo.
 */
export const REPARTICAO_ANEXO_III = [
  { tributo: "INSS/CPP", percentual: 0.434 },
  { tributo: "ISS", percentual: 0.335 },
  { tributo: "COFINS", percentual: 0.1282 },
  { tributo: "IRPJ", percentual: 0.04 },
  { tributo: "CSLL", percentual: 0.035 },
  { tributo: "PIS/Pasep", percentual: 0.0278 },
] as const;

export interface TributoDas {
  tributo: string;
  valor: number;
}

/**
 * Abre o DAS por tributo e devolve tambem o total.
 *
 * O total sai da SOMA DAS PARTES ARREDONDADAS, nao do produto direto: e assim
 * que o PGDAS apura. Em 09/2026, 68.071,84 x 6% da 4.084,3104, que arredondado
 * seria 4.084,31 - mas o declarado e 4.084,30, exatamente a soma dos seis
 * tributos arredondados. Sem reproduzir isso, a provisao erra centavos todo mes
 * e nunca fecha com a guia.
 */
export function detalharDas(
  base: number,
  aliquota: number
): { tributos: TributoDas[]; total: number } {
  const bruto = base * aliquota;
  const tributos = REPARTICAO_ANEXO_III.map(({ tributo, percentual }) => ({
    tributo,
    valor: round2(bruto * percentual),
  }));
  return { tributos, total: round2(tributos.reduce((s, t) => s + t.valor, 0)) };
}

export interface AliquotaCalculada {
  faixa: number;
  nominal: number;
  deducao: number;
  /** Aliquota efetiva aplicada sobre a receita do mes. */
  efetiva: number;
  rbt12: number;
}

/**
 * Aliquota efetiva = (RBT12 x nominal - deducao) / RBT12.
 *
 * Com RBT12 zerada (primeiro mes de faturamento) nao ha o que dividir: vale a
 * nominal da 1a faixa, que e como o PGDAS de 09/2026 apurou os 6%.
 */
export function aliquotaEfetiva(rbt12: number): AliquotaCalculada {
  const indice = ANEXO_III.findIndex((f) => rbt12 <= f.ate);
  const i = indice === -1 ? ANEXO_III.length - 1 : indice;
  const faixa = ANEXO_III[i];

  const efetiva =
    rbt12 <= 0 ? faixa.nominal : (rbt12 * faixa.nominal - faixa.deducao) / rbt12;

  return {
    faixa: i + 1,
    nominal: faixa.nominal,
    deducao: faixa.deducao,
    efetiva,
    rbt12,
  };
}

/** Faturamento de um mes, chave "YYYY-MM". */
export type FaturamentoPorMes = Record<string, number>;

function mesesAntes(mes: string, quantidade: number): string[] {
  const [ano, m] = mes.split("-").map(Number);
  const saida: string[] = [];
  for (let i = 1; i <= quantidade; i++) {
    const d = new Date(ano, m - 1 - i, 1);
    saida.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`);
  }
  return saida;
}

/**
 * RBT12 do mes: soma do faturamento dos 12 meses anteriores.
 *
 * No primeiro ano de atividade a RBT12 e PROPORCIONALIZADA - media dos meses
 * ja decorridos vezes 12 -, senao uma empresa nova pagaria sempre a 1a faixa
 * por falta de historico. `inicioAtividade` ("YYYY-MM") liga essa regra.
 */
export function rbt12(
  mes: string,
  faturamento: FaturamentoPorMes,
  inicioAtividade?: string
): number {
  const anteriores = mesesAntes(mes, 12);
  const soma = anteriores.reduce((t, m) => t + (faturamento[m] ?? 0), 0);

  if (!inicioAtividade || inicioAtividade >= mes) return soma;

  const decorridos = anteriores.filter((m) => m >= inicioAtividade).length;
  if (decorridos === 0 || decorridos >= 12) return soma;

  return (soma / decorridos) * 12;
}

export interface PosicaoMes {
  mes: string;
  /**
   * "simples": apurado pelo Anexo III. "mei": mes anterior a entrada no Simples,
   * em que o imposto e o DAS-MEI de valor fixo e nao depende do faturamento.
   */
  regime: "simples" | "mei";
  /** Receita operacional do mes (base do Simples). */
  faturamento: number;
  rbt12: number;
  faixa: number;
  aliquota: number;
  /** DAS estimado sobre o faturamento do mes (zero no periodo MEI). */
  devido: number;
  /** DAS lancado para essa competencia (pago ou a pagar). */
  lancado: number;
  /** Positivo = falta provisionar. Sempre zero no periodo MEI. */
  diferenca: number;
}

export interface OpcoesFiscais {
  /** "YYYY-MM" de abertura: liga a RBT12 proporcionalizada do primeiro ano. */
  inicioAtividade?: string;
  /**
   * Primeira competencia apurada no Simples (PGDAS-D). Antes dela a empresa era
   * MEI: o imposto era fixo e a receita daqueles meses nao entra na RBT12, que
   * e como o PGDAS-D de 09/2026 foi declarado (receitas anteriores zeradas).
   */
  apuracaoDesde?: string;
}

/**
 * Posicao fiscal mes a mes: quanto o Simples deveria custar sobre o
 * faturamento e quanto ja foi lancado. A diferenca e o que falta provisionar.
 *
 * `dasLancadoPorCompetencia` precisa estar indexado pela COMPETENCIA do
 * imposto, nao pela data do pagamento: o DAS de setembro e pago em outubro.
 */
export function posicaoFiscal(
  faturamento: FaturamentoPorMes,
  dasLancadoPorCompetencia: FaturamentoPorMes,
  opcoes: OpcoesFiscais = {}
): PosicaoMes[] {
  const { inicioAtividade, apuracaoDesde } = opcoes;
  const noSimples = (mes: string) => !apuracaoDesde || mes >= apuracaoDesde;

  // Base da RBT12: so a receita apurada no Simples.
  const base: FaturamentoPorMes = {};
  Object.entries(faturamento).forEach(([mes, v]) => {
    if (noSimples(mes)) base[mes] = v;
  });

  const meses = Array.from(
    new Set([...Object.keys(faturamento), ...Object.keys(dasLancadoPorCompetencia)])
  ).sort();

  return meses.map((mes) => {
    const fat = faturamento[mes] ?? 0;
    const lancado = round2(dasLancadoPorCompetencia[mes] ?? 0);

    if (!noSimples(mes)) {
      return { mes, regime: "mei", faturamento: fat, rbt12: 0, faixa: 0, aliquota: 0, devido: 0, lancado, diferenca: 0 };
    }

    const acumulado = rbt12(mes, base, inicioAtividade);
    const { efetiva, faixa } = aliquotaEfetiva(acumulado);
    const { total: devido } = detalharDas(fat, efetiva);

    return {
      mes,
      regime: "simples",
      faturamento: fat,
      rbt12: acumulado,
      faixa,
      aliquota: efetiva,
      devido,
      lancado,
      diferenca: round2(devido - lancado),
    };
  });
}

/**
 * Quanto de Simples ainda nao foi lancado, no ACUMULADO ate `ateMes`.
 * O acumulado nao depende de em que mes cada pagamento foi registrado: mesmo
 * que um DAS esteja lancado na data do pagamento (mes seguinte), devido e
 * lancado se encontram na soma. E o numero certo para alerta.
 */
export function dasEmAberto(linhas: PosicaoMes[], ateMes: string): number {
  const simples = linhas.filter((l) => l.regime === "simples");
  const devido = simples.filter((l) => l.mes <= ateMes).reduce((s, l) => s + l.devido, 0);
  const lancado = simples.reduce((s, l) => s + l.lancado, 0);
  return Math.max(0, round2(devido - lancado));
}

function round2(v: number): number {
  return Math.round((v + Number.EPSILON) * 100) / 100;
}

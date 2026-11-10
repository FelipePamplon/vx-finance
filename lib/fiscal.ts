import { sectionOf } from "@/lib/analytics";
import { COMPANY } from "@/lib/company";
import { monthKey } from "@/lib/dates";
import { round2 } from "@/lib/format";
import { dasEmAberto, posicaoFiscal, type FaturamentoPorMes, type PosicaoMes } from "@/lib/tax";
import type { TransactionWithRelations } from "@/types/database";

export interface ApuracaoFiscal {
  linhas: PosicaoMes[];
  /** Simples devido e ainda nao lancado, no acumulado ate o mes de `today`. */
  emAberto: number;
  mei: {
    /** Receita operacional dos meses em que a empresa era MEI. */
    receita: number;
    /** Receita operacional do ano-calendario inteiro (MEI + Simples). */
    receitaAno: number;
    limite: number;
    /** Receita do ano acima do limite do MEI mais a tolerancia legal. */
    excedeTolerancia: boolean;
  };
}

/**
 * Apuracao fiscal a partir dos lancamentos. Unica para a aba Posicao Fiscal e
 * para a Saude dos Dados, que antes montavam cada uma a sua.
 *
 * Imposto entra pela COMPETENCIA (`date`), nao pela data do pagamento: o DAS de
 * setembro e pago em outubro e, lido pela data do pagamento, fazia setembro
 * parecer sem imposto lancado e outubro com imposto em dobro.
 */
export function apurarFiscal(rows: TransactionWithRelations[], today: string): ApuracaoFiscal {
  const faturamento: FaturamentoPorMes = {};
  const dasLancado: FaturamentoPorMes = {};
  const ano = today.slice(0, 4);
  let receitaAno = 0;

  rows.forEach((t) => {
    if (t.status === "cancelado") return;
    const mes = monthKey(t.date);
    const secao = sectionOf(t);

    if (t.type === "receita" && secao === "operacional") {
      faturamento[mes] = (faturamento[mes] ?? 0) + Number(t.amount);
      if (mes.startsWith(ano)) receitaAno += Number(t.amount);
    }
    if (t.type === "despesa" && secao === "imposto") {
      dasLancado[mes] = (dasLancado[mes] ?? 0) + Number(t.amount);
    }
  });

  const linhas = posicaoFiscal(faturamento, dasLancado, {
    inicioAtividade: COMPANY.inicioAtividade,
    apuracaoDesde: COMPANY.simples.apuracaoDesde,
  }).filter((l) => l.faturamento > 0 || l.lancado > 0);

  const receitaMei = round2(
    linhas.filter((l) => l.regime === "mei" && l.mes.startsWith(ano)).reduce((s, l) => s + l.faturamento, 0)
  );
  const teto = COMPANY.mei.limiteAnual * (1 + COMPANY.mei.toleranciaPct / 100);

  return {
    linhas,
    emAberto: dasEmAberto(linhas, monthKey(today)),
    mei: {
      receita: receitaMei,
      receitaAno: round2(receitaAno),
      limite: COMPANY.mei.limiteAnual,
      excedeTolerancia: receitaMei > 0 && receitaAno > teto,
    },
  };
}

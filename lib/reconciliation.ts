import { signedAmountForAccount, signedAmountOnStatement } from "@/lib/finance";
import type { TransactionStatus, TransactionType } from "@/types/database";

export interface BankEntry {
  date: string;
  description: string;
  amount: number;
}

export interface ReconcilableTransaction {
  id: string;
  date: string;
  paid_date?: string | null;
  amount: number;
  type: TransactionType;
  status?: TransactionStatus;
  account_id?: string | null;
  transfer_account_id?: string | null;
}

export interface ReconcileOptions {
  /**
   * Conta do extrato que esta sendo conferido. Sem ela a conciliacao compara o
   * extrato de uma conta contra lancamentos de TODAS as contas, e um valor igual
   * em outro banco aparece como "conciliado" - foi assim que lancamentos faltantes
   * do Inter passaram batido. Com ela, o sinal tambem sai certo: numa
   * transferencia a conta de destino recebe credito, nao debito.
   */
  accountId?: string;
}

export interface ReconciledEntry extends BankEntry {
  status: "conciliado" | "nao_encontrado";
  matchedTransactionId?: string;
}

export class StatementParseError extends Error {}

function normalizeDate(raw: string): string | null {
  const clean = raw.trim();

  const isoMatch = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return clean;

  const brMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (brMatch) {
    const [, dd, mm, yyyy] = brMatch;
    return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  const brShortYearMatch = clean.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{2})$/);
  if (brShortYearMatch) {
    const [, dd, mm, yy] = brShortYearMatch;
    return `20${yy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
  }

  return null;
}

function isDateLike(raw: string): boolean {
  return normalizeDate(raw) !== null;
}

function parseAmount(raw: string): number | null {
  let clean = raw.trim().replace(/^R\$\s*/i, "").replace(/\s/g, "");
  if (clean === "") return null;

  let negative = false;
  const parenMatch = clean.match(/^\((.+)\)$/);
  if (parenMatch) {
    negative = true;
    clean = parenMatch[1];
  }

  if (!/^-?[\d.,]+$/.test(clean)) return null;

  if (clean.includes(",")) {
    clean = clean.replace(/\./g, "").replace(",", ".");
  }

  const value = parseFloat(clean);
  if (Number.isNaN(value)) return null;
  return negative ? -Math.abs(value) : value;
}

function isAmountLike(raw: string): boolean {
  return parseAmount(raw) !== null && /\d/.test(raw);
}

/**
 * Descobre o separador olhando o arquivo inteiro, nao so a primeira linha.
 * Extratos de banco (o do Inter, por exemplo) comecam com linhas de cabecalho
 * tipo " Extrato Conta Corrente " e "Conta ;521205271": a primeira linha nao tem
 * separador nenhum, e adivinhar por ela fazia o arquivo inteiro ser descartado.
 * O criterio aqui e util de verdade: ganha o separador que produz mais linhas
 * com uma data E um valor reconheciveis - exatamente o que o parser precisa.
 */
function detectDelimiter(lines: string[]): string {
  const candidates = [";", ",", "\t"];
  let best = candidates[0];
  let bestScore = -1;

  for (const candidate of candidates) {
    let score = 0;
    for (const line of lines) {
      const cells = line.split(candidate).map((c) => c.trim().replace(/^"|"$/g, ""));
      if (cells.length < 2) continue;
      const dateIndex = cells.findIndex((c) => isDateLike(c));
      if (dateIndex === -1) continue;
      if (cells.some((c, i) => i !== dateIndex && isAmountLike(c))) score++;
    }
    if (score > bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  return best;
}

export function parseCsvStatement(text: string): BankEntry[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length === 0) {
    throw new StatementParseError("O arquivo está vazio.");
  }

  const delimiter = detectDelimiter(lines);
  const entries: BankEntry[] = [];
  let skippedRows = 0;

  for (const line of lines) {
    const cells = line.split(delimiter).map((c) => c.trim().replace(/^"|"$/g, ""));
    if (cells.length < 2) {
      skippedRows++;
      continue;
    }

    const dateIndex = cells.findIndex((c) => isDateLike(c));
    if (dateIndex === -1) {
      // Provavelmente a linha de cabeçalho ou uma linha inválida.
      skippedRows++;
      continue;
    }

    const amountIndexes = cells
      .map((c, i) => (i !== dateIndex && isAmountLike(c) ? i : -1))
      .filter((i) => i !== -1);

    if (amountIndexes.length === 0) {
      skippedRows++;
      continue;
    }

    // Quando há mais de uma coluna numérica (ex.: valor e saldo), a primeira
    // após a data costuma ser o valor da movimentação.
    const amountIndex = amountIndexes[0];
    const amount = parseAmount(cells[amountIndex]);
    const date = normalizeDate(cells[dateIndex]);

    if (!date || amount === null) {
      skippedRows++;
      continue;
    }

    // Coluna numerica nunca e descricao. Sem isso, a coluna "Saldo" do extrato
    // entrava no texto do lancamento ("Pix enviado Tms Digital 6.885,94").
    const description = cells
      .filter((_, i) => i !== dateIndex && !amountIndexes.includes(i))
      .join(" ")
      .trim();

    entries.push({ date, description: description || "Sem descrição", amount });
  }

  if (entries.length === 0) {
    throw new StatementParseError(
      skippedRows > 0
        ? "Não foi possível reconhecer nenhuma linha do CSV. Verifique se o arquivo contém colunas de data, descrição e valor."
        : "O arquivo não contém lançamentos."
    );
  }

  return entries;
}

export function parseOfxStatement(text: string): BankEntry[] {
  const entries: BankEntry[] = [];
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/g) ?? [];

  if (blocks.length === 0) {
    throw new StatementParseError(
      "Não foi possível encontrar lançamentos (<STMTTRN>) no arquivo OFX."
    );
  }

  for (const block of blocks) {
    const amountMatch = block.match(/<TRNAMT>\s*(-?[\d.,]+)/);
    const dateMatch = block.match(/<DTPOSTED>\s*(\d{8})/);
    const memoMatch = block.match(/<MEMO>([^\n<]*)/);
    const nameMatch = block.match(/<NAME>([^\n<]*)/);

    if (!amountMatch || !dateMatch) continue;

    const amount = parseAmount(amountMatch[1]);
    if (amount === null) continue;

    const raw = dateMatch[1];
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    const description = (memoMatch?.[1] || nameMatch?.[1] || "Sem descrição").trim();

    entries.push({ date, description, amount });
  }

  if (entries.length === 0) {
    throw new StatementParseError(
      "O arquivo OFX foi lido, mas nenhum lançamento válido foi encontrado."
    );
  }

  return entries;
}

export function parseStatementFile(filename: string, text: string): BankEntry[] {
  if (filename.toLowerCase().endsWith(".ofx")) {
    return parseOfxStatement(text);
  }
  return parseCsvStatement(text);
}

export function reconcile(
  bankEntries: BankEntry[],
  transactions: ReconcilableTransaction[],
  options: ReconcileOptions = {}
): ReconciledEntry[] {
  const { accountId } = options;
  const used = new Set<string>();

  // Lancamento cancelado nao existe no extrato: se ele puder casar, esconde a
  // linha de verdade que ainda falta registrar.
  const candidates = transactions.filter((t) => {
    if (t.status === "cancelado") return false;
    if (!accountId) return true;
    return t.account_id === accountId || t.transfer_account_id === accountId;
  });

  return bankEntries.map((entry) => {
    const entryDate = new Date(`${entry.date}T00:00:00`).getTime();

    const match = candidates.find((t) => {
      if (used.has(t.id)) return false;
      const signedAmount = accountId
        ? signedAmountForAccount(t, accountId)
        : signedAmountOnStatement(t);
      const amountMatches = Math.abs(signedAmount - entry.amount) < 0.01;
      // O extrato reflete a data em que o dinheiro se moveu, nao a competencia.
      const tDate = new Date(`${t.paid_date ?? t.date}T00:00:00`).getTime();
      const daysDiff = Math.abs(tDate - entryDate) / (1000 * 60 * 60 * 24);
      return amountMatches && daysDiff <= 2;
    });

    if (match) {
      used.add(match.id);
      return { ...entry, status: "conciliado" as const, matchedTransactionId: match.id };
    }

    return { ...entry, status: "nao_encontrado" as const };
  });
}

// ---------------------------------------------------------------------------
// Sugestao de lancamento para linha do extrato que nao esta no sistema
// ---------------------------------------------------------------------------

function limpar(s: string): string {
  return s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Tira o "tipo de operacao" do historico do banco e deixa o favorecido. */
function favorecido(descricao: string): string {
  return limpar(descricao)
    .replace(
      /^(pix (enviado|recebido)( devolvido)?|compra no debito|pagamento efetuado|pagamento de convenio|transferencia pix|pix qr code (dinamico|estatico)|recarga|ted (enviada|recebida)|estorno)\s*[-:]?\s*/,
      ""
    )
    .replace(/\s+(sao paulo|belem)\s+bra$/, "")
    .replace(/\d{2}\/\d{2}$/, "")
    .trim();
}

export interface EntrySuggestion {
  type: TransactionType;
  /** Aplicacao/resgate: a outra ponta e uma conta de investimento. */
  transfer: "aplicacao" | "resgate" | null;
  category_id: string | null;
  client_id: string | null;
  project_id: string | null;
  /** De quantos lancamentos anteriores a sugestao saiu. */
  baseadoEm: number;
}

/**
 * Sugere como lancar uma linha do extrato a partir do historico: o mesmo
 * favorecido costuma cair na mesma categoria. Aplicacao e resgate de CDB sao
 * reconhecidos como transferencia - lanca-los como despesa/receita foi um dos
 * erros que inflaram o saldo (ADR-0002).
 */
export function suggestEntry(
  entry: BankEntry,
  history: {
    description: string;
    type: TransactionType;
    status?: TransactionStatus;
    category_id?: string | null;
    client_id?: string | null;
    project_id?: string | null;
  }[]
): EntrySuggestion {
  const texto = limpar(entry.description);

  if (/\b(aplicacao|resgate)\b/.test(texto) && /\b(cdb|lci|lca|poupanca|fundo|porq)/.test(texto)) {
    return {
      type: "transferencia",
      transfer: entry.amount < 0 ? "aplicacao" : "resgate",
      category_id: null,
      client_id: null,
      project_id: null,
      baseadoEm: 0,
    };
  }

  const type: TransactionType = entry.amount >= 0 ? "receita" : "despesa";
  const quem = favorecido(entry.description);
  const vazio = { type, transfer: null, category_id: null, client_id: null, project_id: null, baseadoEm: 0 };
  if (quem.length < 4) return vazio;

  const parecidos = history.filter(
    (t) =>
      t.type === type &&
      t.status !== "cancelado" &&
      t.category_id &&
      limpar(t.description).includes(quem)
  );
  if (parecidos.length === 0) return vazio;

  const maisComum = <K extends "category_id" | "client_id" | "project_id">(campo: K) => {
    const contagem = new Map<string, number>();
    parecidos.forEach((t) => {
      const v = t[campo];
      if (v) contagem.set(v, (contagem.get(v) ?? 0) + 1);
    });
    return Array.from(contagem.entries()).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  };

  return {
    type,
    transfer: null,
    category_id: maisComum("category_id"),
    client_id: maisComum("client_id"),
    project_id: maisComum("project_id"),
    baseadoEm: parecidos.length,
  };
}

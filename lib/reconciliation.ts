export interface BankEntry {
  date: string;
  description: string;
  amount: number;
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

function detectDelimiter(line: string): string {
  const candidates = [",", ";", "\t"];
  let best = ",";
  let bestCount = -1;
  for (const candidate of candidates) {
    const count = line.split(candidate).length - 1;
    if (count > bestCount) {
      bestCount = count;
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

  const delimiter = detectDelimiter(lines[0]);
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

    const description = cells
      .filter((_, i) => i !== dateIndex && i !== amountIndex)
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
  transactions: { id: string; date: string; amount: number; type: "receita" | "despesa" }[]
): ReconciledEntry[] {
  const used = new Set<string>();

  return bankEntries.map((entry) => {
    const entryDate = new Date(`${entry.date}T00:00:00`).getTime();

    const match = transactions.find((t) => {
      if (used.has(t.id)) return false;
      const signedAmount = t.type === "receita" ? t.amount : -t.amount;
      const amountMatches = Math.abs(signedAmount - entry.amount) < 0.01;
      const tDate = new Date(`${t.date}T00:00:00`).getTime();
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

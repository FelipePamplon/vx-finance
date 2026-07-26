export interface BankEntry {
  date: string;
  description: string;
  amount: number;
}

export interface ReconciledEntry extends BankEntry {
  status: "conciliado" | "nao_encontrado";
  matchedTransactionId?: string;
}

function normalizeDate(raw: string): string | null {
  const brMatch = raw.match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
  if (brMatch) {
    const [, dd, mm, yyyy] = brMatch;
    return `${yyyy}-${mm}-${dd}`;
  }
  const isoMatch = raw.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (isoMatch) return raw;
  return null;
}

export function parseCsvStatement(text: string): BankEntry[] {
  const lines = text.split(/\r?\n/).filter((l) => l.trim().length > 0);
  const entries: BankEntry[] = [];
  const startIndex = /^[^,;]+[,;][^,;]+[,;]\s*-?\d/.test(lines[0]) ? 0 : 1;

  for (let i = startIndex; i < lines.length; i++) {
    const parts = lines[i].split(/[,;]/).map((p) => p.trim().replace(/^"|"$/g, ""));
    if (parts.length < 3) continue;

    const [rawDate, description, rawAmount] = parts;
    const date = normalizeDate(rawDate);
    const amount = parseFloat(rawAmount.replace(/\./g, "").replace(",", "."));
    if (!date || Number.isNaN(amount)) continue;

    entries.push({ date, description, amount });
  }

  return entries;
}

export function parseOfxStatement(text: string): BankEntry[] {
  const entries: BankEntry[] = [];
  const blocks = text.match(/<STMTTRN>[\s\S]*?<\/STMTTRN>/g) ?? [];

  for (const block of blocks) {
    const amountMatch = block.match(/<TRNAMT>([-\d.]+)/);
    const dateMatch = block.match(/<DTPOSTED>(\d{8})/);
    const memoMatch = block.match(/<MEMO>([^\n<]*)/);
    const nameMatch = block.match(/<NAME>([^\n<]*)/);

    if (!amountMatch || !dateMatch) continue;

    const amount = parseFloat(amountMatch[1]);
    const raw = dateMatch[1];
    const date = `${raw.slice(0, 4)}-${raw.slice(4, 6)}-${raw.slice(6, 8)}`;
    const description = (memoMatch?.[1] || nameMatch?.[1] || "Sem descrição").trim();

    entries.push({ date, description, amount });
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

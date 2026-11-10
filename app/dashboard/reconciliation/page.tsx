"use client";

import { useEffect, useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, FileUp } from "lucide-react";
import { toast } from "sonner";

import { Badge } from "@/components/ui/badge";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { accountsApi } from "@/hooks/use-accounts";
import { transactionsApi } from "@/hooks/use-transactions";
import { TransactionDialog, type TransactionFormValues } from "@/components/transactions/transaction-dialog";
import { Button } from "@/components/ui/button";
import { addMonths, formatDate, monthEnd, monthKey } from "@/lib/dates";
import { categoriesApi } from "@/hooks/use-categories";
import { formatCurrency } from "@/lib/format";
import {
  parseStatementFile,
  reconcile,
  StatementParseError,
  suggestEntry,
  type BankEntry,
} from "@/lib/reconciliation";

export default function ReconciliationPage() {
  const { data: transactions } = transactionsApi.useList();
  const { data: accounts } = accountsApi.useList();
  const { data: categories } = categoriesApi.useList();
  const [bankEntries, setBankEntries] = useState<BankEntry[]>([]);
  const [fileName, setFileName] = useState<string | null>(null);
  const [accountId, setAccountId] = useState<string>("");
  const [dialogOpen, setDialogOpen] = useState(false);
  const [prefill, setPrefill] = useState<Partial<TransactionFormValues>>({});

  // Linha do extrato que nao esta no sistema vira lancamento em um clique, ja
  // com a categoria sugerida pelo historico. Antes a tela so apontava a falta e
  // o lancamento tinha que ser redigitado em outra tela - e ficava para depois.
  function lancar(entry: BankEntry) {
    const sugestao = suggestEntry(entry, transactions ?? []);
    const valor = Math.abs(entry.amount);
    const base: Partial<TransactionFormValues> = {
      description: entry.description,
      amount: valor,
      date: entry.date,
      due_date: entry.date,
      paid_date: entry.date,
      status: "pago",
    };

    if (sugestao.transfer === "aplicacao") {
      setPrefill({ ...base, type: "transferencia", account_id: accountId, transfer_account_id: "" });
    } else if (sugestao.transfer === "resgate") {
      // Resgate: o dinheiro SAI da aplicacao e entra na conta do extrato.
      setPrefill({ ...base, type: "transferencia", account_id: "", transfer_account_id: accountId });
    } else {
      // Imposto sobre faturamento pago no mes M refere-se a M-1: a competencia
      // vai para o ultimo dia do mes anterior e a data do extrato fica como
      // pagamento. Lancado tudo na data do pagamento, a posicao fiscal mostrava
      // um mes sem imposto e o seguinte com imposto em dobro.
      const categoria = categories?.find((c) => c.id === sugestao.category_id);
      const competencia =
        categoria?.dre_section === "imposto"
          ? monthEnd(addMonths(monthKey(entry.date), -1))
          : entry.date;
      setPrefill({
        ...base,
        date: competencia,
        type: sugestao.type,
        account_id: accountId,
        category_id: sugestao.category_id ?? "",
        client_id: sugestao.client_id ?? "",
        project_id: sugestao.project_id ?? "",
      });
    }
    setDialogOpen(true);
  }

  // Conferir contra todas as contas e o caminho que da falso positivo, entao ele
  // nao e o padrao: a primeira conta corrente ja vem selecionada.
  const defaultAccountId = useMemo(() => {
    const list = accounts ?? [];
    return (list.find((a) => a.type === "corrente") ?? list[0])?.id ?? "";
  }, [accounts]);

  useEffect(() => {
    if (!accountId && defaultAccountId) setAccountId(defaultAccountId);
  }, [accountId, defaultAccountId]);

  async function handleFile(file: File) {
    try {
      const text = await file.text();
      const parsed = parseStatementFile(file.name, text);
      setBankEntries(parsed);
      setFileName(file.name);
      toast.success(`${parsed.length} lançamento(s) importado(s) do extrato.`);
    } catch (error) {
      setBankEntries([]);
      setFileName(null);
      const message =
        error instanceof StatementParseError
          ? error.message
          : "Não foi possível ler o arquivo. Verifique se é um CSV ou OFX válido.";
      toast.error(message);
    }
  }

  // O extrato e de uma conta so. Conferir contra os lancamentos de todas as contas
  // da falso "conciliado" quando outro banco tem um valor igual na mesma data.
  const entries = useMemo(
    () =>
      bankEntries.length > 0
        ? reconcile(bankEntries, transactions ?? [], { accountId: accountId || undefined })
        : [],
    [bankEntries, transactions, accountId]
  );

  const summary = useMemo(() => {
    const conciliados = entries.filter((e) => e.status === "conciliado").length;
    const naoEncontrados = entries.length - conciliados;
    return { conciliados, naoEncontrados };
  }, [entries]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Conciliação Bancária</h1>
        <p className="text-sm text-muted-foreground">
          Importe o extrato do banco (OFX ou CSV) e confira com os lançamentos já registrados
        </p>
      </div>

      <Card>
        <CardContent className="flex flex-col gap-4 pt-6">
          <label className="flex w-fit cursor-pointer items-center gap-2 rounded-md border border-dashed border-border px-4 py-3 text-sm text-muted-foreground hover:border-primary hover:text-foreground">
            <FileUp className="size-4" />
            {fileName ?? "Selecionar arquivo OFX ou CSV"}
            <input
              type="file"
              accept=".ofx,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFile(file);
              }}
            />
          </label>

          <div className="flex flex-col gap-2 sm:max-w-xs">
            <Label>Conta do extrato</Label>
            <Select value={accountId} onValueChange={setAccountId}>
              <SelectTrigger>
                <SelectValue placeholder="Todas as contas (não recomendado)" />
              </SelectTrigger>
              <SelectContent>
                {(accounts ?? []).map((account) => (
                  <SelectItem key={account.id} value={account.id}>
                    {account.bank}
                    {account.account ? ` · ${account.account}` : ""}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Escolha a conta a que este extrato pertence. Sem isso, um valor igual em
              outro banco pode aparecer como conciliado por engano.
            </p>
          </div>

          <p className="text-xs text-muted-foreground">
            CSV esperado: data, descrição, valor (positivo para créditos, negativo para
            débitos). Arquivos OFX exportados pelo internet banking também são aceitos.
          </p>
        </CardContent>
      </Card>

      {entries.length > 0 && (
        <>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Conciliados</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="flex items-center gap-2 text-xl font-semibold text-success">
                  <CheckCircle2 className="size-5" />
                  {summary.conciliados}
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle>Não encontrados</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="flex items-center gap-2 text-xl font-semibold text-destructive">
                  <AlertCircle className="size-5" />
                  {summary.naoEncontrados}
                </p>
              </CardContent>
            </Card>
          </div>

          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Data</TableHead>
                <TableHead>Descrição (extrato)</TableHead>
                <TableHead>Valor</TableHead>
                <TableHead>Status</TableHead>
                <TableHead className="w-28" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {entries.map((entry, index) => (
                <TableRow key={`${entry.date}-${entry.amount}-${index}`}>
                  <TableCell className="text-muted-foreground">
                    {formatDate(entry.date)}
                  </TableCell>
                  <TableCell>{entry.description}</TableCell>
                  <TableCell
                    className={entry.amount >= 0 ? "text-success" : "text-destructive"}
                  >
                    {formatCurrency(entry.amount)}
                  </TableCell>
                  <TableCell>
                    {entry.status === "conciliado" ? (
                      <Badge variant="success">Conciliado</Badge>
                    ) : (
                      <Badge variant="destructive">Não encontrado</Badge>
                    )}
                  </TableCell>
                  <TableCell>
                    {entry.status === "nao_encontrado" && (
                      <Button
                        type="button"
                        size="sm"
                        variant="secondary"
                        disabled={!accountId}
                        onClick={() => lancar(entry)}
                      >
                        Lançar
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </>
      )}

      <TransactionDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        editing={null}
        prefill={prefill}
      />
    </div>
  );
}

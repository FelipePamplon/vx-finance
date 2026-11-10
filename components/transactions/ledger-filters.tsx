"use client";

import { useState } from "react";
import { Search, SlidersHorizontal, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { accountsApi } from "@/hooks/use-accounts";
import { categoriesApi } from "@/hooks/use-categories";
import { clientsApi } from "@/hooks/use-clients";
import { partnersApi } from "@/hooks/use-partners";
import { projectsApi } from "@/hooks/use-projects";
import {
  countActiveFilters,
  EMPTY_FILTERS,
  type LedgerFilterState,
} from "@/lib/ledger-filters";

const ALL = "__all__";

function Campo({
  label,
  value,
  onChange,
  options,
  semLabel,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  /** Se informado, acrescenta a opcao "sem vinculo". */
  semLabel?: string;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      <Select value={value || ALL} onValueChange={(v) => onChange(v === ALL ? "" : v)}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={ALL}>Todos</SelectItem>
          {semLabel && <SelectItem value="sem">{semLabel}</SelectItem>}
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export function LedgerFilters({
  value,
  onChange,
  defaults = EMPTY_FILTERS,
  hide = [],
}: {
  value: LedgerFilterState;
  onChange: (next: LedgerFilterState) => void;
  /** Estado para o qual "Limpar" volta. */
  defaults?: LedgerFilterState;
  hide?: (keyof LedgerFilterState)[];
}) {
  const { data: accounts } = accountsApi.useList();
  const { data: categories } = categoriesApi.useList();
  const { data: clients } = clientsApi.useList();
  const { data: projects } = projectsApi.useList();
  const { data: partners } = partnersApi.useList();

  const set = <K extends keyof LedgerFilterState>(key: K, v: LedgerFilterState[K]) =>
    onChange({ ...value, [key]: v });

  const avancados = countActiveFilters(value, ["q", "from", "to", "tipo", ...hide]);
  const [aberto, setAberto] = useState(avancados > 0);
  const mostra = (k: keyof LedgerFilterState) => !hide.includes(k);
  const alterado = JSON.stringify(value) !== JSON.stringify(defaults);

  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-end gap-3">
        {mostra("q") && (
          <div className="relative min-w-[200px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={value.q}
              onChange={(e) => set("q", e.target.value)}
              placeholder="Buscar descrição, categoria, cliente, valor…"
              className="pl-9"
              aria-label="Buscar lançamentos"
            />
          </div>
        )}

        {mostra("from") && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-from" className="text-xs text-muted-foreground">
              De
            </Label>
            <Input
              id="f-from"
              type="date"
              value={value.from}
              onChange={(e) => set("from", e.target.value)}
              className="w-[150px]"
            />
          </div>
        )}
        {mostra("to") && (
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="f-to" className="text-xs text-muted-foreground">
              Até
            </Label>
            <Input
              id="f-to"
              type="date"
              value={value.to}
              onChange={(e) => set("to", e.target.value)}
              className="w-[150px]"
            />
          </div>
        )}

        <div className="flex gap-2">
          <Button
            type="button"
            variant={aberto || avancados > 0 ? "secondary" : "outline"}
            onClick={() => setAberto((v) => !v)}
            aria-expanded={aberto}
          >
            <SlidersHorizontal className="size-4" />
            Filtros{avancados > 0 ? ` (${avancados})` : ""}
          </Button>
          {alterado && (
            <Button type="button" variant="ghost" onClick={() => onChange(defaults)}>
              <X className="size-4" />
              Limpar
            </Button>
          )}
        </div>
      </div>

      {aberto && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
          {mostra("tipo") && (
            <Campo
              label="Tipo"
              value={value.tipo}
              onChange={(v) => set("tipo", v as LedgerFilterState["tipo"])}
              options={[
                { value: "receita", label: "Receita" },
                { value: "despesa", label: "Despesa" },
                { value: "transferencia", label: "Transferência" },
              ]}
            />
          )}
          {mostra("status") && (
            <Campo
              label="Status"
              value={value.status}
              onChange={(v) => set("status", v as LedgerFilterState["status"])}
              options={[
                { value: "ativos", label: "Pago + pendente" },
                { value: "pago", label: "Pago" },
                { value: "pendente", label: "Pendente" },
                { value: "cancelado", label: "Cancelado" },
              ]}
            />
          )}
          {mostra("conta") && (
            <Campo
              label="Conta"
              value={value.conta}
              onChange={(v) => set("conta", v)}
              options={(accounts ?? []).map((a) => ({ value: a.id, label: a.bank }))}
            />
          )}
          {mostra("categoria") && (
            <Campo
              label="Categoria"
              value={value.categoria}
              onChange={(v) => set("categoria", v)}
              semLabel="Sem categoria"
              options={(categories ?? []).map((c) => ({
                value: c.id,
                label: `${c.name} · ${c.type === "receita" ? "receita" : "despesa"}`,
              }))}
            />
          )}
          {mostra("secao") && (
            <Campo
              label="Camada do DRE"
              value={value.secao}
              onChange={(v) => set("secao", v as LedgerFilterState["secao"])}
              options={[
                { value: "operacional", label: "Operacional" },
                { value: "imposto", label: "Imposto" },
                { value: "financeira", label: "Financeira" },
                { value: "distribuicao", label: "Distribuição" },
              ]}
            />
          )}
          {mostra("cliente") && (
            <Campo
              label="Cliente"
              value={value.cliente}
              onChange={(v) => set("cliente", v)}
              semLabel="Sem cliente"
              options={(clients ?? []).map((c) => ({ value: c.id, label: c.company }))}
            />
          )}
          {mostra("projeto") && (
            <Campo
              label="Projeto"
              value={value.projeto}
              onChange={(v) => set("projeto", v)}
              semLabel="Sem projeto"
              options={(projects ?? []).map((p) => ({ value: p.id, label: p.name }))}
            />
          )}
          {mostra("socio") && (
            <Campo
              label="Sócio"
              value={value.socio}
              onChange={(v) => set("socio", v)}
              semLabel="Sem sócio"
              options={(partners ?? []).map((p) => ({ value: p.id, label: p.name }))}
            />
          )}
          {mostra("min") && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-min" className="text-xs text-muted-foreground">
                Valor mínimo
              </Label>
              <Input
                id="f-min"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={value.min}
                onChange={(e) => set("min", e.target.value)}
                placeholder="0,00"
              />
            </div>
          )}
          {mostra("max") && (
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="f-max" className="text-xs text-muted-foreground">
                Valor máximo
              </Label>
              <Input
                id="f-max"
                type="number"
                inputMode="decimal"
                step="0.01"
                value={value.max}
                onChange={(e) => set("max", e.target.value)}
                placeholder="0,00"
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

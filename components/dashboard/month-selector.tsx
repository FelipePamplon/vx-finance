"use client";

import { useRouter } from "next/navigation";

import { addMonths, monthKey, monthLabel, todayISO } from "@/lib/dates";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface MonthOption {
  value: string;
  label: string;
}

function buildMonthOptions(monthsBack: number): MonthOption[] {
  // Mes corrente no fuso da empresa, nao no do navegador nem em UTC.
  const atual = monthKey(todayISO());
  return Array.from({ length: monthsBack }, (_, i) => {
    const value = addMonths(atual, -i);
    const label = monthLabel(value, true);
    return { value, label: label.charAt(0).toUpperCase() + label.slice(1) };
  });
}

export function MonthSelector({ selectedMonth }: { selectedMonth: string }) {
  const router = useRouter();
  const options = buildMonthOptions(24);

  return (
    <Select
      value={selectedMonth}
      onValueChange={(value) => router.push(`/dashboard?month=${value}`)}
    >
      <SelectTrigger className="w-[200px]">
        <SelectValue placeholder="Selecione o período" />
      </SelectTrigger>
      <SelectContent>
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

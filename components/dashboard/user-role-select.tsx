"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { updateUserRole } from "@/app/dashboard/users/actions";

const ROLE_LABELS: Record<string, string> = {
  admin: "Admin",
  financeiro: "Financeiro",
  socio: "Sócio",
  leitura: "Leitura",
};

export function UserRoleSelect({
  userId,
  currentRole,
}: {
  userId: string;
  currentRole: string;
}) {
  const [isPending, startTransition] = useTransition();
  // Controlado: se o banco recusar, o seletor volta ao papel que vale de verdade
  // em vez de exibir um papel que nao foi salvo.
  const [role, setRole] = useState(currentRole);

  function handleChange(next: string) {
    const anterior = role;
    setRole(next);
    startTransition(async () => {
      try {
        const result = await updateUserRole(userId, next);
        if ("error" in result) {
          setRole(anterior);
          toast.error(result.error);
        } else {
          toast.success("Papel atualizado.");
        }
      } catch {
        setRole(anterior);
        toast.error("Erro ao atualizar papel.");
      }
    });
  }

  return (
    <Select value={role} onValueChange={handleChange} disabled={isPending}>
      <SelectTrigger className="w-40">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {Object.entries(ROLE_LABELS).map(([value, label]) => (
          <SelectItem key={value} value={value}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

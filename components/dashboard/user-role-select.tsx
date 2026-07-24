"use client";

import { useTransition } from "react";
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

  function handleChange(role: string) {
    startTransition(async () => {
      try {
        await updateUserRole(userId, role);
        toast.success("Papel atualizado.");
      } catch {
        toast.error("Erro ao atualizar papel.");
      }
    });
  }

  return (
    <Select defaultValue={currentRole} onValueChange={handleChange} disabled={isPending}>
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

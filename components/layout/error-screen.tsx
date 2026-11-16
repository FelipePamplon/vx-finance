"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { AlertTriangle, RotateCw } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Tela para quando uma pagina falha ao carregar. Sem ela o Next mostrava a tela
 * branca "Application error", que parece o sistema fora do ar - mesmo quando a
 * falha e de uma consulta so e some na segunda tentativa.
 */
export function ErrorScreen({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  useEffect(() => {
    console.error(error);
  }, [error]);

  function tentarDeNovo() {
    // refresh busca de novo os dados do servidor; reset redesenha a pagina.
    startTransition(() => {
      router.refresh();
      reset();
    });
  }

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-16 text-center">
      <AlertTriangle className="size-10 text-destructive" />
      <div className="flex flex-col gap-1">
        <h2 className="text-lg font-semibold text-foreground">Não foi possível carregar esta página</h2>
        <p className="text-sm text-muted-foreground">
          Pode ter sido uma falha momentânea de conexão com o banco de dados. Seus dados não foram
          alterados.
        </p>
      </div>
      <Button onClick={tentarDeNovo} isLoading={isPending}>
        <RotateCw className="size-4" />
        Tentar de novo
      </Button>
      {error.digest && (
        <p className="text-xs text-muted-foreground">Código do erro: {error.digest}</p>
      )}
    </div>
  );
}

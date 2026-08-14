"use client";

import { useParams } from "next/navigation";

import { QuoteForm } from "@/components/quotes/quote-form";
import { quotesApi } from "@/hooks/use-quotes";

export default function EditQuotePage() {
  const params = useParams();
  const id = typeof params.id === "string" ? params.id : undefined;
  const { data: quote, isLoading } = quotesApi.useGet(id);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">
          {quote ? `Editar orçamento #${String(quote.number).padStart(4, "0")}` : "Editar orçamento"}
        </h1>
        <p className="text-sm text-muted-foreground">
          Ajuste os itens, valores e status do orçamento
        </p>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Carregando...</p>}
      {!isLoading && !quote && (
        <p className="text-sm text-muted-foreground">Orçamento não encontrado.</p>
      )}
      {quote && <QuoteForm quote={quote} />}
    </div>
  );
}

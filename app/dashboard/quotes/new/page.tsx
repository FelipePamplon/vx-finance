import { QuoteForm } from "@/components/quotes/quote-form";

export default function NewQuotePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Novo orçamento</h1>
        <p className="text-sm text-muted-foreground">
          Monte o orçamento a partir do catálogo de serviços ou com itens personalizados
        </p>
      </div>

      <QuoteForm />
    </div>
  );
}

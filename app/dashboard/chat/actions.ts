"use server";

import Anthropic from "@anthropic-ai/sdk";

import { createClient } from "@/lib/supabase/server";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function askFinanceQuestion(
  question: string,
  history: ChatMessage[]
): Promise<string> {
  const supabase = await createClient();

  const now = new Date();
  const twelveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 11, 1)
    .toISOString()
    .slice(0, 10);

  const [{ data: accounts }, { data: transactions }] = await Promise.all([
    supabase.from("accounts").select("bank, type, balance"),
    supabase
      .from("transactions")
      .select(
        "description, amount, type, date, status, categories(name), accounts(bank), clients(company), projects(name)"
      )
      .gte("date", twelveMonthsAgo)
      .order("date", { ascending: false })
      .limit(500),
  ]);

  const context = {
    contas: accounts ?? [],
    lancamentos_ultimos_12_meses: transactions ?? [],
  };

  const client = new Anthropic();

  try {
    const response = await client.messages.create({
      model: "claude-opus-5",
      max_tokens: 2048,
      output_config: { effort: "medium" },
      system: [
        {
          type: "text",
          text: `Você é o assistente financeiro da VX Capital. Responda perguntas sobre os dados financeiros abaixo, em português, de forma direta e objetiva. Use apenas os dados fornecidos — nunca invente números. Formate valores monetários em reais (R$). Se a pergunta não puder ser respondida com os dados disponíveis, diga isso claramente.\n\nDados (JSON):\n${JSON.stringify(context)}`,
          cache_control: { type: "ephemeral" },
        },
      ],
      messages: [
        ...history.map((m) => ({ role: m.role, content: m.content })),
        { role: "user" as const, content: question },
      ],
    });

    if (response.stop_reason === "refusal") {
      return "Não consegui responder essa pergunta. Tente reformular.";
    }

    const textBlock = response.content.find((b) => b.type === "text");
    return textBlock && textBlock.type === "text" ? textBlock.text : "Sem resposta.";
  } catch {
    return "Ocorreu um erro ao consultar o assistente. Tente novamente.";
  }
}

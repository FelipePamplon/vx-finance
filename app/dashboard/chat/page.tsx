"use client";

import { useState } from "react";
import { Send, Sparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { askFinanceQuestion, type ChatMessage } from "./actions";

export default function ChatPage() {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSend() {
    const question = input.trim();
    if (!question || loading) return;

    const nextMessages: ChatMessage[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    setInput("");
    setLoading(true);

    try {
      const answer = await askFinanceQuestion(question, messages);
      setMessages([...nextMessages, { role: "assistant", content: answer }]);
    } catch {
      setMessages([
        ...nextMessages,
        { role: "assistant", content: "Ocorreu um erro ao processar sua pergunta." },
      ]);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold text-foreground">Assistente Financeiro</h1>
        <p className="text-sm text-muted-foreground">
          Pergunte sobre suas receitas, despesas e contas em linguagem natural
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Conversa
          </CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex min-h-[200px] flex-col gap-3">
            {messages.length === 0 && (
              <p className="text-sm text-muted-foreground">
                Exemplos: &quot;Quanto gastei com marketing esse mês?&quot;, &quot;Qual meu
                saldo atual?&quot;, &quot;Quais foram minhas maiores despesas?&quot;
              </p>
            )}
            {messages.map((m, i) => (
              <div
                key={i}
                className={
                  m.role === "user"
                    ? "max-w-[80%] self-end rounded-lg bg-primary/15 px-4 py-2 text-sm text-foreground"
                    : "max-w-[80%] self-start whitespace-pre-wrap rounded-lg bg-accent px-4 py-2 text-sm text-foreground"
                }
              >
                {m.content}
              </div>
            ))}
            {loading && (
              <div className="self-start rounded-lg bg-accent px-4 py-2 text-sm text-muted-foreground">
                Pensando...
              </div>
            )}
          </div>

          <div className="flex gap-2">
            <Input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  handleSend();
                }
              }}
              placeholder="Pergunte algo sobre suas finanças..."
              disabled={loading}
            />
            <Button onClick={handleSend} disabled={loading || !input.trim()}>
              <Send className="size-4" />
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

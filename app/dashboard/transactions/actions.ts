"use server";

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";

export async function suggestCategory(
  description: string,
  categories: { id: string; name: string }[]
): Promise<string | null> {
  if (!description.trim() || categories.length === 0) return null;

  const client = new Anthropic();
  const validIds = [...categories.map((c) => c.id), "none"] as [string, ...string[]];
  const schema = z.object({ category_id: z.enum(validIds) });

  const categoryList = categories.map((c) => `${c.id}: ${c.name}`).join("\n");

  try {
    const response = await client.messages.parse({
      model: "claude-opus-5",
      max_tokens: 200,
      thinking: { type: "disabled" },
      output_config: {
        effort: "low",
        format: zodOutputFormat(schema),
      },
      messages: [
        {
          role: "user",
          content: `Descrição do lançamento financeiro: "${description}"\n\nCategorias disponíveis:\n${categoryList}\n\nEscolha o id da categoria mais adequada para essa descrição. Se nenhuma categoria fizer sentido, responda "none".`,
        },
      ],
    });

    if (response.stop_reason === "refusal") return null;

    const categoryId = response.parsed_output?.category_id;
    return categoryId && categoryId !== "none" ? categoryId : null;
  } catch {
    return null;
  }
}

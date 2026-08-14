"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import type { Quote, QuoteStatus, QuoteWithItems, QuoteWithRelations } from "@/types/database";

const QUOTES_KEY = ["quotes"];

export interface QuoteItemInput {
  service_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
}

export interface QuoteInput {
  title: string;
  client_id: string | null;
  project_id: string | null;
  status: QuoteStatus;
  valid_until: string | null;
  notes: string | null;
  discount: number;
  items: QuoteItemInput[];
}

function computeTotal(items: QuoteItemInput[], discount: number) {
  const subtotal = items.reduce((sum, item) => sum + item.quantity * item.unit_price, 0);
  return Math.max(subtotal - discount, 0);
}

async function replaceItems(
  supabase: ReturnType<typeof createClient>,
  quoteId: string,
  items: QuoteItemInput[]
) {
  const itemsTable = supabase.from("quote_items") as any; // eslint-disable-line @typescript-eslint/no-explicit-any

  const { error: deleteError } = await itemsTable.delete().eq("quote_id", quoteId);
  if (deleteError) throw deleteError;

  if (items.length === 0) return;

  const { error: insertError } = await itemsTable.insert(
    items.map((item, index) => ({
      quote_id: quoteId,
      service_id: item.service_id,
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      position: index,
    }))
  );
  if (insertError) throw insertError;
}

export const quotesApi = {
  useList() {
    return useQuery({
      queryKey: QUOTES_KEY,
      queryFn: async () => {
        const supabase = createClient();
        const builder = supabase.from("quotes") as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const { data, error } = await builder
          .select("*, clients(company,email,contact), projects(name)")
          .order("created_at", { ascending: false });
        if (error) throw error;
        return data as unknown as QuoteWithRelations[];
      },
    });
  },

  useGet(id: string | undefined) {
    return useQuery({
      queryKey: [...QUOTES_KEY, id],
      queryFn: async () => {
        const supabase = createClient();
        const builder = supabase.from("quotes") as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const { data, error } = await builder
          .select("*, clients(company,email,contact), projects(name), quote_items(*)")
          .eq("id", id)
          .single();
        if (error) throw error;
        return data as unknown as QuoteWithItems;
      },
      enabled: !!id,
    });
  },

  useCreate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (input: QuoteInput) => {
        const supabase = createClient();
        const quotesTable = supabase.from("quotes") as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const total = computeTotal(input.items, input.discount);

        const { data: quote, error } = await quotesTable
          .insert({
            title: input.title,
            client_id: input.client_id,
            project_id: input.project_id,
            status: input.status,
            valid_until: input.valid_until,
            notes: input.notes,
            discount: input.discount,
            total,
          })
          .select()
          .single();
        if (error) throw error;

        await replaceItems(supabase, quote.id, input.items);

        return quote as unknown as Quote;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUOTES_KEY });
        toast.success("Orçamento criado com sucesso.");
      },
      onError: (error: Error) => {
        toast.error(`Erro ao criar orçamento: ${error.message}`);
      },
    });
  },

  useUpdate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async ({ id, input }: { id: string; input: QuoteInput }) => {
        const supabase = createClient();
        const quotesTable = supabase.from("quotes") as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const total = computeTotal(input.items, input.discount);

        const { error } = await quotesTable
          .update({
            title: input.title,
            client_id: input.client_id,
            project_id: input.project_id,
            status: input.status,
            valid_until: input.valid_until,
            notes: input.notes,
            discount: input.discount,
            total,
          })
          .eq("id", id);
        if (error) throw error;

        await replaceItems(supabase, id, input.items);
      },
      onSuccess: (_data, variables) => {
        queryClient.invalidateQueries({ queryKey: QUOTES_KEY });
        queryClient.invalidateQueries({ queryKey: [...QUOTES_KEY, variables.id] });
        toast.success("Orçamento atualizado com sucesso.");
      },
      onError: (error: Error) => {
        toast.error(`Erro ao atualizar orçamento: ${error.message}`);
      },
    });
  },

  useDelete() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (id: string) => {
        const supabase = createClient();
        const builder = supabase.from("quotes") as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const { error } = await builder.delete().eq("id", id);
        if (error) throw error;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUOTES_KEY });
        toast.success("Orçamento excluído.");
      },
      onError: (error: Error) => {
        toast.error(`Erro ao excluir: ${error.message}`);
      },
    });
  },

  useUpdateStatus() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async ({ id, status }: { id: string; status: QuoteStatus }) => {
        const supabase = createClient();
        const builder = supabase.from("quotes") as any; // eslint-disable-line @typescript-eslint/no-explicit-any
        const { error } = await builder.update({ status }).eq("id", id);
        if (error) throw error;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: QUOTES_KEY });
        toast.success("Status do orçamento atualizado.");
      },
      onError: (error: Error) => {
        toast.error(`Erro ao atualizar status: ${error.message}`);
      },
    });
  },
};

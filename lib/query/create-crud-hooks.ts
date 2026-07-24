"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";

export function createCrudHooks<T extends { id: string }>(
  table: string,
  options?: { orderBy?: string; ascending?: boolean; select?: string }
) {
  const queryKey = [table];

  function useList() {
    return useQuery({
      queryKey,
      queryFn: async () => {
        const supabase = createClient();
        let query = supabase.from(table).select(options?.select ?? "*");
        if (options?.orderBy) {
          query = query.order(options.orderBy, {
            ascending: options.ascending ?? false,
          });
        }
        const { data, error } = await query;
        if (error) throw error;
        return data as unknown as T[];
      },
    });
  }

  function useCreate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (values: Partial<T>) => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from(table)
          .insert(values)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as T;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
        toast.success("Registro criado com sucesso.");
      },
      onError: (error: Error) => {
        toast.error(`Erro ao criar: ${error.message}`);
      },
    });
  }

  function useUpdate() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async ({ id, values }: { id: string; values: Partial<T> }) => {
        const supabase = createClient();
        const { data, error } = await supabase
          .from(table)
          .update(values)
          .eq("id", id)
          .select()
          .single();
        if (error) throw error;
        return data as unknown as T;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
        toast.success("Registro atualizado com sucesso.");
      },
      onError: (error: Error) => {
        toast.error(`Erro ao atualizar: ${error.message}`);
      },
    });
  }

  function useDelete() {
    const queryClient = useQueryClient();
    return useMutation({
      mutationFn: async (id: string) => {
        const supabase = createClient();
        const { error } = await supabase.from(table).delete().eq("id", id);
        if (error) throw error;
      },
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey });
        toast.success("Registro excluído.");
      },
      onError: (error: Error) => {
        toast.error(`Erro ao excluir: ${error.message}`);
      },
    });
  }

  return { queryKey, useList, useCreate, useUpdate, useDelete };
}

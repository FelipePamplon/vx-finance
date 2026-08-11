"use client";

import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { toast } from "sonner";

import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const profileSchema = z.object({
  name: z.string().min(2, "Nome muito curto"),
});

type ProfileFormValues = z.infer<typeof profileSchema>;

export function ProfileSettingsForm({
  userId,
  defaultName,
}: {
  userId: string;
  defaultName: string;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<ProfileFormValues>({
    resolver: zodResolver(profileSchema),
    defaultValues: { name: defaultName },
  });

  async function onSubmit(values: ProfileFormValues) {
    const supabase = createClient();
    const { error } = await supabase
      .from("profiles")
      .update({ name: values.name })
      .eq("id", userId);

    if (error) {
      toast.error("Erro ao salvar.");
      return;
    }

    toast.success("Perfil atualizado.");
  }

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="flex max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-2">
        <Label htmlFor="name">Nome</Label>
        <Input id="name" {...register("name")} />
        {errors.name && <p className="text-sm text-destructive">{errors.name.message}</p>}
      </div>

      <Button type="submit" isLoading={isSubmitting} className="w-fit">
        Salvar
      </Button>
    </form>
  );
}

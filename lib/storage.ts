import { createClient } from "@/lib/supabase/client";

const BUCKET = "attachments";

export async function uploadAttachment(file: File) {
  const supabase = createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = `${user?.id ?? "anon"}/${Date.now()}-${file.name}`;

  const { error } = await supabase.storage.from(BUCKET).upload(path, file, {
    cacheControl: "3600",
    upsert: false,
  });

  if (error) throw error;
  return path;
}

export async function getAttachmentUrl(path: string) {
  const supabase = createClient();
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(path, 60 * 60);

  if (error) throw error;
  return data.signedUrl;
}

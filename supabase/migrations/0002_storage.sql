-- VX Capital Finance - Storage de comprovantes (Sprint 3)
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar e executar

insert into storage.buckets (id, name, public)
values ('attachments', 'attachments', false)
on conflict (id) do nothing;

drop policy if exists "attachments_authenticated_select" on storage.objects;
create policy "attachments_authenticated_select" on storage.objects
  for select using (bucket_id = 'attachments' and auth.role() = 'authenticated');

drop policy if exists "attachments_authenticated_insert" on storage.objects;
create policy "attachments_authenticated_insert" on storage.objects
  for insert with check (bucket_id = 'attachments' and auth.role() = 'authenticated');

drop policy if exists "attachments_authenticated_update" on storage.objects;
create policy "attachments_authenticated_update" on storage.objects
  for update using (bucket_id = 'attachments' and auth.role() = 'authenticated');

drop policy if exists "attachments_authenticated_delete" on storage.objects;
create policy "attachments_authenticated_delete" on storage.objects
  for delete using (bucket_id = 'attachments' and auth.role() = 'authenticated');

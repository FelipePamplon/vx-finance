-- VX Capital Finance - CNPJ/CPF e endereco do cliente
-- Rodar no Supabase: Dashboard > SQL Editor > New query > colar e executar

alter table public.clients
  add column if not exists document text,
  add column if not exists address text;

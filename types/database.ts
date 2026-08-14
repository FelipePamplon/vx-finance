export type TransactionType = "receita" | "despesa";
export type TransactionStatus = "pendente" | "pago" | "cancelado";
export type AccountType = "corrente" | "poupanca" | "investimento" | "caixa";
export type ProjectStatus = "ativo" | "pausado" | "concluido" | "cancelado";
export type QuoteStatus = "rascunho" | "enviado" | "aprovado" | "recusado" | "expirado";

export interface Category {
  id: string;
  name: string;
  color: string;
  icon: string | null;
  type: TransactionType;
  created_by: string | null;
  created_at: string;
}

export interface Account {
  id: string;
  bank: string;
  agency: string | null;
  account: string | null;
  type: AccountType;
  balance: number;
  created_by: string | null;
  created_at: string;
}

export interface Client {
  id: string;
  company: string;
  contact: string | null;
  email: string | null;
  phone: string | null;
  created_by: string | null;
  created_at: string;
}

export interface Project {
  id: string;
  name: string;
  client_id: string | null;
  budget: number;
  status: ProjectStatus;
  created_by: string | null;
  created_at: string;
  clients?: { company: string } | null;
}

export interface Partner {
  id: string;
  name: string;
  email: string | null;
  share: number;
  created_by: string | null;
  created_at: string;
}

export interface Transaction {
  id: string;
  description: string;
  amount: number;
  type: TransactionType;
  date: string;
  account_id: string | null;
  category_id: string | null;
  project_id: string | null;
  client_id: string | null;
  partner_id: string | null;
  status: TransactionStatus;
  attachment_url: string | null;
  created_by: string | null;
  created_at: string;
}

export interface TransactionWithRelations extends Transaction {
  accounts: { bank: string } | null;
  categories: { name: string; color: string } | null;
  clients: { company: string } | null;
  projects: { name: string } | null;
}

export interface Service {
  id: string;
  name: string;
  description: string | null;
  price: number;
  unit: string | null;
  created_by: string | null;
  created_at: string;
}

export interface QuoteItem {
  id: string;
  quote_id: string;
  service_id: string | null;
  description: string;
  quantity: number;
  unit_price: number;
  position: number;
  created_at: string;
}

export interface Quote {
  id: string;
  number: number;
  title: string;
  client_id: string | null;
  project_id: string | null;
  status: QuoteStatus;
  valid_until: string | null;
  notes: string | null;
  discount: number;
  total: number;
  created_by: string | null;
  created_at: string;
}

export interface QuoteWithRelations extends Quote {
  clients: { company: string; email: string | null; contact: string | null } | null;
  projects: { name: string } | null;
}

export interface QuoteWithItems extends QuoteWithRelations {
  quote_items: QuoteItem[];
}

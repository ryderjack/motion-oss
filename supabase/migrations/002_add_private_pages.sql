-- Add private pages support
alter table public.pages add column if not exists created_by uuid references public.users(id) on delete set null;
alter table public.pages add column if not exists is_private boolean default false;

create index if not exists idx_pages_created_by on public.pages(created_by);

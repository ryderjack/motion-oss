-- Audit trail for page edits
create table if not exists public.page_history (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  user_id uuid not null references public.users(id) on delete cascade,
  action text not null, -- 'update_title', 'update_icon', 'update_cover', 'update_blocks', 'archive', 'restore', 'update_privacy', etc.
  changes jsonb not null default '{}',
  created_at timestamptz default now()
);

create index if not exists idx_page_history_page on public.page_history(page_id);
create index if not exists idx_page_history_created on public.page_history(page_id, created_at desc);

alter table public.page_history enable row level security;

-- Page shares: track which workspace members have explicit access to a page
-- Used for Notion-style "Shared" pages visible to a subset of the workspace.

create table if not exists public.page_shares (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  user_id uuid not null references users(id) on delete cascade,
  permission text not null default 'VIEWER' check (permission in ('VIEWER', 'EDITOR')),
  created_at timestamptz not null default now(),
  constraint page_shares_unique unique (page_id, user_id)
);

create index if not exists idx_page_shares_page on page_shares(page_id);
create index if not exists idx_page_shares_user on page_shares(user_id);

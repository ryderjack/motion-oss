create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.users(id) on delete cascade,
  actor_id uuid not null references public.users(id) on delete cascade,
  type text not null default 'mention',
  page_id uuid references public.pages(id) on delete cascade,
  page_title text,
  content text,
  is_read boolean default false,
  created_at timestamptz default now()
);

create index if not exists idx_notifications_user on public.notifications(user_id);
create index if not exists idx_notifications_user_unread on public.notifications(user_id, is_read) where is_read = false;
create index if not exists idx_notifications_created on public.notifications(created_at desc);

alter table public.notifications enable row level security;

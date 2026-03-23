create table if not exists page_guests (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references pages(id) on delete cascade,
  email text not null,
  permission text not null default 'VIEWER' check (permission in ('VIEWER', 'EDITOR')),
  token text not null unique default encode(gen_random_bytes(32), 'hex'),
  invited_by uuid not null references users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint page_guests_page_email_unique unique (page_id, email)
);

create index if not exists idx_page_guests_page_id on page_guests(page_id);
create index if not exists idx_page_guests_token on page_guests(token);
create index if not exists idx_page_guests_email on page_guests(email);

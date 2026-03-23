-- Soft-delete support for database rows (trash)
alter table public.database_rows
  add column if not exists is_archived boolean default false;

create index if not exists idx_db_rows_archived
  on public.database_rows(page_id, is_archived);

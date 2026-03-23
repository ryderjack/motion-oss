-- Motion Workspace tables
-- Run this in Supabase SQL Editor or via migration

-- Users table
create table if not exists public.users (
  id uuid primary key default gen_random_uuid(),
  email text unique not null,
  name text,
  hashed_password text,
  image text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Workspaces table
create table if not exists public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  slug text unique not null,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

-- Members table (links users to workspaces with roles)
create type member_role as enum ('ADMIN', 'EDITOR', 'VIEWER');

create table if not exists public.members (
  id uuid primary key default gen_random_uuid(),
  role member_role default 'EDITOR',
  user_id uuid not null references public.users(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz default now(),
  unique(user_id, workspace_id)
);

-- Pages table (documents + databases)
create type page_type as enum ('PAGE', 'DATABASE');

create table if not exists public.pages (
  id uuid primary key default gen_random_uuid(),
  title text default 'Untitled',
  icon text,
  cover_image text,
  type page_type default 'PAGE',
  view_mode text,
  parent_id uuid references public.pages(id) on delete set null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_by uuid references public.users(id) on delete set null,
  position int default 0,
  is_favorite boolean default false,
  is_archived boolean default false,
  is_private boolean default false,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_pages_workspace on public.pages(workspace_id);
create index if not exists idx_pages_parent on public.pages(parent_id);

-- Blocks table (rich text content for pages)
create table if not exists public.blocks (
  id uuid primary key default gen_random_uuid(),
  type text not null,
  content jsonb not null default '{}',
  position int default 0,
  page_id uuid not null references public.pages(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_blocks_page on public.blocks(page_id);

-- Database properties (columns for database-type pages)
create table if not exists public.database_properties (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  type text not null,
  options jsonb,
  position int default 0,
  page_id uuid not null references public.pages(id) on delete cascade
);

create index if not exists idx_db_props_page on public.database_properties(page_id);

-- Database rows
create table if not exists public.database_rows (
  id uuid primary key default gen_random_uuid(),
  page_id uuid not null references public.pages(id) on delete cascade,
  position int default 0,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_db_rows_page on public.database_rows(page_id);

-- Cell values (intersection of rows and properties)
create table if not exists public.cell_values (
  id uuid primary key default gen_random_uuid(),
  value jsonb,
  property_id uuid not null references public.database_properties(id) on delete cascade,
  row_id uuid not null references public.database_rows(id) on delete cascade,
  unique(property_id, row_id)
);

create index if not exists idx_cells_row on public.cell_values(row_id);

-- Templates
create table if not exists public.templates (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  description text,
  icon text,
  type page_type default 'PAGE',
  blocks jsonb,
  properties jsonb,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create index if not exists idx_templates_workspace on public.templates(workspace_id);

-- Enable RLS on all tables
alter table public.users enable row level security;
alter table public.workspaces enable row level security;
alter table public.members enable row level security;
alter table public.pages enable row level security;
alter table public.blocks enable row level security;
alter table public.database_properties enable row level security;
alter table public.database_rows enable row level security;
alter table public.cell_values enable row level security;
alter table public.templates enable row level security;

-- Service role bypasses RLS, so our server-side code works fine.
-- If you later add client-side access, add proper RLS policies here.

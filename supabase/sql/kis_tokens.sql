create table if not exists public.kis_tokens (
  id text primary key,
  access_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);


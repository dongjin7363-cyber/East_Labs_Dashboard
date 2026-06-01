alter table if exists public.portfolio_holdings
  add column if not exists quote_disabled boolean not null default false;

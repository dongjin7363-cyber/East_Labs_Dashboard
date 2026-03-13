alter table if exists public.portfolio_holdings
  add column if not exists position text;

update public.portfolio_holdings
set position = 'N'
where position is null;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'portfolio_holdings_position_check'
  ) then
    alter table public.portfolio_holdings
      add constraint portfolio_holdings_position_check
      check (position in ('OW', 'N', 'UW'));
  end if;
end $$;

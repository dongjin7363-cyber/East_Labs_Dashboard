alter table public.export_items enable row level security;
alter table public.export_data enable row level security;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'export_items'
      and policyname = 'export_items_public_select'
  ) then
    create policy export_items_public_select
      on public.export_items
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

do $$
begin
  if not exists (
    select 1
    from pg_policies
    where schemaname = 'public'
      and tablename = 'export_data'
      and policyname = 'export_data_public_select'
  ) then
    create policy export_data_public_select
      on public.export_data
      for select
      to anon, authenticated
      using (true);
  end if;
end
$$;

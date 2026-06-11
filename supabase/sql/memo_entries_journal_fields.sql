-- Adds Investment Journal fields to existing memo entries.
-- This file does not remove legacy buy_tickers, sell_tickers, or comment columns.

alter table public.memo_entries
  add column if not exists title text,
  add column if not exists content text,
  add column if not exists memo_type text not null default 'Market Note',
  add column if not exists sentiment text;

update public.memo_entries
set
  content = coalesce(nullif(btrim(content), ''), nullif(btrim(comment), ''), 'Legacy memo'),
  title = coalesce(
    nullif(btrim(title), ''),
    nullif(btrim(split_part(coalesce(nullif(content, ''), nullif(comment, ''), 'Legacy memo'), E'\n', 1)), ''),
    'Untitled Memo'
  ),
  memo_type = case
    when memo_type in ('Market Note', 'Investment Idea', 'Macro', 'Trading Diary') then memo_type
    else 'Market Note'
  end,
  sentiment = case
    when nullif(btrim(sentiment), '') in ('Bear', 'Neutral', 'Bull') then nullif(btrim(sentiment), '')
    else null
  end
where
  title is null
  or btrim(title) = ''
  or content is null
  or btrim(content) = ''
  or memo_type is null
  or btrim(memo_type) = ''
  or memo_type not in ('Market Note', 'Investment Idea', 'Macro', 'Trading Diary')
  or sentiment = ''
  or sentiment not in ('Bear', 'Neutral', 'Bull');

alter table public.memo_entries
  alter column title set not null,
  alter column content set not null,
  alter column memo_type set not null,
  alter column memo_type set default 'Market Note';

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conname = 'memo_entries_memo_type_check'
  ) then
    alter table public.memo_entries
      add constraint memo_entries_memo_type_check
      check (memo_type in ('Market Note', 'Investment Idea', 'Macro', 'Trading Diary'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'memo_entries_sentiment_check'
  ) then
    alter table public.memo_entries
      add constraint memo_entries_sentiment_check
      check (sentiment is null or sentiment in ('Bear', 'Neutral', 'Bull'));
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'memo_entries_title_not_blank_check'
  ) then
    alter table public.memo_entries
      add constraint memo_entries_title_not_blank_check
      check (btrim(title) <> '');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conname = 'memo_entries_content_not_blank_check'
  ) then
    alter table public.memo_entries
      add constraint memo_entries_content_not_blank_check
      check (btrim(content) <> '');
  end if;
end $$;

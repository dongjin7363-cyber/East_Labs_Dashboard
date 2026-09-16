-- Apply after the production endpoint and Vault secret are configured.
-- pg_cron uses UTC: 22:00 / 03:00 / 08:00 = KST 07:00 / 12:00 / 17:00.
-- Run every calendar day. The body carries the nominal slot, not completion time.
select cron.schedule('east-portfolio-07-kst','0 22 * * *', $job$
  select net.http_post(
    url := 'https://east-labs-dashboard.vercel.app/api/cron/portfolio',
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='east_portfolio_cron_secret')),
    body := jsonb_build_object('scheduledAt',date_trunc('hour',now())),
    timeout_milliseconds := 300000
  );
$job$);
select cron.schedule('east-portfolio-12-kst','0 3 * * *', $job$
  select net.http_post(
    url := 'https://east-labs-dashboard.vercel.app/api/cron/portfolio',
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='east_portfolio_cron_secret')),
    body := jsonb_build_object('scheduledAt',date_trunc('hour',now())),
    timeout_milliseconds := 300000
  );
$job$);
select cron.schedule('east-portfolio-17-kst','0 8 * * *', $job$
  select net.http_post(
    url := 'https://east-labs-dashboard.vercel.app/api/cron/portfolio',
    headers := jsonb_build_object('Content-Type','application/json','Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name='east_portfolio_cron_secret')),
    body := jsonb_build_object('scheduledAt',date_trunc('hour',now())),
    timeout_milliseconds := 300000
  );
$job$);

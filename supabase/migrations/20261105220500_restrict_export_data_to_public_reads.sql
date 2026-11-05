-- Public market data is readable in the browser; ingestion uses service_role.
DROP POLICY IF EXISTS "allow all" ON public.export_data;
DROP POLICY IF EXISTS export_data_public_select ON public.export_data;
CREATE POLICY export_data_public_select ON public.export_data
  FOR SELECT TO anon, authenticated USING (true);
REVOKE INSERT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER
  ON TABLE public.export_data FROM anon, authenticated;
GRANT SELECT ON TABLE public.export_data TO anon, authenticated;

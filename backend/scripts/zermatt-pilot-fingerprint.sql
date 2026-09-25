-- Compare the complete contents of every application table without exporting rows.
-- All statements share one consistent snapshot on each database.
BEGIN TRANSACTION ISOLATION LEVEL REPEATABLE READ READ ONLY;
SELECT format(
  'SELECT %L || E''\t'' || count(*)::text || E''\t'' || md5(coalesce(string_agg(md5(to_jsonb(t)::text), '''' ORDER BY md5(to_jsonb(t)::text)), '''')) FROM public.%I t;',
  tablename, tablename
)
FROM pg_catalog.pg_tables
WHERE schemaname = 'public'
ORDER BY tablename
\gexec
COMMIT;

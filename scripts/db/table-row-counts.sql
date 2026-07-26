\pset tuples_only on
\pset format unaligned
\set QUIET 1

select format(
  'select %L || chr(9) || count(*)::text from %I.%I;',
  table_name,
  table_schema,
  table_name
)
from information_schema.tables
where table_schema = 'public'
  and table_type = 'BASE TABLE'
order by table_name
\gexec


-- Quita la exposición vía RPC de la función event-trigger pre-existente
-- (corre como postgres; el event trigger NO se afecta).
revoke execute on function public.rls_auto_enable() from anon, public;

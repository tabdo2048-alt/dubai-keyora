-- The previous browser-side login precheck and failure logger did not guard
-- Supabase Auth's /token endpoint. Anonymous callers could invoke the logger
-- directly to create false failures and lock out users behind a shared IP.
-- Leave the historical rows untouched; rely on Auth's endpoint-level limits.
-- The existing deployed UI still calls check_login_rate before sign-in. Keep a
-- harmless, invoker-rights compatibility function until that UI is replaced;
-- revoking it before deployment would prevent existing clients from signing in.
revoke execute on function public.record_login_failure(text) from public, anon, authenticated;
create or replace function public.check_login_rate()
returns void language plpgsql security invoker set search_path = '' as $$ begin return; end; $$;

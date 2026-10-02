-- A login's role must be recorded at the time of the event. Existing rows stay
-- private to the platform owner because their historical role cannot be proven.
alter table public.audit_logs
  add column actor_was_admin boolean not null default true;

create index audit_logs_regular_logins_created_at_idx
  on public.audit_logs (created_at desc)
  where event_type = 'login' and actor_was_admin = false;

create function public.current_user_is_limited_audit_viewer()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from auth.users u
    join public.user_roles r on r.user_id = u.id and r.role = 'admin'
    where u.id = auth.uid()
      and lower(trim(u.email)) = 'hassan@admin.com'
  );
$$;

revoke all on function public.current_user_is_limited_audit_viewer() from public, anon, authenticated;
grant execute on function public.current_user_is_limited_audit_viewer() to authenticated;

drop policy if exists "Platform owner reads audit logs" on public.audit_logs;
create policy "Owner or limited viewer reads audit logs"
on public.audit_logs for select to authenticated
using (
  coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  and (
    (select public.current_user_is_platform_owner())
    or (
      (select public.current_user_is_limited_audit_viewer())
      and event_type = 'login'
      and actor_was_admin = false
      and actor_user_id is not null
    )
  )
);

create or replace function public.record_login_success()
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid := auth.uid();
  v_session_id uuid;
  v_tenant_id uuid;
  v_email text;
  v_was_admin boolean;
begin
  if v_user_id is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Authenticated non-anonymous user required' using errcode = '42501';
  end if;

  begin
    v_session_id := nullif(auth.jwt() ->> 'session_id', '')::uuid;
  exception when invalid_text_representation then
    v_session_id := null;
  end;

  select m.tenant_id into v_tenant_id
  from public.tenant_members m
  where m.user_id = v_user_id
  order by m.created_at asc
  limit 1;

  select coalesce(auth.jwt() ->> 'email', u.email) into v_email
  from auth.users u where u.id = v_user_id;

  select (
    exists (select 1 from public.user_roles r where r.user_id = v_user_id and r.role = 'admin')
    or exists (
      select 1 from public.tenant_members m
      where m.user_id = v_user_id and m.role::text in ('owner', 'admin')
    )
  ) into v_was_admin;

  insert into public.audit_logs (
    event_type, actor_user_id, actor_email, tenant_id, session_id, metadata, actor_was_admin
  ) values (
    'login', v_user_id, v_email, v_tenant_id, v_session_id,
    jsonb_build_object('method', 'password'), v_was_admin
  )
  on conflict (session_id) where event_type = 'login' and session_id is not null
  do nothing;
end;
$$;

revoke all on function public.record_login_success() from public, anon;
grant execute on function public.record_login_success() to authenticated;

-- Only the daily service-role job can list and remove abandoned, never-paid signups.
-- Both checks are repeated inside the final transaction so a webhook or a new
-- membership cannot turn a previously scanned tenant into an unsafe deletion.
create or replace function public.unpaid_signups_due_for_deletion(_limit integer default 10)
returns table (tenant_id uuid, user_id uuid, stripe_customer_id text)
language sql security definer set search_path = ''
as $$
  select t.id, m.user_id, t.stripe_customer_id
  from public.tenants t
  join public.tenant_members m on m.tenant_id = t.id and m.role = 'owner'
  join auth.users u on u.id = m.user_id
  where t.created_at <= now() - interval '5 days'
    and u.created_at <= now() - interval '5 days'
    and t.subscription_status = 'incomplete'
    and t.current_period_end is null
    and t.data_purged_at is null
    and not exists (select 1 from public.tenant_members x where x.tenant_id = t.id and x.user_id <> u.id)
    and not exists (select 1 from public.tenant_members x where x.user_id = u.id and x.tenant_id <> t.id)
    and not exists (select 1 from public.user_roles r where r.user_id = u.id and r.role = 'admin')
    and not exists (select 1 from storage.objects o where o.owner_id = u.id::text and o.name not like t.id::text || '/%')
  order by t.created_at, t.id
  limit greatest(1, least(coalesce(_limit, 10), 25));
$$;

revoke all on function public.unpaid_signups_due_for_deletion(integer) from public, anon, authenticated;
grant execute on function public.unpaid_signups_due_for_deletion(integer) to service_role;

create or replace function public.delete_unpaid_signup(_tenant uuid, _user uuid, _customer text)
returns boolean
language plpgsql security definer set search_path = ''
as $$
begin
  -- Serialize against webhook writes to this tenant. The caller has already
  -- checked Stripe directly, including open checkouts and paid invoices.
  perform 1 from public.tenants t where t.id = _tenant for update;

  if not exists (
    select 1 from public.tenants t
    join public.tenant_members m on m.tenant_id = t.id and m.user_id = _user and m.role = 'owner'
    join auth.users u on u.id = _user
    where t.id = _tenant
      and t.created_at <= now() - interval '5 days'
      and u.created_at <= now() - interval '5 days'
      and t.subscription_status = 'incomplete'
      and t.current_period_end is null
      and t.data_purged_at is null
      and t.stripe_customer_id is not distinct from _customer
      and not exists (select 1 from public.tenant_members x where x.tenant_id = t.id and x.user_id <> _user)
      and not exists (select 1 from public.tenant_members x where x.user_id = _user and x.tenant_id <> t.id)
      and not exists (select 1 from public.user_roles r where r.user_id = _user and r.role = 'admin')
      and not exists (select 1 from storage.objects o where o.owner_id = _user::text and o.name not like t.id::text || '/%')
  ) then return false; end if;

  delete from public.audit_logs where tenant_id = _tenant or actor_user_id = _user;
  delete from public.usage_events where tenant_id = _tenant or user_id = _user;
  delete from public.login_attempts where lower(email) = (select lower(email) from auth.users where id = _user);
  delete from public.tenants where id = _tenant;
  if not found then return false; end if;
  delete from auth.users where id = _user;
  if not found then raise exception 'Auth user vanished during cleanup'; end if;
  return true;
end;
$$;

revoke all on function public.delete_unpaid_signup(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.delete_unpaid_signup(uuid, uuid, text) to service_role;

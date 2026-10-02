-- Tenant-aware product metering, Mapbox billing estimates, and configurable
-- commercial limits. Raw security/audit history remains in audit_logs.

create table public.usage_events (
  id uuid primary key default gen_random_uuid(),
  tenant_id uuid references public.tenants(id) on delete set null,
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  session_id text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint usage_events_event_type_check check (
    event_type in (
      'mapbox_map_initialized',
      'cesium_initialized',
      'tour_opened',
      'scene_viewed',
      'pdf_generated',
      'project_viewed',
      'login_success'
    )
  ),
  constraint usage_events_session_length_check check (
    session_id is null or length(session_id) between 1 and 160
  ),
  constraint usage_events_metadata_object_check check (jsonb_typeof(metadata) = 'object'),
  constraint usage_events_metadata_size_check check (pg_column_size(metadata) <= 16384)
);

comment on table public.usage_events is
  'Immutable product-metering events. Browser callers insert only through record_usage_event(), which derives user and tenant identity from Auth.';
comment on column public.usage_events.event_type is
  'Mapbox billing uses mapbox_map_initialized only; logins and other events are never converted into estimated map loads.';

create index usage_events_tenant_id_idx on public.usage_events(tenant_id);
create index usage_events_user_id_idx on public.usage_events(user_id);
create index usage_events_event_type_idx on public.usage_events(event_type);
create index usage_events_created_at_idx on public.usage_events(created_at desc);
create index usage_events_tenant_period_idx
  on public.usage_events(tenant_id, created_at desc, event_type);
create index usage_events_event_period_idx
  on public.usage_events(event_type, created_at desc);
create unique index usage_events_mapbox_instance_uidx
  on public.usage_events(user_id, (metadata ->> 'map_instance_id'))
  where event_type = 'mapbox_map_initialized'
    and user_id is not null
    and metadata ? 'map_instance_id';
create unique index usage_events_public_mapbox_instance_uidx
  on public.usage_events(session_id, (metadata ->> 'map_instance_id'))
  where event_type = 'mapbox_map_initialized'
    and user_id is null
    and session_id is not null
    and metadata ? 'map_instance_id';

create table public.tenant_usage_daily (
  usage_date date not null,
  tenant_id uuid not null references public.tenants(id) on delete cascade,
  event_type text not null,
  event_count bigint not null default 0 check (event_count >= 0),
  primary key (usage_date, tenant_id, event_type),
  constraint tenant_usage_daily_event_type_check check (
    event_type in (
      'mapbox_map_initialized',
      'cesium_initialized',
      'tour_opened',
      'scene_viewed',
      'pdf_generated',
      'project_viewed',
      'login_success'
    )
  )
);

comment on table public.tenant_usage_daily is
  'Reproducible daily rollup populated from immutable usage_events. Raw events are retained for billing evidence and user drill-down.';
create index tenant_usage_daily_tenant_date_idx
  on public.tenant_usage_daily(tenant_id, usage_date desc);

create table public.usage_billing_settings (
  singleton boolean primary key default true check (singleton),
  monthly_free_mapbox_loads bigint not null default 50000 check (monthly_free_mapbox_loads >= 0),
  mapbox_pricing_tiers jsonb not null default '[
    {"up_to": 100000, "price_per_1000": 5},
    {"up_to": 200000, "price_per_1000": 4},
    {"up_to": 1000000, "price_per_1000": 3},
    {"up_to": 5000000, "price_per_1000": 2.5},
    {"up_to": null, "price_per_1000": 2.5}
  ]'::jsonb,
  currency text not null default 'USD' check (currency ~ '^[A-Z]{3}$'),
  billing_period text not null default 'monthly' check (billing_period in ('monthly', 'annual')),
  allocation_strategy text not null default 'proportional_usage'
    check (allocation_strategy in ('proportional_usage', 'included_quota_overage')),
  updated_by uuid references auth.users(id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint usage_billing_settings_tiers_array check (jsonb_typeof(mapbox_pricing_tiers) = 'array')
);

comment on table public.usage_billing_settings is
  'Editable provider-pricing configuration. Defaults match Mapbox GL JS public Map Loads pricing reviewed on 2026-09-28.';

insert into public.usage_billing_settings(singleton) values (true)
on conflict (singleton) do nothing;

create table public.tenant_usage_limits (
  tenant_id uuid primary key references public.tenants(id) on delete cascade,
  max_projects integer check (max_projects is null or max_projects >= 0),
  max_users integer check (max_users is null or max_users >= 0),
  max_360_tours integer check (max_360_tours is null or max_360_tours >= 0),
  max_storage_bytes bigint check (max_storage_bytes is null or max_storage_bytes >= 0),
  included_mapbox_loads bigint check (included_mapbox_loads is null or included_mapbox_loads >= 0),
  mapbox_overage_enabled boolean not null default true,
  mapbox_overage_price_per_1000 numeric(12,4) check (
    mapbox_overage_price_per_1000 is null or mapbox_overage_price_per_1000 >= 0
  ),
  limit_action text not null default 'soft_limit'
    check (limit_action in ('soft_limit', 'hard_limit', 'overage')),
  subscription_revenue numeric(14,2) check (subscription_revenue is null or subscription_revenue >= 0),
  revenue_period text check (revenue_period is null or revenue_period in ('monthly', 'annual')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.tenant_usage_limits is
  'Per-tenant product limits. NULL means unlimited. soft_limit is the safe default; hard_limit is opt-in.';

insert into public.tenant_usage_limits (
  tenant_id,
  max_projects,
  max_users,
  max_360_tours,
  max_storage_bytes,
  included_mapbox_loads,
  mapbox_overage_enabled,
  mapbox_overage_price_per_1000,
  limit_action
)
select id, 20, 10, 30, 21474836480, 25000, true, 5, 'soft_limit'
from public.tenants
on conflict (tenant_id) do nothing;

create or replace function public.create_default_tenant_usage_limits()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.tenant_usage_limits (
    tenant_id, max_projects, max_users, max_360_tours, max_storage_bytes,
    included_mapbox_loads, mapbox_overage_enabled,
    mapbox_overage_price_per_1000, limit_action
  ) values (new.id, 20, 10, 30, 21474836480, 25000, true, 5, 'soft_limit')
  on conflict (tenant_id) do nothing;
  return new;
end;
$$;

revoke all on function public.create_default_tenant_usage_limits() from public, anon, authenticated;

create trigger tenants_create_default_usage_limits
after insert on public.tenants
for each row execute function public.create_default_tenant_usage_limits();

create trigger usage_billing_settings_updated
before update on public.usage_billing_settings
for each row execute function public.update_updated_at_column();

create trigger tenant_usage_limits_updated
before update on public.tenant_usage_limits
for each row execute function public.update_updated_at_column();

create or replace function public.rollup_usage_event_daily()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.tenant_id is not null then
    insert into public.tenant_usage_daily(usage_date, tenant_id, event_type, event_count)
    values ((new.created_at at time zone 'UTC')::date, new.tenant_id, new.event_type, 1)
    on conflict (usage_date, tenant_id, event_type)
    do update set event_count = public.tenant_usage_daily.event_count + 1;
  end if;
  return new;
end;
$$;

revoke all on function public.rollup_usage_event_daily() from public, anon, authenticated;

create trigger usage_events_daily_rollup
after insert on public.usage_events
for each row execute function public.rollup_usage_event_daily();

create or replace function public.record_usage_event(
  _event_type text,
  _session_id text default null,
  _metadata jsonb default '{}'::jsonb,
  _tenant_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
  v_tenant_id uuid;
  v_session_id text;
  v_metadata jsonb;
  v_event_id uuid;
begin
  if v_user_id is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Authenticated non-anonymous user required' using errcode = '42501';
  end if;

  if _event_type not in (
    'mapbox_map_initialized', 'cesium_initialized', 'tour_opened',
    'scene_viewed', 'pdf_generated', 'project_viewed', 'login_success'
  ) then
    raise exception 'Unsupported usage event type';
  end if;

  if _tenant_id is not null then
    if public.is_platform_owner(v_user_id)
       and exists (select 1 from public.tenants t where t.id = _tenant_id) then
      v_tenant_id := _tenant_id;
    else
      select m.tenant_id into v_tenant_id
      from public.tenant_members m
      where m.tenant_id = _tenant_id and m.user_id = v_user_id
      limit 1;
    end if;
    if v_tenant_id is null then
      raise exception 'Cannot record usage for another tenant' using errcode = '42501';
    end if;
  else
    select m.tenant_id into v_tenant_id
    from public.tenant_members m
    where m.user_id = v_user_id
    order by m.created_at asc
    limit 1;
  end if;

  -- Platform-owner activity without an active tenant is retained as platform
  -- overhead; every normal user must resolve to a real membership.
  if v_tenant_id is null and not public.is_platform_owner(v_user_id) then
    raise exception 'No tenant membership found' using errcode = '42501';
  end if;

  if _metadata is null or jsonb_typeof(_metadata) <> 'object' then
    raise exception 'Usage metadata must be a JSON object';
  end if;

  v_metadata := _metadata - array['tenant_id', 'user_id', 'actor_user_id'];
  if pg_column_size(v_metadata) > 16384 then
    raise exception 'Usage metadata is too large';
  end if;

  v_session_id := left(
    coalesce(nullif(btrim(_session_id), ''), nullif(auth.jwt() ->> 'session_id', '')),
    160
  );

  insert into public.usage_events(tenant_id, user_id, event_type, session_id, metadata)
  values (v_tenant_id, v_user_id, _event_type, v_session_id, v_metadata)
  on conflict (user_id, (metadata ->> 'map_instance_id'))
    where event_type = 'mapbox_map_initialized'
      and user_id is not null
      and metadata ? 'map_instance_id'
  do nothing
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.record_usage_event(text, text, jsonb, uuid) from public, anon;
grant execute on function public.record_usage_event(text, text, jsonb, uuid) to authenticated;

-- Public visitors also create billable Mapbox Map instances. This narrowly
-- scoped endpoint records only that event, never accepts tenant/user identity,
-- validates client-generated UUIDs, deduplicates instances, and throttles a
-- browser session. Provider Mapbox reporting remains the invoice authority.
create or replace function public.record_public_mapbox_initialization(
  _session_id text,
  _metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_event_id uuid;
  v_instance_id text;
begin
  if auth.uid() is not null
     and not coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false) then
    raise exception 'Authenticated users must use record_usage_event' using errcode = '42501';
  end if;
  if _session_id is null
     or _session_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'A valid public session id is required';
  end if;
  if _metadata is null or jsonb_typeof(_metadata) <> 'object' then
    raise exception 'Usage metadata must be a JSON object';
  end if;
  v_instance_id := _metadata ->> 'map_instance_id';
  if v_instance_id is null
     or v_instance_id !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'A valid Mapbox instance id is required';
  end if;
  if pg_column_size(_metadata) > 4096 then
    raise exception 'Usage metadata is too large';
  end if;
  if _metadata - array['map_instance_id', 'map_mode', 'route'] <> '{}'::jsonb
     or coalesce(_metadata ->> 'map_mode', '') not in ('satellite', '3d', 'admin_location_picker', 'admin_plot_editor', 'admin_zone_editor')
     or length(coalesce(_metadata ->> 'route', '')) > 512 then
    raise exception 'Unsupported public Mapbox metadata';
  end if;
  if (
    select count(*)
    from public.usage_events e
    where e.user_id is null
      and e.session_id = _session_id
      and e.event_type = 'mapbox_map_initialized'
      and e.created_at >= now() - interval '1 minute'
  ) >= 10 then
    raise exception 'Public usage event rate limit exceeded' using errcode = '42900';
  end if;

  insert into public.usage_events(tenant_id, user_id, event_type, session_id, metadata)
  values (null, null, 'mapbox_map_initialized', _session_id, _metadata || '{"unverified_public":true}'::jsonb)
  on conflict (session_id, (metadata ->> 'map_instance_id'))
    where event_type = 'mapbox_map_initialized'
      and user_id is null
      and session_id is not null
      and metadata ? 'map_instance_id'
  do nothing
  returning id into v_event_id;

  return v_event_id;
end;
$$;

revoke all on function public.record_public_mapbox_initialization(text, jsonb) from public;
grant execute on function public.record_public_mapbox_initialization(text, jsonb) to anon, authenticated;

-- Hard limits are deliberately opt-in. Soft and overage modes continue serving
-- customers while the dashboard warns and attributes overage.
create or replace function public.enforce_tenant_resource_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_limit integer;
  v_count bigint;
  v_action text;
begin
  select l.limit_action,
    case tg_table_name
      when 'projects' then l.max_projects
      when 'tenant_members' then l.max_users
      when 'virtual_tours' then l.max_360_tours
    end
  into v_action, v_limit
  from public.tenant_usage_limits l
  where l.tenant_id = new.tenant_id;

  if v_action is distinct from 'hard_limit' or v_limit is null then
    return new;
  end if;

  execute format('select count(*) from public.%I where tenant_id = $1', tg_table_name)
    into v_count using new.tenant_id;

  if v_count >= v_limit then
    raise exception '% limit reached for this tenant', tg_table_name using errcode = '23514';
  end if;
  return new;
end;
$$;

revoke all on function public.enforce_tenant_resource_limit() from public, anon, authenticated;

create trigger projects_enforce_tenant_limit
before insert on public.projects
for each row execute function public.enforce_tenant_resource_limit();
create trigger tenant_members_enforce_tenant_limit
before insert on public.tenant_members
for each row execute function public.enforce_tenant_resource_limit();
create trigger virtual_tours_enforce_tenant_limit
before insert on public.virtual_tours
for each row execute function public.enforce_tenant_resource_limit();

alter table public.usage_events enable row level security;
alter table public.tenant_usage_daily enable row level security;
alter table public.usage_billing_settings enable row level security;
alter table public.tenant_usage_limits enable row level security;

revoke all on table public.usage_events from public, anon, authenticated;
revoke all on table public.tenant_usage_daily from public, anon, authenticated;
revoke all on table public.usage_billing_settings from public, anon, authenticated;
revoke all on table public.tenant_usage_limits from public, anon, authenticated;

grant select on table public.usage_events to authenticated;
grant select on table public.tenant_usage_daily to authenticated;
grant select, insert, update on table public.usage_billing_settings to authenticated;
grant select, insert, update on table public.tenant_usage_limits to authenticated;

create policy "Authorized users read usage events"
on public.usage_events for select to authenticated
using (
  coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  and (
    (select public.current_user_is_platform_owner())
    or user_id = (select auth.uid())
    or (tenant_id is not null and (select public.is_tenant_member(tenant_id, 'admin')))
  )
);

create policy "Authorized users read daily usage"
on public.tenant_usage_daily for select to authenticated
using (
  coalesce((select auth.jwt() ->> 'is_anonymous')::boolean, false) = false
  and (
    (select public.current_user_is_platform_owner())
    or (select public.is_tenant_member(tenant_id, 'admin'))
  )
);

create policy "Platform owner reads billing settings"
on public.usage_billing_settings for select to authenticated
using ((select public.current_user_is_platform_owner()));
create policy "Platform owner inserts billing settings"
on public.usage_billing_settings for insert to authenticated
with check ((select public.current_user_is_platform_owner()));
create policy "Platform owner updates billing settings"
on public.usage_billing_settings for update to authenticated
using ((select public.current_user_is_platform_owner()))
with check ((select public.current_user_is_platform_owner()));

create policy "Authorized admins read tenant limits"
on public.tenant_usage_limits for select to authenticated
using (
  (select public.current_user_is_platform_owner())
  or (select public.is_tenant_member(tenant_id, 'admin'))
);
create policy "Platform owner inserts tenant limits"
on public.tenant_usage_limits for insert to authenticated
with check ((select public.current_user_is_platform_owner()));
create policy "Platform owner updates tenant limits"
on public.tenant_usage_limits for update to authenticated
using ((select public.current_user_is_platform_owner()))
with check ((select public.current_user_is_platform_owner()));

create or replace function public.platform_usage_report(
  _start_at timestamptz,
  _end_at timestamptz,
  _tenant_id uuid default null,
  _user_id uuid default null,
  _event_type text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if auth.uid() is null
     or coalesce((auth.jwt() ->> 'is_anonymous')::boolean, false)
     or not public.is_platform_owner(auth.uid()) then
    raise exception 'forbidden: platform owner only' using errcode = '42501';
  end if;
  if _start_at is null or _end_at is null or _end_at <= _start_at
     or _end_at - _start_at > interval '400 days' then
    raise exception 'Invalid usage report date range';
  end if;
  if _event_type is not null and _event_type not in (
    'mapbox_map_initialized', 'cesium_initialized', 'tour_opened',
    'scene_viewed', 'pdf_generated', 'project_viewed', 'login_success'
  ) then
    raise exception 'Invalid usage event filter';
  end if;

  with
  filtered_events as (
    select e.*
    from public.usage_events e
    where e.created_at >= _start_at and e.created_at < _end_at
      and (_tenant_id is null or e.tenant_id = _tenant_id)
      and (_user_id is null or e.user_id = _user_id)
      and (_event_type is null or e.event_type = _event_type)
  ),
  event_totals as (
    select
      count(*) filter (where event_type = 'mapbox_map_initialized')::bigint as mapbox_loads,
      count(*) filter (where event_type = 'login_success')::bigint as logins,
      count(*) filter (where event_type = 'tour_opened')::bigint as tour_opens,
      count(*) filter (where event_type = 'pdf_generated')::bigint as pdfs,
      count(*) filter (where event_type = 'project_viewed')::bigint as project_views,
      count(distinct user_id) filter (where user_id is not null)::bigint as active_users
    from filtered_events
  ),
  tenant_events as (
    select e.tenant_id,
      count(*) filter (where event_type = 'mapbox_map_initialized')::bigint as mapbox_loads,
      count(*) filter (where event_type = 'login_success')::bigint as logins,
      count(*) filter (where event_type = 'tour_opened')::bigint as tour_opens,
      count(*) filter (where event_type = 'pdf_generated')::bigint as pdfs,
      count(*) filter (where event_type = 'project_viewed')::bigint as project_views,
      count(distinct user_id) filter (where user_id is not null)::bigint as active_users
    from filtered_events e
    where e.tenant_id is not null
    group by e.tenant_id
  ),
  storage_totals as (
    select case
        when split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
        then split_part(o.name, '/', 1)::uuid
      end as tenant_id,
      coalesce(sum(coalesce((o.metadata ->> 'size')::bigint, 0)), 0)::bigint as storage_bytes
    from storage.objects o
    where o.bucket_id in ('project-media', 'tour-panoramas', 'tour-thumbnails', 'tour-floorplans')
      and split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
    group by case
      when split_part(o.name, '/', 1) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
      then split_part(o.name, '/', 1)::uuid
    end
  ),
  tenant_rows as (
    select t.id, t.name, t.slug, t.plan, t.subscription_status, t.current_period_end,
      (select count(*) from public.tenant_members m where m.tenant_id = t.id)::bigint as users,
      (select count(*) from public.projects p where p.tenant_id = t.id)::bigint as projects,
      (select count(*) from public.virtual_tours vt where vt.tenant_id = t.id)::bigint as tours,
      coalesce(st.storage_bytes, 0)::bigint as storage_bytes,
      coalesce(te.mapbox_loads, 0)::bigint as mapbox_loads,
      coalesce(te.logins, 0)::bigint as logins,
      coalesce(te.tour_opens, 0)::bigint as tour_opens,
      coalesce(te.pdfs, 0)::bigint as pdfs,
      coalesce(te.project_views, 0)::bigint as project_views,
      coalesce(te.active_users, 0)::bigint as active_users,
      l.max_projects, l.max_users, l.max_360_tours, l.max_storage_bytes,
      l.included_mapbox_loads, l.mapbox_overage_enabled,
      l.mapbox_overage_price_per_1000, l.limit_action,
      l.subscription_revenue, l.revenue_period
    from public.tenants t
    left join tenant_events te on te.tenant_id = t.id
    left join storage_totals st on st.tenant_id = t.id
    left join public.tenant_usage_limits l on l.tenant_id = t.id
    where _tenant_id is null or t.id = _tenant_id
  ),
  user_rows as (
    select e.tenant_id, e.user_id, u.email,
      max(e.created_at) as last_active,
      count(*) filter (where e.event_type = 'login_success')::bigint as logins,
      count(*) filter (where e.event_type = 'mapbox_map_initialized')::bigint as mapbox_loads,
      count(*) filter (where e.event_type = 'tour_opened')::bigint as tour_opens,
      count(*) filter (where e.event_type = 'pdf_generated')::bigint as pdfs,
      count(*) filter (where e.event_type = 'project_viewed')::bigint as project_views
    from filtered_events e
    left join auth.users u on u.id = e.user_id
    where e.user_id is not null
    group by e.tenant_id, e.user_id, u.email
  ),
  daily_rows as (
    select (e.created_at at time zone 'UTC')::date as usage_date,
      e.tenant_id,
      count(*)::bigint as mapbox_loads
    from filtered_events e
    where e.event_type = 'mapbox_map_initialized'
    group by (e.created_at at time zone 'UTC')::date, e.tenant_id
  ),
  recent_rows as (
    select e.id, e.tenant_id, e.user_id, u.email, e.session_id, e.metadata, e.created_at
    from filtered_events e
    left join auth.users u on u.id = e.user_id
    where e.event_type = 'mapbox_map_initialized'
    order by e.created_at desc
    limit 100
  )
  select jsonb_build_object(
    'range', jsonb_build_object('start', _start_at, 'end', _end_at),
    'summary', jsonb_build_object(
      'total_tenants', (select count(*) from tenant_rows),
      'active_users', coalesce((select active_users from event_totals), 0),
      'mapbox_loads', coalesce((select mapbox_loads from event_totals), 0),
      'logins', coalesce((select logins from event_totals), 0),
      'tour_opens', coalesce((select tour_opens from event_totals), 0),
      'pdfs', coalesce((select pdfs from event_totals), 0),
      'projects', coalesce((select sum(projects) from tenant_rows), 0),
      'tours', coalesce((select sum(tours) from tenant_rows), 0),
      'storage_bytes', coalesce((select sum(storage_bytes) from tenant_rows), 0)
    ),
    'settings', coalesce((select to_jsonb(s) from public.usage_billing_settings s where s.singleton), '{}'::jsonb),
    'tenants', coalesce((select jsonb_agg(to_jsonb(t) order by t.mapbox_loads desc, t.name) from tenant_rows t), '[]'::jsonb),
    'users', coalesce((select jsonb_agg(to_jsonb(u) order by u.mapbox_loads desc, u.last_active desc) from user_rows u), '[]'::jsonb),
    'daily', coalesce((select jsonb_agg(to_jsonb(d) order by d.usage_date, d.tenant_id) from daily_rows d), '[]'::jsonb),
    'recent_mapbox', coalesce((select jsonb_agg(to_jsonb(r) order by r.created_at desc) from recent_rows r), '[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.platform_usage_report(timestamptz, timestamptz, uuid, uuid, text) from public, anon;
grant execute on function public.platform_usage_report(timestamptz, timestamptz, uuid, uuid, text) to authenticated;

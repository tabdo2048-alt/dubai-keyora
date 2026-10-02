-- Resolve legacy readable routes on the database without downloading up to 500
-- private project names. SECURITY INVOKER retains the projects/developers RLS.
create function public.find_project_by_readable_slug(_slug text)
returns uuid language sql stable security invoker set search_path = '' as $$
  select p.id from public.projects p
  left join public.developers d on d.id = p.developer_id
  where trim(both '-' from regexp_replace(lower(p.slug), '[^a-z0-9]+', '-', 'g')) = _slug
     or trim(both '-' from regexp_replace(lower(p.name), '[^a-z0-9]+', '-', 'g')) = _slug
     or trim(both '-' from regexp_replace(lower(p.name || '-' || coalesce(d.name, d.slug, '')), '[^a-z0-9]+', '-', 'g')) = _slug
  order by p.created_at desc limit 1;
$$;
revoke all on function public.find_project_by_readable_slug(text) from public;
grant execute on function public.find_project_by_readable_slug(text) to anon, authenticated;

-- Supports the name-only branch above; the developer-suffixed legacy route
-- remains a rare server-side scan rather than a bulk client download.
create index projects_readable_name_idx on public.projects
  ((trim(both '-' from regexp_replace(lower(name), '[^a-z0-9]+', '-', 'g'))));

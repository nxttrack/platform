// Each returned wall-clock interval is free under both UTC and Europe/Amsterdam
// interpretations. Separate dates keep
// the full test retry from overlapping a lesson created by the first attempt.
function availableWindowsSql(candidates) { return `
  with recursive ancestors as (
    select id, parent_resource_id from public.resources where tenant_id=$1 and id=$2
    union
    select parent.id, parent.parent_resource_id from public.resources parent
    join ancestors child on child.parent_resource_id=parent.id where parent.tenant_id=$1
  ), descendants as (
    select id from public.resources where tenant_id=$1 and id=$2
    union
    select child.id from public.resources child join descendants parent on child.parent_resource_id=parent.id
    where child.tenant_id=$1
  ), busy as (
    select starts_at, ends_at from public.session_resource_reservations
    where tenant_id=$1 and status='active'
      and resource_id in (select id from ancestors union select id from descendants)
    union all
    select starts_at, ends_at from public.session_instructor_reservations
    where tenant_id=$1 and status='active' and instructor_user_id=$3
    union all
    select starts_at, ends_at from public.season_blackout_periods
    where tenant_id=$1 and status='published' and (resource_id is null or resource_id=$2)
  ), candidates as (
    ${candidates}
  ), available as (
    select distinct on (wall_start::date) wall_start
    from candidates
    where not exists (
      select 1 from busy cross join (values ('UTC'), ('Europe/Amsterdam')) zones(zone)
      where busy.starts_at < (wall_start + interval '45 minutes') at time zone zones.zone
        and busy.ends_at > wall_start at time zone zones.zone
    )
    order by wall_start::date, wall_start
  )
  select to_char(wall_start, 'YYYY-MM-DD"T"HH24:MI') as "startsAt",
         to_char(wall_start + interval '45 minutes', 'YYYY-MM-DD"T"HH24:MI') as "endsAt"
  from available order by wall_start limit 2
`; }

export const adminSessionWindowsSql = availableWindowsSql(`
  select ($4::date + day_offset) + make_interval(hours => hour) as wall_start
  from generate_series(1, 12) day_offset cross join generate_series(6, 10) hour
`);

// Keep published occurrences outside the manual lesson's agenda window and
// inside the 700-day instructor qualification created by the UI journey.
export const adminPublicationWindowsSql = availableWindowsSql(`
  select ($4::date + day_offset) + interval '20 hours' as wall_start
  from generate_series(14, 650) day_offset
  where extract(isodow from $4::date + day_offset)=7
`);

export function requireAdminSessionWindows(rows) {
  if (rows.length !== 2 || rows.some((row) => !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(row.startsAt)
    || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(row.endsAt)
    || Date.parse(`${row.endsAt}Z`) - Date.parse(`${row.startsAt}Z`) !== 45 * 60_000)
    || rows[0].startsAt.slice(0, 10) === rows[1].startsAt.slice(0, 10)) {
    throw new Error("Two distinct free admin lesson dates are required.");
  }
  return rows;
}

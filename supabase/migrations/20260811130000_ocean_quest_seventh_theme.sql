-- Ocean Quest is an additive seventh immutable theme release. The four source
-- PNGs are copied byte-for-byte from the validated definitive source archive.

insert into public.portal_theme (theme_key, display_name, description)
values (
  'ocean-quest',
  'Ocean Quest',
  'Een interactieve onderwaterreis langs eilanden, parels en persoonlijke mijlpalen.'
)
on conflict (theme_key) do nothing;

insert into public.portal_theme_release (
  theme_key,
  release,
  status,
  portal_contract,
  manifest_schema_version,
  manifest_json,
  content_hash,
  published_at
) values (
  'ocean-quest',
  '3.0.0',
  'published',
  'parent-portal/1.2',
  3,
  '{"themePack":"1.0.0","registry":"web-build","parentContract":"parent-portal/1.2","childContract":"child-portal/1.0","assessmentScale":"five_point_v1","badgeArtworkMode":"placeholder-only","sourceArchiveSha256":"8d5b647dabc54c5a72ba279914307a31466cf1666d46933251eca36fee8ea579"}'::jsonb,
  '4b9b9523bd123dd2beaffb488049d22477a04a8c21c6c93c4eff5472d414cba2',
  now()
)
on conflict (theme_key, release) do nothing;

insert into public.portal_theme_asset (
  theme_key,
  theme_release,
  slot,
  asset_path,
  content_hash,
  mime_type,
  intrinsic_width,
  intrinsic_height,
  is_decorative
) values
  ('ocean-quest', '3.0.0', 'overview.hero.desktop', '/portal-themes/ocean-quest/journey-desktop.png', 'c8f4ca9f64608dffb2579d5494ff1cc811459e238b0b55727eda77296e64de7b', 'image/png', 1983, 793, true),
  ('ocean-quest', '3.0.0', 'overview.hero.mobile', '/portal-themes/ocean-quest/journey-mobile.png', 'fcfd746bb3b186d3e6a29702aa1eee020347f1b0491761eb14a8a79674fb1615', 'image/png', 853, 1844, true),
  ('ocean-quest', '3.0.0', 'progress.journey.desktop', '/portal-themes/ocean-quest/journey-desktop.png', 'c8f4ca9f64608dffb2579d5494ff1cc811459e238b0b55727eda77296e64de7b', 'image/png', 1983, 793, true),
  ('ocean-quest', '3.0.0', 'progress.journey.mobile', '/portal-themes/ocean-quest/journey-mobile.png', 'fcfd746bb3b186d3e6a29702aa1eee020347f1b0491761eb14a8a79674fb1615', 'image/png', 853, 1844, true),
  ('ocean-quest', '3.0.0', 'mascot.idle', '/portal-themes/ocean-quest/mascot.png', 'b84d87656b55646bc8bee3697b1b72093846d89e06f87055ca051a49f3a6dde0', 'image/png', 1706, 922, true),
  ('ocean-quest', '3.0.0', 'progress.chapter.completed', '/portal-themes/ocean-quest/journey-completed.png', '8183dc2282b61b234b103095774d813171b63d5f9b1207ed4f18d95ef7d619ca', 'image/png', 1983, 793, true)
on conflict (theme_key, theme_release, slot) do nothing;

insert into public.tenant_portal_theme_availability (
  tenant_id,
  theme_key,
  theme_release,
  is_enabled,
  reason
)
select
  tenant.id,
  'ocean-quest',
  '3.0.0',
  true,
  'Ocean Quest definitieve bronrelease v1.0.0'
from public.tenants tenant
on conflict (tenant_id, theme_key, theme_release) do nothing;

comment on column public.portal_theme_release.manifest_json is
  'Immutable release metadata; Ocean Quest 3.0.0 declares both parent-portal/1.2 and child-portal/1.0 recipes.';

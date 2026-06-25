alter table public.tenant_public_profiles
  add column if not exists logo_url text,
  add column if not exists hero_image_url text,
  add column if not exists hero_image_alt text,
  add column if not exists brand_primary_hex text not null default '#1d4ed8',
  add column if not exists brand_accent_hex text not null default '#b6ff2e',
  add column if not exists location_label text,
  add column if not exists footer_tagline text,
  add column if not exists contact_email text,
  add column if not exists contact_phone text,
  add column if not exists address_lines text[] not null default '{}'::text[],
  add column if not exists seo_title text,
  add column if not exists seo_description text,
  add column if not exists news_items jsonb not null default '[]'::jsonb,
  add column if not exists agenda_items jsonb not null default '[]'::jsonb;

alter table public.tenant_public_profiles
  drop constraint if exists tenant_public_profiles_primary_hex_check,
  add constraint tenant_public_profiles_primary_hex_check check (brand_primary_hex ~ '^#[0-9a-fA-F]{6}$');

alter table public.tenant_public_profiles
  drop constraint if exists tenant_public_profiles_accent_hex_check,
  add constraint tenant_public_profiles_accent_hex_check check (brand_accent_hex ~ '^#[0-9a-fA-F]{6}$');

alter table public.tenant_public_profiles
  drop constraint if exists tenant_public_profiles_news_items_check,
  add constraint tenant_public_profiles_news_items_check check (jsonb_typeof(news_items) = 'array');

alter table public.tenant_public_profiles
  drop constraint if exists tenant_public_profiles_agenda_items_check,
  add constraint tenant_public_profiles_agenda_items_check check (jsonb_typeof(agenda_items) = 'array');

drop policy if exists "Tenant staff can view tenant public profiles" on public.tenant_public_profiles;
create policy "Tenant staff can view tenant public profiles"
  on public.tenant_public_profiles
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant staff can view program public settings" on public.program_public_settings;
create policy "Tenant staff can view program public settings"
  on public.program_public_settings
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

drop policy if exists "Tenant staff can view intake configs" on public.intake_form_configs;
create policy "Tenant staff can view intake configs"
  on public.intake_form_configs
  for select
  to authenticated
  using (
    app_private.current_user_has_platform_role(array['platform_owner', 'platform_admin', 'platform_support'])
    or app_private.current_user_has_tenant_role(tenant_id, array['tenant_owner', 'tenant_admin', 'tenant_staff'])
  );

do $$
declare
  demo_tenant_id uuid;
begin
  select id into demo_tenant_id
  from public.tenants
  where slug = 'aquaswim-demo';

  if demo_tenant_id is null then
    return;
  end if;

  insert into public.tenant_public_profiles (
    tenant_id,
    status,
    hero_title,
    hero_subtitle,
    primary_cta_label,
    secondary_cta_label,
    intro_title,
    intro_body,
    logo_url,
    hero_image_url,
    hero_image_alt,
    brand_primary_hex,
    brand_accent_hex,
    location_label,
    footer_tagline,
    contact_email,
    contact_phone,
    address_lines,
    seo_title,
    seo_description,
    news_items,
    agenda_items
  )
  values (
    demo_tenant_id,
    'published',
    'Zwemles met vertrouwen bij AquaSwim',
    'Kleine groepen, persoonlijke begeleiding en realtime ouderinzage vanuit NXTTRACK.',
    'Plan intake',
    'Bekijk programma''s',
    'Van intake naar de juiste groep',
    'Ouders kiezen een programma, geven voorkeuren door en de zwemschool plaatst elk kind zorgvuldig in de juiste groep.',
    '/lovable/zwemdemo-logo.png',
    '/lovable/hero-swim.png',
    'Lachend kind met zwembril in zwembad',
    '#1d4ed8',
    '#b6ff2e',
    'Den Haag',
    'Samen elke druppel vooruit.',
    'info@aquaswim-demo.nl',
    '+31 70 123 45 67',
    array['Sportlaan 12', '2596 AB Den Haag']::text[],
    'AquaSwim Demo - zwemles met vertrouwen',
    'Bekijk zwemprogramma''s, proeflessen, intake en wachttijden van AquaSwim Demo.',
    '[
      {
        "title": "Zomervakantie intensieve lessen en versnelde trajecten",
        "body": "In de zomervakantie bieden wij extra intensieve lessen aan. Ideaal om een voorsprong te maken voor het nieuwe seizoen.",
        "date": "15 mei 2026"
      },
      {
        "title": "Nieuwe instroommomenten voor Zwemdiploma A",
        "body": "Er zijn nieuwe instroommomenten toegevoegd voor kinderen die klaar zijn voor hun eerste zwemroute.",
        "date": "1 juni 2026"
      },
      {
        "title": "Ouderportaal blijft de centrale plek",
        "body": "Voortgang, badges, berichten en diploma''s blijven zichtbaar vanuit de persoonlijke omgeving.",
        "date": "24 juni 2026"
      }
    ]'::jsonb,
    '[
      {
        "title": "Diploma A instroom",
        "time": "Maandag 16:00",
        "location": "Bad 1 - baan 1"
      },
      {
        "title": "Proeflesmoment",
        "time": "Zaterdag 11:00",
        "location": "Instructiebad"
      },
      {
        "title": "Afzwemmen Diploma A",
        "time": "Zaterdag 10:00",
        "location": "Wedstrijdbad"
      }
    ]'::jsonb
  )
  on conflict (tenant_id) do update
    set status = excluded.status,
        logo_url = excluded.logo_url,
        hero_image_url = excluded.hero_image_url,
        hero_image_alt = excluded.hero_image_alt,
        brand_primary_hex = excluded.brand_primary_hex,
        brand_accent_hex = excluded.brand_accent_hex,
        location_label = excluded.location_label,
        footer_tagline = excluded.footer_tagline,
        contact_email = excluded.contact_email,
        contact_phone = excluded.contact_phone,
        address_lines = excluded.address_lines,
        seo_title = excluded.seo_title,
        seo_description = excluded.seo_description,
        news_items = excluded.news_items,
        agenda_items = excluded.agenda_items;
end $$;

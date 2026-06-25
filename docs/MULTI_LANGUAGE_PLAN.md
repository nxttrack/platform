# NXTTRACK Multi-Language Readiness Plan

Last updated: 2026-06-25

Status: readiness plan and small code foundation. This is not a full translation sprint.

## 1. Goal

Prepare NXTTRACK for multiple languages without breaking the current Dutch swim-first product.

First supported languages:

- `nl` - Dutch.
- `en` - English.

Later language candidates:

- `pl` - Polish.
- `tr` - Turkish.
- `ar` - Arabic.
- `uk` - Ukrainian.

Multi-language support must work across public tenant pages, intake forms, parent portal messages, email templates, notifications, helpdesk, and knowledge base articles. Internal core concepts remain generic and tenant-aware.

## 2. Current State

Inspected areas:

- Routing: `apps/web/app/(tenant-public)`, `(parent)`, `(instructor)`, `(tenant-admin)`, `(platform-admin)`, `(nxttrack-marketing)`.
- Tenant settings: `public.tenant_settings` currently has `terminology_sector`, `locale`, and `timezone`.
- Platform settings and sector templates: `public.platform_settings.default_locale` and `public.sector_templates.default_locale`.
- Public tenant content: `tenant_public_profiles`, `program_public_settings`, `intake_form_configs`.
- Intake submissions and events: `intake_submissions`, `intake_submission_events`, smart intake decision tables.
- Communication: `message_templates`, `message_outbox`, `parent_notifications`, `communication_provider_configs`.
- Parent portal: lessons, notifications, documents, payments, progress, diplomas.
- Terminology: `apps/web/lib/tenant/terminology.ts`.
- Lovable-derived UI text: marketing, tenant public pages, parent/instructor/admin shells and route labels.
- Knowledge base/helpdesk: not implemented yet; planned in canon and roadmap.

Findings:

- Most current visible UI text is Dutch and hardcoded in React components.
- Tenant-specific public copy is already stored in tenant tables, but not language-versioned.
- Intake questions and options are stored as JSON, but labels are not yet language-versioned.
- Message templates are tenant-scoped and shortcode-based, but there is no language column or translation bundle.
- Parent notifications store rendered title/body only; no source language metadata is stored yet.
- Tenant terminology is sector-based and currently Dutch-first.
- Existing Dutch UI should remain the default and must not be refactored broadly in this sprint.

## 3. Recommended Strategy

Use a lightweight layered i18n approach:

1. Stable language constants in code.
2. Tenant language settings in database later.
3. Profile/guardian preferred language later.
4. Dictionary helpers for app chrome and shared labels.
5. Translation bundles for tenant-owned content.
6. Language-aware message templates and notifications.
7. Knowledge base/helpdesk content with language-specific articles.

This avoids introducing a heavy translation framework before content ownership, tenant settings, and UX are ready.

## 4. Data Model Direction

Recommended future schema changes:

- `tenant_settings.default_language text not null default 'nl'`.
- `tenant_settings.enabled_languages text[] not null default array['nl']::text[]`.
- `profiles.preferred_language text`.
- `participant_guardians.preferred_language text`.
- `tenant_public_profiles.translations jsonb not null default '{}'::jsonb`.
- `program_public_settings.translations jsonb not null default '{}'::jsonb`.
- `intake_form_configs.translation_bundle jsonb not null default '{}'::jsonb`.
- `message_templates.language text not null default 'nl'` or unique key `(tenant_id, code, language)`.
- `message_outbox.language text`.
- `parent_notifications.language text`.
- Future `knowledge_articles.language text` and `support_tickets.preferred_language text`.

Suggested translation bundle shape for tenant-owned content:

```json
{
  "nl": {
    "hero_title": "AquaSwim Demo zwemschool",
    "primary_cta_label": "Bekijk programma's"
  },
  "en": {
    "hero_title": "AquaSwim Demo swim school",
    "primary_cta_label": "View programs"
  }
}
```

For intake questions:

```json
{
  "nl": {
    "questions": {
      "swim_experience": {
        "label": "Heeft je kind al zwemervaring?"
      }
    }
  },
  "en": {
    "questions": {
      "swim_experience": {
        "label": "Does your child have swim experience?"
      }
    }
  }
}
```

## 5. Tenant Settings

Tenant admins should eventually control:

- Default language.
- Enabled public languages.
- Whether public language switcher is visible.
- Whether intake inherits tenant default or asks for parent preferred language.
- Whether message templates must exist in every enabled language before activation.

Platform admins should control:

- Languages allowed globally.
- Sector template default language.
- Platform-level knowledge base article languages.

## 6. Fallback Behavior

Canonical fallback order:

1. User/guardian preferred language.
2. Tenant default language.
3. Dutch fallback.

When a translation key is missing:

1. Try preferred language.
2. Try tenant default.
3. Try Dutch.
4. Show the stable key or existing Dutch content as a last-resort developer signal.

Public anonymous routes should use:

1. URL language segment as canonical public route, e.g. `/en`, `/en/programs`, `/en/intake`.
2. Cookie/query only as a future convenience for remembering preference or campaign links.
3. Browser `Accept-Language` only if tenant enabled.
4. Tenant default language.
5. Dutch.

Decision:

- Public language choice uses URL segments because this is best for SEO, shareable links, metadata, browser history, analytics, and crawler indexing.
- Dutch remains the canonical default without a `/nl` prefix for now.
- English is exposed through `/en/*`.
- Backoffice/admin/instructor operational shells stay Dutch-only until there is a real product reason to internationalize staff workflows.
- Arabic/RTL QA is not active yet. Arabic stays a future language candidate until RTL design and regression testing are explicitly scheduled.
- Tenant-managed translations are not enabled yet. English translation ownership is platform-only in this phase.

## 7. What To Translate Now

Current small implementation scope:

- `apps/web/lib/i18n/languages.ts`
- `apps/web/lib/i18n/dictionary.ts`
- `apps/web/lib/i18n/index.ts`
- `apps/web/lib/i18n/public-routing.ts`
- `apps/web/app/[language]/*`
- `apps/web/components/public-site/tenant-public-pages.tsx`

This adds:

- Supported languages: `nl`, `en`.
- Future language constants: `pl`, `tr`, `ar`, `uk`.
- Tenant language settings type.
- Language preference resolver.
- Basic Dutch/English dictionary for shared labels.
- Translation helper with Dutch fallback and interpolation.
- Public URL segment helper.
- English public tenant website chrome for home, programs, program detail, intake, news, and agenda.
- Intake redirect preservation for `/en/intake`.

No broad admin/backoffice UI refactor is included.

## 8. What To Translate Later

Later implementation should cover:

- Tenant public homepage copy and navigation.
- Program overview/detail public copy.
- Intake question labels, help text, options, consent text, and confirmation text.
- Tenant-owned CMS content translation bundles after platform approval.
- Slot offer public pages.
- Parent portal chrome and parent-facing content.
- Instructor/admin chrome only where necessary; tenant staff remains Dutch-first initially.
- Email/message templates per language.
- Parent notifications with source language metadata.
- Knowledge base and FAQ articles.
- Helpdesk ticket categories and suggested article text.

## 9. Tenant Terminology Rules

Language and terminology are related but not the same.

Examples:

| Generic concept | Dutch swim label | English swim label |
| --- | --- | --- |
| participant | leerling | learner |
| guardian | ouder/verzorger | parent/guardian |
| instructor | zweminstructeur | swim instructor |
| session | zwemles | swim lesson |
| stage | badje/niveau | stage/level |
| resource | bad/baan | pool/lane |
| milestone event | afzwemmen | certification event |

Core logic must keep using generic concepts. Tenant terminology maps those concepts to sector/language-specific labels.

## 10. Migration Risks

Risks:

- Adding language columns without default/fallback can break existing queries.
- Unique constraints on `message_templates(tenant_id, code)` must be redesigned before per-language templates.
- Translation JSON can become inconsistent without validation.
- Parent-facing fallback could show mixed Dutch/English if content is partially translated.
- Tenant-owned Dutch CMS text can still appear on `/en/*` until platform-managed translation bundles are implemented.
- Arabic will require RTL UI QA before activation and is explicitly not active now.

Mitigation:

- Add nullable/defaulted columns first.
- Backfill `nl` values from existing Dutch content.
- Validate translation bundles in server actions before saving.
- Keep Dutch as hard fallback.
- Add language-specific tests before enabling public language switcher.
- Keep tenant-managed translation editing disabled until the platform translation model, validation, and workflow are approved.

## 11. Implementation Tasks

Recommended next tasks:

1. Add typed platform-managed translation bundle validators for public content, intake configs, and templates.
2. Add language-aware read helpers for tenant-owned public content without exposing tenant editing yet.
3. Extend the route-aware public language switcher to slot offers and future public/support pages.
4. Add migration for tenant/profile/guardian language fields after the public fallback contract is stable.
5. Add template language model and preview validation.
6. Add parent/guardian preferred language capture during intake and account invitation.
7. Add knowledge base/helpdesk language fields when those modules are implemented.
8. Schedule RTL QA before activating Arabic.

## 12. Testing Plan

Required tests:

- Unit tests for `resolveLanguagePreference` and `translate`.
- Public page snapshot test with tenant default `nl`.
- Public page snapshot test with tenant default `en` after DB fields exist.
- Intake submission with Dutch labels remains unchanged.
- Missing English translation falls back to Dutch.
- Message template preview validates selected language and required variables.
- Parent notification stores intended language when language metadata exists.
- RLS tests confirm language settings do not expose cross-tenant content.
- Responsive QA for future language switcher on mobile tenant website.

## 13. Secrets

No external translation provider is selected or required for this phase.

Do not add `TRANSLATION_PROVIDER_API_KEY` now. If machine translation is later approved, add a placeholder to `.env.example` and `docs/REQUIRED_SECRETS.md` before implementation.

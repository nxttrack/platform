# Swim Start Enterprise Gap Analysis

Reviewed on: 2026-06-25  
Branch: `staging`  
Scope: current `nxttrack/platform` codebase versus the NXTTRACK canon and Swim Start launch surface.

## Purpose

The current platform has a broad working foundation: routing, shells, Supabase migrations, tenant isolation patterns, public intake, waitlist/placement, parent and instructor portals, manual payments, messages/documents/tasks/reports foundations, and platform admin controls.

The next goal is different from "make the pages exist". The goal is to make the Swim Start modules enterprise-worthy: predictable, secure, maintainable, tenant-configurable, data-backed, auditable, responsive, and ready for real swim schools.

This document defines what is present now, what is still open, and the recommended order to complete Swim Start.

## Canon Baseline

The canon says NXTTRACK must be:

- Swim-first in visible experience.
- Generic internally, so future sectors do not inherit hardcoded swimming concepts.
- Multi-tenant with strict tenant isolation.
- Built around the real workflow from public tenant website, intake, waitlist, placement, lessons, progress, payments, documents, reports, and daily operations.
- Clear that learning progress is separate from billing: a child moving stage/badge does not automatically change subscription or payment plan.

Relevant source documents:

- `docs/NXTTRACK_CANON.md`
- `docs/TECHNICAL_ARCHITECTURE.md`
- `docs/IMPLEMENTATION_ROADMAP.md`

Relevant implementation areas:

- `apps/web/app`
- `apps/web/components`
- `apps/web/lib`
- `supabase/migrations`

## Current Foundation

Implemented or largely present:

- App Router route groups for public tenant, auth boundary, parent, instructor, tenant admin, platform admin, and NXTTRACK marketing.
- Shared shell layout with role-specific navigation.
- Tenant/admin/parent/instructor trusted auth context.
- Supabase migrations for tenants, roles, programs, stages, groups, sessions, resources, participants, enrollments, progress, badges, certificates, intake, waitlist, slot offers, portals, attendance, afzwem, payments, messages, tasks, documents, reports, platform super admins, and global SMTP.
- RLS enabled across the domain migrations with role-based policies.
- Demo zwemschool seed data.
- Read models and server actions for many modules.
- Staging deployment flow and smoke/release gates.

Not enterprise-ready yet:

- Several pages are still placeholders or "prepared" surfaces.
- Search, filtering, pagination, sorting, import/export, and bulk actions are not consistently implemented.
- Mutations are mostly direct form actions; they need stronger validation, user feedback, audit logs, and transaction boundaries.
- Tenant branding and public website content are not yet fully tenant-admin manageable.
- File storage is prepared as records, but upload/download/access lifecycle is not complete.
- Message outbox is prepared, but delivery workers, retries, templates, previews, and SendGrid/SMTP observability are incomplete.
- Reports are export requests and summaries, not fully generated report products.
- E2E coverage, RLS tests, accessibility checks, and Lovable pixel QA need to be expanded.

## Tenant Admin Sidebar

The tenant admin sidebar is now grouped and sorted around daily swim-school operations:

- Overzicht
- Instroom
- Aanbod
- Planning
- Mensen
- Communicatie
- Financieel & inzicht
- Beheer

Implemented in:

- `apps/web/lib/navigation.ts`
- `apps/web/components/shell/app-shell.tsx`

Open enhancement:

- Active item detection currently follows the original shell behavior and highlights the first item. For enterprise navigation, the shell should become path-aware so the current route is highlighted inside each group.

## Swim Start Module Gap Matrix

| Module | Current state | Enterprise gap | Next tasks |
| --- | --- | --- | --- |
| Publieke tenantwebsite basis | Data-backed public snapshot exists via tenant domain/slug, tenant profile, public program settings, active programs, stages, and intake configs. UI uses Lovable-inspired components and assets. | Tenant admin cannot yet fully manage public profile, branding, hero imagery, program public copy, SEO, menu items, news, agenda, or custom domains from a polished UI. Some public pages are still placeholder content. | Build tenant website settings UI, make branding/assets configurable, complete homepage/program/detail/intake/news/agenda states, run Lovable visual QA. |
| Programma-overzicht | Public program listing reads `program_public_settings`, `programs`, `stages`, and intake config. Admin program/stage CRUD exists. | Program public content and internal program data are split but not easy to manage together. No publish preview, completeness checks, pricing/capacity validation, or archive workflow. | Add program publishing workflow, preview, validation, search/filter, and public settings management per program. |
| Eenvoudige inschrijving | Public intake creates `intake_submissions` and `intake_submission_events`. Intake type supports registration/trial/waitlist options. | Intake is not yet a polished enrollment journey. No duplicate detection, email confirmation, parent account creation, consent capture, spam protection, or admin triage SLA. | Add confirmation screen/email, duplicate matching, consent fields, validation feedback, lifecycle timeline, and optional parent account invite. |
| Basis intakeformulier | Intake config supports allowed options and custom questions. Preferred days/times are stored. | Config editor is missing. Question types are limited. No conditional questions, required validation per custom field, versioning, preview, or answer mapping to placement criteria. | Build intake config editor, add richer question types, publish/version configs, map answers to stage recommendation hints. |
| Leerlingenbeheer | Participants, enrollments, group memberships, progress, badges, certificates, guardians are read in admin domain. Participant/enrollment CRUD exists. | The page is still basic operational CRUD. No full learner profile, timeline, guardian/account linking workflow, documents/payments/progress tabs, merge/duplicate handling, or audit history. | Build enterprise learner profile, search/filter, guardian linking, enrollment history, status transitions, and audit trail. |
| Ouder/verzorgerbeheer | `participant_guardians`, profiles, and tenant memberships are read. Guardian CRUD exists but requires profile IDs. Parent portal uses guardian linkage. | No polished guardian management UI for creating/inviting parent accounts, multiple guardians, contact preferences, permissions, custody/privacy notes, or invite resend/reset. | Build parent/guardian management with email invite, profile creation, relationship permissions, communication preferences, and account status. |
| Instructeurs | Instructor table and CRUD exist. Instructor portal can link by profile/email and scope to assigned groups unless manager role. | No complete instructor account invite, availability, qualifications, substitutions, roster planning, or permission tuning. | Add instructor account lifecycle, availability/skills, assignment validation, and schedule/absence handling. |
| Groepen | Groups model and CRUD exist. Capacity checks are used in placement. | No full planning board editing, conflict detection, recurrence/session generation, overbooking policy, capacity reservations, or group lifecycle history. | Add planning board CRUD, recurrence/session generation, instructor/resource conflict validation, and group capacity controls. |
| Sessies/zwemlessen | Sessions model and CRUD exist. Parent/instructor portals read sessions. | Sessions are not yet generated from recurring groups, no cancellation/reschedule workflow, no make-up slot capacity, no lesson notes summary, no calendar export. | Build session generator, reschedule/cancel flow, calendar views, make-up availability, and session-level operational state. |
| Aanwezigheid | Instructor action upserts `session_attendance`. Instructor UI can register status. | Needs better roster UX, bulk attendance, late edits with reason, parent-visible absence rules, audit trail, catch-up integration, and attendance reporting. | Add bulk attendance, edit history, absence reason taxonomy, catch-up trigger, and attendance report metrics. |
| Eenvoudige wachtlijst | Waitlist entries, placement suggestions, capacity snapshots, slot offers, and accept/decline trigger exist. | Smart waitlist is basic. No prioritization rules, fairness policy, manual override audit, duplicate handling, messaging integration, SLA, or waitlist dashboard filters. | Add waitlist scoring rules, priority controls, filters, duplicate matching, offer communication, and complete event timeline. |
| Ouderportaal | Parent portal reads children, lessons, progress, badges, diplomas, notifications, documents, catch-up requests, invoices, payments. Read-status and catch-up request actions exist. | Depends on correct guardian account linkage. Needs polished mobile flows, account onboarding, message center, document download, payment detail, catch-up status tracking, and notification delivery. | Harden onboarding, improve child dashboard, complete notification/read state, document download rules, payment details, and catch-up lifecycle. |
| Instructeurportaal basis | Instructor portal reads agenda, groups, students, attendance, progress, notes, badges, and stage proposals. Actions exist for attendance, progress, notes, badges, stage proposals. | Needs lesson-day ergonomics, bulk actions, offline/poor-network behavior, role scoping tests, note visibility rules, and manager/instructor difference in UI. | Build focused lesson mode, bulk progress/attendance, note visibility controls, scoping tests, and mobile QA. |
| Berichten basis | Message templates, provider config, outbox, queue action, and global SMTP foundation exist. | Queued messages are not a complete sending system. No worker/retry/delivery log, template preview variables, unsubscribe/preferences, SendGrid API production mode, or tenant-level sender governance. | Implement message delivery worker, template preview, delivery events, retries, SendGrid adapter, and tenant communication settings. |
| Documenten basis | Tenant document records and parent documents exist. Certificates have file/download/share fields. | Storage is only prepared. No upload UI, signed URLs, file scanning, versioning, retention policy, visibility enforcement in UI, or download/share flow. | Build storage buckets, upload/download UI, signed URL access, document visibility rules, versioning, and retention controls. |
| Eenvoudige voortgang | Progress, stage modules, module progress, badge awards, achievement cards, and stage transition proposals exist. Parent/instructor surfaces read this data. | Needs complete stage/module definitions per program, assessment rubrics, approval of stage transitions, history, parent-friendly copy, and reporting. | Add module/rubric management, transition approval flow, progress timeline, parent copy, and analytics. |
| Basis betalingen/factuurstatus | Subscription plans are separate from stages. Manual invoices and payment records exist. Payment records sync invoice status and notify guardians. Mollie/iDEAL adapter is intentionally prepared but inactive. | Needs invoice numbering policy, payment corrections/refunds, exports, reminders, reconciliation, parent payment detail UX, and Mollie-ready provider lifecycle. | Harden manual invoice/payment flows, add corrections, reminders, exports, parent payment details, and adapter contract tests. |
| Tenant branding | Public profile data exists and logos/assets are used in UI. Tenant settings store terminology sector. | Tenant branding management is placeholder. Logo/hero/images/colors are not yet tenant-admin configurable. Public site still uses fixed Lovable assets in places. | Build branding/settings editor, store logo/hero/theme values, validate image sizes, add preview, and remove hardcoded tenant branding where inappropriate. |
| Basis rapportages | Report export requests exist for occupancy, waitlist, progress, payments. Admin dashboard shows summaries. | Reports are not yet generated reports. No filters, charts, downloads, scheduled exports, report permissions, or data quality checks. | Build real report queries, charts, filters, CSV/XLSX generation, export worker, and report access rules. |

## Cross-Cutting Enterprise Backlog

### 1. Tenant Configuration And Branding

Highest priority because it affects the public tenantwebsite, onboarding, and commercial perception.

Tasks:

- Replace `admin/instellingen` placeholder with real tenant settings.
- Manage `tenant_settings`, `tenant_public_profiles`, `program_public_settings`, and `intake_form_configs`.
- Add logo, hero image, brand colors, contact data, address, social links, SEO title/description, and legal links.
- Add preview/publish workflow for tenant public content.
- Keep internal models generic while using swim labels in visible tenant UI.

### 2. Admin UX Maturity

Tasks:

- Add consistent pending, success, error, and validation states to all forms.
- Add search, filters, sorting, pagination, and empty states.
- Add detail pages for learners, guardians, instructors, groups, sessions, invoices, and intakes.
- Add status transition actions instead of free-form status changes where lifecycle matters.
- Add audit log entries for every important admin mutation.
- Add import/export for participants, guardians, groups, and payments after core workflows are stable.

### 3. Workflow Integrity

Tasks:

- Make intake to waitlist to placement to slot offer to enrollment visible as one timeline.
- Add duplicate detection for intake/participants/guardians.
- Add group/resource/instructor conflict detection.
- Generate sessions from recurring groups with explicit review before publishing.
- Keep subscription/payment plan separate from stage transitions in all UI copy and actions.
- Add safe rollback/cancel flows for placement, enrollment, invoices, and sessions.

### 4. Security, Privacy, And RLS

Tasks:

- Add automated RLS tests per role: platform admin, tenant owner/admin, instructor, parent, athlete.
- Verify parent access only through `participant_guardians`.
- Verify instructor access only to assigned groups unless manager role.
- Add server action permission tests.
- Add audit logs for sensitive changes: guardians, roles, payments, documents, certificates, and SMTP settings.
- Add privacy controls for notes, documents, and messages.

### 5. Communication And Documents

Tasks:

- Implement message dispatch worker for SMTP first and SendGrid next.
- Add delivery status, retry, failure reasons, and preview/test sends.
- Add template variable validation.
- Implement tenant document upload, signed downloads, parent visibility, versioning, and retention.
- Connect progress/payment/slot-offer events to message templates where appropriate.

### 6. Payments

Tasks:

- Define invoice numbering and period rules.
- Add payment correction/refund flows.
- Add payment reminders and overdue status calculation.
- Add finance export.
- Keep Mollie/iDEAL adapter prepared, but only activate after manual flow is reliable.

### 7. Reporting

Tasks:

- Build real query-backed dashboards for occupancy, waitlist, progress, attendance, payments, and revenue.
- Add filters by program, stage, group, instructor, date range, status.
- Add CSV/XLSX export jobs.
- Add report permissions and audit.

### 8. Quality Bar

Tasks:

- Add E2E smoke tests for public intake, admin placement, parent portal, instructor attendance, manual payment, and document visibility.
- Add responsive QA for mobile tenant website, parent portal, instructor lesson mode, and admin sidebar.
- Add accessibility checks for forms, navigation, contrast, focus states, and labels.
- Add Lovable visual comparison for marketing and tenant public pages.
- Add production observability: structured logs, health checks, error reporting, and deployment release notes.

## Recommended Sprint Order

### Sprint 1: Swim Start Settings And Public Website

Goal: make the tenant public presence enterprise-manageable.

Scope:

- Tenant settings page becomes real.
- Branding and public website content editable by tenant admin.
- Program public settings and intake config editor.
- Public homepage, program overview, program detail, and intake polished with complete empty/error/submitted states.

Acceptance:

- Tenant admin can update public copy/branding without code changes.
- Public tenant website no longer depends on fixed demo assets except global NXTTRACK assets.
- Intake forms can be configured per program.

### Sprint 2: People And Enrollment Operations

Goal: make learner/guardian/enrollment management production usable.

Scope:

- Learner profile.
- Guardian management and account invitations.
- Enrollment lifecycle and group membership view.
- Duplicate detection and audit trail.

Acceptance:

- Admin can create/manage a child, guardians, enrollment, and active group placement from one coherent flow.
- Parent account linkage is clear and testable.

### Sprint 3: Planning, Sessions, And Attendance

Goal: make daily lesson operations reliable.

Scope:

- Group planning board.
- Recurring group to session generation.
- Resource/instructor conflict checks.
- Attendance bulk flow.
- Catch-up request lifecycle.

Acceptance:

- Admin can create a group schedule and sessions.
- Instructor can run a lesson from a mobile-first roster.
- Attendance can feed parent/catch-up/reporting flows.

### Sprint 4: Portals And Progress

Goal: make parent and instructor portals feel real, not just data mirrors.

Scope:

- Parent dashboard, lessons, notifications, documents, payments, progress.
- Instructor agenda, group roster, student assessment, notes, compliments.
- Progress modules, badge awards, achievement cards, stage transition approval.

Acceptance:

- Parent sees useful current-state information.
- Instructor can record progress and attendance efficiently.
- Stage transition stays separate from billing plan.

### Sprint 5: Messages, Documents, Payments, Reports

Goal: complete the operational support layer.

Scope:

- SMTP dispatch worker and SendGrid-ready adapter.
- Document upload/download.
- Manual invoice/payment corrections and reminders.
- Basic reports and exports.

Acceptance:

- Operational messages can be sent and tracked.
- Documents can be securely shared.
- Payment state is visible and correct.
- Reports are generated from real data.

### Sprint 6: Enterprise Hardening

Goal: make the system safe enough for real tenant onboarding.

Scope:

- RLS tests.
- E2E tests.
- Audit logs.
- Performance pass.
- Accessibility pass.
- Responsive and Lovable visual QA.
- Staging release checklist.

Acceptance:

- Critical workflows are covered by tests.
- Role isolation is verified.
- Staging can be used for product owner acceptance with confidence.

## Immediate Open Tasks

These are the highest-priority concrete tasks before calling Swim Start enterprise-ready:

1. Replace tenant settings placeholder with real settings/branding/public-content management.
2. Add path-aware active navigation in the shared shell.
3. Complete public tenant website management: hero, logo, colors, program copy, SEO, news/agenda placeholders or data sources.
4. Add intake config editor and public intake confirmation/email flow.
5. Build learner and guardian detail management with account invite/linking.
6. Add group/session planning board with conflict/capacity validation.
7. Add instructor lesson-day bulk attendance and progress UX.
8. Add parent portal onboarding and document/payment/detail flows.
9. Add message dispatch worker with SMTP first and SendGrid-ready adapter.
10. Add document storage upload/download lifecycle with signed access.
11. Add manual payment corrections, reminders, and export.
12. Build real reports instead of export request placeholders.
13. Add audit logs for sensitive writes.
14. Add RLS, server-action, and E2E tests for Swim Start workflows.
15. Run Lovable pixel QA for tenant marketing, backoffice, parent portal, and instructor portal.

## Summary

The foundation is broad and promising. Swim Start is not yet enterprise-ready because the platform still needs managed tenant branding, polished operational workflows, lifecycle controls, auditability, stronger tests, and production-grade communication/document/reporting/payment handling.

The right next move is not to add more modules. It is to harden the existing Swim Start modules in the sprint order above, starting with tenant settings and the public tenant website because they shape the first real customer experience.

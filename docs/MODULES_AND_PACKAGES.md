# NXTTRACK Modules And Packages

Last updated: 2026-06-25

Status: planning and packaging reference. Commercial package names may change, but module boundaries and dependencies are canonical for implementation planning.

## 1. Module Boundary Rules

- Visible swim-school labels are allowed in UI and templates.
- Internal modules use generic concepts: participant, guardian, instructor, session, resource, stage, entitlement, incident, integration.
- Modules must not require swimming-only core tables.
- Billing, learning progress, placement, and access control remain separate domains connected by explicit events.
- External integrations are optional provider adapters, not required core behavior.

## 2. Base Platform Modules

These are foundational and apply to all tenants/sectors.

| Module | Purpose | Current status |
| --- | --- | --- |
| Tenancy & roles | Tenant isolation, platform admin, tenant staff, instructor, parent roles | Implemented foundation |
| Terminology | Swim-first labels over generic internals | Implemented foundation |
| Public tenant website | Tenant marketing, programs, intake entry | Implemented and being matured |
| Core domain | Programs, stages, groups, sessions, resources, enrollments | Implemented foundation |
| Parent portal | Lessons, child profile, notifications, docs, payments, progress | Implemented foundation |
| Instructor portal | Agenda, roster, attendance, notes, progress | Implemented foundation |
| Tenant admin | Dashboard, planning, people, operations | Implemented foundation |
| Smart Flow Engine | Decisions, reasons, blockers, automation, AI suggestions | Implemented foundation through S13 |
| Communication foundation | In-app/email templates, SMTP first, SendGrid-ready | Implemented foundation |
| Documents & reports | Document records, reports, exports, audit | Implemented foundation |

## 3. Swim Start Package

Goal: the first complete usable swim-school operational product.

Included modules:

- Public tenant website basis.
- Program overview.
- Simple registration/intake.
- Basic intake form.
- Learner management.
- Guardian management.
- Instructors.
- Groups.
- Sessions/swim lessons.
- Attendance.
- Simple waitlist.
- Parent portal.
- Instructor portal basis.
- Basic messages.
- Basic documents.
- Simple progress.
- Basic payments/invoice status.
- Tenant branding.
- Basic reports.

Implementation principle:

Swim Start must be stable, responsive, Lovable-aligned, auditable, and tenant-isolated before Pro/Enterprise modules deepen the product.

## 4. Swim Pro Modules

Goal: make tenant operations commercially stronger and more efficient.

| Module group | Included modules | Dependencies |
| --- | --- | --- |
| Billing & Incasso Engine | Registration fee, one-off payments, payment periods, reminders, failed-payment signals, batch payments, SEPA readiness, iDEAL/Mollie activation later | Manual payments, provider secrets, billing audit |
| Flexrooster & Flex Fill Engine | Flex schedule, open spot detection, auto-fill suggestions, make-up credit placement, trial placement, extra paid lesson placement | Sessions, capacity, credits, placement rules |
| Webshop & Credits Engine | Activities, articles, extra lessons, make-up credits, vacation lessons, entitlements after purchase | Billing, catalog, sessions, capacity |
| Staff Competency & Leave Engine | Staff profile, competencies, certificates, BHV/EHBO tracking, leave requests, replacement signals | Staff model, planning, tenant policy |
| Communication Escalation Engine | Segmented communication, escalation policies, emergency broadcast without external WhatsApp/SMS by default | Communication foundation, consent/preference model |
| Tenant Customer Helpdesk | Parent tickets, ticket categories/status, internal notes, child/program/group/payment context | Parent identity, messages, permissions |
| Knowledge Base | Tenant/platform articles, FAQ, suggested help articles | Helpdesk, content management, multilingual readiness |

Pro modules can be released incrementally. None of them should bypass Swim Start security or audit.

## 5. Swim Enterprise Modules

Goal: support larger tenants, physical access workflows, compliance administration, and deeper integrations.

| Module group | Included modules | Dependencies |
| --- | --- | --- |
| Access Control & Auto Attendance | QR, barcode, RFID, lesson-window validation, auto attendance, manual correction | Sessions, attendance, provider/hardware integration, audit |
| Safety & Compliance Engine | Incidents, accidents, BHV records, complaints, checklists, instructor certification tracking, tenant-defined standards, NRZ-related tracking | Permissions, audit logs, legal wording |
| Advanced Communication | WhatsApp Business API urgent escalation, SMS fallback, push if available, advanced multilingual templates | Consent, channel policy, provider secrets |
| Advanced Integration Layer | Bookkeeping, CRM/ticket systems, access hardware, webhooks, API keys, retry logs | Integration registry, secret storage, provider contracts |

Enterprise modules require explicit provider, privacy, and legal decisions before implementation.

## 6. Cross-Cutting Modules

## Multi-Language Support

Used by:

- Public tenant website.
- Program/stage content.
- Intake forms.
- Message templates.
- Helpdesk and knowledge base.
- Emergency communication.

Implementation posture:

- Prepare early.
- Translate display content, not internal keys.
- Dutch remains first swim-school language.
- Advanced multilingual template management is later.

## Integration Settings

Used by:

- Mollie.
- Bookkeeping.
- WhatsApp Business API.
- SMS provider.
- Access control hardware.
- CRM/ticket systems.
- Webhooks/API keys.

Implementation posture:

- Add placeholders and settings structure early.
- Do not call providers until secrets, policy, and tests are ready.
- Keep tenant-specific credentials out of Git.

## 7. Dependency Order

Recommended dependency order:

1. Swim Start operational foundation.
2. Architecture readiness for languages, billing concepts, channel taxonomy, staff competencies, integration placeholders.
3. Billing & Incasso Engine.
4. Flexrooster, Flex Fill, Webshop, Credits.
5. Staff Competency & Leave.
6. Communication Escalation, Helpdesk, Knowledge Base.
7. Access Control, Auto Attendance, Safety/Compliance, Advanced Integrations.

Reasoning:

- Billing and capacity must exist before paid credits or webshop fulfillment.
- Staff profiles and planning must exist before leave and replacement signals are meaningful.
- Communication channels and consent must exist before WhatsApp/SMS escalation.
- Access control hardware must wait for attendance, sessions, audit, and provider contracts.
- Safety/compliance must wait for strong permissions and legal wording.

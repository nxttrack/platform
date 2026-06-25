# NXTTRACK Smart Features Canon

Last updated: 2026-06-25

Status: official feature-domain extension for swim-school growth, pro, and enterprise modules. This document extends `docs/NXTTRACK_CANON.md` and `docs/SMART_FLOW_CANON.md`.

## 1. Purpose

The latest swim-school feature comparison identified additional domains that NXTTRACK must support later. These domains are now part of the official product canon, but they are not all MVP scope.

NXTTRACK remains swim-first in visible labels and sector-flexible internally.

Examples:

| Swim-school label | Generic internal concept |
| --- | --- |
| leerling | participant |
| ouder/verzorger | guardian |
| zweminstructeur | instructor |
| zwemles | session |
| badje | stage |
| baan/bad/ruimte | resource |
| afzwemmen | milestone event / certification event |
| inhaalleskaart | entitlement / credit |
| incident/BHV-melding | safety record |

Rule: new modules must use generic core concepts and tenant/sector terminology for swim-specific labels.

## 2. Official Module Groups

## Billing & Incasso Engine

Purpose: make swim-school billing operationally mature without coupling billing to progress.

Included features:

- iDEAL.
- SEPA incasso.
- Registration fee.
- One-off payments.
- Batch payments.
- Payment periods.
- Payment reminders.
- Failed payment signals.
- Financial overviews.

Core concepts:

- Payment provider.
- Payment method.
- Payment mandate.
- Payment batch.
- Invoice/payment period.
- Registration fee.
- One-off charge.
- Payment reminder.
- Failed payment signal.

Rules:

- Subscription/payment plan remains separate from stage, group, and progress.
- Registration fees can be tied to an enrollment lifecycle, but must not automatically place a participant.
- SEPA mandates require explicit consent and audit.
- Payment batches must be traceable and reversible by correction flow, not by deleting history.

Roadmap placement:

- Registration fee model and SEPA readiness: early architecture preparation.
- Batch payments and one-off payments: Growth / Pro.
- Live incasso automation: Enterprise or provider-approved later stage.

## Flexrooster & Flex Fill Engine

Purpose: allow tenants to work with flexible sessions beside fixed recurring groups and fill open spots responsibly.

Included features:

- Flex schedule beside regular schedule.
- Open spot detection.
- Auto-fill empty lesson spots.
- Make-up credit placement.
- Trial lesson placement.
- Extra paid lesson placement.
- Priority rules for open spots.

Core concepts:

- Flexible session.
- Open capacity slot.
- Capacity hold.
- Placement candidate.
- Entitlement/credit.
- Priority rule.
- Fill suggestion.

Rules:

- Auto-fill is not blind auto-placement. It must use capacity, eligibility, priority, and tenant policy.
- A make-up credit gives eligibility to book or be placed into a suitable spot; it does not change stage or subscription.
- Trial lesson and extra lesson placement must respect capacity and instructor/resource constraints.

Roadmap placement:

- Capacity foundation: existing smart flow/capacity phases.
- Flex schedule and auto-fill: Growth / Pro.

## Webshop & Credits Engine

Purpose: let tenants sell products, activities, and lesson-related entitlements through NXTTRACK.

Included features:

- Sell activities with time slots.
- Sell products/articles.
- Sell extra lessons.
- Sell make-up lesson credits.
- Sell vacation lessons.
- Generate credits/entitlements after purchase.
- Connect webshop to capacity and sessions.

Core concepts:

- Catalog item.
- Sellable activity.
- Product/article.
- Time slot.
- Entitlement.
- Credit balance.
- Fulfillment event.
- Purchase/order.

Rules:

- A webshop purchase creates an order and, if applicable, an entitlement.
- A credit/entitlement must have eligibility rules, expiry, and usage history.
- Capacity-linked products must reserve or validate session capacity.

Roadmap placement:

- Growth / Pro after billing and capacity foundations.

## Staff Competency & Leave Engine

Purpose: make staff planning safer and more reliable.

Included features:

- Staff profile information.
- Instructor competencies.
- Certificates.
- BHV/EHBO tracking.
- Leave requests.
- Leave approval.
- Replacement signals.
- Competency-aware scheduling.

Core concepts:

- Staff profile.
- Competency.
- Credential.
- Certificate.
- Availability exception.
- Leave request.
- Replacement requirement.
- Planning warning.

Rules:

- Instructor competency can influence scheduling, but tenant policy decides whether it blocks or warns.
- BHV/EHBO fields are tenant records; they do not imply legal compliance by themselves.
- Leave approval must create planning signals for affected groups/sessions.

Roadmap placement:

- Staff competency basic model: early architecture preparation.
- Leave planning and competency-aware scheduling: Growth / Pro.

## Access Control & Auto Attendance

Purpose: connect check-in events to session validation and attendance later.

Included features:

- QR check-in.
- Barcode check-in.
- RFID check-in.
- Lesson time validation.
- Access only during assigned lesson windows.
- Automatic attendance.
- Manual correction by instructor/admin.

Core concepts:

- Access credential.
- Check-in event.
- Session window.
- Attendance suggestion.
- Attendance record.
- Manual correction.

Rules:

- Hardware check-in is evidence, not absolute truth.
- Instructor/admin correction must remain possible and audited.
- Access is only valid during allowed windows and for eligible participants.
- Hardware provider secrets and webhook signing must be handled through the secrets registry.

Roadmap placement:

- Enterprise / later.

## Safety & Compliance Engine

Purpose: support tenant safety administration and structured evidence.

Included features:

- Incident registration.
- Accident registration.
- BHV records.
- Complaints management.
- Checklists.
- Instructor certification tracking.
- Tenant-defined standards.
- NRZ-related tracking without claiming automatic compliance.
- Audit logs.

Core concepts:

- Safety record.
- Incident.
- Accident.
- Complaint.
- Checklist.
- Standard/norm.
- Evidence item.
- Review action.
- Audit event.

Rules:

- NXTTRACK can store tenant-defined standards and NRZ-related tracking fields.
- NXTTRACK must not claim automatic NRZ or legal compliance without explicit certification/legal approval.
- Safety records are sensitive and must have strong permissions and audit.

Roadmap placement:

- Enterprise / later.

## Communication Escalation Engine

Purpose: manage communication by urgency, consent, and channel reliability.

Included channel order:

1. App notification first.
2. Email second.
3. Push if available.
4. WhatsApp only for urgent reminders or no response.
5. SMS fallback only if needed.

Included features:

- Emergency broadcast.
- Segmented communication.
- Urgent reminders.
- No-response escalation.
- Delivery status and audit.

Core concepts:

- Communication channel.
- Audience segment.
- Consent/preference.
- Escalation policy.
- Delivery attempt.
- Emergency broadcast.

Rules:

- WhatsApp and SMS are not default bulk channels.
- Urgent escalation needs tenant policy, consent, cost controls, opt-out handling, and provider approval.
- Emergency broadcast must be auditable.

Roadmap placement:

- Communication channel model: early architecture preparation.
- Segmented communication and helpdesk messages: Growth / Pro.
- WhatsApp Business API and SMS fallback: Enterprise / later.

## Integration Layer

Purpose: provide a safe tenant-aware foundation for provider integrations.

Included integrations:

- Mollie.
- Bookkeeping integrations later.
- WhatsApp Business API later.
- SMS provider later.
- Access control hardware later.
- CRM/ticket systems later.
- Webhooks.
- API keys.
- Integration settings per tenant.

Core concepts:

- Integration provider.
- Integration connection.
- Webhook endpoint.
- Webhook event.
- API key.
- Secret reference.
- Retry log.
- Sync status.

Rules:

- No real provider secrets in Git.
- Tenant-specific credentials need approved encrypted storage.
- Webhooks must be signed, verified, idempotent, and audited.
- Integration failures must be visible to admins.

Roadmap placement:

- Integration settings placeholder: early architecture preparation.
- Advanced provider integrations: Enterprise / later.

## Tenant Customer Helpdesk & Knowledge Base

Purpose: give parents a structured support path and reduce admin workload.

Included features:

- Parent support tickets.
- Ticket status flow.
- Ticket categories.
- Internal notes.
- Automatic context from child/program/group/payment.
- Customer knowledge base.
- Suggested help articles.
- Self-service FAQ.

Core concepts:

- Support ticket.
- Ticket category.
- Ticket status.
- Ticket assignment.
- Internal note.
- Context link.
- Knowledge article.
- Suggested article.

Rules:

- Parent-facing ticket views must never show internal notes.
- Automatic context must respect permissions.
- Knowledge base content can be platform-level or tenant-level.
- Suggested help articles are suggestions, not AI-only support decisions.

Roadmap placement:

- Growth / Pro.

## 3. Multilingual Policy

Multi-language support is a cross-cutting foundation, not a single page.

Scope:

- Tenant default language.
- Supported languages per tenant.
- Public content translations.
- Program/stage labels.
- Message templates.
- Helpdesk/knowledge base articles.
- Future advanced multilingual templates.

Rules:

- Keep internal keys stable and translate display labels/copy.
- Dutch remains the first swim-school language.
- Avoid hardcoding visible Dutch strings into core logic.
- Advanced multilingual template management belongs after the basic template system is stable.

Roadmap placement:

- Multi-language readiness: early architecture preparation.
- Advanced multilingual templates: Enterprise / later.

## 4. Packaging View

Suggested commercial grouping:

| Package | Modules |
| --- | --- |
| Swim Start | Public tenant site, intake, learners, guardians, instructors, groups, sessions, attendance, waitlist, parent/instructor portals, messages, documents, progress, manual payments, branding, basic reports |
| Swim Pro | Billing & Incasso, flexrooster, flex fill, webshop, credits, staff competencies, leave, segmented communication, helpdesk, knowledge base |
| Swim Enterprise | Access control, auto attendance, safety/compliance, advanced integrations, WhatsApp/SMS escalation, advanced multilingual templates |

Packaging may change commercially, but the dependency order should remain foundation first, provider/hardware later.

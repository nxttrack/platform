# NXTTRACK Required Secrets Registry

Last updated: 2026-06-25

Status: canonical registry for environment variables, credentials, webhook secrets, API keys, and safe placeholders. Never commit real secrets.

## 1. Rules

- Use placeholders only in docs and `.env.example`.
- Real values live in GitHub Environments, VPS environment files, Supabase secret storage, or an approved secret manager.
- Keep staging and production values separate.
- Never expose provider secrets with `NEXT_PUBLIC_`.
- Do not add a secret to deployment before consuming code and logging safeguards exist.
- Tenant-specific integration credentials require an approved encrypted-storage design before implementation.

Safe placeholder value:

```txt
placeholder_add_later
```

## 2. Existing Core Runtime Secrets

| Secret name | What it is for | Required now or later | Where to obtain it | Module | Safe placeholder |
| --- | --- | --- | --- | --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project URL exposed to browser | Required now | Supabase project settings | Supabase client | empty in `.env.example` until configured |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable browser key | Required now | Supabase API settings | Supabase client | empty in `.env.example` until configured |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Legacy Supabase anon browser key fallback | Later/legacy | Supabase API settings | Supabase client | empty in `.env.example` until configured |
| `SUPABASE_SECRET_KEY` | Server-side Supabase secret key | Required now for admin/server tasks | Supabase API settings | Supabase server/admin | empty in `.env.example` until configured |
| `DATABASE_URL` | Direct Postgres connection for migrations | Required for migration deploy | Supabase database settings | Database migrations | empty in `.env.example` until configured |
| `SMTP_HOST` | SMTP host | Required when email sends live | SendGrid or SMTP provider | Communication | empty in `.env.example` until configured |
| `SMTP_PORT` | SMTP port | Required when email sends live | SendGrid or SMTP provider | Communication | `587` |
| `SMTP_USER` | SMTP username | Required when email sends live | SendGrid or SMTP provider | Communication | empty in `.env.example` until configured |
| `SMTP_PASS` | SMTP password/API key | Required when email sends live | SendGrid or SMTP provider | Communication | empty in `.env.example` until configured |
| `SMTP_FROM_EMAIL` | Verified sender email | Required when email sends live | SendGrid verified sender/domain | Communication | empty in `.env.example` until configured |
| `SMTP_FROM_NAME` | Sender display name | Required when email sends live | Tenant/platform policy | Communication | empty in `.env.example` until configured |
| `SENDGRID_API_KEY` | SendGrid API adapter key | Later, when API adapter is activated | SendGrid dashboard | Communication | empty in `.env.example` until configured |
| `OPENAI_API_KEY` | OpenAI API key for AI assistant suggestions | Later, only when AI assistant is activated | OpenAI platform project | AI Assistant Layer | empty in `.env.example` until configured |

## 3. Future Billing & Incasso Secrets

| Secret name | What it is for | Required now or later | Where to obtain it | Module | Safe placeholder |
| --- | --- | --- | --- | --- | --- |
| `MOLLIE_API_KEY` | Mollie/iDEAL/SEPA API calls | Later | Mollie dashboard | Billing & Incasso Engine | `placeholder_add_later` |
| `MOLLIE_WEBHOOK_SECRET` | Verify Mollie webhook calls | Later | Generated during webhook setup | Billing & Incasso Engine | `placeholder_add_later` |
| `MOLLIE_PROFILE_ID` | Select Mollie profile/account | Later | Mollie dashboard | Billing & Incasso Engine | `placeholder_add_later` |
| `SEPA_CREDITOR_ID` | Conditional creditor metadata only if Mollie/provider setup later requires it | Later/conditional | Mollie contract, bank, or payment provider if required | Billing & Incasso Engine | `placeholder_add_later` |

Notes:

- Product decision: SEPA direct debit runs through Mollie first. Direct bank/SEPA secrets should not be added unless the Mollie/provider path explicitly requires extra creditor metadata.
- SEPA mandate consent must be stored as domain/audit data, not only as a secret.

## 4. Future Communication Escalation Secrets

| Secret name | What it is for | Required now or later | Where to obtain it | Module | Safe placeholder |
| --- | --- | --- | --- | --- | --- |
| `WHATSAPP_BUSINESS_TOKEN` | WhatsApp Business API send/auth token if provider is approved | Later | Provider not selected yet; likely Meta/WhatsApp Business platform or approved partner | Communication Escalation Engine | `placeholder_add_later` |
| `WHATSAPP_BUSINESS_PHONE_NUMBER_ID` | WhatsApp sender phone number ID if provider is approved | Later | Provider not selected yet | Communication Escalation Engine | `placeholder_add_later` |
| `WHATSAPP_WEBHOOK_SECRET` | Verify inbound WhatsApp callbacks if provider is approved | Later | Generated during selected provider setup | Communication Escalation Engine | `placeholder_add_later` |
| `SMS_PROVIDER_API_KEY` | SMS provider send/auth key | Later | Selected SMS provider | Communication Escalation Engine | `placeholder_add_later` |
| `SMS_PROVIDER_WEBHOOK_SECRET` | Verify SMS delivery callbacks | Later | Selected SMS provider | Communication Escalation Engine | `placeholder_add_later` |
| `PUSH_VAPID_PUBLIC_KEY` | Web push public VAPID key | Later, if push is activated | Generated by platform | Communication Escalation Engine | `placeholder_add_later` |
| `PUSH_VAPID_PRIVATE_KEY` | Web push private VAPID key | Later, if push is activated | Generated by platform | Communication Escalation Engine | `placeholder_add_later` |

Notes:

- WhatsApp provider is not selected yet.
- WhatsApp is only for urgent reminders/no-response escalation unless product policy changes.
- SMS is fallback only and requires cost controls and opt-out policy.

## 5. Future Integration Secrets

| Secret name | What it is for | Required now or later | Where to obtain it | Module | Safe placeholder |
| --- | --- | --- | --- | --- | --- |
| `BOOKKEEPING_API_KEY` | Bookkeeping integration API calls | Later | Selected bookkeeping provider | Integration Layer | `placeholder_add_later` |
| `BOOKKEEPING_WEBHOOK_SECRET` | Verify bookkeeping callbacks if used | Later | Selected bookkeeping provider | Integration Layer | `placeholder_add_later` |
| `ACCESS_CONTROL_API_KEY` | Access control hardware API calls | Later | Selected hardware/provider dashboard | Access Control & Auto Attendance | `placeholder_add_later` |
| `ACCESS_CONTROL_WEBHOOK_SECRET` | Verify access-control check-in callbacks | Later | Selected hardware/provider setup | Access Control & Auto Attendance | `placeholder_add_later` |
| `ACCESS_CONTROL_BASE_URL` | Provider base URL when not fixed by adapter | Later | Selected hardware/provider docs | Access Control & Auto Attendance | `placeholder_add_later` |
| `CRM_TICKET_SYSTEM_API_KEY` | Optional external CRM/ticket sync; native NXTTRACK helpdesk does not require this | Later/optional | Selected CRM/ticket provider if approved | Integration Layer | `placeholder_add_later` |
| `NXTTRACK_WEBHOOK_SIGNING_SECRET` | Sign outbound webhooks from NXTTRACK | Later | Generated by platform/secret manager | Integration Layer | `placeholder_add_later` |

Notes:

- Tenant-specific API keys should eventually be stored as encrypted tenant integration secrets, not platform-wide `.env` values, unless the provider account is platform-managed.
- Webhooks must be idempotent and audited.

## 6. Feature-To-Secret Map

| Feature/module | Secret dependencies |
| --- | --- |
| iDEAL | `MOLLIE_API_KEY`, `MOLLIE_WEBHOOK_SECRET`, `MOLLIE_PROFILE_ID` |
| Registration fee payment | `MOLLIE_API_KEY`, `MOLLIE_WEBHOOK_SECRET`, `MOLLIE_PROFILE_ID` when iDEAL/Mollie is activated; none for manual admin-only status |
| SEPA incasso | `MOLLIE_API_KEY`, `MOLLIE_WEBHOOK_SECRET`, conditionally `SEPA_CREDITOR_ID` only if required by Mollie/provider setup |
| Payment batches | Provider secret if provider-submitted; none for manual/export-only batch |
| WhatsApp urgent escalation | `WHATSAPP_BUSINESS_TOKEN`, `WHATSAPP_BUSINESS_PHONE_NUMBER_ID`, `WHATSAPP_WEBHOOK_SECRET` |
| SMS fallback | `SMS_PROVIDER_API_KEY`, `SMS_PROVIDER_WEBHOOK_SECRET` |
| Push notification | `PUSH_VAPID_PUBLIC_KEY`, `PUSH_VAPID_PRIVATE_KEY` |
| Bookkeeping integration | `BOOKKEEPING_API_KEY`, `BOOKKEEPING_WEBHOOK_SECRET` |
| Access control hardware | `ACCESS_CONTROL_API_KEY`, `ACCESS_CONTROL_WEBHOOK_SECRET`, `ACCESS_CONTROL_BASE_URL` |
| Native tenant/platform helpdesk | none |
| Optional external CRM/ticket sync | `CRM_TICKET_SYSTEM_API_KEY` |
| Public webhooks/API | `NXTTRACK_WEBHOOK_SIGNING_SECRET` plus tenant/API-key model |

## 7. Current Placeholder Block For `.env.example`

```txt
MOLLIE_API_KEY=placeholder_add_later
MOLLIE_WEBHOOK_SECRET=placeholder_add_later
MOLLIE_PROFILE_ID=placeholder_add_later
SEPA_CREDITOR_ID=placeholder_add_later
WHATSAPP_BUSINESS_TOKEN=placeholder_add_later
WHATSAPP_BUSINESS_PHONE_NUMBER_ID=placeholder_add_later
WHATSAPP_WEBHOOK_SECRET=placeholder_add_later
SMS_PROVIDER_API_KEY=placeholder_add_later
SMS_PROVIDER_WEBHOOK_SECRET=placeholder_add_later
PUSH_VAPID_PUBLIC_KEY=placeholder_add_later
PUSH_VAPID_PRIVATE_KEY=placeholder_add_later
BOOKKEEPING_API_KEY=placeholder_add_later
BOOKKEEPING_WEBHOOK_SECRET=placeholder_add_later
ACCESS_CONTROL_API_KEY=placeholder_add_later
ACCESS_CONTROL_WEBHOOK_SECRET=placeholder_add_later
ACCESS_CONTROL_BASE_URL=placeholder_add_later
CRM_TICKET_SYSTEM_API_KEY=placeholder_add_later
NXTTRACK_WEBHOOK_SIGNING_SECRET=placeholder_add_later
```

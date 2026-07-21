# Communication Delivery Runbook

Status: executable process; real staging provider, sender and controlled-inbox evidence remain required.

## Safety Boundary

- Configure secrets only through the platform-owner settings screen or the scoped GitHub environment; never commit or paste them into Actions logs.
- Use a dedicated sending-domain credential with only the permissions needed to send mail.
- Use a controlled external inbox for tests. Do not create a real invitation, reset request or tenant broadcast merely to test transport.
- One explicit test at a time. A provider acceptance response proves hand-off, while inbox receipt and headers prove external delivery.

## Configure Staging

1. Verify the sender/domain in the selected provider.
2. Publish and verify SPF, DKIM and DMARC. Record the active DKIM selector as staging variable `EMAIL_DKIM_SELECTOR`.
3. Sign in as `platform_owner` and open `/platform/instellingen` on staging.
4. Choose SendGrid API or SMTP, set the verified from-address/name and enter the provider secret. The application encrypts the secret before database storage.
5. Enable the provider and save. Re-open the screen and confirm only the non-sensitive “configured” state is shown.
6. Run `Communications foundation audit`; sender/provider/DKIM must pass before a delivery test.

The deploy-time environment fallback remains supported, but database-backed platform settings take precedence when their singleton row exists. Do not configure both paths with different senders.

## Controlled Delivery Test

1. In `/platform/instellingen`, enter the controlled external inbox under **Testmail**.
2. Select **Test versturen** once.
3. Confirm a new `platform_delivery_test` entry appears under **Testhistorie** with status `sent` and, for SendGrid, its provider message ID when supplied.
4. Confirm receipt outside the NXTTRACK infrastructure. Inspect sender, subject, SPF, DKIM and DMARC results in the received headers.
5. Record recipient owner, receipt timestamp, provider message ID, deployed SHA and evidence location without copying the message body or credentials.
6. Re-run `Communications foundation audit`; `controlled-test-delivery` accepts a successful test for 30 days.

Provider acceptance is not the same as inbox delivery. The human receipt/header record remains mandatory.

## Failure And Retry

- `skipped`: delivery is disabled or incomplete. Fix configuration; do not retry until the foundation audit passes.
- `failed`: inspect the status and sanitized provider/SMTP error in Testhistorie or tenant mail diagnostics.
- timeout: provider hand-off is unknown. Check the provider activity log before retrying to avoid a duplicate.
- rejected sender/authentication: rotate or correct the scoped credential and verify sender ownership.
- recipient/bounce: confirm the controlled address and inspect the provider event/activity log. Do not repeatedly retry a hard bounce.

Tenant notification attempts expose a manual **Retry** action to authorized tenant staff. A retry creates a new delivery-attempt row; it does not overwrite the failed evidence. Platform tests are retried by submitting one new controlled test after the cause is resolved.

## Recovery Evidence

Communication delivery is recovered only when:

1. the non-sending foundation audit passes mail settings and DNS;
2. exactly one new controlled test is provider-accepted and received externally;
3. its delivery attempt is visible and traceable;
4. the operational monitor reports no failed, skipped or stuck attempts in its configured window;
5. the incident/support owner records the result and closes the issue.

If the provider remains unreliable, disable transactional delivery, retain portal notifications as the product fallback, and escalate provider replacement separately.

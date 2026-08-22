# Production readiness core — sprint 1

Datum: 22 augustus 2026

Auditbron: `docs/PRODUCTION_TENANT_READINESS_AUDIT_2026-08-20.md` (alleen gelezen; niet gewijzigd)

Geaudite basis-SHA: `68d4a79ccdc3ede3691bf1ec1782fb8f81c05466`

Sprintbranch: `codex/production-readiness-core-sprint-1`

Werkvorm: geïsoleerde Git-worktree, omdat de oorspronkelijke werkmap ongetrackte gebruikersbestanden bevat die op de basis-SHA getrackte paden overlappen. De oorspronkelijke werkmap en gebruikerswijzigingen blijven onaangeroerd.

## Scope en status

| Audit-ID | Status | Checkpoint | Bewijs/commit |
| --- | --- | --- | --- |
| P1-004 | PARTIALLY CLOSED | 2 — fail-closed mail en outbox | Infrastructuur en centraal transport groen; business-enqueue wordt in checkpoints 3–5 transactioneel aangesloten |
| P0-004 | CLOSED | 3 — tenantprovisioning | Atomische databasegraph, deterministische dedupe, hervatbare Auth-grens en failure/concurrencybewijs |
| P1-001 | NOT STARTED | 4 — participant en intake | Nog te implementeren |
| P1-002 | NOT STARTED | 4 — capaciteit en plaatsing | Nog te implementeren |
| P1-003 | NOT STARTED | 5 — imports | Nog te implementeren |

De algemene NO-GO uit het auditrapport blijft ongewijzigd. Deze sprint claimt geen live runtimebewijs zonder de vereiste externe credentials en omgevingen.

## Checkpoint 1 — repository- en baselinebewijs

### Git-inventaris

- Verplichte basis bestaat als commit en is de tip van `codex/parent-child-portals-v1`/`origin/codex/parent-child-portals-v1`.
- De nieuwe branch is rechtstreeks op de verplichte basis aangemaakt; `git merge-base HEAD 68d4a79...` geeft exact `68d4a79...`.
- De oorspronkelijke werkmap stond op `main` (`e34544c6d7ddfea572d4b1c68a3e201ee3381872`) en bevatte ongetrackte `apps/android/`-bestanden en het ongetrackte auditrapport. Geen van die bestanden is verplaatst, verwijderd, overschreven of opgenomen in deze branch.
- Geen rebase, merge, reset, deployment of live databaseactie uitgevoerd.
- Er zijn geen toepasselijke repository-`AGENTS.md`- of `AGENTS.override.md`-bestanden gevonden.

### Pre-change baseline

Runtime lokaal: Node `v24.18.0`; repository package manager `pnpm 10.24.0`; CI-runtime is Node `20.19.0`. De engines-eis is `>=20.19.0`. Harmonisatie is uitsluitend stretchscope.

| Commando | Exact resultaat vóór bronwijzigingen |
| --- | --- |
| `pnpm install --frozen-lockfile` | PASS; 317 packages uit lockfile, geen lockfilewijziging |
| `pnpm run typecheck` | PASS |
| `pnpm run lint` | Geen afzonderlijke lint: script is dezelfde `tsc --noEmit` als typecheck |
| `pnpm exec tsx --test tests/unit/*.test.ts tests/unit/*.test.mjs` | PASS; 375 tests, 0 failures, 0 skips |
| `pnpm run build` | PASS; Next.js 16.2.11, 17 statische pagina's gegenereerd |
| `pnpm run release:truth` | PASS; waarschuwing dat `origin/production` 3 commits buiten de canonieke historie bevat |
| `pnpm run design:audit` | PASS |
| `pnpm run auth:audit` | PASS; route- en authboundary plus 3 invitation-targettests |
| `pnpm run db:audit` | PASS; 135 migrations |
| `pnpm run db:rls-audit` | PASS; 246 public tables en 135 migrations; bestaande waarschuwingen voor private helpers zonder authenticated grant |
| `pnpm run release:audit-journey-bot` | PASS |
| `pnpm run release:audit-runtime-env` | PASS |
| `pnpm run security:audit-dependencies` | FAIL (bestaand); `nanoid <3.3.18`, GHSA-2v37-7h3g-55p8 via de expliciete `3.3.17` override |
| `pnpm run test:e2e` | FAIL lokaal; 12 pass, 80 skips, 34 failures. Oorzaak is reproduceerbaar: standalone Next runtime kan `libvips-cpp.so.8.18.3` voor `sharp` niet laden, waarna assets 404'en. `pnpm rebuild sharp` maakt een directe `require('sharp')` succesvol maar herstelt de standalone runtime niet. Credentialsuites zijn niet getest, niet als pass gemarkeerd. |
| `git diff --check` | PASS |

De dependencyauditfailure correspondeert met stretchpunt 3. De Playwrightfailure is een lokale native-runtime/packageerfailure, geen groen productbewijs. Beide blijven zichtbaar en worden aan het einde opnieuw gedraaid.

## Geverifieerde huidige callgraphs en zwakke transaction boundaries

### P1-004 — mail

`createInvitation`, password reset, tenant notifications en operationele acties roepen `sendTransactionalEmail` rechtstreeks aan. Dat pad leest platformsettings of env, kiest SendGrid of SMTP, voert direct netwerk-I/O uit en schrijft achteraf best-effort `email_delivery_attempts`. `EMAIL_SENDING_ENABLED` wordt alleen door releaseconfig-audits genoemd en niet door het centrale transport afgedwongen. Provideracceptatie wordt als `delivered: true` en `sent` opgeslagen; er is geen claim, dedupe, retry/backoff of terminale dead-state. Het attempt-log bevat recipient en subject en mag daarom niet in applicatielogs worden gedumpt.

### P0-004 — provisioning

`provisionTenantAction` maakt eerst een run en schrijft daarna tenant, settings, theme-RPC, domains, branding, program, stages, resources, group en payment plan in afzonderlijke Data API-calls. Vervolgens activeert het de tenant en roept het voor owner/staff `createInvitation` aan, inclusief Auth-user/membership en direct mailtransport. Een failure maakt alleen de tenant inactive; reeds geschreven graphrecords en Auth-side effects blijven bestaan. Een retry heeft geen deterministische run/business key.

### P1-001 — participant en intake

`createParticipantEnrollmentAction` schrijft participant, optionele guardianrelatie en enrollment los van elkaar en controleert guardian/enrollment-errors niet als één graph. `submitIntake` doet een read-before-write dedupe, schrijft submission, answers en `tenant_events` afzonderlijk; answer- of eventfailure laat de submission achter. De dedupe-index is niet uniek en beschermt parallelle submits niet.

### P1-002 — capaciteit

`createGroupMembershipAction` doet een niet-gelockte applicatie-precheck en daarna een losse insert. De bestaande `app_private.enforce_membership_capacity_bucket`-trigger lockt de tenant+group-rij en herberekent regulier/flex/trial/hard capacity vóór insert/update; dat bestaande centrale capaciteitscontract blijft leidend. De huidige unique constraint `(group_id, enrollment_id, status)` laat tegelijk een actieve én trialplaatsing voor dezelfde enrollment/groep toe en is niet tenant-expliciet. Er is geen idempotente service-RPC met gecontroleerde capacity/conflictrespons.

### P1-003 — imports

`applyImportAction` leest `ready`, zet daarna los `applying` en verwerkt elke rij met sequentiële reads/writes. Guardianrows creëren Auth-users, invitations en direct mail. Het manifest bestaat alleen in procesgeheugen tot completion. Bij failure worden rollbackerrors genegeerd, waarna het manifest wordt leeggemaakt en `failed` wordt gezet. `rollbackImportAction` verwijdert eveneens sequentieel zonder delete-resultaten te controleren. Double-apply kan door een race tweemaal claimen; 5.000 rijen veroorzaken duizenden round trips.

## Ontwerpcontract vóór implementatie

### Gemeenschappelijke invarianten

1. Elke samengestelde databasewrite loopt door één service-only databasefunctie; elke functie valideert tenant en actor/input, gebruikt een vaste `search_path`, en commit of rollbackt als één statement/transaction.
2. `PUBLIC`, `anon` en `authenticated` krijgen geen execute op servicefuncties. Alleen `service_role` krijgt minimaal `EXECUTE`; negatieve granttests zijn verplicht.
3. Nieuwe publieke tabellen krijgen RLS + FORCE RLS, geen client-writegrants en alleen strikt noodzakelijke readpolicies. Outboxpayloads blijven service-only.
4. Business/idempotency keys zijn onveranderlijk en uniek in de database. Een retry met dezelfde key en dezelfde requestfingerprint retourneert het bestaande resultaat; dezelfde key met andere input faalt als conflict.
5. Audit/lifecycle-events zijn append-only. Geen secret, token, raw messagebody of onnodige PII komt in foutdetails of applicatielogs.
6. Failure-injection is alleen testinput en wordt niet blootgesteld aan clientrollen. Productie-RPC's accepteren geen verborgen bypass voor atomariteit of autorisatie.

### Mail/outbox

- Business key: `(tenant_id nulls not distinct, message_type, idempotency_key)`; invitation gebruikt de invitationbusinesskey, andere callers een expliciete stabiele mutatiekey.
- Transactie: businessrecord + outboxrow worden door dezelfde databasefunctie geschreven. Geen workerclaim of provider-I/O binnen die transactie.
- Payload: service-only durable payload plus `related_type`/`related_id`; inhoud is begrensd. Logs gebruiken alleen outbox-ID/type/status/providerstatus.
- Claim: `FOR UPDATE SKIP LOCKED`; status `queued|processing|retry|accepted|dead|cancelled`; lease token + expiry voorkomt dubbele actieve verwerking en maakt workercrashes hervatbaar.
- Kill switch: uitsluitend de letterlijke, getrimde, case-insensitive waarde `true` voor `EMAIL_SENDING_ENABLED` staat provider-I/O toe. Missing, leeg, invalid en false geven in het directe centrale transport een disabled-uitkomst zonder netwerkaanroep; de outboxworker claimt in die toestand niets zodat queued/retry-items hervatbaar blijven. Dit wordt zowel vóór workerclaim als in het centrale transportpad afgedwongen.
- Retry: alleen transient timeout/network/429/5xx; begrensd aantal attempts en deterministische exponential backoff met cap. Invalid payload/config/4xx (behalve 429) en exhausted retries gaan zichtbaar naar `dead`.
- Provideracceptatie heet `accepted`, niet `delivered`. Bounce/webhookdelivery blijft open totdat end-to-end geïmplementeerd en getest.

### Tenantprovisioning

- Business key: deterministische hash/fingerprint over genormaliseerde slug + owneremail + versie van het provisioningcontract; unieke idempotency key op onboarding run en unieke tenant-slug blijven de databasebarrière.
- Transactie: run, tenant, settings, theme assignment/audit, domains, branding, program, stages, resources, group, plan, invitationrecords/outbox en immutable lifecycle-events in één service-RPC. Tenantstatus wordt pas `active` wanneer alle verplichte database- en enqueuewrites slagen.
- Auth-compensatie: provisioning maakt geen Auth-user vóór de databasecommit. Een aparte hervatbare invitation-materializer maakt/resolveert een Auth-user idempotent en bindt die aan de bestaande invitation; failure blijft delivery/setup zichtbaar zonder tweede tenant/run. Geen destructive compensatie van gedeelde Auth-users.
- Failure states: transactionele failure laat geen tenantgraph achter; een committed run is `ready_for_identity|opened|attention_required`, waarbij `opened` alleen database-ready betekent en deliverystatus apart zichtbaar is.
- Audit: `requested`, `database_committed`, `identity_materialized`, `mail_accepted`, `mail_retry`, `attention_required`; append-only.

### Participantgraph

- Business key: expliciete operation key van de serveractie; fallbackfingerprint wordt niet uit naam alleen afgeleid. Database bewaart requestfingerprint.
- Transactie: participant + optionele `participant_guardians` + enrollment + audit in één service-RPC.
- Tenantconsistentie: program, stage, guardian en alle samengestelde FK's moeten bij dezelfde tenant horen; stage moet bij program horen.
- Retry: dezelfde key geeft dezelfde participant/enrollment; key-reuse met andere input is conflict. Elke fout laat nul nieuwe graphrecords achter.

### Intake

- Business key: de bestaande SHA-256 dedupekey plus een begrensde idempotencywindow-key die vóór de RPC server-side wordt berekend; unieke database-invariant maakt parallelle double-clicks veilig.
- Transactie: submission + alle answers + `intake.received` audit/event in één service-only RPC.
- Retry: dezelfde key retourneert de bestaande submission/reference; afwijkende payloadfingerprint onder dezelfde key faalt. Duplicate-detectie over 30 dagen blijft een apart productconcept en wordt niet verward met request-idempotency.
- Failure: invalid question/form/program/tenant of enige writefailure rolt alles terug.

### Groepsplaatsing

- Business key: `(tenant_id, operation_key)` met resultaat; doelinvariant is maximaal één live (`active|trial`) membership per tenant+group+enrollment. Meerdere programma-enrollments en historische/flexrecords blijven toegestaan.
- Transactie: lock group, valideer enrollment/participant/tenant, herbereken bestaande bucket+hard capacity onder lock via het bestaande capacitycontract, insert/upsert membership en append audit in één RPC.
- Resultaten: `placed`, `already_placed`, `capacity_full`, `conflict`; verwachte contention is geen generieke 500.
- Verplichte test: één resterende plek, 20 parallelle claims, exact één `placed`, negentien gecontroleerde capacity/conflictuitkomsten, eindcount en audit exact consistent.

### Imports

- Claimkey: job-ID plus apply-attempt/lease; statusovergang `ready -> applying` gebeurt atomisch met `FOR UPDATE SKIP LOCKED`/vergelijkbare rijlock.
- Rowbusinesskey: bestaande `duplicate_key` wordt na normalisatie tenant+job-gebonden uniek per toepassingsrun; manifestregels zijn durable en uniek per importrow.
- Batchtransactie: chunks (doel 250, begrensd) via één RPC per chunk. Iedere chunk schrijft targets, rowstates en manifest atomair; geen 5.000 sequentiële Data API-writes.
- Resume: committed chunks worden overgeslagen op manifest/rowstate; dezelfde apply is idempotent. Guardian invitationrecords/outbox worden in dezelfde chunk geschreven; Auth-materialisatie blijft aparte hervatbare side effect.
- Rollback: reverse manifest in chunks; iedere compensatie krijgt `pending|compensated|failed`. Manifest wordt nooit leeggemaakt. Een failure zet job `needs_attention`/`reconciliation` met begrensde foutdetails; retry verwerkt alleen onbevestigde entries.
- Mutatiebeleid: deze sprint houdt de bestaande create-only importsemantiek aan. Rollback verwijdert uitsluitend records waarvan het manifest bewijst dat deze import ze heeft gecreëerd; bestaande records worden niet destructief aangepast.

## Checkpointlog

### Checkpoint 1

- Status: CLOSED.
- Commit: `2582fdc21964abf784cab8315031bee754206ed9` (`docs(audit): define core readiness transaction contracts`).
- Gewijzigd: alleen dit sprintdocument.
- Tests: zie pre-change baseline; geen live credentials gebruikt.
- Resterend risico: alle primaire auditissues zijn nog open; bestaande dependency- en lokale Playwrightbaseline zijn rood.
- Vervolg: checkpoint 2 implementeert eerst kill switch en durable outbox.

### Checkpoint 2

- Audit-ID/status: P1-004 PARTIALLY CLOSED. Het centrale transport, de durable outbox, atomische claim, retry/dead-semantiek en serviceboundary zijn gereed; transactionele enqueue vanuit provisioning, participantflows en imports volgt in hun eigen checkpoints.
- Commit: `ae04a439b16da009436092061d95410b3da7e74c` (`feat(email): add fail-closed durable outbox`).
- Gewijzigd: additive migration `20260822002234_production_email_outbox.sql`; centraal transportcontract; outboxworker en fail-closed interne workerroute; invitation/password-reset/notificatie/slot-offer statussemantiek; beheerfeedback; unit- en echte PostgreSQL-concurrentietest.
- Invarianten: alleen letterlijke `EMAIL_SENDING_ENABLED=true` kan provider-I/O bereiken; een uitgeschakelde worker claimt niets; `(tenant_id NULLS NOT DISTINCT, message_type, idempotency_key)` dedupliceert; afwijkende input onder dezelfde key faalt; `FOR UPDATE SKIP LOCKED` plus claimtoken/lease voorkomt dubbele actieve verwerking; een verlopen laatste lease wordt `dead`; provideracceptatie zet alleen `accepted_at`/`provider_accepted_at`, nooit `delivered_at`.
- Grants: outbox-RPC's zijn `SECURITY INVOKER`, hebben vaste `search_path`, zijn gerevoked voor `PUBLIC`/`anon`/`authenticated` en alleen uitvoerbaar door `service_role`. Tabellen hebben FORCE RLS en expliciete deny-readpolicies voor authenticated; negatieve grant- en RLS-tests zijn groen.
- Tests: `tests/unit/email-outbox-contract.test.ts` 7/7 PASS; volledige unitsuite 382/382 PASS; `test:email-outbox:db` PASS met twintig parallelle enqueues en twintig parallelle claims; authaudit PASS; typecheck PASS; production build PASS; migrationaudit PASS (136); RLS-audit PASS (248 tabellen, alleen bestaande private-helperwaarschuwingen); `git diff --check` PASS.
- Lokale DB-validatie: de nieuwe migration is op de geïsoleerde lokale validatiecontainer geparset/toegepast; de repositorybrede `supabase db push` kon niet als bewijs dienen doordat die container bestaande history/schema-drift heeft bij `20260802230000` (`tenant_notifications_dedupe_unique`). Er is geen migration-repair uitgevoerd. De RPC-concurrentietest draait wel tegen de werkelijk aangemaakte outboxtabellen en functies.
- Resterend risico: bounce/webhook-afleveringsbewijs is niet geïmplementeerd en wordt niet als opgelost geclaimd; worker scheduling/credentials zijn extern NIET GETEST; bestaande mailcallers buiten de samengestelde writes gebruiken nog het centrale directe pad en worden bij checkpoints 3–5 waar vereist atomair naar enqueue verplaatst. Nieuwe incassopogingen blijven bewust fail-closed zolang alleen provideracceptatie en geen aflevering bekend is.

### Checkpoint 3

- Audit-ID/status: P0-004 CLOSED. P1-004 blijft PARTIALLY CLOSED totdat ook importinvitaties transactioneel via dezelfde outbox lopen.
- Commit: wordt na deze groene checkpointcommit in het volgende checkpointblok vastgelegd.
- Gewijzigd: additive migration `20260822004329_atomic_tenant_provisioning.sql`; provisioningserveraction en hervatactie; Auth-userresolver/bootstrapherkenning; generieke invitationcopy; onboardingrun-UI; unitcontract en echte PostgreSQL-integratietest.
- Transactie: `provision_tenant_atomic` serialiseert op de deterministische slugkey en schrijft run, inactive tenant, settings, theme-availability/assignment/audit, domains, branding, program, stages, resources, group, payment plan, invitations, outbox en immutable events binnen één PL/pgSQL-boundary. De interne exception-subtransactie rolt iedere graphwrite terug maar bewaart een PII-vrije `attention_required` run plus attempt/event.
- Idempotentie: de key is SHA-256 over `tenant-provisioning:v1:<slug>`; de afzonderlijke requestfingerprint omvat alle genormaliseerde businessinput. Dezelfde key/input retourneert dezelfde run/tenant; key-reuse met andere input faalt. Een advisory transaction lock serialiseert parallelle submits.
- Auth-grens: Auth-users worden pas na de databasecommit aangemaakt of gevonden. Nieuwe bootstrapaccounts krijgen alleen de invitation-UUID in admin-only app metadata, zodat een crash tussen Auth en database veilig als nieuw account hervat en nog steeds wachtwoordkeuze eist. De database-materializer upsert profile/security/membership atomisch. Geen mislukte poging verwijdert mogelijk gedeelde Auth-users.
- Fail-closed opening: tenant en outbox blijven respectievelijk `inactive` en circa honderd jaar uitgesteld zolang identities onvolledig zijn. Alleen `complete_tenant_provisioning` verifieert alle identities, memberships en outboxreferenties, activeert de tenant, opent de run en maakt alle invitation-items in dezelfde transactie due. Provider-I/O gebeurt daarna door de worker.
- Grants/audit: alle publieke provisioning-RPC's zijn `SECURITY INVOKER`, fixed-search-path, gerevoked voor `PUBLIC`/`anon`/`authenticated` en alleen uitvoerbaar door `service_role`; de minimale private Auth-resolver is fixed-search-path `SECURITY DEFINER` en eveneens service-only. `tenant_onboarding_events` is append-only, FORCE RLS en platform-admin read-only.
- Failure/concurrencybewijs: zeven geïnjecteerde boundaries (`organization`, `identity`, `program`, `operations`, `billing`, `invitations`, `opening`) laten elk nul tenant/invitationgraph achter en één durable aandachtsevent; een database-retry hergebruikt dezelfde run en bewaart beide attempts/events. Twintig parallelle submits leveren exact één run en één tenant. Identity-timeout + retry, dubbele materialisatie en dubbele finalization zijn idempotent bewezen.
- Tests: provisioningcontract 6/6 PASS; volledige unitsuite 388/388 PASS; `test:tenant-provisioning:db` PASS; `test:email-outbox:db` PASS in dezelfde gedeelde queue; authaudit PASS; typecheck PASS; production build PASS; migrationaudit PASS (137); RLS-audit PASS (249 tabellen, alleen bestaande private-helperwaarschuwingen plus de verwachte service-only Auth-resolver); `git diff --check` PASS.
- Lokale DB-validatie: migration compileerde/toegepast op de geïsoleerde lokale validatiecontainer; alle functies zijn werkelijk uitgevoerd. Geen staging/live database, echte mail of live Auth-provider is gebruikt. Auth API-runtime blijft daarom extern NIET GETEST; de databasezijde en crashsemantiek zijn lokaal bewezen.
- Rollbackrisico: application-forward rollback houdt tenants/runs/invitations uit deze flow intact; `EMAIL_SENDING_ENABLED=false` en/of de worker gate stopt provider-I/O. De additive tabellen/kolommen kunnen door de oude app worden genegeerd, maar een oude app mag niet opnieuw voor provisioning worden gebruikt omdat die zijn oude niet-atomische writeketen zou hervatten.

### Checkpoint 4

- Status: NOT STARTED.

### Checkpoint 5

- Status: NOT STARTED.

## Deployment- en rollbackcontract

Alle migrations in deze sprint zijn additive en forward-compatible. Er worden geen live migrations uitgevoerd. Deploymentvolgorde na review: database migrations in timestampvolgorde, daarna exact hetzelfde appartifact, daarna workers/cron pas activeren met `EMAIL_SENDING_ENABLED=false`. Rollback is application-forward: kill switch uit, workers stoppen, oude appversie kan nieuwe additive tabellen/kolommen negeren. Schema-drops of migration-repair zijn geen rollbackmechanisme.

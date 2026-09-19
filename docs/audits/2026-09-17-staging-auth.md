# NXTTRACK staging-auth: onderzoek en reviewpatch

Onderzocht op 17 september 2026; werkboom, origin/main en laatste deployment opnieuw gecontroleerd op 19 september 2026. Dit document is geen bewijs van een geslaagde staginggate.

## Werkbasis en behoud van lokaal werk

- Repository: `https://github.com/nxttrack/platform.git` op `codex-worker-01`.
- Worktree: `/home/codex/repos/nxttrack-fix-sprint4-auth`.
- Branch: `codex/fix-sprint4-staging-auth-bounce`; oorspronkelijke upstream: `origin/main`.
- Begin-HEAD en na fetch actuele `origin/main`: `26257df791e0dca81ad5e9208acd31999ba519a6`.
- Geen toepasselijke `AGENTS.md` gevonden in de bovenliggende directories of deze worktree.
- Alleen de bestaande, niet gestagede `signIn()`-wijziging en een leeg ongetrackt bestand `tsc` aangetroffen. Geen staged wijzigingen.
- Herstelkopie: `/home/codex/task-evidence/nxttrack-staging-auth-20260917/initial-worktree.patch`, plus originele spec, indexpatch en status. Directory mode 0700; originele kopieën 0600.
- De handmatige retry is vervangen; geen onbekend werk overschreven. `tsc` pas verwijderd na controle op nul bytes en ontbreken in de Git-index, en na backup.
- Andere worktrees en Fieldgrid zijn niet gewijzigd.

## Wat is bewezen, en wat niet?

De oorspronkelijke stagingoorzaak is **niet vastgesteld**. De oorspronkelijke URL-fout onderscheidt een nooit verstuurd formulier niet van een sessie die na authenticatie verloren gaat. Er is geen bewijs voor een Supabase-cookie-race of parallelle adminworkers.

Wel bewezen:

1. De handmatige lokale patch construeert tijdens uitvoering `//admin/programma(?:?|$)/`. Evaluatie van de werkelijk aanwezige regel geeft `SyntaxError: Nothing to repeat`. Dit was een afzonderlijke lokale regressie, niet de oorzaak van de historische stagingfailure.
2. De oorspronkelijke regex op `main` accepteert zowel `/login?next=/admin/programma` als `/admin/programma` op een verkeerde origin. Dit is met de uit `git show HEAD:...` geëxtraheerde expressie uitgevoerd.
3. `waitForLoadState("domcontentloaded")` na klikken bewijst geen nieuwe request: het event kan al bij het openen van de loginpagina hebben plaatsgevonden.
4. De loginhelper had geen observatie van de server action en geen eigen controle op beschermde UI of sessiebehoud.

De patch herstelt deze aantoonbare testfouten en maakt een volgende failure diagnostisch bruikbaar. Hij claimt niet de onbewezen stagingoorzaak te repareren.

## Historische release en artifacts

[Deploymentrun 35030995915](https://github.com/nxttrack/platform/actions/runs/35030995915), poging 1, SHA `26257df791e0dca81ad5e9208acd31999ba519a6`, is nog de laatste deploymentrun bij het onderzoek.

| Controle | Vastgesteld resultaat |
| --- | --- |
| Deploymentjob `104589216770` | SUCCESS |
| Actieve runtime `/api/health` | HTTP 200, `env=staging`, dezelfde commit-SHA; database en schemacontract PASS |
| Browserjob `104589656371` | FAILURE |
| Sprint 4 adminjourney | FAILURE bij eerste login; één worker, ook volledige Playwright-retry faalt |
| Volledige staginggate | NIET GESLAAGD |
| Volledige release-evidence voor deze SHA | NIET AANWEZIG |

Tijdlijn (UTC): theme-matrix-upload 22:41:43; adminstap 22:42:59–22:43:14 op 15 september. Beide adminpogingen bleven op `https://staging.nxttrack.nl/login?next=%2Fadmin%2Fprogramma`, zonder errorparameter, met 5000 ms assertiontimeout.

De API toont uitsluitend het exact-source-artifact (`10420619146`) en de seven-theme-matrix (`10421862725`), beide van deze run/SHA. De matrix is vóór de adminstap geüpload. Het admin-retrylog noemt een lokale `trace.zip`, screenshot en video, maar die zijn niet als artifact beschikbaar. De eerdere matrix is dus geen admintrace en is niet als zodanig gebruikt.

Na de adminfailure waren **SKIPPED**: rol-/tenantisolatie, toegankelijkheid/prestatiebudgetten, Communicationhub/Badge Studio, premiumvalidatie, Priority A-capture, Phase 15 truth/security, schrijven en uploaden van release-evidence. Een succesvolle uploadstap zonder de bijbehorende capture bewijst deze controles niet.

Laatste groene main-CI: [34996461318](https://github.com/nxttrack/platform/actions/runs/34996461318). Dit bewijst de historische CI, niet de stagingjourney.

## Login-keten, vragen A–J

| Vraag | Bevinding en beperking |
| --- | --- |
| A: velden gevuld tot submit? | De oude helper roept `fill` aan, maar de ontbrekende trace verhindert bewijs over de waarden op het historische submitmoment. De nieuwe helper vergelijkt de formulierwaarden direct vóór klikken en logt alleen een boolean. |
| B: hydration/her-rendering? | De loginpagina is een servercomponent met gewone uncontrolled inputs; shell/providers bevatten clientcomponenten. Drie lokale browserprobes (normaal, JavaScript vrijgeven ná invullen, JavaScript uit) behielden de invoer en verstuurden elk één action. Geen historische invoerreset bewezen; actionability alleen bewijst geen hydration. |
| C/D: werkelijke submit? | Browser verstuurt een POST naar dezelfde `/login`-route: gehydrateerd met `Next-Action`, of als native documentformulier. `loginAction` voert vervolgens server-side `signInWithPassword` uit. Er hoeft geen Supabase-request in de browser te staan. Historisch ontbreekt requestbewijs. |
| E: response/redirect? | Authfailure en anonieme context in `loginAction` sturen naar `error=invalid_credentials`. Wachtwoordwijziging heeft een eigen route. Bij succes volgt de gesaniteerde doelroute. Een 200 alleen bewijst geen sessie. |
| F: foutfase? | Niet vast te stellen uit de URL/logs. Geen vastgestelde keuze tussen pre-submit, auth, cookieoverdracht en eerste beschermde request. |
| G: oude anonieme context? | `getTrustedAuthContextForRequest` maakt via `getTrustedAuthContext` een nieuwe SSR-client; geen React-cache/memoization gevonden in deze keten. Na sign-in wordt opnieuw uit de requestcookiestore gelezen. Geen bewijs van een hergebruikte anonieme context. |
| H: host/cookies/proxy? | `staging.nxttrack.nl` wordt als staginghost herkend. Supabase SSR 0.12.0 gebruikt standaard path `/`, SameSite `lax`, geen expliciet domein of Secure-override in de app. Proxy schrijft vernieuwde cookies in request én response; server action gebruikt Next `cookies().set`. HTTPS-origin en path zijn passend. Historische werkelijk verzonden cookieattributen en proxyheaders ontbreken; hun correcte overdracht is niet bewezen. |
| I: fixtures/interferentie? | Historisch `PHASE16_RESET_E2E_PASSWORDS=true`, `PHASE16_PRESERVE_ADMIN_IDENTITIES=true`. De admin-preserve-route controleert bestaande membership/login en slaat adminreset over. `prepare-sprint4-admin` leest alleen de state. Andere voorafgaande fixtures muteren data; admininterferentie of sessierevocatie is niet bewezen. Workflow concurrency serialiseert stagingdeployments; externe workflow-interferentie is daarmee niet uitgesloten. |
| J: classificatie? | Bewezen lokale testregressie en tekortschietende assertions/observatie. Oorspronkelijke stagingblokkade blijft onverklaard; geen bewezen applicatie- of omgevingsbug. |

Het huidige adminprogramma toont de heading `Programma's en leerlijnen`, achter `requirePrivateShellContext`. **Deze GET schrijft wachttijdprognoses (`persist: true`)**. Gebruik de helper/journey daarom niet als uitsluitend leesbare staging-login-smoke.

## Gekozen wijziging

- `apps/web/tests/e2e/helpers/admin-sign-in.ts`: één submit, relevante POST-observatie vóór klikken, HTTP-statuscontrole, exacte origin/pathnamevergelijking, beschermde heading en herhaalde beschermde documentrequest.
- Query- en hashvarianten van de echte doelroute zijn toegestaan; een doelroute in `next`, een padprefix en andere origin zijn geen succes.
- Geen interne retry, geen extra sleep, geen verhoogde globale timeout/retry, geen tokeninjectie. Met de ongewijzigde CI-testretry kan het volledige scenario maximaal twee login-submits uitvoeren.
- Geschoonde diagnostiek bevat verstreken tijd, veld-aanwezigheidsboolean, request/response/failure-events, status, beschermde UI/follow-up en eindlocatieclassificatie met aanwezigheid van `error`. Geen waarden van credentials, cookies, tokens, headers of requestbodies.
- `sprint4-admin-mutations.spec.ts`: gebruikt de daadwerkelijk geteste helper. De programma-, niveau-, kwalificatie-, groeps-, leerling-, plaatsings-, plannings-, billing-, document- en communicatiehandelingen en PR #90-datumberekening blijven intact.
- `admin-sign-in-contract.spec.ts`: echte Chromium-browser met een lokale HTTP-fixture en uitsluitend fictieve credentials. Ook verkeerde-originresponses worden lokaal afgevangen. Dit bewijst het helpercontract, niet Supabase of staging.
- `package.json`: regressies toegevoegd aan de bestaande CI-browser-smokeselectie. Geen dependency-/lockfilewijziging.
- Geen applicatiecode, permissies, schema's, workflows of releasebeveiligingen gewijzigd. PR #88 alleen als vergelijking gelezen; zijn retry niet overgenomen.

## Validatie

Node `24.18.0`, pnpm `10.24.0`, Playwright `1.61.1`, TypeScript `5.9.3`, conform repository/CI. Bestaande dependencies bruikbaar; geen herinstallatie of goedkeuring van buildscripts nodig. De geïnstalleerde Playwright-types ondersteunen een URL-predicate bij `toHaveURL`.

De exacte commando's, werkboombasis, duur en exitcodes staan in de afgeschermde `checks.jsonl` naast de herstelpatch. Alle lokale checks gebruikten de werkboom op begin-SHA `26257df791e0dca81ad5e9208acd31999ba519a6` plus deze reviewpatch. De applicatiecode van de lokale build is gelijk aan die begin-SHA; de nieuwe testcode is afzonderlijk gewijzigd. De PR-CI valideert vervolgens de definitieve commit. De volgende resultaten zijn werkelijk uitgevoerd:

- Typecheck: PASS, exit 0, 25,30 s.
- `pnpm run test:unit`: PASS, 509 tests, 0 failures/skips, exit 0, 11,66 s.
- `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3137 pnpm run test:smoke:e2e --workers=1 --retries=0`: **100 PASS**, geen skips/failures, exit 0, 73,32 s. Bevat 24 helpercontracttests op elk van desktop en mobiel (48), plus 52 bestaande smoke-/visualtests.
- Baseline replay: de werkelijk uit `git show HEAD:...` gelezen oude URL-expressie tijdelijk in de geëxtraheerde matcher geplaatst; dezelfde zes regressies leverden 2 verwachte failures, 4 PASS, exit 1, 1,68 s. De helper in `finally` bytegetrouw hersteld. Daarna `PLAYWRIGHT_BASE_URL=http://127.0.0.1:3137 pnpm --filter @nxttrack/web exec playwright test tests/e2e/admin-sign-in-contract.spec.ts --project=chromium-desktop --workers=1 --retries=0 --grep destination --reporter=list`: 6 PASS, exit 0, 1,29 s.
- Laatste `pnpm --filter @nxttrack/web typecheck`: PASS, exit 0, 2,85 s, na de laatste wijziging in de regressiefixture.
- Tijdens het bouwen van de lokale HTTP-fixture zijn fixturefouten gecorrigeerd (response niet uitgelezen vóór navigatie en automatisch opnieuw verzonden afgebroken TCP-request). De definitieve netwerkfouttest gebruikt Playwright `route.abort`, telt één submit en ziet de requestfailure. De eindrun hierboven heeft geen failures.
- Eerste productiebuild werd door een herstart van de werkomgeving onderbroken; er is geen eind-exitcode en dit telt niet als PASS. De nieuwe build slaagde: exit 0, 31,31 s; standalone assets packaging exit 0, 0,50 s.
- Lokale echte loginpagina: 3/3 gecontroleerde afwijzingen, exit 0, 1,65 s. Fictieve credentials, geen geconfigureerde Supabase. Normaal: POST met `Next-Action` op 462 ms, foutredirect op 537 ms; uitgestelde JavaScript: POST op 242 ms, foutredirect op 294 ms; zonder JavaScript: native POST op 174 ms, HTTP 303 op 184 ms, foutredirect op 201 ms. Deze gecontroleerde negatieve paden bewijzen geen geldige stagingauthenticatie.
- `release:truth`, `design:audit`, `release:audit-runtime-env`, `auth:audit` (3 tests), `security:audit-dependencies`, `db:audit` (158 bestanden), `db:rls-audit` (256 tabellen): allemaal exit 0. RLS-audit meldt bestaande waarschuwingen over private functies zonder authenticated execute-grant; scripts en migraties zijn ongewijzigd. Repository-truth meldt bestaande divergentie van staging-/productionbranches; geen branches samengevoegd.
- `APP_URL=https://staging.nxttrack.nl REQUIRE_HEALTH_COMMIT=true REQUIRE_HEALTH_DATABASE=true pnpm run staging:health`: PASS, exit 0, 1,23 s, één openbare GET-poging.
- Lint is eveneens `tsc --noEmit`, daarom niet dubbel uitgevoerd.
- Echte staginglogins: **0**. Geen goedgekeurde credentials/configuratie in environment of de twee opgegeven checkouts gevonden. Alleen om een beveiligd bestaand configuratiepad gevraagd, niet om secrets in chat.
- Volledige muterende stagingjourney, fixturevoorbereiding, merge, deployment, bootstrap en rollback: **NOT RUN**, buiten huidige toestemming.

## Na review en afzonderlijke toestemming

De bestaande deployworkflow is `workflow_dispatch` vanaf canonical `main`, met `target=staging`. Hij checkt exact `github.sha` uit. Een oude run herstarten gebruikt de oude broncode. De branch `staging` wordt niet aangepast.

Actuele gecontroleerde stagingvariabelen: `APP_ENV=staging`, `APP_URL=https://staging.nxttrack.nl`, `RUN_DB_MIGRATIONS=false`, `DB_MIGRATE_DRY_RUN=false`, `DB_MIGRATE_INCLUDE_ALL=false`, `BOOTSTRAP_PLATFORM_OWNER=false`, `BOOTSTRAP_PLATFORM_OWNER_RESET_PASSWORD=false`, `MAINTENANCE_NO_WRITE=false`, `PHASE16_RESET_E2E_PASSWORDS=true`. `PHASE16_PRESERVE_ADMIN_IDENTITIES` valt terug op workflowdefault `true`. Tenant: `aquaswim-demo`.

De patch voegt geen migraties toe. De daadwerkelijke remote migration ledger is niet opgevraagd zonder stagingdatabaseconfiguratie. De browserjob zet `RUN_DB_MIGRATIONS=true`; `phase-15-validate.mjs` roept daarmee daadwerkelijk `pnpm run db:migrate` aan. `RUN_DB_MIGRATIONS=false` op de deployjob verhindert dat dus niet. De browserjob voert bovendien fixturemutaties uit. Beoordeel bij latere toestemming expliciet de bestaande reset-/fixturegevolgen; verander geen flags om gates te omzeilen.

Onderstaande commando's zijn uitsluitend voor **na goedkeuring**, niet uitgevoerd. Bepaal de PR en HEAD van de taakbranch en controleer dat die HEAD overeenkomt met de expliciet goedgekeurde reviewversie. Voorkom nieuwe main-merges tussen het vaststellen van de release-SHA en dispatch; de workflow accepteert alleen ref `main` en heeft geen afzonderlijke staging-SHA-input.

```bash
REPO=nxttrack/platform
PR_NUMBER=$(gh pr list --repo "$REPO" --head codex/fix-sprint4-staging-auth-bounce --state open --json number --jq '.[0].number')
FIX_SHA=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json headRefOid --jq .headRefOid)
gh pr checks "$PR_NUMBER" --repo "$REPO" --watch
gh pr merge "$PR_NUMBER" --repo "$REPO" --merge --match-head-commit "$FIX_SHA"
MERGE_SHA=$(gh pr view "$PR_NUMBER" --repo "$REPO" --json mergeCommit --jq .mergeCommit.oid)
RELEASE_SHA=$(gh api "repos/$REPO/commits/main" --jq .sha)
test "$RELEASE_SHA" = "$MERGE_SHA"
# Laat ook CI op de resulterende main-SHA slagen.
gh run list --repo "$REPO" --workflow ci.yml --commit "$RELEASE_SHA"
# Controleer actieve deployments en rollbackrepetities; wacht bij actieve runs.
gh run list --repo "$REPO" --workflow deploy.yml --limit 10
gh run list --repo "$REPO" --workflow staging-rollback-rehearsal.yml --limit 10
# Controleer opnieuw de omgeving en mutation/resetinstellingen.
gh api --paginate "repos/$REPO/environments/staging/variables?per_page=100" \
  --jq '.variables[] | select(.name | test("^(APP_ENV|APP_URL|RUN_DB_MIGRATIONS|DB_MIGRATE_DRY_RUN|DB_MIGRATE_INCLUDE_ALL|BOOTSTRAP_PLATFORM_OWNER|BOOTSTRAP_PLATFORM_OWNER_RESET_PASSWORD|PHASE16_RESET_E2E_PASSWORDS|PHASE16_PRESERVE_ADMIN_IDENTITIES|MAINTENANCE_NO_WRITE)$")) | {name,value}'
test "$(gh api "repos/$REPO/commits/main" --jq .sha)" = "$RELEASE_SHA"
gh workflow run deploy.yml --repo "$REPO" --ref main -f target=staging -f bootstrap_platform_owner=false
gh run list --repo "$REPO" --workflow deploy.yml --event workflow_dispatch --limit 5 \
  --json databaseId,headSha,createdAt,status,url
DEPLOY_RUN_ID=<nieuwe-run-van-deze-dispatch>
test "$(gh run view "$DEPLOY_RUN_ID" --repo "$REPO" --json headSha --jq .headSha)" = "$RELEASE_SHA"
gh run watch "$DEPLOY_RUN_ID" --repo "$REPO" --exit-status
gh run view "$DEPLOY_RUN_ID" --repo "$REPO" --json headSha,conclusion,jobs
curl -fsS https://staging.nxttrack.nl/api/health | \
  jq -e --arg sha "$RELEASE_SHA" '.ok == true and .env == "staging" and .commitSha == $sha'
gh api "repos/$REPO/actions/runs/$DEPLOY_RUN_ID/artifacts" \
  --jq '.artifacts[] | {name,expired,workflow_run}'
```

Verifieer daarna ook de inhoud van de release-evidence en exact-source-artifacts op dezelfde SHA; alle eerder SKIPPED gates moeten werkelijk PASS zijn. Alleen een healthcheck of artifactnaam volstaat niet. Bij afwijkende run-SHA of nieuwe failure: geen geldige releaseverklaring; onderzoek de nieuwe blokkade. Productiepromotie vereist de aparte productie-evidence en menselijke toestemming uit het productierunbook en valt buiten deze taak.

Rollback: de bestaande procedure selecteert een eerder door de workflow gebouwde, schema-compatibele release, wisselt `current` atomisch en herstart de stagingservice; controleer health, routes, tenant en login opnieuw. De vijf nieuwste releases worden bewaard. De afzonderlijke staging-rollbackrepetitie deelt de deployment-concurrencygroep en herstelt daarna de oorspronkelijke release. Applicatierollback draait geen businesswrites of migraties terug; databaseherstel/datareparatie vergt afzonderlijke beoordeling en toestemming. Geen rollback uitgevoerd.

Referenties: [VPS-runbook](../VPS_DEPLOY_RUNBOOK.md), [production release/rollback](../PRODUCTION_RELEASE_RUNBOOK.md), [Playwright hydration](https://playwright.dev/docs/navigations#hydration), [Supabase SSR](https://supabase.com/docs/guides/auth/server-side/advanced-guide). Documentatie beschrijft mogelijke mechanismen; zij bewijst de historische oorzaak niet.

Reviewstatus: **FIX_READY_FOR_REVIEW** voor de bewezen testcorrecties. De oorspronkelijke stagingoorzaak is nog niet bewezen; geen `STAGING_VALIDATED` of productie-gereedverklaring. De PR-beschrijving bevat de definitieve commit en bijbehorende CI-link.

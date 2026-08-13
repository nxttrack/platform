# QA-rapport — parent-/kinderportalen v1.0

Datum: 11 augustus 2026. Branch: `codex/parent-child-portals-v1`.

## Uitgevoerde gates

| Gate | Resultaat |
|---|---|
| `pnpm run typecheck` | groen |
| `pnpm run lint` | groen |
| `pnpm run test:parent-child-portals` | 19/19 groen |
| `pnpm run test:portal-themes` | 34/34 groen |
| `pnpm run test:swim-canon` | 53/53 groen |
| `pnpm run test:billing-contract` | 24/24 groen |
| `pnpm run test:communication-hub` | 20/20 groen |
| `pnpm run test:badges` | 25/25 groen |
| `pnpm run test:participant-media` | 12/12 groen |
| `pnpm run test:content-security` | 4/4 groen |
| `pnpm run auth:audit` | groen; 5 private shells |
| `pnpm run db:audit` | groen; 133 migrationfiles |
| `pnpm run db:rls-audit` | groen met uitsluitend bestaande/private-helperwaarschuwingen plus nieuwe bewust service-only helpers |
| `pnpm run security:audit-dependencies` | groen; geen bekende productiekwetsbaarheden na gerichte `nanoid@3.3.17` override |
| `pnpm run release:truth` / `design:audit` / Journey Bot- en runtime-audits | groen |
| `pnpm run build` | groen; compile, TypeScript, page-data en 17 statische pagina's |
| `pnpm run deploy:package-standalone-assets` | groen |
| `pnpm run test:e2e` zonder stagingcredentials | 46 groen, 86 expliciet overgeslagen, 0 failures |
| Lokale ephemere Supabase init vanaf nul | groen; alle 133 migrations in volgorde toegepast |
| Gerichte SQL/JWT/RLS-test | groen; no-context, parent, child en kill-switch fail-closed |
| Echte lokale REST/GraphQL-test | groen: 403 / 200 / 403, GraphQL 403, kill-switch 403 |
| Policydekking | 245/245 RLS-enabled public tabellen; Storage en Realtime beide restrictive |
| `pnpm run test:portal-themes:e2e` zonder stagingfixtures | technisch groen, 2/2 bewust overgeslagen |

De lokale database en API waren ephemeral. Er is geen remote staging-/productiedatabase gemigreerd en er zijn geen productiegegevens of -secrets gebruikt.

## Render- en viewportstatus

Het testcontract telt en controleert exact 322 canonieke renders, 196 dashboard-viewportcases en 14 boards. Daarnaast codeert de harness losse bewijsrenders voor de drie profieltabs, badge celebration/locked, request success/rate-limit/error, reduced motion en parent-reauth. De routegebonden browserrun vereist echter:

- `E2E_PLATFORM_OWNER_EMAIL/PASSWORD`;
- `E2E_TENANT_ADMIN_EMAIL/PASSWORD`;
- `E2E_PARENT_EMAIL/PASSWORD`;
- `E2E_CERTIFICATE_CODE`;
- de canonieke curriculum-, les-, badge-, media- en certificaatfixtures.

Deze waarden/fixtures waren niet aanwezig in de Codex-omgeving. Feitelijk geproduceerde acceptatierenders in deze run: **0 van 322**; dashboardviewportcases: **0 van 196**; boards: **0 van 14**. De Playwrighttests sloegen aantoonbaar over en falen in required mode bij ontbrekende fixtures. CI/PR-artifacts bewaren de outputs zodra de stagingrun plaatsvindt.

Daarom zijn visual diff ≤2px, axe op echte fixtures, handmatige keyboard/screenreadercontrole, 200%-zoom, Web Vitals en Lighthouse nog niet als groen aangemerkt.

## Definition-of-Done-status

| Items | Status | Bewijs |
|---|---|---|
| 1–5: servergrens, routes, vijf childbestemmingen en sessionbinding | geïmplementeerd; lokale contract-/RLS/API-gates groen | `portal-session`-tests, 245/245 policies en echte lokale REST/GraphQL-probes |
| 6–8: parent/child dashboardgeometrie en mobiele first viewport | geïmplementeerd; fixturegebonden renderbewijs open | layoutasserties in de 196-case Playwrightmatrix |
| 9–13: zeven recipes, assets, Journey, snapshots en badgeplaceholder-UX | geïmplementeerd; unit-/assetgates groen | 34 themetests en byte-for-byte assetmanifest |
| 14–18: surpriseprivacy, verboden commands/share, `view_only`, reauth en flags | geïmplementeerd; contractgates groen | allowlistprojectie, serverguards, default-off migration en rollout-runbook |
| 19: alle qualitygates | gedeeltelijk | lint/typecheck/unit/build/security/smoke groen; echte fixture-a11y/performance/visuals open |
| 20: 322/196 meetbaar gehaald | geblokkeerd | harness exact afgedwongen, maar 0/322 en 0/196 werkelijk uitgevoerd |
| 21: geen releaseblocker | geblokkeerd | de verplichte visual/responsive/securitymatrix is nog niet aantoonbaar volledig groen |

## Releasebesluit

Alle rolloutflags blijven disabled. De branch mag als draft-PR worden gereviewd, maar is **niet mergeklaar** totdat de volledige fixturegebonden visual/responsive/accessibility/securitymatrix aantoonbaar groen is. Er wordt vanuit deze sprint niet gemerged of gedeployed.

## Nog bij te werken na de finale gate

Vul in de PR na de stagingmatrix aan:

- artifactlink en exact 322/196/14 resultaat;
- browserresultaten Chromium/WebKit/Firefox;
- axe-/handmatige focus- en screenreaderbevindingen;
- Lighthouse Performance, LCP, INP en CLS;
- gemaskeerde/allowlisted deltas en alle overige pixelafwijkingen;
- definitief merge-ready oordeel.

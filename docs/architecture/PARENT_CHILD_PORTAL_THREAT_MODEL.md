# Parent-/kinderportaal — capability- en threat model

Status: implementatiebranch, 11 augustus 2026. Rollout staat standaard uit.

## Grens en eigenaarschap

NXTTRACK houdt één Next.js-app, Supabase-project, curriculum-, planning-, badge-, theme- en voortgangsdomein. De presentatie is gescheiden:

- `ParentPortalShell` bezit `/portaal/**`, dertien ouderfuncties en bestaande oudercommands.
- `ChildPortalShell` bezit `/kind/**`, een afzonderlijke allowlist-DTO en uitsluitend veilige kindcommands.
- De server-authoritative voortgang uit `swim-progress.ts` en de focus-/volgorderegels uit `portal-journey-contract.ts` worden door beide projecties gebruikt.
- Childdata wordt server-side geprojecteerd. Er wordt geen volledige parent-DTO geladen en daarna in React verborgen.

## Autoritatieve sessiestate

`app_private.portal_session_contexts` bindt child mode aan de Supabase JWT-claim `session_id`, auth-user, tenant, één participant en `context_version = 1`. De row is wereldwijd voor de sessie: ook trainer-, staff-, admin- en platformroutes blijven dicht. Verlopen, locked en revoked rows blijven als tombstone bestaan.

Bij een geactiveerde rollout is afwezigheid niet automatisch parent. `app_private.portal_parent_session_contexts` wordt uitsluitend door een volledig gevalideerde serverrequest geïnitialiseerd. Tot die tijd blokkeert de database directe Data API-toegang. Het starten van child mode verwijdert deze parentinitialisatie transactioneel en schrijft daarna de childcontext.

De resolver accepteert geen mode, tenant, participant, contextversie of sessie-ID uit een browsercookie, queryparameter of custom header als authority. `auth.sessions` en de actuele membership/guardian-link worden opnieuw gecontroleerd.

## Capabilitymatrix

| Capability | Parent | Child |
|---|---:|---:|
| Ouderplanning bekijken/wijzigen | ja, bestaande permissions | nee |
| Journey lezen | volledige ouderprojectie | `journey.read_child_safe` |
| Badges lezen | ouderprojectie en toegestane share | `badges.read_child_safe`, geen externe share |
| Agenda lezen | volledig | `schedule.read_child_safe`, read-only |
| Goedgekeurde media | private ouderflow | `approved_media.read_child_safe`, inline proxy, geen download |
| Kindvoorkeuren | ouderinstellingen | `child_preferences.write_safe` |
| Vraag mijn ouder | n.v.t. | `parent_request.create_safe` |
| Inbox/betaling/document/gezin/feedback | ja | afwezig |

De childallowlist bevat exact acht capabilities. Een `view_only`-guardian krijgt in v1 geen entrycommand voor child mode; zo worden de twee childmutaties niet stil uitgebreid.

`Vraag mijn ouder` kent uitsluitend:

- `lesson_help` met een actuele, aan het kind gekoppelde les of gepubliceerd eindmoment;
- `activity_interest` met een actuele, gepubliceerde tijdelijke activiteit;
- `open_parent_portal` voor het gebonden kind.

De database valideert resource, publicatiestatus, tenant en kind, dedupliceert per type/resource en limiteert tot drie nieuwe verzoeken per uur. Vrije tekst en het uitvoeren van de ouderhandeling bestaan niet in dit pad.

## Defense in depth

| Oppervlak | Maatregel |
|---|---|
| Next.js shells/actions/routes | Centrale serverguard resolveert sessionstate per request en weigert niet-childsurfaces. |
| REST/Data API | `pgrst.db_pre_request` blokkeert een restricted sessie, behalve de minimale contextresolver. |
| GraphQL | Restrictieve RLS-policy op iedere RLS-enabled public tabel; dezelfde JWT-sessionstate geldt. |
| RPC | Muterende portal-RPC's zijn alleen voor `service_role`; wrappers valideren auth session, tenant, participant en capability opnieuw. |
| Storage | Restrictieve policy op `storage.objects`; childmedia loopt via een authenticated same-origin proxy en wordt bij iedere request opnieuw geautoriseerd. |
| Realtime | Restrictieve policy op `realtime.messages`; de childclient gebruikt geen blijvende Realtimechannel maar geautoriseerde polling. |
| Browsercache/service worker | Private responses zijn `private, no-store`; de service worker cachet geen authenticated HTML/API/media en onderdrukt push buiten parent mode. |
| Oude tabs | `BroadcastChannel`, storage-event en server/proxyguard sluiten of redirecten parenttabs bij child/locked state. |
| Terug naar parent | Alleen verse wachtwoordlogin met single-use challenge van maximaal vijf minuten en een nieuwe Auth-session-ID. |

Private responses voeren tevens `X-Robots-Tag: noindex, nofollow, noarchive, nosnippet, noimageindex`, `nosniff`, same-origin resource policy en no-referrer waar van toepassing.

## Gemeten beveiligingsbewijs

Op een lokale ephemere Supabase-stack zijn alle 133 migrations vanaf nul toegepast. Daarna zijn met een echte Auth-JWT uitgevoerd:

| Scenario | Uitkomst |
|---|---:|
| Rollout actief, context ontbreekt, REST `/tenants` | 403 |
| Gevalideerde parentinitialisatie, dezelfde REST-call | 200 |
| Childcontext, dezelfde geldige parent-JWT, REST | 403 |
| Childcontext, GraphQL | 403 |
| Childcontext, minimale contextresolver | 200 met uitsluitend contextcontract |
| Rollout daarna disabled, bestaande childtombstone, REST | 403 |

De database bevatte 245 RLS-enabled public tabellen en exact 245 restrictieve portalpolicies; daarnaast bestaan restrictieve policies op `storage.objects` en `realtime.messages`.

## Open releasebewijs

De fixturegebonden browsermatrix, handmatige screenreadercontrole en Web Vitals/Lighthouse zijn in deze omgeving niet uitgevoerd. De featureflags blijven daarom uit en de draft-PR is niet mergeklaar totdat die gates aantoonbaar groen zijn.

# Parent/child-portalen — baseline-audit

Vastgelegd op 2026-08-11 vóór productwijzigingen.

## Git- en bronbaseline

- Doelbasis: `origin/staging` op `6f9aec3`.
- Werkbranch: `codex/parent-child-portals-v1`.
- De actuele zes-thema- en zwemcanonbasis uit `origin/main` is zonder inhoudelijk conflict ingemerged; audit-HEAD: `2ac2e93`.
- De oorspronkelijke Ocean Quest-zip is exact 85.900.138 bytes en heeft SHA-256 `8d5b647dabc54c5a72ba279914307a31466cf1666d46933251eca36fee8ea579`.
- Alle 38 uitgepakte bronbestanden staan in `docs/codex-input/ocean-quest-v1.0.0`; hun hashes staan in `SOURCE_MANIFEST.sha256`.
- De zes bestaande thema-ID's vóór uitbreiding zijn: `nxttrack-default`, `dolphin-bay`, `turtle-trails`, `polar-splash`, `coastal-explorer`, `nationaal-zwem-abc`.

## Architectuurbaseline

- Eén Next.js 16 App Router-app gebruikt servercomponents/-actions, Supabase SSR-cookies en server-only adminclients.
- Bestaande privéshells: `/portaal`, `/instructor`, `/admin`, `/platform`; er is nog geen `/kind`-shell.
- Parent heeft de 13 canonieke route-ID's. Compatibiliteitsroutes bestaan naast de canonieke routes.
- Browserconfig bestaat via `createBrowserClient`; de huidige applicatie importeert deze helper niet buiten zijn definitie. Auth-cookies en de Data API blijven daarom als browseroppervlak behandeld.
- Autorisatie komt uit `profiles`, `user_security`, `tenant_memberships` en `platform_memberships`. De trusted context bevat vóór deze sprint nog geen JWT-`session_id` of portalmodus.
- Guardianrelaties zijn tenantgebonden via `participant_guardians`; `view_only`-handhaving bestaat al voor oudermutaties.
- De theme engine gebruikt immutable releases, semantic tokens, route-recipes en afzonderlijke mobiele/desktopassets. De runtimecatalogus bevat vóór deze sprint exact zes releases.
- Realtime wordt door de webapp niet rechtstreeks gebruikt. Private downloads lopen via same-origin serverroutes; Storage wordt server-side benaderd.

## Nulmeting

| Gate | Resultaat |
|---|---|
| `pnpm run typecheck` | groen |
| `pnpm run lint` | groen |
| `pnpm run test:portal-themes` | 33/33 groen |
| `pnpm run test:swim-canon` | 53/53 groen |
| `pnpm run auth:audit` | groen; 4 bestaande privéshells |
| `pnpm run db:audit` | groen; 130 migraties |
| `pnpm run db:rls-audit` | groen met 17 bestaande waarschuwingen voor private helperfuncties zonder authenticated-grant |
| `pnpm run build` | compile, TypeScript, page-data en 17 statische pagina's groen |

De 17 RLS-auditwaarschuwingen zijn pre-existent en beschrijven `app_private`-helpers die bewust geen publieke execute-grant hebben. Ze zijn niet als regressie aan deze sprint toegerekend.

## Gekozen beveiligingsrichting

De sprint gebruikt de sessie-ID-gebonden restrictieve databasevariant. Een kindcontext wordt aan de Supabase JWT-claim `session_id`, auth-user, tenant, kind en contextversie gekoppeld. De applicatie controleert deze context vóór iedere privéshell/serveractie; additieve restrictieve RLS en capability-RPC's sluiten directe Data API-, Storage- en Realtimepaden fail-closed af. Service-role wordt uitsluitend server-side gebruikt en iedere kind-DTO wordt vóór serialisatie opgebouwd.

## Uitvoeringsgrenzen

Deze branch mag migrations en code bevatten, maar migrations worden niet op een remote database toegepast. Er wordt niet gemerged of gedeployed. Na groene lokale gates wordt alleen de featurebranch gepusht en een draft-PR naar `staging` geopend.

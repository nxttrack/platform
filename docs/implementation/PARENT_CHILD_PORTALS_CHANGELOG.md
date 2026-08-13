# Changelog — parent-/kinderportalen v1.0

## Security en rollout

- Sessie-ID-gebonden globale childlock, persisted tombstones en verse reauthchallenge.
- Gevalideerde parentinitialisatie voor rollouttenants en fail-closed no-context Data API-gate.
- Restrictieve RLS voor alle exposed RLS-tabellen, Storage en Realtime; same-origin childmediaproxy.
- Vier standaard-uit featureflags, readinessgate, TTL en geauditeerde kill switch.
- Productie-dependency-audit hersteld met een gerichte transitieve `nanoid@3.3.17` override.

## Parent

- Alle dertien routes en compatibilityroutes behouden.
- Taakgericht 50/50-dashboard met compacte, centraal berekende badje-/diplomaringen en 33/33/33 onderrij.
- Kindselector naar het profielmenu; veilige child-entry onder Gezin en toegang.
- Goedkeuren/intrekken van child-safe media en childrequests zichtbaar in Inbox.

## Child

- Nieuwe `/kind`-shell met exact vijf bestemmingen.
- Afzonderlijke allowlist-DTO's voor Vandaag, Journey, badges, agenda, diploma-metadata, media en voorkeuren.
- Eén gedeeld Journey-contract voor selectie, focus, volgorde, toetsenbord, trackpad en drag.
- Gestructureerd, resourcegebonden en idempotent `Vraag mijn ouder` zonder vrije tekst.
- Goedgekeurde afbeeldingen/MP4-webmedia en curriculuminstructievideo met captions/transcript.

## Themes en QA

- Ocean Quest als zevende immutable `3.0.0`-release met parent- en childrecipes.
- Vier definitieve bronassets byte-for-byte aangesloten; geen badgeart verzonnen.
- Statisch afgedwongen contract voor 322 renders, 196 dashboardviewports en 14 boards.
- CI voert de parent-/childcontracttests uit; stagingworkflow gebruikt de zeven-theme matrix.

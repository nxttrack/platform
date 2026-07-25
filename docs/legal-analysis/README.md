# NXTTRACK juridische feiteninventarisatie

## Doel en afbakening

Dit dossier is technische en functionele input voor latere juridische documentatie. Het bevat geen
privacyverklaring, voorwaarden, verwerkersovereenkomst of juridisch oordeel. Een mogelijke rechtsgrond,
contractuele rol of beleidskeuze staat daarom als `OWNER DECISION REQUIRED`, tenzij een repositorybron
letterlijk iets anders bewijst.

Onderzocht op 25 juli 2026:

- branch: `docs/nxttrack-legal-facts-inventory`;
- broncommit: `76f0a3f8cc28abab59fba06ff40e03fbea7c6a5f`;
- workspace: rootpackage `@nxttrack/platform` en applicatie `apps/web` (`@nxttrack/web`);
- bronsoorten: actieve Next.js-code, server actions, API-routes, SQL-migraties, tests, synthetische
  seeds, serviceworker/manifest, `.env.example`, GitHub Actions en bestaande runbooks.

De analyse is read-only uitgevoerd ten opzichte van applicatie, databases en externe systemen. Er is
geen productieverbinding geopend en er zijn geen records, geheimen, betalingen, e-mails of
leveranciersaccounts geraadpleegd.

## Bewijsstandaard

| Status | Betekenis |
|---|---|
| `OBSERVED` | Rechtstreeks aantoonbaar in actieve code of schema. |
| `INFERRED` | Sterke technische aanwijzing, maar niet volledig bewezen. |
| `PLANNED` | Alleen documentatie, mock, flag of niet-uitgevoerde/ongeschakelde code. |
| `UNKNOWN` | Niet uit de repository vast te stellen. |
| `CONFLICT` | Repositorybronnen spreken elkaar tegen of beschrijven verschillende tijdstippen. |

Bij belangrijke bevindingen verwijst `[E###]` naar
[`13-evidence-index.csv`](13-evidence-index.csv). De index vermeldt pad, regel/symbool, omgeving,
feature flag en zekerheid. “Productie” betekent in dit dossier dat code voor productie bereikbaar of
configureerbaar is; zonder runtime-inspectie is niet bewezen welke commit of instelling momenteel live
staat.

## Rapporten

1. [`01-product-and-environment-map.md`](01-product-and-environment-map.md)
2. [`02-data-subjects-and-data-catalogue.md`](02-data-subjects-and-data-catalogue.md)
3. [`03-processing-and-data-flows.md`](03-processing-and-data-flows.md)
4. [`04-role-and-responsibility-candidates.md`](04-role-and-responsibility-candidates.md)
5. [`05-vendors-and-integrations.md`](05-vendors-and-integrations.md)
6. [`06-cookies-storage-pwa-and-tracking.md`](06-cookies-storage-pwa-and-tracking.md)
7. [`07-retention-deletion-export-and-backups.md`](07-retention-deletion-export-and-backups.md)
8. [`08-security-and-access-controls.md`](08-security-and-access-controls.md)
9. [`09-consent-and-data-subject-rights.md`](09-consent-and-data-subject-rights.md)
10. [`10-children-automation-and-dpia-input.md`](10-children-automation-and-dpia-input.md)
11. [`11-commercial-and-contract-facts.md`](11-commercial-and-contract-facts.md)
12. [`12-gaps-risks-and-owner-questions.md`](12-gaps-risks-and-owner-questions.md)
13. [`13-evidence-index.csv`](13-evidence-index.csv)
14. [`facts.json`](facts.json)

## Belangrijkste beperkingen

- De repository bewijst geen actuele productie-inhoud, aantallen betrokkenen, feitelijke
  gegevensvolumes, leverancierscontracten, verwerkingslocaties of door de provider ingestelde
  bewaartermijnen. `[E013]`
- De SQL-migraties zijn de schema-source-of-truth, maar zonder databaseverbinding is niet per omgeving
  bewezen dat iedere migratie is toegepast of iedere tabel records bevat. `[E011]`
- Tests, Journey Bot en seeds gebruiken synthetische data. Ze bewijzen codepaden, niet dat dezelfde
  verwerking met echte productiegegevens plaatsvindt. `[E012]`
- Marketingtekst, roadmaps en faseverslagen zijn niet als contractuele toezegging behandeld.
- Een afhankelijkheid geldt pas als leverancier wanneer actieve runtimecode of een operationeel
  integratiepunt is aangetroffen.

## Grootste open vragen

1. Welke rechtspersoon levert NXTTRACK, welke contactgegevens horen daarbij en wie is formeel
   privacy-/securityverantwoordelijke? `OWNER DECISION REQUIRED`.
2. Welke rolverdeling geldt per tenantproces tussen DG Webservices/NXTTRACK, zwemschool, ouder,
   Mollie, SendGrid, Google en Supabase? De technische kandidaten zijn beschreven, de contracten niet.
3. Welke concrete bewaartermijnen gelden voor intake, voortgang, presentie, communicatie,
   betaalgegevens, audits, imports, exports, Auth, Storage en back-ups?
4. Welke providerregio’s, doorgiften, DPA’s, SCC’s, subleveranciers en verwijderafspraken zijn
   contractueel bevestigd?
5. Hoe worden verzoeken van betrokkenen, ouderlijk gezag, conflicterende verzorgers, intrekking,
   supporttoegang, incidenten en datalekken organisatorisch ontvangen, geverifieerd en afgehandeld?

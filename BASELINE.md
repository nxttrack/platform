# Fase 0 — baseline 13 september 2026

Scope: alleen main-reconciliatie vóór V4.2. De gebruikersopdracht is leidend;
V4.2-instructies en acceptatiecases uit het pakket zijn geen opdracht voor deze fase.

- Repository: `nxttrack/platform`; fetch uitgevoerd op 13 september 2026.
- Werkbranch: `codex/main-reconciliation-v42-prep`, rechtstreeks vanaf actuele `origin/main`.
- Base: `0fa158fb0abc7fdfe781a103a4c83b016edcba45`.
- Staging: `6f9aec33d4e2172a231ec4f0b57a4342d724c1a8` (main-only 98, staging-only 142).
- Production: `ba8932b5ecc5c4148c1b5d6d14b27ba6628df281` (main-only 469, production-only 32).
- Portalenbron: `68d4a79ccdc3ede3691bf1ec1782fb8f81c05466` (199 ahead).
- Core-bron: `4e3784649767be4c197db624b33995b3d1502f65` (209 ahead).
- Certificeringsbron: `db9806f1d12aee7082f5c2848a271ac526e65aa6` (230 ahead).
- Main en de main-in-portalen merge `2ac2e93` hebben **dezelfde tree**:
  `f65f649e0b1f1366a5d1eb16d782e345fcd61b08`. Oude staging-ancestry is geen reden
  om oude code opnieuw te porten. Netto bronverschil: 365 bestanden.
- Main bevat canonieke beoordeling/curriculum/carry-over, planning, billing,
  native Android/API, private media en zes theme releases. De bron voegt
  sessiegebonden kindprojecties, completion sequence, outbox, atomische
  provisioning/import, certificeringscorrecties en releasecontroles toe.

De oorspronkelijke checkout `/home/codex/repos/nxttrack` blijft op lokale main
`e34544c6d7ddfea572d4b1c68a3e201ee3381872`, 74 commits achter origin/main.
Bestaande wijzigingen: instructeur-groepenpagina; untracked `apps/android/`,
`docs/APPLICATIE_REGISTER_INSTRUCTEUR_PLATFORM_TENANT_ADMIN.md` en
`docs/PRODUCTION_TENANT_READINESS_AUDIT_2026-08-20.md`. Deze zijn niet meegenomen.
Ook andere bestaande worktrees blijven ongemoeid; bronbestanden komen uit Git-blobs.
Geen toepasselijke repository-AGENTS.md gevonden.

## Ongewijzigde baselinechecks

Node 24.18.0 / pnpm 10.24.0; frozen install. Main zelf mist `.node-version`
en gebruikt Node 20.19.0 in CI, terwijl de certificering Node 24 voorschrijft.

- Typecheck: PASS (`lint` is hetzelfde `tsc --noEmit`, geen onafhankelijke lint).
- Alle unitbestanden: **328 passed, 0 failed, 0 skipped**.
- Release truth, design, auth, migrations, RLS, Sprint31, Journey Bot en
  runtime-environment audits: PASS.
- Next productiebuild: PASS.
- Standalone-assets: aanvankelijk ENOSPC; PASS na verplaatsen van uitsluitend
  deze taak haar `.next` naar `/dev/shm` en opnieuw uitvoeren.
- Lokale browser smoke + analytics-consent, desktop/mobile: **40 passed,
  2 skipped** (analytics vereist expliciete fixtureconfiguratie).
- Dependency audit: FAIL, **7 bestaande advisories** (2 critical, 3 high,
  2 moderate). De bron fixeert nanoid/Tiptap; Next 16.2.11 blijft afzonderlijk
  te beoordelen. Geen auditthreshold verlagen of allowlist toevoegen.

Er zijn geen externe staging-/productietests of deploys uitgevoerd. Bewijs van
oude audits wordt niet als bewijs voor deze nieuwe branch gepresenteerd.
Zie [ledger](docs/audits/2026-09-13-main-reconciliation.md) en het eindrapport
voor de nieuwe checks en overblijvende grenzen.

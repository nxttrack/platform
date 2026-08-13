# Android delivery naar Google Play

Status: implementatie gereed; externe Play Console- en GitHub-credentials zijn
vereist voor de eerste upload.

Dit runbook geldt voor:

| App | Package | Workflowmatrix |
| --- | --- | --- |
| NXTTRACK Instructeur | `nl.nxttrack.instructor` | `instructor` |
| NXTTRACK Ouderportaal | `nl.nxttrack.parent` | `parent` |

De geautomatiseerde grens is bewust de Google Play **internal** track. Een
closed, open of production release vraagt een afzonderlijk releasebesluit.

## 1. Eenmalige Play Console-inrichting

1. Maak twee afzonderlijke Play-apprecords met exact de package names hierboven.
   Een package name ligt na de eerste artifactupload vast.
2. Kies app, geen game; leg supportadres, privacybeleid, doelgroep en
   distributielanden vast.
3. Schakel voor beide apps Play App Signing in. Laat bij nieuwe apps Google de
   app-signing key beheren en gebruik per app een andere upload key.
4. Bewaar de upload-keystores buiten de repository in een beheerde secret vault.
   Registreer alleen hun publieke uploadcertificaten in Play Console.
5. Leg van zowel app-signing als uploadcertificaat SHA-256-fingerprints vast.
   Gebruik de app-signing fingerprint voor eventuele externe API-koppelingen.
6. Richt per app een internal-testersgroep in. Internal testing ondersteunt
   maximaal 100 testers per app.
7. Vul ten minste de verplichte store listing, content rating, app access,
   doelgroep/kinderen, advertentiesverklaring en Data safety-formulieren in.
   Beschrijf de feitelijke gegevensstromen; de apps verwerken leerling-,
   voortgangs-, planning-, communicatie-, media- en factuurgegevens.
8. Activeer de Google Play Android Developer API en koppel per app een
   serviceaccount met uitsluitend rechten om releases naar testtracks te maken.

Google onderscheidt de door NXTTRACK beheerde upload key van de door Play
beheerde app-signing key. Zie [Play App Signing](https://support.google.com/googleplay/android-developer/answer/9842756?hl=en)
en [een app aanmaken](https://support.google.com/googleplay/android-developer/answer/9859152?hl=en).

## 2. Upload keys maken

Maak per app een unieke RSA-upload key van minimaal 2048 bit. Gebruik geen
persoonlijk wachtwoord en commit nooit een keystore, PEM, serviceaccountbestand
of wachtwoord.

Controleer vóór registratie:

```bash
keytool -list -v -keystore instructor-upload.jks
keytool -list -v -keystore parent-upload.jks
```

Maak voor GitHub één base64waarde per keystore, zonder logging in CI:

```bash
base64 -w 0 instructor-upload.jks
base64 -w 0 parent-upload.jks
```

Sla bronkeystores en herstelgegevens op in de secret vault. GitHub bevat alleen
de voor upload benodigde kopie. Bij verlies of compromis: pauzeer de protected
environment, trek serviceaccounttoegang in en start de Play-upload-key-reset.

## 3. Protected GitHub environment

Maak de environment `google-play-internal` aan.

Aanbevolen protection rules:

- alleen branch `main`;
- minimaal één required reviewer;
- voorkom self-review;
- beperk toegang tot releasebeheerders;
- bewaar signing- en Play-secrets uitsluitend als environment secrets;
- sta alleen Actions toe die aan een volledige commit-SHA zijn gepind.

GitHub geeft environment secrets pas vrij nadat de protection rules zijn
geslaagd. Zie [Deployments and environments](https://docs.github.com/en/actions/reference/workflows-and-actions/deployments-and-environments)
en [Secure use reference](https://docs.github.com/en/actions/reference/security/secure-use).

Environment variable:

| Naam | Waarde |
| --- | --- |
| `NATIVE_API_BASE_URL` | HTTPS-origin van de doelomgeving, zonder pad |

Environment secrets voor instructeur:

- `ANDROID_INSTRUCTOR_UPLOAD_KEYSTORE_BASE64`
- `ANDROID_INSTRUCTOR_UPLOAD_STORE_PASSWORD`
- `ANDROID_INSTRUCTOR_UPLOAD_KEY_ALIAS`
- `ANDROID_INSTRUCTOR_UPLOAD_KEY_PASSWORD`
- `GOOGLE_PLAY_INSTRUCTOR_SERVICE_ACCOUNT_JSON`

Environment secrets voor ouder:

- `ANDROID_PARENT_UPLOAD_KEYSTORE_BASE64`
- `ANDROID_PARENT_UPLOAD_STORE_PASSWORD`
- `ANDROID_PARENT_UPLOAD_KEY_ALIAS`
- `ANDROID_PARENT_UPLOAD_KEY_PASSWORD`
- `GOOGLE_PLAY_PARENT_SERVICE_ACCOUNT_JSON`

Gebruik afzonderlijke upload keys en bij voorkeur afzonderlijke
serviceaccounts. De Play API vereist de `androidpublisher`-scope; beperk de
Play Console-permissions desondanks tot de twee bedoelde apps en testrelease.
De bundle-uploadendpoint staat in de
[Android Publisher API](https://developers.google.com/android-publisher/api-ref/rest/v3/edits.bundles/upload).

## 4. Preflight

Voor iedere upload:

1. Controleer dat de beoogde commit op `main` staat en Android CI groen is.
2. Controleer dat de native API op `NATIVE_API_BASE_URL` hetzelfde contract
   ondersteunt en de migrations tot en met
   `20260802230000_native_mobile_commands.sql` zijn toegepast.
3. Kies één nieuwe, monotonisch stijgende `version_code`; Play accepteert
   maximaal `2100000000`.
4. Kies een semantische `version_name`, bijvoorbeeld `1.0.0`.
5. Controleer release notes in beide
   `distribution/whatsnew/whatsnew-nl-NL`-bestanden.
6. Verifieer dat er geen open incident, rode migration/RLS-gate of onverwachte
   privacywijziging is.
7. Controleer de laatste pre-launch report na een eerdere upload.

Lokale bronverificatie:

```bash
pnpm typecheck
pnpm test:swim-canon
pnpm test:swim-canon:db
pnpm db:audit
pnpm db:rls-audit
pnpm auth:audit
pnpm android:quality -- -PNXTTRACK_API_BASE_URL=https://staging.example.nl
```

## 5. Internal-track upload

Open GitHub Actions en start `Upload Android apps to Google Play internal`
handmatig vanaf `main`.

Inputs:

- `version_code`: nieuwe positieve integer;
- `version_name`: bijvoorbeeld `1.0.0`;
- `confirmation`: exact `UPLOAD_ANDROID_INTERNAL`.

De workflow:

1. valideert branch, bevestiging en versie;
2. draait de volledige native quality gate op exact dezelfde commit;
3. wacht op de protected-environmentgoedkeuring;
4. materialiseert per matrixjob alleen de bijbehorende upload key;
5. bouwt, minificeert en ondertekent beide AAB's;
6. weigert een niet-ondertekende bundle;
7. maakt build-provenance attestations;
8. uploadt beide packages naar uitsluitend `internal`;
9. bewaart AAB en rapporten 30 dagen als evidence.

GitHub beschrijft provenance in
[artifact attestations](https://docs.github.com/en/actions/how-tos/secure-your-work/use-artifact-attestations/use-artifact-attestations).

## 6. Verificatie na upload

Controleer voor beide apps:

- nieuwe versie en juiste package op de internal track;
- uploadcertificaat en versionCode;
- mapping file voor minified builds in App bundle explorer;
- tester opt-in link en installatie vanaf Google Play;
- cold start, login, tokenrefresh en sign-out;
- offline starten vanuit versleutelde cache;
- offline assessment/attendance en latere idempotente sync;
- ouderringen, vijf themes, 2/4-badgewall en individuele share;
- beveiligde factuur-, diploma-, media- en documentdownload;
- mediatoestemming en feedbackbevestiging;
- geen surprise-badgelek in netwerkinspectie;
- Play pre-launch report zonder nieuwe blocking crash, ANR of accessibilityfout.

Internal testing is bedoeld voor maximaal 100 vertrouwde testers en kan al vóór
een volledig ingevulde store listing worden gestart. Zie
[internal testing](https://support.google.com/googleplay/android-developer/answer/9845334?hl=en).

## 7. Rollback en incidenten

Een Play-upload kan niet uit de versionCode-historie worden gewist.

- Bij een defect: pauzeer de internal track of upload een herstelde bundle met
  hogere `versionCode`.
- Bij API-incompatibiliteit: zet de betrokken tenant-rollout op `paused` of
  `disabled`; behoud oudere contracts totdat clients zijn bijgewerkt.
- Bij gecompromitteerde upload key: blokkeer de GitHub environment, roteer de
  secrets, trek serviceaccounttoegang in en vraag Play om een upload-key-reset.
- Bij gecompromitteerd serviceaccount: trek de sleutel onmiddellijk in, review
  Play en GitHub auditlogs en maak een nieuw least-privilege account.
- Bij privacyincident: blokkeer media/downloadroutes server-side; een clientrelease
  alleen is geen afdoende containment.
- Promoveer nooit automatisch van internal naar een andere track.

Leg per release vast: commit-SHA, workflowrun, approver, versionCode,
versionName, AAB-attestation, Play releasestatus, pre-launch report en
smokeresultaat.

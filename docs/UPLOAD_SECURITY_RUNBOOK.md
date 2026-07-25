# Uploadbeveiliging

Status: verplicht voor staging en productie voordat document-, diploma- of CSV-upload wordt gebruikt.

## Beveiligingscontract

- NXTTRACK accepteert voor private documenten alleen PDF, PNG, JPEG, DOCX en XLSX en controleert MIME-type én magic bytes.
- CSV-import accepteert uitsluitend `.csv`, maximaal 2 MB en 5.000 rijen, verwijdert ongewenste control characters en begrenst cellen.
- Iedere upload wordt vóór opslag met ClamAV `INSTREAM` gescand.
- Productie weigert iedere upload wanneer ClamAV niet bereikbaar is of geen expliciet schoon oordeel geeft.
- Alleen records met scanstatus `clean` zijn in productie downloadbaar. Bestaande `legacy_unscanned` objecten moeten opnieuw worden aangeboden en gescand.
- SHA-256, scanner, scantijd en dataclassificatie worden bij het record opgeslagen.

De implementatie volgt het officiële ClamD-protocol. ClamD kan via een lokale Unix-socket of een private TCP-socket luisteren en `INSTREAM` ontvangt de bestandsbytes via diezelfde verbinding:
<https://docs.clamav.net/manual/Usage/ClamdProtocol.html>.

## VPS-voorbereiding

1. Installeer een onderhouden ClamAV- en ClamD-pakket. Voor Debian/Ubuntu noemt de officiële documentatie `clamav` en `clamav-daemon`:
   <https://docs.clamav.net/manual/Installing/Packages.html>.
2. Zorg dat signatures automatisch door FreshClam worden bijgewerkt en dat ClamD actief is.
3. Kies bij voorkeur een Unix-socket. Controleer het werkelijke `LocalSocket`-pad in `clamd.conf`; neem geen voorbeeldpad blind over.
4. Geef de systemd-servicegebruiker van NXTTRACK uitsluitend connectierecht op deze socket. Maak de socket niet publiek toegankelijk.
5. Zet in de gedeelde environment:

   ```dotenv
   UPLOAD_MALWARE_SCAN_MODE=required
   CLAMAV_SOCKET_PATH=/werkelijk/pad/naar/clamd.ctl
   CLAMAV_HOST=
   CLAMAV_PORT=3310
   ```

   Gebruik voor een private TCP-opstelling `CLAMAV_HOST` en `CLAMAV_PORT` en laat `CLAMAV_SOCKET_PATH` leeg.
6. Herstart ClamD en daarna `nxttrack-staging` of `nxttrack-production`.

## Validatie

1. Upload een geldige kleine PDF; het record moet `clean`, `clamav-instream`, een scantijd en SHA-256 krijgen.
2. Controleer dat een HTML-, SVG-, executable of bestand met een vervalst MIME-type wordt geweigerd.
3. Voer in een geïsoleerde testtenant de standaard antivirus-testfile uit volgens het interne securityproces; verwacht afwijzing en geen Storage-object.
4. Stop ClamD tijdelijk in staging en controleer dat een upload fail-closed wordt geweigerd.
5. Start ClamD opnieuw en controleer de signature-update- en servicedashboards.

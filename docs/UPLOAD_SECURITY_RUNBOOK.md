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

## VPS-voorbereiding voor Ubuntu/Debian

Voer dit uit op de NXTTRACK VPS met een account dat `sudo` mag gebruiken.

1. Installeer ClamAV, ClamD en FreshClam:

   ```bash
   sudo apt-get update
   sudo DEBIAN_FRONTEND=noninteractive apt-get install -y clamav clamav-daemon clamav-freshclam
   ```

2. Stop de automatische updater kort, haal de nieuwste signatures op en activeer hem opnieuw:

   ```bash
   sudo systemctl stop clamav-freshclam
   sudo freshclam
   sudo systemctl enable --now clamav-freshclam
   ```

3. Maak eerst een herstelbare kopie van de daemonconfig:

   ```bash
   sudo cp --archive /etc/clamav/clamd.conf "/etc/clamav/clamd.conf.before-nxttrack-$(date -u +%Y%m%dT%H%M%SZ)"
   sudoedit /etc/clamav/clamd.conf
   ```

   Zorg dat deze regels precies één keer actief voorkomen. Verwijder of becommentarieer een eventuele `TCPSocket` en `TCPAddr`; NXTTRACK gebruikt lokaal uitsluitend de Unix-socket:

   ```ini
   LocalSocket /run/clamav/clamd.ctl
   LocalSocketGroup clamav
   LocalSocketMode 660
   FixStaleSocket true
   StreamMaxLength 25M
   ```

4. Controleer welke niet-rootgebruiker de NXTTRACK-services uitvoert en geef alleen die gebruiker toegang tot de groep `clamav`:

   ```bash
   STAGING_APP_USER="$(sudo systemctl show nxttrack-staging --property=User --value)"
   PRODUCTION_APP_USER="$(sudo systemctl show nxttrack-production --property=User --value)"

   test -n "$STAGING_APP_USER" && test "$STAGING_APP_USER" != root
   test -n "$PRODUCTION_APP_USER" && test "$PRODUCTION_APP_USER" != root

   sudo usermod --append --groups clamav "$STAGING_APP_USER"
   sudo usermod --append --groups clamav "$PRODUCTION_APP_USER"
   ```

   Stop als een van de twee `test`-regels faalt. Controleer dan eerst de systemd-unit; de applicatie hoort niet als root te draaien. Wanneer beide services bewust dezelfde gebruiker gebruiken, is de tweede `usermod` veilig en idempotent.

5. Valideer de ClamD-config en start de daemon:

   ```bash
   sudo clamconf --config-dir=/etc/clamav --non-default
   sudo systemctl enable --now clamav-daemon
   sudo systemctl restart clamav-daemon
   sudo systemctl is-active --quiet clamav-daemon
   sudo test -S /run/clamav/clamd.ctl
   sudo stat --format='%A %U:%G %n' /run/clamav/clamd.ctl
   ```

   Verwacht voor de socket een eigenaar/groep `clamav:clamav` en groepsrechten om te verbinden, normaal `srw-rw----`.

6. Stel de runtimevariabelen in bij GitHub → repository `nxttrack/platform` → Environments → zowel `staging` als `production` → Environment variables:

   ```dotenv
   UPLOAD_MALWARE_SCAN_MODE=required
   CLAMAV_SOCKET_PATH=/run/clamav/clamd.ctl
   CLAMAV_HOST=
   CLAMAV_PORT=3310
   ```

   De deployworkflow schrijft deze waarden naar `/var/www/nxttrack/{staging|production}/shared/.env`. Bewerk dat bestand daarom niet als permanente configuratiebron; een volgende deploy overschrijft het.

7. Herstart de applicaties zodat hun nieuwe groepslidmaatschap en environment actief worden:

   ```bash
   sudo systemctl restart nxttrack-staging
   sudo systemctl restart nxttrack-production
   sudo systemctl is-active --quiet nxttrack-staging
   sudo systemctl is-active --quiet nxttrack-production
   ```

8. Bewijs dat beide applicatiegebruikers de socket kunnen gebruiken:

   ```bash
   printf 'NXTTRACK ClamAV clean test\n' | sudo tee /tmp/nxttrack-clamav-clean.txt >/dev/null
   sudo chmod 644 /tmp/nxttrack-clamav-clean.txt
   sudo -u "$STAGING_APP_USER" clamdscan --fdpass /tmp/nxttrack-clamav-clean.txt
   sudo -u "$PRODUCTION_APP_USER" clamdscan --fdpass /tmp/nxttrack-clamav-clean.txt
   sudo rm /tmp/nxttrack-clamav-clean.txt
   ```

   Beide scans moeten `OK` en `Infected files: 0` tonen.

## Validatie

1. Deploy eerst de actuele `main`-SHA naar staging.
2. Upload in een geïsoleerde stagingtenant een geldige kleine PDF. Het record moet `clean`, `clamav-instream`, een scantijd en SHA-256 krijgen.
3. Controleer dat een HTML-, SVG-, executable of bestand met een vervalst MIME-type wordt geweigerd.
4. Download uitsluitend voor deze geïsoleerde stagingtest het officiële EICAR-testbestand, geef het een `.csv`-naam en bied het via de CSV-import aan:

   ```bash
   curl --fail --show-error --location https://secure.eicar.org/eicar.com.txt --output /tmp/eicar.csv
   sudo clamdscan --fdpass /tmp/eicar.csv
   rm /tmp/eicar.csv
   ```

   De lokale controle hoort `FOUND` en exitcode `1` te geven. De stagingupload moet vervolgens worden afgewezen en mag geen Storage-object of toegepaste import opleveren.
5. Test de fail-closed grens uitsluitend op staging:

   ```bash
   sudo systemctl stop clamav-daemon.socket clamav-daemon.service
   sudo systemctl is-active clamav-daemon.socket clamav-daemon.service
   sudo test ! -S /run/clamav/clamd.ctl
   ```

   Beide units horen `inactive` te melden en de socket hoort afwezig te zijn. Selecteer vervolgens
   expliciet een geldig klein bestand in **Document uploaden**. De upload moet nu met de rode melding
   `Upload geweigerd: de malwarecontrole is niet bereikbaar of het bestand is niet schoon.` worden
   geweigerd. Alleen de service stoppen is geen geldige test: `clamav-daemon.socket` kan de daemon
   bij de eerstvolgende scan automatisch opnieuw starten. Herstel direct daarna:

   ```bash
   sudo systemctl enable --now clamav-daemon.socket clamav-daemon.service
   sudo systemctl is-active --quiet clamav-daemon.socket
   sudo systemctl is-active --quiet clamav-daemon
   ```

6. Controleer tot slot:

   ```bash
   sudo systemctl --no-pager --full status clamav-daemon clamav-freshclam
   sudo journalctl --unit=clamav-daemon --unit=clamav-freshclam --since='30 minutes ago' --no-pager
   sudo freshclam --version
   ```

Voer de EICAR- en fail-closed uploadtest niet op productie uit. Productie krijgt dezelfde configuratie pas na groen stagingbewijs.

# Predictive operations

NXTTRACK gebruikt drie uitlegbare advieslagen. Geen van deze lagen voert zelfstandig een nadelig besluit, plaatsing, betaling, bericht of roosterwijziging uit.

## Voorspelde wachttijdband

`calculateWaitTimeBand` gebruikt, in volgorde:

1. maximaal de laatste 100 exacte vergelijkbare plaatsingen;
2. plaatsingen van hetzelfde programma en niveau uit de laatste 180 dagen;
3. algemene historie van programma en niveau;
4. programmahistorie;
5. tenantbrede historie;
6. actuele wachtlijstdruk en vaste capaciteit.

De statistiek gebruikt mediaan, P75 en P90. Ouders zien alleen een band en een voorzichtige tip. Exacte cijfers en bronredenen zijn alleen voor tenantmedewerkers zichtbaar. Journey Bot-data is standaard uitgesloten. `include_test_data=true` werkt uitsluitend in development of staging.

Een plaatsing telt historisch vanaf ontvangst van de intake (of aanmaak van de wachtlijstentry) tot acceptatie van het aanbod. Als de kandidaat de minimumleeftijd later bereikt, begint de relevante wachttijd niet vóór `eligible_from`.

## Next Best Action

De dagelijkse generator detecteert alle dertien operationele actietypen uit het productcontract. Elke actie bevat:

- een stabiele fingerprint voor idempotentie;
- prioriteit en confidence;
- redenen met bronbewijs;
- een veilige link naar brondata;
- lifecycle `open`, `dismissed`, `completed` of `auto_resolved`.

Afgeronde en genegeerde acties worden niet stil heropend zolang hetzelfde signaal actief blijft. Open acties verdwijnen automatisch uit de voorgrond als hun bronsignaal niet meer bestaat. “Maak taak” maakt alleen een gekoppelde taak; de bronmutatie blijft een afzonderlijke menselijke beslissing.

Het advies voor een extra lesmoment verschijnt alleen bij de combinatie volle passende groepen, minimaal vijf plaatsbare voorkeuren, lange of zeer lange wachttijd, lage uitstroom en een aantoonbaar vrij resourcevenster.

`POST /api/internal/next-best-actions` is beveiligd met `CRON_SECRET`. De dagelijkse GitHub-workflow draait voor staging en productie. Handmatig verversen kan vanuit **Automatisering → Vandaag belangrijk**.

## Smart Placement 2.0

Plaatsingssuggesties combineren bewezen programma- en niveaumatch, voorkeuren, vaste capaciteit, resourcebeschikbaarheid, instructeurstoewijzing, leeftijdsbalans, verwachte doorstroom, betrouwbare gezinskoppeling en FIFO.

Harde blockers blijven zichtbaar en maken `canOffer=false`. Verwachte uitstroom heft een volle groep nooit op. De server controleert blockers opnieuw bij het maken én accepteren van een aanbod.

De huidige database heeft nog geen expliciet tenantbeleid voor flexcapaciteit, instructeurskwalificaties of maximale instructeursbelasting. Die signalen worden daarom niet verzonnen. Een bewezen planningsconflict wordt wel als overload behandeld. Rechtstreekse plaatsing vanuit een wachtlijstvoorstel is bewust niet toegevoegd: de bestaande geverifieerde aanbodflow bewaart ouderbevestiging en voorkomt gedeeltelijke deelnemers-, inschrijvings- en groepsrecords.

Journey Bot-markers worden doorgezet naar deelnemer, inschrijving, groepslidmaatschap, suggesties en afgeleide acties. De purgefunctie verwijdert afgeleide records van dezelfde run voordat de bronrecords worden opgeschoond.

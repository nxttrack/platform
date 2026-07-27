# Communicatiehub

De Communicatiehub bundelt tenantmeldingen, nieuwsbrieven, templates en
oudergesprekken zonder de bestaande aankondigingen te dupliceren.

## Routes

- `/admin/berichten`: gedeelde inbox, interne notities, toewijzing en taken.
- `/admin/notificaties`: in-app meldingen en status.
- `/admin/nieuwsbrieven`: campagnes, consent-veilige segmenten en delivery logs.
- `/admin/templates`: tenanttemplates met gecontroleerde shortcodes.
- `/admin/communicatie-instellingen`: instructeurstoegang en kanaalgates.
- `/portaal/berichten`: alleen de eigen oudergesprekken en publieke berichten.
- `/instructor/berichten`: toegewezen of toegestane groepsgesprekken.
- `/portaal/profiel`: in-app-, service- en nieuwsbriefvoorkeuren.

## Veiligheidsmodel

- Elke nieuwe communicatietabel heeft `tenant_id`, samengestelde tenant-FK's,
  RLS en `FORCE ROW LEVEL SECURITY`.
- Ouders zien nooit `internal_note` of `staff_only`.
- `view_only`-voogden kunnen geen gesprek over een leerling starten of
  beantwoorden.
- Een beheerder kan een ouder alleen aan een leerlinggesprek koppelen als die
  ouder aantoonbaar toegang tot die leerling heeft.
- Publieke berichten en geplande campagnes vereisen expliciete menselijke
  bevestiging.
- Nieuwsbrieven gebruiken alleen ontvangers met actuele, expliciete
  toestemming. Intrekken sluit hen direct uit van toekomstige runs.
- Testdata gebruikt expliciete `is_test`- en Journey Bot-lineage en
  gereserveerde `.test`-adressen worden niet als echte ontvanger voorbereid.
- WhatsApp en SMS blijven uit totdat consent, providerconfiguratie en
  juridische goedkeuring afzonderlijk zijn ingericht.
- De delivery-laag maakt alleen auditbare records; deze implementatie roept
  geen externe mail-, WhatsApp- of SMS-provider aan.

## Segmenten

Ondersteund zijn alle ouders, programma, groep, badje/niveau, wachtlijst,
nieuwe intakes, afzwemkandidaten, inhaalcredits, open betalingen en
instructeurs. Gerichte programma-, groep- en badjesegmenten vereisen een
tenant-eigen referentie. Zonder geldige referentie is de doelgroep leeg.

## Bewuste beperkingen

- Bijlagen staan uit totdat private storage, thread-ACL, inhoudsclassificatie
  en malwarecontrole als één keten beschikbaar zijn.
- Campagnes kunnen als concept of ingepland worden voorbereid, maar een
  scheduler/provider-worker voor echte externe verzending valt buiten deze
  veilige foundation.
- Open/clickvelden zijn voorbereid voor providerwebhooks; er worden geen
  trackingpixels of links toegevoegd.
- Nieuwsbrieven naar intake- en wachtlijst-e-mailadressen zonder gekoppeld
  account worden bewust als `skipped_no_consent` vastgelegd.

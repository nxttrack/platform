# Tenantwebsite beheren

Tenant owners en tenant admins beheren de publieke klantreis via
`/admin/website`. De eerste veilige CMS-laag ondersteunt:

- home, programma's, agenda en nieuws;
- bovenregel, titel, introductie en twee CTA's;
- drie beheerste kleurthema's;
- zichtbaarheid per pagina;
- SEO-titel en SEO-omschrijving.

## Veiligheidsgrenzen

De editor accepteert uitsluitend platte tekst. React rendert deze inhoud
escaped; vrije HTML, scripts en embeds worden niet opgeslagen. CTA's zijn
alleen interne paden die met precies één `/` beginnen. Alle records zijn
tenant-scoped en `tenant_site_pages` heeft zowel gewone als geforceerde RLS.

De publieke site gebruikt inhoud alleen nadat de tenant op basis van het
subdomain is vastgesteld. Een verborgen pagina verdwijnt uit de navigatie en
toont geen tenantinhoud meer op de directe route.

## CRM-scope

Deze editor is gekoppeld aan de bestaande publieke intake- en
attributiestromen: CTA's kunnen naar `/intake` en `/programmas` leiden en de
bestaande analyticslaag blijft bron, campagne en conversie meten. Dit is een
gestructureerde pagina-editor, geen vrije drag-and-drop pagebuilder. Nieuwe
sectietypen kunnen later gecontroleerd aan hetzelfde model worden toegevoegd.

Er zijn geen extra secrets of environment variables nodig.

# Parent-/kinderportaal — rollout, kill switch en rollback

## Vaste grenzen

- Pas migrations niet vanuit Codex Cloud toe op staging of productie.
- Deploy eerst de additieve migrations, daarna de compatibele servercode en pas als laatste de UI-flags.
- `swim.portal.direct_child_login` blijft in v1 altijd `disabled`.
- Bestaande child-, locked- en revokedcontexten worden nooit verwijderd zolang de oude Auth-sessie/JWT bruikbaar kan zijn.

## Featureflags

| Key | Default | Doel |
|---|---|---|
| `swim.portal.parent_child_split` | disabled | Sessionboundary en gescheiden parent/childpresentatie. |
| `swim.portal.child_mode` | disabled | Nieuwe childcontexten toestaan. |
| `swim.portal.parent_requests` | disabled | Gestructureerd `Vraag mijn ouder`. |
| `swim.portal.direct_child_login` | disabled | Gereserveerd; kan door de v1-configuratie niet worden aangezet. |

Tenantbeheer configureert status en absolute TTL onder `/admin/instellingen`. Toegestaan bereik is 15–720 minuten. `pilot` of `enabled` wordt database-side geweigerd zonder zowel `security_reviewed` als `visual_matrix_reviewed`.

## Activatievolgorde

1. Maak een databasebackup volgens de bestaande operatorprocedure.
2. Pas migrations `20260811120000`, `20260811130000` en `20260811140000` in volgorde toe.
3. Controleer policydekking, grants en advisors.
4. Deploy de servercode met alle flags disabled.
5. Draai de volledige security-, route-, visual-, accessibility- en performancegates met stagingfixtures.
6. Markeer pas daarna security/visual readiness voor één interne tenant en zet status op `pilot`.
7. Controleer dat de eerstvolgende gevalideerde parentrequest een parentcontext initialiseert vóór browserdirecte Data API-toegang.
8. Observeer contextstart/-lock, mislukte reauth, childmedia en ouderverzoeken. Breid tenantallowlist alleen gecontroleerd uit.

## Kill switch

Zet de tenantstatus op `paused` of `disabled` via dezelfde adminflow. De transactionele databasecommand:

- weigert nieuwe childcontexten;
- schrijft auditregels;
- zet bestaande actieve childcontexten op persisted `locked` met reden `rollout_kill_switch`;
- verwijdert geen context, securityevent, request, voorkeur, media-approval of domeindata;
- laat de oude JWT geen parentdata lezen.

Een gedeeltelijk mislukte naverwerking verandert niets aan de databasegate: iedere bestaande child/tombstone-row blijft restricted. De ouder keert alleen terug via verse reauth.

## Compatibiliteit en rollback

De migrations voegen private context-/audit-/challenge-tabellen, drie public portaltabellen, Ocean Quest-release-/assetrows, MP4 als gecontroleerd mediatype en een curriculumvideoconstraint toe. Er worden geen bestaande tabellen, kolommen of productierows verwijderd.

Veilige applicatierollback:

1. Zet de rollout op `disabled` en verifieer locked tombstones.
2. Rol de UI/servercode terug naar de vorige release, maar behoud de nieuwe tabellen, functies en restrictieve sessiegate totdat alle uitgegeven JWT's zijn verlopen of ingetrokken.
3. Laat Ocean Quest ongebruikt; verwijder geen immutable release of historische assignment.
4. Laat MP4- en curriculumvideometadata staan; oudere code negeert de additieve velden/typen.
5. Verwijder `pgrst.db_pre_request` of restrictieve policies nooit als eerste rollbackstap. Dat zou juist oude child-JWT's heropenen.

Een fysieke schemarollback is niet nodig voor applicatieherstel en vereist een afzonderlijk, expliciet goedgekeurd changeplan.

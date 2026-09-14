# Registered route and complete history

Implementation through `8d849b8147b08e9b5e40ef859e9c506321742040`. IN_PROGRESS; the full integration is not certified.

The route uses the reference's orientation-specific cubic tangents inside each registered anchor rectangle. Intrinsic-pixel arc length places pearls on that same curve. Portrait/landscape preserve separate source anchors. No Default anchors/artwork were fabricated. Badge markers are only placed at their complete 44px size; inaccessible/off-page clusters remain in the complete moments list.

Canonical Journey reads now page each stably ordered, authorized database query beyond the PostgREST response cap. Observation and retraction reads share a timestamp cutoff; retractions are scoped to the loaded enrollments. An incomplete read fails rather than rendering partial correction history. A 100,000-row request guard prevents an unbounded load; no audit/test gate was changed. Later-page failure and a 1,213-observation correction history are covered. Existing score/projection authority is unchanged.

Validation: `pnpm test:unit` 500 PASS; `pnpm typecheck` PASS. Five existing Chromium rich Journey tests PASS on the changed geometry. An additional Chromium test uses the browser's actual SVG path geometry and proves every visible pearl is within one intrinsic pixel of the curve in portrait and landscape. The local PostgREST retraction relationship/order/range/cutoff query succeeds (zero test rows in that read). This is not full authenticated portal E2E. Firefox/WebKit remain locally blocked by host libraries as documented in DEVELOPMENT-CHECKPOINT.md.

No deployment, remote database mutation, merge, push, provider action or real communication.

| Evidence | SHA-256 |
|---|---|
| `journey-curve-pages-all-units.log` | `e09891de72bee963ae479893312713e011eca6bcacba0ee1f4fcdb9814aef68a` |
| `journey-pages-typecheck.log` | `0de00c4791387b6713220c80c19f9992f9cb5f1597a33cf1f3f93266db5b46c4` |
| `journey-pages-api.log` | `71b4b1d65577eb25fdc77691b492ae36eb46d8426bae6456384bdbbfe6f68ae8` |
| `journey-pages-units.log` | `a6a035957a76943c3ad60c48e0cb3a38fdf7ddec0f554a7ea9c674aecdd1fa11` |
| `journey-registered-curve-units.log` | `75188c5834b55e2a87ee4cbf666a77c4544bf24ef0a44ce8194234db22750e60` |
| `journey-curve-browser.log` | `45c192090cd96009cffc7b3ccd11d0aa29858d56e1df3b15fcb821d03c4e56af` |
| `journey-curve-registration.log` | `6b02436cc6e2c7ffd297fb596331118e637c38b8435d625a9771ecf93f627adb` |

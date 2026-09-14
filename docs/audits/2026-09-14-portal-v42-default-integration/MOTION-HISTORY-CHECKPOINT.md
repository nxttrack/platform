# Guide activity and complete badge history

Canonical baseline remains `afb53f6e4f72ac8fb0cba88ab98e43373fc7ed80`; full integration is IN_PROGRESS.

The shared renderer parks the guide only after the camera rests. During drag/camera movement, guide and event markers are hidden rather than moved through controls. Collision measurements are performed after settling rather than every pointer frame. A short opacity arrival at the safe destination preserves optional character travel/idle/look poses without animating through obstacles. Intersection/document visibility stops offscreen loops; reduced-motion disables pulse/arrival and preserves explicit navigation/list access. Direct safe placement is the fallback required by the handoff; there is no forced travel path or extra Default parallax.

Parent Journey badge history and child earned badges/current standard releases now use stable bounded pagination with read-time cutoffs. Related earned-release and lifecycle metadata use deduplicated batches of at most100 IDs to avoid URL/response limits. A later failure rejects all partial results. The legacy parent badge wall loads only the authorized family's awards, preserves surprise filtering and sorts the combined batches. Historical award title/date and stable-key earned identity remain unchanged.

Actual evidence:

- 505 units PASS, including1213 related IDs, bounded requests/deduplication and rejection of partial metadata on a later batch failure. The existing child-source boundary assertion now recognizes the bounded earned-ID query rather than assuming one unbounded `.in()` request; its security requirement remains intact.
- Typecheck PASS.
- Seven Chromium rich scene tests PASS, including measured guide/obstacle non-overlap, **zero obstacle measurements during the active drag**, guide absence offscreen, no running reduced-motion animation, accessible list after guide disable, camera/resize/registration/separate-event regressions.
- One actual parent/child collection browser flow rerun after the history changes PASS; durable reads, explicit save, failure/retry, focus, duplicate and responsive controls still work.

Logs/hashes are in TEST-RESULTS and evidence. No schema change in this checkpoint: candidate157, official local history still151 until final fresh/upgrade certification. No deployment, remote database mutation or provider action. Original Default assets remain missing (B01), so no original-artwork visual approval is claimed.

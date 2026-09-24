# Decisions

- Final authorized start instructions and canonical baseline supersede historical phase 0 branch suggestions in the handoff.
- Keep numeric PortalThemeManifestV3 and native tokens intact. Rich presentation is separately versioned and paired with the same immutable release/digest.
- No invented Default source JSON parser: distinguish recognized-but-unavailable Default dialect from manifestless guided mapping.
- No new curriculum rules; source world IDs are presentation identities only.
- Theme import/publish/assignment are separate commands. Extend existing platform theme control rather than duplicate its authority.
- Missing originals remain a visual/source blocker, not a reason to stop code work.

- Removed the hand-written Sharp declaration (introduced in CMS commit 1bb915c). Installed Sharp 0.35.4 supplies its own dist/index.d.mts; the old declaration shadowed actual metadata/decode APIs. All existing Sharp callers pass typecheck with upstream types. No dependency or lockfile change.
- Source package schemas retain their exact known field sets, except semantic asset/criterion IDs additionally allow dots. Rejected fields never reach CSS/HTML or network fetches.
- Reference Ocean legacy crops and technical fallback world remain explicitly classified. Parelroute retains separate registered portrait/landscape layers. Neither reference is labelled Default 1.1.


## Final implementation policies

- Platform-managed world bindings are explicit opt-ins, limited to tenant/program/published curriculum/stage. Existing tenant/child theme selection remains active outside that mode and cannot override it inside the mode. Publication alone activates nothing.
- Message/instructor drafts are private actor+tenant scoped, revisioned and retained for 30 days; actor writes prune expired drafts. No autonomous pruning/provider worker was added. Browser storage contains only navigation/camera state, not message/assessment payloads.
- Collection ownership is distinct from discovery and curriculum progress. Only the confirmed server command saves an immutable source title/image. Existing native v1 capabilities stay exact; the new cosmetic command has its own private capability gate.
- Import retry creates a new attempt from verified retained source. Cleanup targets only terminal rejected import source/preview objects. Published/revision/historical references are preserved. Validated runtime-asset garbage collection is deliberately not implemented.
- Support slots are preserved in schema/editor/export and explicitly inventoried as not rendered; optional decoration is deferred until real originals can be reviewed. This does not license replacement Default artwork.
- Historical evidence records keep their original outcomes; failed fixture setup, streamed-loading test races and missing local browser libraries are retained separately from repaired reruns.
- All 151 canonical migrations remain byte-identical. Six new migrations bring the candidate to 157; runtime contract 5 and its existing rollback floor stay intact, while exact candidate artifact-lineage assertions require all 157.
- Assessment save retries canonical badge evaluation in the mounted workflow; no new durable background badge job is claimed. A post-save evaluation failure remains visible and retryable.

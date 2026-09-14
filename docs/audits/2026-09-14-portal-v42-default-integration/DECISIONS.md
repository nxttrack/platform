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

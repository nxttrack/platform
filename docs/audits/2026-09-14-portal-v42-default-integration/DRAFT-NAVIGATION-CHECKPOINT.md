# Draft navigation — verified implementation checkpoint

Status: IN_PROGRESS for the whole V4.2 integration. Main remains afb53f6e4f72ac8fb0cba88ab98e43373fc7ed80; no push, PR, deployment or remote mutation at this checkpoint.

The root browser-history boundary records only opaque entry positions while retaining Next router state. Back/Forward first restores the original URL and flushes registered private drafts with editors mounted. Failed writes retain inputs and the original history length; success resumes navigation without replacing history entries. Unowned/cross-document navigation retains native beforeunload confirmation. Tab changes, command-palette navigation and shell context switching also wait for pending drafts. Ordinary links, close and archive retain their existing checks.

Unpublished child compliments are not auto-published on navigation. They hold navigation with an explicit explanation until publication or confirmed discard. Cancelling discard retains the text. Confirmed discard clears it.

Actual Chromium evidence: 3 navigation harness cases (Back/Forward, command palette, tab unmount) plus the authenticated instructor/parent/child chain including unpublished-compliment Back and cancel-discard: **4 PASS**, 39.6s. The separate real message suite includes failed draft save on Back, retry saving through Back, Forward and restored durable draft: **2 PASS**. These are isolated loopback sessions with fictional people, no external messages or provider actions.

The first expanded instructor test had 3 PASS / 1 FAIL: its hard page.goto created a cross-document entry, where native beforeunload applied, but its assertion expected the same-document error. The test now enters through the actual instructor student link and retains that SPA history across reload. The original failed log is retained. The successful rerun uses a newly seeded fictional family. No failed run has been relabelled PASS.

Typecheck PASS; all 505 units PASS, 0 skipped; existing auth audit PASS. Root history behavior is bounded to tracked SPA entries; physical device checks and the final complete browser/build gates remain pending.

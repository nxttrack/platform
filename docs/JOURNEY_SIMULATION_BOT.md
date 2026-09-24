# Journey Simulation Bot — retired

The Journey Bot was retired at the owner’s request on 14 September 2026 (Europe/Amsterdam). Testing is performed manually from now on.

The bot runner, platform controls, seed, tick endpoint, dedicated smoke/window tests and three GitHub workflows have been removed from the application source. The bot step was removed from the ordinary demo-seed workflow. Bot-only release checks and environment variables are obsolete.

The three hosted Journey Bot workflows were disabled immediately. The shared demo-seed workflow is also temporarily disabled because its current main revision still invokes the bot seed. It may be re-enabled only after the reviewed removal is on main; the bot workflows stay disabled.

A forward-only retirement migration stops configurations, removes the bot RPCs and makes its six historical tables read-only for application roles. Existing migrations, test-data lineage, purge receipts and historical audit evidence are retained. Old test records stay excluded from real analytics, notifications and payments. The ordinary learner Journey UI and its browser tests are unaffected.

This is not a claim that the previous 503 incident was recovered. The final manual tick still failed; the owner cancelled recovery in favour of removing the feature. No successful scheduled ticks are invented or required as proof of retirement.

See [retirement evidence](audits/2026-09-14-journey-bot-retirement.md) for the exact commits, database migrations, checks and remaining release status. No application deployment or PR #58 merge is part of retirement.

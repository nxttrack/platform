import { execFileSync } from "node:child_process";

// The schema keeps its original, immutable certification lineage. This audited
// semantic port has the same apps/web, package/lockfile and migration content as
// db9806f, without merging the unrelated staging and preview deployment history.
// Preserve this commit when merging the reconciliation PR (no squash/rebase).
export const reconciledApplicationAnchors = Object.freeze({
  "541fe5fd6cee083cb809eef236382cfd2d519ed3": "12b4885a55c439caa2a7aa180d597e72baf9d2d5"
});

export function assertCompatibleApplicationAncestry({ sourceCheckout, minimumAppSha, candidateSha }) {
  if (![minimumAppSha, candidateSha].every((sha) => typeof sha === "string" && /^[0-9a-f]{40}$/.test(sha))) {
    throw new Error("Application compatibility requires full immutable commit SHAs.");
  }
  const anchors = [minimumAppSha, reconciledApplicationAnchors[minimumAppSha]].filter(Boolean);
  for (const anchor of anchors) {
    try {
      execFileSync("git", ["merge-base", "--is-ancestor", anchor, candidateSha], {
        cwd: sourceCheckout,
        stdio: "ignore"
      });
      return anchor;
    } catch {
      // A source branch may not be fetched in a canonical-only checkout. The
      // explicitly certified alternative must still be a real ancestor.
    }
  }
  throw new Error("Application commit has no certified compatible ancestor; refusing release or rollback.");
}

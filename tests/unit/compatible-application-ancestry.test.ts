import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertCompatibleApplicationAncestry, reconciledApplicationAnchors } from "../../scripts/release/compatible-application-ancestry.mjs";

const sourceCheckout = fileURLToPath(new URL("../..", import.meta.url));
const minimumAppSha = "541fe5fd6cee083cb809eef236382cfd2d519ed3";
const candidateSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sourceCheckout, encoding: "utf8" }).trim();

test("the canonical semantic port is a real compatible ancestor", () => {
  assert.equal(assertCompatibleApplicationAncestry({ sourceCheckout, minimumAppSha, candidateSha }), reconciledApplicationAnchors[minimumAppSha]);
});

test("a canonical main-only checkout retains the anchor without source branch refs", () => {
  const checkout = mkdtempSync(join(tmpdir(), "nxttrack-canonical-main-"));
  try {
    execFileSync("git", ["init", "--quiet", "--initial-branch=main", checkout]);
    const commonDir = execFileSync("git", ["rev-parse", "--git-common-dir"], { cwd: sourceCheckout, encoding: "utf8" }).trim();
    mkdirSync(join(checkout, ".git", "objects", "info"), { recursive: true });
    writeFileSync(join(checkout, ".git", "objects", "info", "alternates"), `${resolve(sourceCheckout, commonDir, "objects")}\n`);
    execFileSync("git", ["update-ref", "refs/heads/main", candidateSha], { cwd: checkout });
    assert.equal(execFileSync("git", ["for-each-ref", "--format=%(refname)"], { cwd: checkout, encoding: "utf8" }).trim(), "refs/heads/main");
    assert.equal(assertCompatibleApplicationAncestry({ sourceCheckout: checkout, minimumAppSha, candidateSha }), reconciledApplicationAnchors[minimumAppSha]);
    assert.throws(() => assertCompatibleApplicationAncestry({ sourceCheckout: checkout, minimumAppSha,
      candidateSha: "0fa158fb0abc7fdfe781a103a4c83b016edcba45" }), /no certified compatible ancestor/);
  } finally {
    rmSync(checkout, { recursive: true, force: true });
  }
});

test("the old main baseline and missing commits cannot be release or rollback targets", () => {
  for (const candidateSha of ["0fa158fb0abc7fdfe781a103a4c83b016edcba45", "f".repeat(40)]) {
    assert.throws(() => assertCompatibleApplicationAncestry({ sourceCheckout, minimumAppSha, candidateSha }), /no certified compatible ancestor/);
  }
});

test("an unrelated schema floor cannot borrow this semantic port", () => {
  assert.throws(() => assertCompatibleApplicationAncestry({ sourceCheckout, minimumAppSha: "e".repeat(40), candidateSha }), /no certified compatible ancestor/);
});

test("branch names and abbreviated SHAs are not immutable compatibility identifiers", () => {
  for (const candidateSha of ["main", "12b4885", "--all"]) {
    assert.throws(() => assertCompatibleApplicationAncestry({ sourceCheckout, minimumAppSha, candidateSha }), /full immutable commit SHAs/);
  }
});

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";
import { assertCompatibleApplicationAncestry, reconciledApplicationAnchors } from "../../scripts/release/compatible-application-ancestry.mjs";

const sourceCheckout = fileURLToPath(new URL("../..", import.meta.url));
const minimumAppSha = "541fe5fd6cee083cb809eef236382cfd2d519ed3";
const candidateSha = execFileSync("git", ["rev-parse", "HEAD"], { cwd: sourceCheckout, encoding: "utf8" }).trim();

test("the canonical semantic port is a real compatible ancestor", () => {
  assert.equal(assertCompatibleApplicationAncestry({ sourceCheckout, minimumAppSha, candidateSha }), reconciledApplicationAnchors[minimumAppSha]);
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

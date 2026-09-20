import assert from "node:assert/strict";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, utimesSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { pruneReleases } from "../../scripts/release/prune-releases.mjs";

function fixture(t) {
  const baseDirectory = mkdtempSync(join(tmpdir(), "nxttrack-prune-"));
  t.after(() => rmSync(baseDirectory, { recursive: true, force: true }));
  const root = join(baseDirectory, "releases");
  mkdirSync(root);
  function release(index) {
    const name = `20260920${String(index).padStart(6, "0")}-abcdef0`, directory = join(root, name);
    mkdirSync(directory);
    writeFileSync(join(directory, "server.js"), `release-${index}`);
    utimesSync(directory, 1000 + index, 1000 + index);
    return directory;
  }
  return { baseDirectory, root, release };
}

test("failed newer candidates cannot evict either the current application or the previous working snapshot", (t) => {
  const { baseDirectory, release } = fixture(t);
  const previous = release(1), current = release(2), oldUnused = release(3);
  const failed = [4, 5, 6, 7, 8, 9].map(release);
  symlinkSync(current, join(baseDirectory, "current"));
  const result = pruneReleases({ baseDirectory, previousReleaseDirectory: previous });
  assert.equal(readFileSync(join(previous, "server.js"), "utf8"), "release-1");
  assert.equal(readFileSync(join(current, "server.js"), "utf8"), "release-2");
  assert.equal(existsSync(oldUnused), false);
  assert.equal(existsSync(failed[0]), false);
  for (const directory of failed.slice(1)) assert.equal(existsSync(directory), true);
  assert.equal(result.removed.length, 2);
  assert.equal(result.retained.length, 7);
  assert.deepEqual(pruneReleases({ baseDirectory, previousReleaseDirectory: previous }).removed, []);
});

test("same current and previous pin is supported without deleting custom rescue folders or symlinks", (t) => {
  const { baseDirectory, root, release } = fixture(t);
  const current = release(1), newer = release(2);
  const rescue = join(root, "v4-maintenance-previous-run");
  mkdirSync(rescue);
  writeFileSync(join(rescue, "server.js"), "maintenance responder");
  const symlink = join(root, "20260920000003-abcdef0");
  symlinkSync(rescue, symlink);
  writeFileSync(join(root, "operator-notes.txt"), "retained");
  symlinkSync(current, join(baseDirectory, "current"));
  const result = pruneReleases({ baseDirectory, previousReleaseDirectory: current, retainCount: 1 });
  for (const directory of [current, newer, rescue, symlink]) assert.equal(existsSync(directory), true);
  assert.deepEqual(result.ignored.sort(), ["20260920000003-abcdef0", "operator-notes.txt", "v4-maintenance-previous-run"]);
});

test("missing or out-of-root rollback pins fail before any release is removed", (t) => {
  const { baseDirectory, release } = fixture(t);
  const current = release(1), another = release(2);
  symlinkSync(current, join(baseDirectory, "current"));
  const outside = join(baseDirectory, "outside");
  mkdirSync(outside);
  for (const previous of [join(baseDirectory, "missing"), outside, join(baseDirectory, "releases")]) {
    assert.throws(() => pruneReleases({ baseDirectory, previousReleaseDirectory: previous, retainCount: 1 }));
    assert.equal(existsSync(current), true);
    assert.equal(existsSync(another), true);
  }
});

test("an out-of-root current symlink and invalid retention cannot trigger pruning", (t) => {
  const { baseDirectory, release } = fixture(t);
  const previous = release(1), outside = join(baseDirectory, "outside");
  mkdirSync(outside);
  symlinkSync(outside, join(baseDirectory, "current"));
  assert.throws(() => pruneReleases({ baseDirectory, previousReleaseDirectory: previous }), /Current application/);
  assert.throws(() => pruneReleases({ baseDirectory, previousReleaseDirectory: previous, retainCount: 0 }), /retention/);
  assert.equal(existsSync(previous), true);
});

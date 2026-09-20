import assert from "node:assert/strict";
import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { rotateStorageBackupKey } from "../../scripts/operations/rotate-storage-backup-key.mjs";

const hash = (bytes) => createHash("sha256").update(bytes).digest("hex");
function fixture(t) {
  const shared = mkdtempSync(join(tmpdir(), "nxttrack-key-rotation-"));
  t.after(() => rmSync(shared, { recursive: true, force: true }));
  const operations = join(shared, "operations-v4"), backups = join(shared, "storage-backups-v4"), gpgHome = join(shared, "gpg-test");
  for (const directory of [operations, backups, gpgHome]) mkdirSync(directory, { mode: 0o700 });
  const current = join(operations, "backup-passphrase"), oldKey = "old9chars", newKey = randomBytes(48).toString("base64");
  writeFileSync(current, oldKey, { mode: 0o600 });
  const execute = (command, args, options) => execFileSync(command, args, { ...options, env: { ...process.env, GNUPGHOME: gpgHome } });
  function encrypt(name, keyFile = current) {
    const input = join(shared, "fixture-plaintext");
    writeFileSync(input, `recoverable bytes: ${name}`, { mode: 0o600 });
    const archive = join(backups, name);
    execute("gpg", ["--batch", "--yes", "--quiet", "--no-symkey-cache", "--pinentry-mode", "loopback", "--passphrase-file", keyFile,
      "--symmetric", "--cipher-algo", "AES256", "--s2k-count", "65536", "--output", archive, input], { stdio: "pipe" });
    rmSync(input);
    return archive;
  }
  function decrypt(archive, keyFile, destination) {
    execute("gpg", ["--batch", "--yes", "--quiet", "--no-symkey-cache", "--pinentry-mode", "loopback", "--passphrase-file", keyFile,
      "--decrypt", "--output", destination, archive], { stdio: "pipe" });
  }
  const rotate = (passphrase = newKey, runner = execute) => rotateStorageBackupKey({ target: "staging", shared, newPassphrase: passphrase, lockHeld: true }, { execute: runner });
  return { shared, operations, backups, current, oldKey, newKey, execute, encrypt, decrypt, rotate };
}

function assertNoTemporaryPlaintext(shared) {
  assert.deepEqual(readdirSync(shared).filter((name) => name.startsWith(".v4-key-rotation-")), []);
  assert.deepEqual(readdirSync(join(shared, "operations-v4")).filter((name) => name.startsWith(".backup-passphrase.pending-")), []);
}

test("actual GPG rotation preserves archive bytes, retains off-host recovery and supports retries and mixed historical keys", (t) => {
  const state = fixture(t);
  const legacyArchive = state.encrypt("legacy.tar.gz.gpg"), legacyBytes = readFileSync(legacyArchive);
  const first = state.rotate();
  assert.equal(first.rotated, true);
  assert.equal(first.verifiedArchives, 1);
  assert.equal(first.retainedKeys, 2);
  assert.equal(first.newBackupVerificationRequired, true);
  assert.equal(readFileSync(state.current, "utf8"), state.newKey);
  assert.equal(statSync(state.current).mode & 0o777, 0o600);
  assert.deepEqual(readFileSync(legacyArchive), legacyBytes);
  const history = join(state.operations, "key-history"), oldKeyFile = join(history, `${hash(state.oldKey)}.key`);
  assert.equal(readFileSync(oldKeyFile, "utf8"), state.oldKey);
  assert.equal(statSync(oldKeyFile).mode & 0o777, 0o600);
  assertNoTemporaryPlaintext(state.shared);

  // Simulate independent recovery: the new secret decrypts the uploaded bundle,
  // which yields the old secret needed by an unchanged historical GitHub archive.
  const restoredBundle = join(state.shared, "off-host-key-history.tar.gz"), restored = join(state.shared, "off-host-keys");
  state.decrypt(first.recoveryBundlePath, state.current, restoredBundle);
  mkdirSync(restored, { mode: 0o700 });
  state.execute("tar", ["-C", restored, "-xzf", restoredBundle], { stdio: "pipe" });
  const restoredPlaintext = join(state.shared, "restored-old-archive");
  state.decrypt(legacyArchive, join(restored, `${hash(state.oldKey)}.key`), restoredPlaintext);
  assert.match(readFileSync(restoredPlaintext, "utf8"), /recoverable bytes: legacy/);
  rmSync(restoredPlaintext); rmSync(restoredBundle); rmSync(restored, { recursive: true });

  const retainedMetadata = readFileSync(join(history, `${hash(state.oldKey)}.json`));
  const retry = state.rotate();
  assert.equal(retry.rotated, false);
  assert.equal(retry.verifiedArchives, 1);
  assert.deepEqual(readFileSync(join(history, `${hash(state.oldKey)}.json`)), retainedMetadata);
  assert.deepEqual(readFileSync(legacyArchive), legacyBytes);

  const secondArchive = state.encrypt("second-key.tar.gz.gpg"), secondBytes = readFileSync(secondArchive);
  const thirdKey = randomBytes(48).toString("base64");
  const secondRotation = state.rotate(thirdKey);
  assert.equal(secondRotation.retainedKeys, 3);
  assert.equal(secondRotation.verifiedArchives, 2);
  assert.equal(readFileSync(state.current, "utf8"), thirdKey);
  assert.deepEqual(readFileSync(legacyArchive), legacyBytes);
  assert.deepEqual(readFileSync(secondArchive), secondBytes);
  assertNoTemporaryPlaintext(state.shared);
});

test("unrecoverable archive prevents key publication and leaves old and new retained keys available for a retry", (t) => {
  const state = fixture(t);
  const damaged = join(state.backups, "damaged.tar.gz.gpg");
  writeFileSync(damaged, "not a valid encrypted archive");
  assert.throws(() => state.rotate(), /Storage key rotation did not complete/);
  assert.equal(readFileSync(state.current, "utf8"), state.oldKey);
  assert.equal(readFileSync(join(state.operations, "key-history", `${hash(state.oldKey)}.key`), "utf8"), state.oldKey);
  assertNoTemporaryPlaintext(state.shared);
  rmSync(damaged);
  assert.equal(state.rotate().rotated, true);
  assertNoTemporaryPlaintext(state.shared);
});

test("encryption process failure is secret-free and never publishes the new key or leaves plaintext", (t) => {
  const state = fixture(t);
  const archive = state.encrypt("retained.tar.gz.gpg"), before = readFileSync(archive);
  let failure;
  try {
    state.rotate(state.newKey, (command, args, options) => {
      if (command === "gpg" && args.includes("--symmetric")) throw new Error(`sensitive provider detail ${state.newKey}`);
      return state.execute(command, args, options);
    });
  } catch (error) { failure = error; }
  assert.match(failure?.message ?? "", /did not complete/);
  assert.ok(!String(failure).includes(state.newKey));
  assert.equal(readFileSync(state.current, "utf8"), state.oldKey);
  assert.deepEqual(readFileSync(archive), before);
  assertNoTemporaryPlaintext(state.shared);
});

test("rotation rejects a missing lock or short/multiline new secret before touching history", (t) => {
  const state = fixture(t);
  assert.throws(() => rotateStorageBackupKey({ target: "staging", shared: state.shared, newPassphrase: state.newKey }), /backup lock/);
  for (const invalid of ["short", `${state.newKey}\ntruncated`]) assert.throws(() => state.rotate(invalid), /32 characters/);
  assert.equal(readFileSync(state.current, "utf8"), state.oldKey);
  assert.deepEqual(readdirSync(state.operations), ["backup-passphrase"]);
});

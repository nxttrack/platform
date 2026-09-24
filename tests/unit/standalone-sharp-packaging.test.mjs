import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, renameSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";

test("standalone packaging replaces existing pnpm links and survives repetition and relocation", () => {
  const root = mkdtempSync(join(tmpdir(), "nxttrack-sharp-package-"));
  const put = (path, value) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, value); };
  const native = "@img+sharp-linux-x64@0.35.4/node_modules/@img/sharp-linux-x64/lib/sharp.node";
  const vips = "@img+sharp-libvips-linux-x64@1.3.3/node_modules/@img/sharp-libvips-linux-x64";
  const link = "@img+sharp-linux-x64@0.35.4/node_modules/@img/sharp-libvips-linux-x64";
  const source = join(root, "node_modules", ".pnpm");
  const standalone = join(root, "apps/web/.next/standalone");
  const target = join(standalone, "node_modules", ".pnpm");
  try {
    const script = join(root, "scripts/deploy/package-standalone-assets.mjs");
    mkdirSync(dirname(script), { recursive: true });
    cpSync(new URL("../../scripts/deploy/package-standalone-assets.mjs", import.meta.url), script);
    put(join(root, "apps/web/.next/static/chunks/runtime.js"), "// runtime");
    put(join(standalone, "apps/web/server.js"), "// standalone server");
    put(join(source, native), "native fixture");
    put(join(source, vips, "lib/libvips.so.42"), "libvips fixture");
    symlinkSync(relative(dirname(join(source, link)), join(source, vips)), join(source, link));
    cpSync(source, target, { recursive: true, verbatimSymlinks: true });
    for (let run = 0; run < 2; run++) execFileSync(process.execPath, [script], { cwd: root, stdio: "pipe" });
    assert.equal(readFileSync(join(source, native), "utf8"), "native fixture");
    const moved = join(root, "relocated-standalone");
    renameSync(standalone, moved);
    rmSync(source, { recursive: true });
    assert.equal(realpathSync(join(moved, "node_modules/.pnpm", link)), join(moved, "node_modules/.pnpm", vips));
    assert.equal(readFileSync(join(moved, "node_modules/.pnpm", link, "lib/libvips.so.42"), "utf8"), "libvips fixture");
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

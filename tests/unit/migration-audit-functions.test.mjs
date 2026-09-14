import assert from "node:assert/strict";
import { test } from "node:test";
import { mkdtempSync, mkdirSync, copyFileSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

test("migration gate scopes function security to its own header and also checks replacements", () => {
  const dir = mkdtempSync(join(tmpdir(), "nxttrack-v42-function-audit-"));
  try {
    mkdirSync(join(dir, "scripts/db"), { recursive: true }); mkdirSync(join(dir, "supabase/migrations"), { recursive: true });
    for (const name of ["audit-migrations.mjs", "sql-function-blocks.mjs"]) copyFileSync(new URL(`../../scripts/db/${name}`, import.meta.url), join(dir, "scripts/db", name));
    const run = (sql) => { writeFileSync(join(dir, "supabase/migrations/20260101000000_test.sql"), sql); return spawnSync(process.execPath, [join(dir, "scripts/db/audit-migrations.mjs")], { encoding: "utf8" }); };
    const mixed = `create function public.visible() returns void language sql security invoker set search_path = '' as $$ select 1; $$;
      create function app_private.internal() returns void language sql security definer set search_path = '' as $body$ select 1; $body$;`;
    assert.equal(run(mixed).status, 0, "A following private definer must not change the public function's security classification");
    for (const declaration of ["create function", "create or replace function"]) {
      const result = run(`${declaration} public.forbidden() returns void language sql security definer set search_path = '' as $body$ select 1; $body$;`);
      assert.equal(result.status, 1); assert.match(result.stderr, /security definer function in public schema/);
    }
    const missing = run("create or replace function app_private.internal() returns void language sql security definer as $$ select 1; $$;");
    assert.equal(missing.status, 1); assert.match(missing.stderr, /missing an explicit search_path/);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

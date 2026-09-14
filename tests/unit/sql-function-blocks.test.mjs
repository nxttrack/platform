import assert from "node:assert/strict";
import test from "node:test";
import { sqlFunctionBlocks } from "../../scripts/db/sql-function-blocks.mjs";

test("RLS audit recognizes pg_get_functiondef named quotes and SET search_path TO", () => {
  assert.deepEqual(sqlFunctionBlocks(`CREATE OR REPLACE FUNCTION app_private.example()
    RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO public, pg_temp
    AS $function$ BEGIN RETURN; END; $function$;`), [{
    name: "app_private.example", securityDefiner: true, explicitSearchPath: true
  }]);
});

test("named and unnamed functions do not borrow a neighbouring search_path", () => {
  const functions = sqlFunctionBlocks(`
    create function app_private.unsafe() returns void language plpgsql security definer
    as $body$ begin return; end; $body$;
    create function app_private.safe() returns void language plpgsql security definer
    set search_path = public, pg_temp as $$ begin return; end; $$;`);
  assert.equal(functions.length, 2);
  assert.equal(functions[0].name, "app_private.unsafe");
  assert.equal(functions[0].explicitSearchPath, false);
  assert.equal(functions[1].explicitSearchPath, true);
});

test("body text cannot masquerade as function privilege or search-path clauses", () => {
  const [unsafe, invoker] = sqlFunctionBlocks(`
    create function app_private.unsafe() returns void language plpgsql security definer
    as $body$ begin raise notice 'set search_path = public'; end; $body$;
    create function public.invoker() returns void language plpgsql
    as $$ begin raise notice 'security definer'; end; $$;`);
  assert.equal(unsafe.explicitSearchPath, false);
  assert.equal(unsafe.securityDefiner, true);
  assert.equal(invoker.securityDefiner, false);
});

test("an inner unnamed quote does not terminate an outer named function body", () => {
  const [block] = sqlFunctionBlocks(`create function app_private.nested() returns void
    language plpgsql security definer set search_path=public,pg_temp
    as $outer$ begin perform $$literal$$; end; $outer$;`);
  assert.equal(block.name, "app_private.nested");
  assert.equal(block.explicitSearchPath, true);
});

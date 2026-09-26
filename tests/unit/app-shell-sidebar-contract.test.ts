import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const shell = readFileSync(new URL("../../apps/web/components/shell/app-shell-client.tsx", import.meta.url), "utf8");
const sidebar = shell.slice(shell.indexOf("function Sidebar("), shell.indexOf("function NavigationItem("));

test("de ingeklapte desktopsidebar houdt de uitklapbediening binnen de rail", () => {
  assert.match(sidebar, /aria-expanded=\{!collapsed\}/);
  assert.match(sidebar, /aria-label=\{collapsed \? "Navigatie uitklappen" : "Navigatie inklappen"\}/);
  assert.match(sidebar, /collapsed && !mobile \? "justify-center gap-0\.5 px-1" : "px-4"/);
  assert.match(sidebar, /collapsed && !mobile && "size-8"/);
  assert.match(sidebar, /collapsed && "size-8 border border-border bg-card shadow-soft"/);
  assert.doesNotMatch(sidebar, /absolute left-\[58px\] top-4 translate-x-1\/2/);
});

test("de desktopsidebar blijft viewportvast en scrolt de lange navigatie zelfstandig", () => {
  assert.match(shell, /sticky top-0 hidden h-dvh self-start overflow-hidden md:block/);
  assert.match(sidebar, /min-h-0 flex-1 overflow-y-auto overscroll-contain py-3/);
});

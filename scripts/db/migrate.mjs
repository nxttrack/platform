#!/usr/bin/env node

console.log("[db:migrate] Phase 2 scaffold: no database migrations are configured yet.");
console.log("[db:migrate] This command is intentionally a safe no-op until Supabase staging and the migration runner are approved.");

if (process.env.DATABASE_URL) {
  console.log("[db:migrate] DATABASE_URL is present, but no schema has been created in this phase.");
} else {
  console.log("[db:migrate] DATABASE_URL is not set. Skipping migration placeholder.");
}

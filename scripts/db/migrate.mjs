#!/usr/bin/env node

console.log("[db:migrate] Supabase migrations are present in the repository.");
console.log("[db:migrate] Automatic migration execution is intentionally disabled until Supabase staging and the deployment runner are approved.");

if (process.env.DATABASE_URL) {
  console.error("[db:migrate] DATABASE_URL is present, but migration execution is not wired yet.");
  console.error("[db:migrate] Approve the Supabase staging project and runner command before enabling this step.");
  process.exit(1);
} else {
  console.log("[db:migrate] DATABASE_URL is not set. Skipping migration execution.");
}

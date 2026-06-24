#!/usr/bin/env node

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const rootDir = fileURLToPath(new URL("../..", import.meta.url));
const migrationsDir = join(rootDir, "supabase", "migrations");

const failures = [];

if (!existsSync(migrationsDir)) {
  console.log("[db:audit] No migrations directory found.");
  process.exit(0);
}

const migrationFiles = readdirSync(migrationsDir)
  .filter((file) => file.endsWith(".sql"))
  .sort();
const normalizedMigrationSql = [];

for (const file of migrationFiles) {
  const filePath = join(migrationsDir, file);
  const sql = readFileSync(filePath, "utf8");
  const normalizedSql = normalizeSql(sql);
  normalizedMigrationSql.push(normalizedSql);

  checkForbiddenPatterns(file, normalizedSql);
  checkSecurityDefinerFunctions(file, normalizedSql);
  checkPolicies(file, normalizedSql);
  checkPublicTables(file, normalizedSql);
}

checkCoreDomainContracts(normalizedMigrationSql.join(" "));
checkPublicTenantIntakeContracts(normalizedMigrationSql.join(" "));
checkPlacementWorkflowContracts(normalizedMigrationSql.join(" "));
checkParentPortalContracts(normalizedMigrationSql.join(" "));
checkInstructorPortalContracts(normalizedMigrationSql.join(" "));
checkProgressBadgesAchievementContracts(normalizedMigrationSql.join(" "));
checkAfzwemDiplomaVaultContracts(normalizedMigrationSql.join(" "));
checkManualPaymentsContracts(normalizedMigrationSql.join(" "));
checkMessagesTasksDocsReportsContracts(normalizedMigrationSql.join(" "));
checkPlatformSuperAdminContracts(normalizedMigrationSql.join(" "));

if (failures.length > 0) {
  console.error("[db:audit] Migration audit failed:");

  for (const failure of failures) {
    console.error(`- ${failure}`);
  }

  process.exit(1);
}

console.log(`[db:audit] Checked ${migrationFiles.length} migration file(s).`);

function checkForbiddenPatterns(file, sql) {
  const forbiddenPatterns = [
    { pattern: /\bauth\.role\s*\(/, message: "uses deprecated auth.role(); use policy TO clauses instead" },
    { pattern: /\braw_user_meta_data\b|\buser_metadata\b/, message: "uses editable user metadata for authorization" },
    { pattern: /create\s+function\s+public\.[\s\S]*?\bsecurity\s+definer\b/, message: "creates a security definer function in public schema" }
  ];

  for (const { pattern, message } of forbiddenPatterns) {
    if (pattern.test(sql)) {
      failures.push(`${file}: ${message}.`);
    }
  }
}

function checkSecurityDefinerFunctions(file, sql) {
  const functionBlocks = sql.match(/create\s+function\s+[\s\S]*?\$\$\s*;/g) ?? [];

  for (const block of functionBlocks) {
    if (/\bsecurity\s+definer\b/.test(block) && !/\bset\s+search_path\s*=/.test(block)) {
      failures.push(`${file}: security definer function is missing an explicit search_path.`);
    }
  }
}

function checkPolicies(file, sql) {
  const policyBlocks = sql.match(/create\s+policy\s+[\s\S]*?;/g) ?? [];

  for (const block of policyBlocks) {
    if (!/\bto\s+authenticated\b/.test(block)) {
      failures.push(`${file}: policy is missing an explicit TO authenticated clause.`);
    }

    if (/\bfor\s+update\b/.test(block) && !/\bwith\s+check\b/.test(block)) {
      failures.push(`${file}: update policy is missing WITH CHECK.`);
    }
  }
}

function checkPublicTables(file, sql) {
  const tables = Array.from(sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?public\.([a-z_][a-z0-9_]*)/g), (match) => match[1]);

  for (const table of tables) {
    const escapedTable = escapeRegExp(table);
    const rlsPattern = new RegExp(`alter\\s+table\\s+public\\.${escapedTable}\\s+enable\\s+row\\s+level\\s+security\\s*;`);
    const authenticatedGrantPattern = new RegExp(`grant\\s+[\\s\\S]*?\\s+on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);
    const serviceRoleGrantPattern = new RegExp(`grant\\s+[\\s\\S]*?\\s+on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+service_role\\s*;`);

    if (!rlsPattern.test(sql)) {
      failures.push(`${file}: public.${table} is missing ALTER TABLE ... ENABLE ROW LEVEL SECURITY.`);
    }

    if (!authenticatedGrantPattern.test(sql)) {
      failures.push(`${file}: public.${table} is missing an explicit authenticated grant.`);
    }

    if (!serviceRoleGrantPattern.test(sql)) {
      failures.push(`${file}: public.${table} is missing an explicit service_role grant.`);
    }
  }
}

function checkCoreDomainContracts(sql) {
  const requiredCoreTables = [
    "programs",
    "stages",
    "groups",
    "sessions",
    "resources",
    "instructors",
    "enrollments",
    "group_memberships",
    "subscription_plans",
    "progress",
    "badges",
    "certificates"
  ];

  for (const table of requiredCoreTables) {
    if (!new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\b`).test(sql)) {
      failures.push(`Core domain contract is missing public.${table}.`);
    }
  }

  const enrollmentsBlock = extractCreateTableBlock(sql, "enrollments");
  const stagesBlock = extractCreateTableBlock(sql, "stages");
  const subscriptionPlansBlock = extractCreateTableBlock(sql, "subscription_plans");

  if (enrollmentsBlock && !/\bcurrent_stage_id\b/.test(enrollmentsBlock)) {
    failures.push("Core domain contract: public.enrollments must track current_stage_id separately from billing.");
  }

  if (enrollmentsBlock && !/\bsubscription_plan_id\b/.test(enrollmentsBlock)) {
    failures.push("Core domain contract: public.enrollments must track subscription_plan_id separately from stage progression.");
  }

  if (stagesBlock && /\b(price|billing|payment|subscription_plan)_?[a-z0-9_]*\b/.test(stagesBlock)) {
    failures.push("Core domain contract: public.stages must not contain billing/payment/subscription columns.");
  }

  if (subscriptionPlansBlock && /\bstage_id\b|\bbadge_id\b|\bbadje\b/.test(subscriptionPlansBlock)) {
    failures.push("Core domain contract: public.subscription_plans must not be tied to stage/badge progression.");
  }

  checkCoreDomainWriteContracts(sql);
}

function extractCreateTableBlock(sql, table) {
  const match = new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\s*\\([\\s\\S]*?\\);`).exec(sql);

  return match?.[0] ?? "";
}

function checkCoreDomainWriteContracts(sql) {
  const mutablePhase3Tables = [
    "programs",
    "stages",
    "subscription_plans",
    "resources",
    "instructors",
    "groups",
    "sessions",
    "participants",
    "enrollments",
    "group_memberships"
  ];

  for (const table of mutablePhase3Tables) {
    const escapedTable = escapeRegExp(table);
    const insertGrantPattern = new RegExp(`grant\\s+insert[\\s\\S]*?on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);
    const updateGrantPattern = new RegExp(`grant\\s+update[\\s\\S]*?on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);
    const insertPolicyPattern = new RegExp(`create\\s+policy\\s+["']?[\\s\\S]*?on\\s+public\\.${escapedTable}[\\s\\S]*?for\\s+insert[\\s\\S]*?to\\s+authenticated[\\s\\S]*?with\\s+check[\\s\\S]*?;`);
    const updatePolicyPattern = new RegExp(`create\\s+policy\\s+["']?[\\s\\S]*?on\\s+public\\.${escapedTable}[\\s\\S]*?for\\s+update[\\s\\S]*?to\\s+authenticated[\\s\\S]*?using[\\s\\S]*?with\\s+check[\\s\\S]*?;`);

    if (!insertGrantPattern.test(sql)) {
      failures.push(`Core domain write contract: public.${table} is missing an authenticated INSERT grant.`);
    }

    if (!updateGrantPattern.test(sql)) {
      failures.push(`Core domain write contract: public.${table} is missing an authenticated UPDATE grant.`);
    }

    if (!insertPolicyPattern.test(sql)) {
      failures.push(`Core domain write contract: public.${table} is missing an INSERT policy with WITH CHECK.`);
    }

    if (!updatePolicyPattern.test(sql)) {
      failures.push(`Core domain write contract: public.${table} is missing an UPDATE policy with USING and WITH CHECK.`);
    }
  }

  const forbiddenDeleteGrant = /\bgrant\s+delete[\s\S]*?\s+on\s+(?:table\s+)?public\.(programs|stages|subscription_plans|resources|instructors|groups|sessions|participants|enrollments|group_memberships)\s+to\s+authenticated\s*;/;

  if (forbiddenDeleteGrant.test(sql)) {
    failures.push("Core domain write contract: Phase 3 must not grant hard DELETE to authenticated users.");
  }
}

function checkPublicTenantIntakeContracts(sql) {
  const requiredPhase4Tables = ["tenant_public_profiles", "program_public_settings", "intake_form_configs", "intake_submissions", "intake_submission_events"];

  for (const table of requiredPhase4Tables) {
    if (!new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\b`).test(sql)) {
      failures.push(`Phase 4 public tenant contract is missing public.${table}.`);
    }
  }

  const publicReadableTables = ["tenant_public_profiles", "program_public_settings", "intake_form_configs"];

  for (const table of publicReadableTables) {
    const escapedTable = escapeRegExp(table);
    const anonSelectGrantPattern = new RegExp(`grant\\s+select\\s+on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+anon\\s*;`);
    const publicSelectPolicyPattern = new RegExp(`create\\s+policy\\s+["']?[\\s\\S]*?on\\s+public\\.${escapedTable}[\\s\\S]*?for\\s+select[\\s\\S]*?to\\s+authenticated,\\s*anon[\\s\\S]*?using[\\s\\S]*?;`);

    if (!anonSelectGrantPattern.test(sql)) {
      failures.push(`Phase 4 public tenant contract: public.${table} is missing an anon SELECT grant.`);
    }

    if (!publicSelectPolicyPattern.test(sql)) {
      failures.push(`Phase 4 public tenant contract: public.${table} is missing a public SELECT policy with USING.`);
    }
  }

  for (const table of ["intake_submissions", "intake_submission_events"]) {
    const escapedTable = escapeRegExp(table);
    const anonInsertGrantPattern = new RegExp(`grant\\s+insert\\s+on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+anon\\s*;`);
    const publicInsertPolicyPattern = new RegExp(`create\\s+policy\\s+["']?[\\s\\S]*?on\\s+public\\.${escapedTable}[\\s\\S]*?for\\s+insert[\\s\\S]*?to\\s+authenticated,\\s*anon[\\s\\S]*?with\\s+check[\\s\\S]*?;`);
    const anonSelectGrantPattern = new RegExp(`grant\\s+select\\s+on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+anon\\s*;`);

    if (!anonInsertGrantPattern.test(sql)) {
      failures.push(`Phase 4 public tenant contract: public.${table} is missing an anon INSERT grant.`);
    }

    if (!publicInsertPolicyPattern.test(sql)) {
      failures.push(`Phase 4 public tenant contract: public.${table} is missing a public INSERT policy with WITH CHECK.`);
    }

    if (anonSelectGrantPattern.test(sql)) {
      failures.push(`Phase 4 public tenant contract: public.${table} must not grant SELECT to anon.`);
    }
  }

  const intakeSubmissionsBlock = extractCreateTableBlock(sql, "intake_submissions");

  if (intakeSubmissionsBlock && !/\bintake_type\b/.test(intakeSubmissionsBlock)) {
    failures.push("Phase 4 public tenant contract: public.intake_submissions must store intake_type.");
  }

  if (intakeSubmissionsBlock && !/\bpreferred_days\b/.test(intakeSubmissionsBlock)) {
    failures.push("Phase 4 public tenant contract: public.intake_submissions must store preferred_days.");
  }

  if (intakeSubmissionsBlock && !/\bpreferred_time_windows\b/.test(intakeSubmissionsBlock)) {
    failures.push("Phase 4 public tenant contract: public.intake_submissions must store preferred_time_windows.");
  }

  if (intakeSubmissionsBlock && !/\bstatus\b/.test(intakeSubmissionsBlock)) {
    failures.push("Phase 4 public tenant contract: public.intake_submissions must store lifecycle status.");
  }
}

function checkPlacementWorkflowContracts(sql) {
  const requiredPhase5Tables = ["waitlist_entries", "placement_suggestions", "slot_offers", "slot_offer_events", "slot_offer_responses"];

  for (const table of requiredPhase5Tables) {
    if (!new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\b`).test(sql)) {
      failures.push(`Phase 5 placement contract is missing public.${table}.`);
    }
  }

  for (const table of ["waitlist_entries", "placement_suggestions", "slot_offers", "slot_offer_responses"]) {
    const escapedTable = escapeRegExp(table);
    const anonSelectGrantPattern = new RegExp(`grant\\s+select\\s+on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+anon\\s*;`);

    if (anonSelectGrantPattern.test(sql)) {
      failures.push(`Phase 5 placement contract: public.${table} must not grant SELECT to anon.`);
    }
  }

  for (const table of ["waitlist_entries", "placement_suggestions", "slot_offers", "slot_offer_events"]) {
    const escapedTable = escapeRegExp(table);
    const insertGrantPattern = new RegExp(`grant\\s+(?:select,\\s*)?insert[\\s\\S]*?on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);
    const updateGrantPattern = new RegExp(`grant\\s+[\\s\\S]*?update[\\s\\S]*?on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);

    if (!insertGrantPattern.test(sql)) {
      failures.push(`Phase 5 placement contract: public.${table} is missing an authenticated INSERT grant.`);
    }

    if (!updateGrantPattern.test(sql)) {
      failures.push(`Phase 5 placement contract: public.${table} is missing an authenticated UPDATE grant.`);
    }
  }

  const slotOffersBlock = extractCreateTableBlock(sql, "slot_offers");
  const slotOfferResponsesBlock = extractCreateTableBlock(sql, "slot_offer_responses");

  if (slotOffersBlock && !/\boffer_token\b/.test(slotOffersBlock)) {
    failures.push("Phase 5 placement contract: public.slot_offers must store offer_token.");
  }

  if (slotOffersBlock && !/\bplacement_suggestion_id\b/.test(slotOffersBlock)) {
    failures.push("Phase 5 placement contract: public.slot_offers must link to placement_suggestion_id.");
  }

  if (slotOfferResponsesBlock && (!/\boffer_token\b/.test(slotOfferResponsesBlock) || !/\bresponse\b/.test(slotOfferResponsesBlock))) {
    failures.push("Phase 5 placement contract: public.slot_offer_responses must store offer_token and response.");
  }

  if (!/grant\s+insert\s*\([^)]*offer_token[^)]*response[^)]*parent_note[^)]*\)\s+on\s+(?:table\s+)?public\.slot_offer_responses\s+to\s+anon,\s*authenticated\s*;/.test(sql)) {
    failures.push("Phase 5 placement contract: public.slot_offer_responses must grant only column-limited anon/authenticated INSERT.");
  }

  if (!/create\s+or\s+replace\s+function\s+app_private\.process_slot_offer_response\b/.test(sql)) {
    failures.push("Phase 5 placement contract: slot offer responses must be processed by app_private.process_slot_offer_response.");
  }
}

function checkParentPortalContracts(sql) {
  const requiredPhase6Tables = ["participant_guardians", "parent_notifications", "lesson_catch_up_requests", "parent_documents"];

  for (const table of requiredPhase6Tables) {
    if (!new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\b`).test(sql)) {
      failures.push(`Phase 6 parent portal contract is missing public.${table}.`);
    }
  }

  for (const table of requiredPhase6Tables) {
    const escapedTable = escapeRegExp(table);
    const anonGrantPattern = new RegExp(`grant\\s+[\\s\\S]*?\\s+on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+anon\\s*;`);

    if (anonGrantPattern.test(sql)) {
      failures.push(`Phase 6 parent portal contract: public.${table} must not grant access to anon.`);
    }
  }

  for (const functionName of ["current_user_can_access_participant", "current_user_can_access_enrollment", "current_user_can_request_catch_up"]) {
    if (!new RegExp(`create\\s+or\\s+replace\\s+function\\s+app_private\\.${functionName}\\b`).test(sql)) {
      failures.push(`Phase 6 parent portal contract is missing app_private.${functionName}.`);
    }
  }

  for (const table of ["participants", "enrollments", "group_memberships", "progress", "certificates"]) {
    const escapedTable = escapeRegExp(table);
    const guardianSelectPolicyPattern = new RegExp(`create\\s+policy\\s+["']?participant\\s+guardians[\\s\\S]*?on\\s+public\\.${escapedTable}[\\s\\S]*?for\\s+select[\\s\\S]*?to\\s+authenticated[\\s\\S]*?using[\\s\\S]*?;`);

    if (!guardianSelectPolicyPattern.test(sql)) {
      failures.push(`Phase 6 parent portal contract: public.${table} is missing a participant guardian SELECT policy.`);
    }
  }

  if (!/create\s+policy\s+["']?parents\s+can\s+update\s+notification\s+read\s+state[\s\S]*?on\s+public\.parent_notifications[\s\S]*?for\s+update[\s\S]*?to\s+authenticated[\s\S]*?with\s+check[\s\S]*?;/.test(sql)) {
    failures.push("Phase 6 parent portal contract: parent_notifications must support guarded read-status updates.");
  }

  if (!/create\s+policy\s+["']?parents\s+can\s+insert\s+catch-up\s+requests[\s\S]*?on\s+public\.lesson_catch_up_requests[\s\S]*?for\s+insert[\s\S]*?to\s+authenticated[\s\S]*?with\s+check[\s\S]*?current_user_can_request_catch_up[\s\S]*?;/.test(sql)) {
    failures.push("Phase 6 parent portal contract: lesson_catch_up_requests must use current_user_can_request_catch_up in its INSERT policy.");
  }
}

function checkInstructorPortalContracts(sql) {
  const requiredPhase7Tables = ["session_attendance", "instructor_student_notes"];

  for (const table of requiredPhase7Tables) {
    if (!new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\b`).test(sql)) {
      failures.push(`Phase 7 instructor portal contract is missing public.${table}.`);
    }

    const escapedTable = escapeRegExp(table);
    const anonGrantPattern = new RegExp(`grant\\s+[\\s\\S]*?\\s+on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+anon\\s*;`);
    const insertGrantPattern = new RegExp(`grant\\s+(?:select,\\s*)?insert[\\s\\S]*?on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);
    const updateGrantPattern = new RegExp(`grant\\s+[\\s\\S]*?update[\\s\\S]*?on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);
    const insertPolicyPattern = new RegExp(`create\\s+policy\\s+["']?[\\s\\S]*?on\\s+public\\.${escapedTable}[\\s\\S]*?for\\s+insert[\\s\\S]*?to\\s+authenticated[\\s\\S]*?with\\s+check[\\s\\S]*?current_user_can_manage_instruction[\\s\\S]*?;`);
    const updatePolicyPattern = new RegExp(`create\\s+policy\\s+["']?[\\s\\S]*?on\\s+public\\.${escapedTable}[\\s\\S]*?for\\s+update[\\s\\S]*?to\\s+authenticated[\\s\\S]*?using[\\s\\S]*?current_user_can_manage_instruction[\\s\\S]*?with\\s+check[\\s\\S]*?current_user_can_manage_instruction[\\s\\S]*?;`);

    if (anonGrantPattern.test(sql)) {
      failures.push(`Phase 7 instructor portal contract: public.${table} must not grant access to anon.`);
    }

    if (!insertGrantPattern.test(sql)) {
      failures.push(`Phase 7 instructor portal contract: public.${table} is missing an authenticated INSERT grant.`);
    }

    if (!updateGrantPattern.test(sql)) {
      failures.push(`Phase 7 instructor portal contract: public.${table} is missing an authenticated UPDATE grant.`);
    }

    if (!insertPolicyPattern.test(sql)) {
      failures.push(`Phase 7 instructor portal contract: public.${table} is missing an instructor INSERT policy.`);
    }

    if (!updatePolicyPattern.test(sql)) {
      failures.push(`Phase 7 instructor portal contract: public.${table} is missing an instructor UPDATE policy.`);
    }
  }

  for (const functionName of ["current_user_can_manage_instruction"]) {
    if (!new RegExp(`create\\s+or\\s+replace\\s+function\\s+app_private\\.${functionName}\\b`).test(sql)) {
      failures.push(`Phase 7 instructor portal contract is missing app_private.${functionName}.`);
    }
  }

  const progressInsertGrantPattern = /grant\s+insert\s*\([^)]*tenant_id[^)]*enrollment_id[^)]*stage_id[^)]*status[^)]*score[^)]*note[^)]*assessed_at[^)]*\)\s+on\s+(?:table\s+)?public\.progress\s+to\s+authenticated\s*;/;
  const progressUpdateGrantPattern = /grant\s+update\s*\([^)]*stage_id[^)]*status[^)]*score[^)]*note[^)]*assessed_at[^)]*\)\s+on\s+(?:table\s+)?public\.progress\s+to\s+authenticated\s*;/;
  const progressInsertPolicyPattern = /create\s+policy\s+["']?instructors\s+can\s+insert\s+progress[\s\S]*?on\s+public\.progress[\s\S]*?for\s+insert[\s\S]*?to\s+authenticated[\s\S]*?with\s+check[\s\S]*?current_user_can_manage_instruction[\s\S]*?;/;
  const progressUpdatePolicyPattern = /create\s+policy\s+["']?instructors\s+can\s+update\s+progress[\s\S]*?on\s+public\.progress[\s\S]*?for\s+update[\s\S]*?to\s+authenticated[\s\S]*?using[\s\S]*?current_user_can_manage_instruction[\s\S]*?with\s+check[\s\S]*?current_user_can_manage_instruction[\s\S]*?;/;

  if (!progressInsertGrantPattern.test(sql)) {
    failures.push("Phase 7 instructor portal contract: public.progress is missing a column-limited authenticated INSERT grant.");
  }

  if (!progressUpdateGrantPattern.test(sql)) {
    failures.push("Phase 7 instructor portal contract: public.progress is missing a column-limited authenticated UPDATE grant.");
  }

  if (!progressInsertPolicyPattern.test(sql)) {
    failures.push("Phase 7 instructor portal contract: public.progress is missing an instructor INSERT policy.");
  }

  if (!progressUpdatePolicyPattern.test(sql)) {
    failures.push("Phase 7 instructor portal contract: public.progress is missing an instructor UPDATE policy.");
  }
}

function checkProgressBadgesAchievementContracts(sql) {
  const requiredPhase8Tables = ["stage_modules", "stage_module_progress", "badge_awards", "achievement_cards", "stage_transition_proposals"];

  for (const table of requiredPhase8Tables) {
    if (!new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\b`).test(sql)) {
      failures.push(`Phase 8 progress/badges contract is missing public.${table}.`);
    }

    const escapedTable = escapeRegExp(table);
    const anonGrantPattern = new RegExp(`grant\\s+[\\s\\S]*?\\s+on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+anon\\s*;`);
    const authenticatedGrantPattern = new RegExp(`grant\\s+[\\s\\S]*?\\s+on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);
    const insertGrantPattern = new RegExp(`grant\\s+(?:select,\\s*)?insert[\\s\\S]*?on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);
    const updateGrantPattern = new RegExp(`grant\\s+[\\s\\S]*?update[\\s\\S]*?on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);

    if (anonGrantPattern.test(sql)) {
      failures.push(`Phase 8 progress/badges contract: public.${table} must not grant access to anon.`);
    }

    if (!authenticatedGrantPattern.test(sql)) {
      failures.push(`Phase 8 progress/badges contract: public.${table} is missing an authenticated grant.`);
    }

    if (!insertGrantPattern.test(sql)) {
      failures.push(`Phase 8 progress/badges contract: public.${table} is missing an authenticated INSERT grant.`);
    }

    if (!updateGrantPattern.test(sql)) {
      failures.push(`Phase 8 progress/badges contract: public.${table} is missing an authenticated UPDATE grant.`);
    }
  }

  const achievementCardsBlock = extractCreateTableBlock(sql, "achievement_cards");
  const stageTransitionProposalsBlock = extractCreateTableBlock(sql, "stage_transition_proposals");
  const stageModuleProgressBlock = extractCreateTableBlock(sql, "stage_module_progress");

  if (stageModuleProgressBlock && !/\bstage_module_id\b/.test(stageModuleProgressBlock)) {
    failures.push("Phase 8 progress/badges contract: public.stage_module_progress must store stage_module_id.");
  }

  if (achievementCardsBlock && !/\bbadge_award_id\b/.test(achievementCardsBlock)) {
    failures.push("Phase 8 progress/badges contract: public.achievement_cards must link to badge_award_id.");
  }

  if (achievementCardsBlock && !/\bstage_module_progress_id\b/.test(achievementCardsBlock)) {
    failures.push("Phase 8 progress/badges contract: public.achievement_cards must link to stage_module_progress_id.");
  }

  if (stageTransitionProposalsBlock && (!/\bfrom_stage_id\b/.test(stageTransitionProposalsBlock) || !/\bto_stage_id\b/.test(stageTransitionProposalsBlock))) {
    failures.push("Phase 8 progress/badges contract: public.stage_transition_proposals must store from_stage_id and to_stage_id.");
  }

  if (stageTransitionProposalsBlock && /\bsubscription_plan_id\b|\bbilling\b|\bpayment\b/.test(stageTransitionProposalsBlock)) {
    failures.push("Phase 8 progress/badges contract: stage transition proposals must not mutate billing/subscription.");
  }

  for (const functionName of ["notify_guardians_for_progress", "publish_stage_module_progress", "publish_badge_award"]) {
    if (!new RegExp(`create\\s+or\\s+replace\\s+function\\s+app_private\\.${functionName}\\b`).test(sql)) {
      failures.push(`Phase 8 progress/badges contract is missing app_private.${functionName}.`);
    }
  }

  for (const triggerName of ["progress_notify_guardians", "stage_module_progress_publish", "badge_awards_publish"]) {
    if (!new RegExp(`create\\s+trigger\\s+${triggerName}\\b`).test(sql)) {
      failures.push(`Phase 8 progress/badges contract is missing trigger ${triggerName}.`);
    }
  }
}

function checkAfzwemDiplomaVaultContracts(sql) {
  const requiredPhase9Tables = ["milestone_readiness_criteria", "milestone_events", "milestone_event_participants", "milestone_results"];

  for (const table of requiredPhase9Tables) {
    if (!new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\b`).test(sql)) {
      failures.push(`Phase 9 afzwem/diploma contract is missing public.${table}.`);
    }

    const escapedTable = escapeRegExp(table);
    const anonGrantPattern = new RegExp(`grant\\s+[\\s\\S]*?\\s+on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+anon\\s*;`);
    const authenticatedGrantPattern = new RegExp(`grant\\s+[\\s\\S]*?\\s+on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);
    const insertGrantPattern = new RegExp(`grant\\s+(?:select,\\s*)?insert[\\s\\S]*?on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);
    const updateGrantPattern = new RegExp(`grant\\s+[\\s\\S]*?update[\\s\\S]*?on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);

    if (anonGrantPattern.test(sql)) {
      failures.push(`Phase 9 afzwem/diploma contract: public.${table} must not grant access to anon.`);
    }

    if (!authenticatedGrantPattern.test(sql)) {
      failures.push(`Phase 9 afzwem/diploma contract: public.${table} is missing an authenticated grant.`);
    }

    if (!insertGrantPattern.test(sql)) {
      failures.push(`Phase 9 afzwem/diploma contract: public.${table} is missing an authenticated INSERT grant.`);
    }

    if (!updateGrantPattern.test(sql)) {
      failures.push(`Phase 9 afzwem/diploma contract: public.${table} is missing an authenticated UPDATE grant.`);
    }
  }

  const milestoneEventsBlock = extractCreateTableBlock(sql, "milestone_events");
  const milestoneParticipantsBlock = extractCreateTableBlock(sql, "milestone_event_participants");
  const milestoneResultsBlock = extractCreateTableBlock(sql, "milestone_results");

  if (milestoneEventsBlock && !/\bevent_type\b/.test(milestoneEventsBlock)) {
    failures.push("Phase 9 afzwem/diploma contract: public.milestone_events must store event_type.");
  }

  if (milestoneParticipantsBlock && !/\breadiness_criteria_id\b/.test(milestoneParticipantsBlock)) {
    failures.push("Phase 9 afzwem/diploma contract: public.milestone_event_participants must link readiness criteria.");
  }

  if (milestoneResultsBlock && (!/\bresult_status\b/.test(milestoneResultsBlock) || !/\bcertificate_id\b/.test(milestoneResultsBlock))) {
    failures.push("Phase 9 afzwem/diploma contract: public.milestone_results must store result_status and certificate_id.");
  }

  for (const columnName of ["source_event_id", "source_result_id", "file_path", "download_status", "share_token", "share_enabled", "vault_status"]) {
    if (!new RegExp(`alter\\s+table\\s+public\\.certificates[\\s\\S]*?add\\s+column\\s+${columnName}\\b`).test(sql)) {
      failures.push(`Phase 9 afzwem/diploma contract: public.certificates must add ${columnName}.`);
    }
  }

  if (!/grant\s+insert\s*\([^)]*source_event_id[^)]*source_result_id[^)]*file_path[^)]*download_status[^)]*share_token[^)]*vault_status[^)]*\)\s+on\s+(?:table\s+)?public\.certificates\s+to\s+authenticated\s*;/.test(sql)) {
    failures.push("Phase 9 afzwem/diploma contract: public.certificates is missing a column-limited authenticated INSERT grant for vault fields.");
  }

  if (!/grant\s+update\s*\([^)]*file_path[^)]*download_status[^)]*share_enabled[^)]*share_expires_at[^)]*vault_status[^)]*\)\s+on\s+(?:table\s+)?public\.certificates\s+to\s+authenticated\s*;/.test(sql)) {
    failures.push("Phase 9 afzwem/diploma contract: public.certificates is missing a column-limited authenticated UPDATE grant for vault fields.");
  }

  for (const functionName of ["notify_guardians_for_milestone_participant", "publish_milestone_result"]) {
    if (!new RegExp(`create\\s+or\\s+replace\\s+function\\s+app_private\\.${functionName}\\b`).test(sql)) {
      failures.push(`Phase 9 afzwem/diploma contract is missing app_private.${functionName}.`);
    }
  }

  for (const triggerName of ["milestone_event_participants_notify_guardians", "milestone_results_publish"]) {
    if (!new RegExp(`create\\s+trigger\\s+${triggerName}\\b`).test(sql)) {
      failures.push(`Phase 9 afzwem/diploma contract is missing trigger ${triggerName}.`);
    }
  }
}

function checkManualPaymentsContracts(sql) {
  const requiredPhase10Tables = ["invoices", "payment_records", "payment_provider_configs", "payment_events"];

  for (const table of requiredPhase10Tables) {
    if (!new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\b`).test(sql)) {
      failures.push(`Phase 10 payments contract is missing public.${table}.`);
    }

    const escapedTable = escapeRegExp(table);
    const anonGrantPattern = new RegExp(`grant\\s+[^;]*\\bon\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+anon\\s*;`);
    const authenticatedGrantPattern = new RegExp(`grant\\s+[^;]*\\bon\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);

    if (anonGrantPattern.test(sql)) {
      failures.push(`Phase 10 payments contract: public.${table} must not grant access to anon.`);
    }

    if (!authenticatedGrantPattern.test(sql)) {
      failures.push(`Phase 10 payments contract: public.${table} is missing an authenticated grant.`);
    }
  }

  for (const table of ["invoices", "payment_records", "payment_provider_configs"]) {
    const escapedTable = escapeRegExp(table);
    const insertGrantPattern = new RegExp(`grant\\s+[^;]*\\binsert\\b[^;]*\\bon\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);
    const updateGrantPattern = new RegExp(`grant\\s+[^;]*\\bupdate\\b[^;]*\\bon\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);
    const updatePolicyPattern = new RegExp(`create\\s+policy\\s+["']?[\\s\\S]*?on\\s+public\\.${escapedTable}[\\s\\S]*?for\\s+update[\\s\\S]*?to\\s+authenticated[\\s\\S]*?using[\\s\\S]*?with\\s+check[\\s\\S]*?;`);

    if (!insertGrantPattern.test(sql)) {
      failures.push(`Phase 10 payments contract: public.${table} is missing an authenticated INSERT grant.`);
    }

    if (!updateGrantPattern.test(sql)) {
      failures.push(`Phase 10 payments contract: public.${table} is missing an authenticated UPDATE grant.`);
    }

    if (!updatePolicyPattern.test(sql)) {
      failures.push(`Phase 10 payments contract: public.${table} is missing an UPDATE policy with USING and WITH CHECK.`);
    }
  }

  if (!/grant\s+[^;]*\binsert\b[^;]*\bon\s+(?:table\s+)?public\.payment_events\s+to\s+authenticated\s*;/.test(sql)) {
    failures.push("Phase 10 payments contract: public.payment_events is missing an authenticated INSERT grant.");
  }

  const invoicesBlock = extractCreateTableBlock(sql, "invoices");
  const paymentRecordsBlock = extractCreateTableBlock(sql, "payment_records");
  const providerConfigsBlock = extractCreateTableBlock(sql, "payment_provider_configs");
  const subscriptionPlansBlock = extractCreateTableBlock(sql, "subscription_plans");

  for (const columnName of ["enrollment_id", "participant_id", "subscription_plan_id", "amount_due_cents", "amount_paid_cents", "collection_method"]) {
    if (invoicesBlock && !new RegExp(`\\b${columnName}\\b`).test(invoicesBlock)) {
      failures.push(`Phase 10 payments contract: public.invoices must store ${columnName}.`);
    }
  }

  if (invoicesBlock && /\bstage_id\b|\bbadge_id\b|\bbadje\b/.test(invoicesBlock)) {
    failures.push("Phase 10 payments contract: public.invoices must not be tied to stage/badge progression.");
  }

  for (const columnName of ["invoice_id", "enrollment_id", "participant_id", "provider", "provider_payment_id", "provider_checkout_url", "payment_method", "amount_cents", "status"]) {
    if (paymentRecordsBlock && !new RegExp(`\\b${columnName}\\b`).test(paymentRecordsBlock)) {
      failures.push(`Phase 10 payments contract: public.payment_records must store ${columnName}.`);
    }
  }

  if (paymentRecordsBlock && /\bstage_id\b|\bbadge_id\b|\bbadje\b/.test(paymentRecordsBlock)) {
    failures.push("Phase 10 payments contract: public.payment_records must not be tied to stage/badge progression.");
  }

  for (const columnName of ["provider", "mode", "status", "api_key_secret_reference", "webhook_secret_reference"]) {
    if (providerConfigsBlock && !new RegExp(`\\b${columnName}\\b`).test(providerConfigsBlock)) {
      failures.push(`Phase 10 payments contract: public.payment_provider_configs must store ${columnName}.`);
    }
  }

  if (subscriptionPlansBlock && /\bstage_id\b|\bbadge_id\b|\bbadje\b/.test(subscriptionPlansBlock)) {
    failures.push("Phase 10 payments contract: public.subscription_plans must remain separate from stage/badge progression.");
  }

  if (!/create\s+policy\s+["']?participants\s+and\s+staff\s+can\s+view\s+invoices[\s\S]*?current_user_can_access_enrollment/.test(sql)) {
    failures.push("Phase 10 payments contract: invoices must use current_user_can_access_enrollment for parent/staff visibility.");
  }

  if (!/create\s+policy\s+["']?participants\s+and\s+staff\s+can\s+view\s+payment\s+records[\s\S]*?current_user_can_access_enrollment/.test(sql)) {
    failures.push("Phase 10 payments contract: payment_records must use current_user_can_access_enrollment for parent/staff visibility.");
  }

  for (const functionName of ["notify_guardians_for_invoice", "sync_invoice_payment_status"]) {
    if (!new RegExp(`create\\s+or\\s+replace\\s+function\\s+app_private\\.${functionName}\\b`).test(sql)) {
      failures.push(`Phase 10 payments contract is missing app_private.${functionName}.`);
    }
  }

  for (const triggerName of ["invoices_notify_guardians", "payment_records_sync_invoice_status"]) {
    if (!new RegExp(`create\\s+trigger\\s+${triggerName}\\b`).test(sql)) {
      failures.push(`Phase 10 payments contract is missing trigger ${triggerName}.`);
    }
  }

  if (!/'manual'[\s\S]*?'active'/.test(sql)) {
    failures.push("Phase 10 payments contract: manual provider config must be seeded active.");
  }

  if (!/'mollie'[\s\S]*?'disabled'/.test(sql)) {
    failures.push("Phase 10 payments contract: Mollie provider config must be prepared but disabled.");
  }
}

function checkMessagesTasksDocsReportsContracts(sql) {
  const requiredPhase12Tables = [
    "communication_provider_configs",
    "message_templates",
    "message_outbox",
    "operational_tasks",
    "tenant_document_records",
    "report_export_requests"
  ];

  for (const table of requiredPhase12Tables) {
    if (!new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${table}\\b`).test(sql)) {
      failures.push(`Phase 12 operations contract is missing public.${table}.`);
    }

    const escapedTable = escapeRegExp(table);
    const anonGrantPattern = new RegExp(`grant\\s+[^;]*\\bon\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+anon\\s*;`);
    const authenticatedGrantPattern = new RegExp(`grant\\s+[^;]*\\bon\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);
    const insertGrantPattern = new RegExp(`grant\\s+[^;]*\\binsert\\b[^;]*\\bon\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);
    const updateGrantPattern = new RegExp(`grant\\s+[^;]*\\bupdate\\b[^;]*\\bon\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`);

    if (anonGrantPattern.test(sql)) {
      failures.push(`Phase 12 operations contract: public.${table} must not grant access to anon.`);
    }

    if (!authenticatedGrantPattern.test(sql)) {
      failures.push(`Phase 12 operations contract: public.${table} is missing an authenticated grant.`);
    }

    if (!insertGrantPattern.test(sql)) {
      failures.push(`Phase 12 operations contract: public.${table} is missing an authenticated INSERT grant.`);
    }

    if (!updateGrantPattern.test(sql)) {
      failures.push(`Phase 12 operations contract: public.${table} is missing an authenticated UPDATE grant.`);
    }
  }

  const providerConfigsBlock = extractCreateTableBlock(sql, "communication_provider_configs");
  const templatesBlock = extractCreateTableBlock(sql, "message_templates");
  const outboxBlock = extractCreateTableBlock(sql, "message_outbox");
  const tasksBlock = extractCreateTableBlock(sql, "operational_tasks");
  const documentsBlock = extractCreateTableBlock(sql, "tenant_document_records");
  const exportsBlock = extractCreateTableBlock(sql, "report_export_requests");

  for (const columnName of ["provider", "mode", "status", "host", "port", "from_email", "username_secret_reference", "password_secret_reference", "api_key_secret_reference"]) {
    if (providerConfigsBlock && !new RegExp(`\\b${columnName}\\b`).test(providerConfigsBlock)) {
      failures.push(`Phase 12 operations contract: public.communication_provider_configs must store ${columnName}.`);
    }
  }

  if (providerConfigsBlock && /\b(api_key|password|username)\s+text\b/.test(providerConfigsBlock)) {
    failures.push("Phase 12 operations contract: communication provider secrets must be stored as secret references, not raw secret values.");
  }

  for (const columnName of ["code", "name", "channel", "audience", "subject_template", "body_template", "status"]) {
    if (templatesBlock && !new RegExp(`\\b${columnName}\\b`).test(templatesBlock)) {
      failures.push(`Phase 12 operations contract: public.message_templates must store ${columnName}.`);
    }
  }

  for (const columnName of ["template_id", "channel", "provider", "recipient_profile_id", "recipient_email", "participant_id", "enrollment_id", "status"]) {
    if (outboxBlock && !new RegExp(`\\b${columnName}\\b`).test(outboxBlock)) {
      failures.push(`Phase 12 operations contract: public.message_outbox must store ${columnName}.`);
    }
  }

  for (const columnName of ["title", "task_type", "status", "priority", "assigned_to_profile_id", "participant_id", "enrollment_id", "due_on"]) {
    if (tasksBlock && !new RegExp(`\\b${columnName}\\b`).test(tasksBlock)) {
      failures.push(`Phase 12 operations contract: public.operational_tasks must store ${columnName}.`);
    }
  }

  for (const columnName of ["title", "document_type", "visibility", "status", "storage_bucket", "file_path", "available_on"]) {
    if (documentsBlock && !new RegExp(`\\b${columnName}\\b`).test(documentsBlock)) {
      failures.push(`Phase 12 operations contract: public.tenant_document_records must store ${columnName}.`);
    }
  }

  for (const columnName of ["report_type", "export_format", "status", "filters", "metadata", "file_path"]) {
    if (exportsBlock && !new RegExp(`\\b${columnName}\\b`).test(exportsBlock)) {
      failures.push(`Phase 12 operations contract: public.report_export_requests must store ${columnName}.`);
    }
  }

  if (!/'smtp'[\s\S]*?'smtp\.sendgrid\.net'/.test(sql)) {
    failures.push("Phase 12 operations contract: SMTP via SendGrid must be seeded as the first email foundation.");
  }

  if (!/'sendgrid'[\s\S]*?'disabled'/.test(sql)) {
    failures.push("Phase 12 operations contract: SendGrid API provider must be prepared but disabled.");
  }
}

function checkPlatformSuperAdminContracts(sql) {
  const requiredTables = ["user_security_requirements", "tenant_super_admin_invitations"];

  for (const table of requiredTables) {
    const escapedTable = escapeRegExp(table);

    if (!new RegExp(`create\\s+table\\s+(?:if\\s+not\\s+exists\\s+)?public\\.${escapedTable}\\b`).test(sql)) {
      failures.push(`Platform super admin contract is missing public.${table}.`);
    }

    if (new RegExp(`grant\\s+[^;]*\\bon\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+anon\\s*;`).test(sql)) {
      failures.push(`Platform super admin contract: public.${table} must not grant access to anon.`);
    }

    if (!new RegExp(`grant\\s+select\\s+on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+authenticated\\s*;`).test(sql)) {
      failures.push(`Platform super admin contract: public.${table} is missing an authenticated SELECT grant.`);
    }

    if (!new RegExp(`grant\\s+all\\s+on\\s+(?:table\\s+)?public\\.${escapedTable}\\s+to\\s+service_role\\s*;`).test(sql)) {
      failures.push(`Platform super admin contract: public.${table} is missing a service_role grant.`);
    }
  }

  const requirementsBlock = extractCreateTableBlock(sql, "user_security_requirements");
  const invitationsBlock = extractCreateTableBlock(sql, "tenant_super_admin_invitations");

  for (const columnName of ["user_id", "must_change_password", "reason", "resolved_at"]) {
    if (requirementsBlock && !new RegExp(`\\b${columnName}\\b`).test(requirementsBlock)) {
      failures.push(`Platform super admin contract: public.user_security_requirements must store ${columnName}.`);
    }
  }

  for (const columnName of ["tenant_id", "user_id", "email", "status", "delivery_provider", "last_sent_at", "accepted_at"]) {
    if (invitationsBlock && !new RegExp(`\\b${columnName}\\b`).test(invitationsBlock)) {
      failures.push(`Platform super admin contract: public.tenant_super_admin_invitations must store ${columnName}.`);
    }
  }

  if (!/create\s+policy\s+["']?users\s+and\s+platform\s+staff\s+can\s+view\s+security\s+requirements[\s\S]*?on\s+public\.user_security_requirements[\s\S]*?for\s+select[\s\S]*?to\s+authenticated[\s\S]*?using[\s\S]*?;/.test(sql)) {
    failures.push("Platform super admin contract: user_security_requirements must have a scoped authenticated SELECT policy.");
  }

  if (!/create\s+policy\s+["']?platform\s+staff\s+can\s+view\s+tenant\s+super\s+admin\s+invitations[\s\S]*?on\s+public\.tenant_super_admin_invitations[\s\S]*?for\s+select[\s\S]*?to\s+authenticated[\s\S]*?using[\s\S]*?;/.test(sql)) {
    failures.push("Platform super admin contract: tenant_super_admin_invitations must have a platform-scoped SELECT policy.");
  }
}

function normalizeSql(sql) {
  return sql
    .replace(/--.*$/gm, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

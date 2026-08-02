import "server-only";

import { createAdminClient } from "@/lib/supabase/admin";
import { getTenantCoreData } from "./core";

export async function getGroupPlanningData() {
  const core = await getTenantCoreData();
  const admin = createAdminClient();
  const [
    templatesResult,
    openingHoursResult,
    qualificationsResult,
    policyResult,
    locationProfilesResult,
    scheduleRulesResult
  ] = await Promise.all([
    admin
      .from("lesson_time_templates")
      .select("id, name, weekday, local_start_time, local_end_time, recurrence_interval_weeks, status")
      .eq("tenant_id", core.tenant.id)
      .eq("status", "active")
      .order("weekday")
      .order("local_start_time"),
    admin
      .from("resource_opening_hours")
      .select("id, resource_id, weekday, opens_at, closes_at, effective_from, effective_until, status")
      .eq("tenant_id", core.tenant.id)
      .eq("status", "active")
      .order("weekday")
      .order("opens_at"),
    admin
      .from("instructor_qualifications")
      .select("id, instructor_user_id, program_id, stage_id, resource_id, qualification_key, name, status, valid_from, valid_until")
      .eq("tenant_id", core.tenant.id)
      .eq("status", "active")
      .order("name"),
    admin
      .from("tenant_planning_policies")
      .select("qualification_enforcement, opening_hours_enforcement, default_capacity_borrowing, maximum_schedule_horizon_days")
      .eq("tenant_id", core.tenant.id)
      .maybeSingle(),
    admin
      .from("resource_location_profiles")
      .select("resource_id, address_line_1, address_line_2, postal_code, city, country_code, timezone")
      .eq("tenant_id", core.tenant.id),
    admin
      .from("group_schedule_rules")
      .select("id, group_id, resource_id, timezone, weekday, local_start_time, local_end_time, starts_on, ends_on, revision, status")
      .eq("tenant_id", core.tenant.id)
      .order("created_at", { ascending: false })
  ]);
  for (const [label, error] of [
    ["lesson time templates", templatesResult.error],
    ["resource opening hours", openingHoursResult.error],
    ["instructor qualifications", qualificationsResult.error],
    ["planning policy", policyResult.error],
    ["resource locations", locationProfilesResult.error],
    ["schedule rules", scheduleRulesResult.error]
  ] as const) {
    if (error) throw new Error(`Could not load ${label}: ${error.message}`);
  }
  return {
    ...core,
    lessonTimeTemplates: templatesResult.data ?? [],
    resourceOpeningHours: openingHoursResult.data ?? [],
    instructorQualifications: qualificationsResult.data ?? [],
    planningPolicy: policyResult.data ?? {
      qualification_enforcement: "blocking",
      opening_hours_enforcement: "advisory",
      default_capacity_borrowing: "none",
      maximum_schedule_horizon_days: 730
    },
    resourceLocationProfiles: locationProfilesResult.data ?? [],
    scheduleRules: scheduleRulesResult.data ?? []
  };
}

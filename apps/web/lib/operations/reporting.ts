export const reportTypes = ["occupancy", "waitlist", "progress", "attendance", "payments", "revenue"] as const;

export type ReportType = (typeof reportTypes)[number];

export type ReportFilters = {
  programId: string | null;
  stageId: string | null;
  groupId: string | null;
  instructorId: string | null;
  status: string | null;
  dateFrom: string | null;
  dateTo: string | null;
};

export type ReportPermissionGrantRow = {
  id: string;
  report_key: string;
  role: string;
  can_view: boolean;
  can_export: boolean;
};

export type ReportLookupRow = {
  id: string;
  name: string;
  status?: string;
  program_id?: string;
  stage_id?: string | null;
};

export type ReportingDashboardData = {
  filters: ReportFilters;
  lookups: {
    programs: ReportLookupRow[];
    stages: ReportLookupRow[];
    groups: ReportLookupRow[];
    instructors: ReportLookupRow[];
  };
  permissions: ReportPermissionGrantRow[];
  occupancy: ReportSection;
  waitlist: ReportSection;
  progress: ReportSection;
  attendance: ReportSection;
  payments: ReportSection;
  revenue: ReportSection;
  auditEvents: ReportAuditEventRow[];
};

export type ReportSection = {
  summary: Record<string, number | string>;
  rows: Array<Record<string, string | number | null>>;
};

export type ReportAuditEventRow = {
  id: string;
  source_table: string;
  source_record_id: string | null;
  action: string;
  risk_level: string;
  created_at: string;
};

type QueryClient = {
  from: (table: string) => any;
};

type GroupRow = {
  id: string;
  program_id: string;
  stage_id: string;
  resource_id: string | null;
  instructor_id: string | null;
  name: string;
  capacity: number;
  status: string;
};

type ResourceRow = {
  id: string;
  name: string;
  capacity: number;
  status: string;
};

type MembershipRow = {
  id: string;
  enrollment_id: string;
  group_id: string;
  status: string;
  ends_on: string | null;
};

type EnrollmentRow = {
  id: string;
  participant_id: string;
  program_id: string;
  current_stage_id: string | null;
  status: string;
};

type SessionRow = {
  id: string;
  group_id: string;
  instructor_id: string | null;
  starts_at: string;
  status: string;
};

type AttendanceRow = {
  id: string;
  session_id: string;
  enrollment_id: string;
  participant_id: string;
  status: string;
  recorded_at: string;
};

type WaitlistRow = {
  id: string;
  program_id: string;
  recommended_stage_id: string | null;
  status: string;
  priority_date: string;
  requested_option: string | null;
  created_at: string;
};

type ProgressRow = {
  id: string;
  enrollment_id: string;
  stage_id: string | null;
  status: string;
  score: number | null;
  assessed_at: string;
};

type StageModuleProgressRow = {
  id: string;
  enrollment_id: string;
  participant_id: string;
  stage_id: string;
  status: string;
  score: number | null;
  assessed_at: string;
};

type InvoiceRow = {
  id: string;
  enrollment_id: string;
  participant_id: string;
  invoice_number: string;
  status: string;
  amount_due_cents: number;
  amount_paid_cents: number;
  refunded_amount_cents: number | null;
  currency: string;
  issued_on: string;
  due_on: string | null;
};

type PaymentRow = {
  id: string;
  invoice_id: string;
  enrollment_id: string;
  participant_id: string;
  status: string;
  amount_cents: number;
  currency: string;
  received_on: string | null;
  created_at: string;
};

type RefundRow = {
  id: string;
  invoice_id: string;
  enrollment_id: string;
  participant_id: string;
  status: string;
  amount_cents: number;
  currency: string;
  refunded_on: string | null;
  created_at: string;
};

const emptySection: ReportSection = { summary: {}, rows: [] };

export function normalizeReportType(value: string | null | undefined): ReportType {
  return reportTypes.includes(value as ReportType) ? (value as ReportType) : "occupancy";
}

export function normalizeReportFilters(input: Record<string, unknown> | URLSearchParams | undefined): ReportFilters {
  return {
    programId: readFilter(input, "program_id", "programId"),
    stageId: readFilter(input, "stage_id", "stageId"),
    groupId: readFilter(input, "group_id", "groupId"),
    instructorId: readFilter(input, "instructor_id", "instructorId"),
    status: readFilter(input, "status", "status_filter"),
    dateFrom: readDateFilter(input, "date_from", "dateFrom"),
    dateTo: readDateFilter(input, "date_to", "dateTo")
  };
}

export function reportFiltersToJson(filters: ReportFilters) {
  return {
    program_id: filters.programId,
    stage_id: filters.stageId,
    group_id: filters.groupId,
    instructor_id: filters.instructorId,
    status: filters.status,
    date_from: filters.dateFrom,
    date_to: filters.dateTo
  };
}

export function reportFilterColumns(filters: ReportFilters) {
  return {
    program_id: filters.programId,
    stage_id: filters.stageId,
    group_id: filters.groupId,
    instructor_id: filters.instructorId,
    status_filter: filters.status,
    date_from: filters.dateFrom,
    date_to: filters.dateTo
  };
}

export function canRoleExportReport(grants: ReportPermissionGrantRow[], roles: readonly string[], reportType: string) {
  if (roles.some((role) => ["tenant_owner", "tenant_admin"].includes(role))) {
    return true;
  }

  return grants.some((grant) => roles.includes(grant.role) && (grant.report_key === reportType || grant.report_key === "exports") && grant.can_export);
}

export async function getReportingDashboardData(supabase: QueryClient, tenantId: string, filters: ReportFilters): Promise<ReportingDashboardData> {
  const [
    programsResult,
    stagesResult,
    groupsResult,
    resourcesResult,
    instructorsResult,
    membershipsResult,
    enrollmentsResult,
    sessionsResult,
    attendanceResult,
    waitlistResult,
    progressResult,
    moduleProgressResult,
    invoicesResult,
    paymentsResult,
    refundsResult,
    permissionsResult,
    auditEventsResult
  ] = await Promise.all([
    supabase.from("programs").select("id, name, status").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase.from("stages").select("id, program_id, name, status").eq("tenant_id", tenantId).order("sort_order", { ascending: true }),
    supabase.from("groups").select("id, program_id, stage_id, resource_id, instructor_id, name, capacity, status").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase.from("resources").select("id, name, capacity, status").eq("tenant_id", tenantId).order("name", { ascending: true }),
    supabase.from("instructors").select("id, display_name, status").eq("tenant_id", tenantId).order("display_name", { ascending: true }),
    supabase.from("group_memberships").select("id, enrollment_id, group_id, status, ends_on").eq("tenant_id", tenantId).limit(2000),
    supabase.from("enrollments").select("id, participant_id, program_id, current_stage_id, status").eq("tenant_id", tenantId).limit(2000),
    supabase.from("sessions").select("id, group_id, instructor_id, starts_at, status").eq("tenant_id", tenantId).order("starts_at", { ascending: false }).limit(1000),
    supabase.from("session_attendance").select("id, session_id, enrollment_id, participant_id, status, recorded_at").eq("tenant_id", tenantId).order("recorded_at", { ascending: false }).limit(2000),
    supabase.from("waitlist_entries").select("id, program_id, recommended_stage_id, status, priority_date, requested_option, created_at").eq("tenant_id", tenantId).order("priority_date", { ascending: true }).limit(1000),
    supabase.from("progress").select("id, enrollment_id, stage_id, status, score, assessed_at").eq("tenant_id", tenantId).order("assessed_at", { ascending: false }).limit(1000),
    supabase.from("stage_module_progress").select("id, enrollment_id, participant_id, stage_id, status, score, assessed_at").eq("tenant_id", tenantId).order("assessed_at", { ascending: false }).limit(1000),
    supabase.from("invoices").select("id, enrollment_id, participant_id, invoice_number, status, amount_due_cents, amount_paid_cents, refunded_amount_cents, currency, issued_on, due_on").eq("tenant_id", tenantId).order("issued_on", { ascending: false }).limit(1000),
    supabase.from("payment_records").select("id, invoice_id, enrollment_id, participant_id, status, amount_cents, currency, received_on, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1000),
    supabase.from("payment_refunds").select("id, invoice_id, enrollment_id, participant_id, status, amount_cents, currency, refunded_on, created_at").eq("tenant_id", tenantId).order("created_at", { ascending: false }).limit(1000),
    supabase.from("report_permission_grants").select("id, report_key, role, can_view, can_export").eq("tenant_id", tenantId).order("report_key", { ascending: true }),
    supabase.from("audit_events").select("id, source_table, source_record_id, action, risk_level, created_at").eq("tenant_id", tenantId).in("source_table", ["report_export_requests", "report_permission_grants"]).order("created_at", { ascending: false }).limit(25)
  ]);

  throwResultError(programsResult.error);
  throwResultError(stagesResult.error);
  throwResultError(groupsResult.error);
  throwResultError(resourcesResult.error);
  throwResultError(instructorsResult.error);
  throwResultError(membershipsResult.error);
  throwResultError(enrollmentsResult.error);
  throwResultError(sessionsResult.error);
  throwResultError(attendanceResult.error);
  throwResultError(waitlistResult.error);
  throwResultError(progressResult.error);
  throwResultError(moduleProgressResult.error);
  throwResultError(invoicesResult.error);
  throwResultError(paymentsResult.error);
  throwResultError(refundsResult.error);
  throwResultError(permissionsResult.error);
  throwResultError(auditEventsResult.error);

  const programs = asRows<{ id: string; name: string; status: string }>(programsResult.data).map((program) => ({ id: program.id, name: program.name, status: program.status }));
  const stages = asRows<{ id: string; program_id: string; name: string; status: string }>(stagesResult.data).map((stage) => ({ id: stage.id, program_id: stage.program_id, name: stage.name, status: stage.status }));
  const groups = asRows<GroupRow>(groupsResult.data);
  const resources = asRows<ResourceRow>(resourcesResult.data);
  const instructors = asRows<{ id: string; display_name: string; status: string }>(instructorsResult.data);
  const memberships = asRows<MembershipRow>(membershipsResult.data);
  const enrollments = asRows<EnrollmentRow>(enrollmentsResult.data);
  const sessions = asRows<SessionRow>(sessionsResult.data);
  const attendance = asRows<AttendanceRow>(attendanceResult.data);
  const waitlist = asRows<WaitlistRow>(waitlistResult.data);
  const progress = asRows<ProgressRow>(progressResult.data);
  const moduleProgress = asRows<StageModuleProgressRow>(moduleProgressResult.data);
  const invoices = asRows<InvoiceRow>(invoicesResult.data);
  const paymentRecords = asRows<PaymentRow>(paymentsResult.data);
  const refunds = asRows<RefundRow>(refundsResult.data);

  return {
    filters,
    lookups: {
      programs,
      stages,
      groups: groups.map((group) => ({ id: group.id, name: group.name, status: group.status, program_id: group.program_id, stage_id: group.stage_id })),
      instructors: instructors.map((instructor) => ({ id: instructor.id, name: instructor.display_name, status: instructor.status }))
    },
    permissions: asRows<ReportPermissionGrantRow>(permissionsResult.data),
    occupancy: buildOccupancySection(groups, resources, memberships, filters),
    waitlist: buildWaitlistSection(waitlist, filters),
    progress: buildProgressSection(progress, moduleProgress, enrollments, filters),
    attendance: buildAttendanceSection(attendance, sessions, groups, filters),
    payments: buildPaymentsSection(invoices, enrollments, filters),
    revenue: buildRevenueSection(invoices, paymentRecords, refunds, enrollments, filters),
    auditEvents: asRows<ReportAuditEventRow>(auditEventsResult.data)
  };
}

export async function buildReportRows(supabase: QueryClient, tenantId: string, reportType: ReportType, filters: ReportFilters) {
  const dashboard = await getReportingDashboardData(supabase, tenantId, filters);
  return dashboard[reportType].rows;
}

function buildOccupancySection(groups: GroupRow[], resources: ResourceRow[], memberships: MembershipRow[], filters: ReportFilters): ReportSection {
  const resourcesById = new Map(resources.map((resource) => [resource.id, resource]));
  const today = new Date().toISOString().slice(0, 10);
  const filteredGroups = groups.filter((group) => matchesGroupFilters(group, filters, true));
  const rows = filteredGroups.map((group) => {
    const resource = group.resource_id ? resourcesById.get(group.resource_id) : null;
    const activeMemberships = memberships.filter((membership) => membership.group_id === group.id && ["planned", "active"].includes(membership.status) && (!membership.ends_on || membership.ends_on >= today)).length;
    const capacity = Math.min(group.capacity, resource?.capacity ?? group.capacity);
    const occupancyRate = capacity > 0 ? Math.round((activeMemberships / capacity) * 100) : 0;

    return {
      group_id: group.id,
      group: group.name,
      status: group.status,
      capacity,
      occupied: activeMemberships,
      available: Math.max(0, capacity - activeMemberships),
      occupancy_rate: occupancyRate
    };
  });

  return {
    summary: {
      groups: rows.length,
      capacity: sum(rows, "capacity"),
      occupied: sum(rows, "occupied"),
      available: sum(rows, "available"),
      occupancy_rate: percentage(sum(rows, "occupied"), sum(rows, "capacity"))
    },
    rows
  };
}

function buildWaitlistSection(waitlist: WaitlistRow[], filters: ReportFilters): ReportSection {
  const rows = waitlist
    .filter((entry) => matchesProgramStageStatusDate(entry.program_id, entry.recommended_stage_id, entry.status, entry.created_at, filters))
    .map((entry) => ({
      waitlist_entry_id: entry.id,
      program_id: entry.program_id,
      stage_id: entry.recommended_stage_id,
      status: entry.status,
      requested_option: entry.requested_option,
      priority_date: entry.priority_date,
      created_at: entry.created_at,
      age_days: daysSince(entry.priority_date)
    }));

  return {
    summary: {
      total: rows.length,
      queued: countBy(rows, "status", "queued"),
      matched: countBy(rows, "status", "matched"),
      offered: countBy(rows, "status", "offered"),
      placed: countBy(rows, "status", "placed")
    },
    rows
  };
}

function buildProgressSection(progress: ProgressRow[], moduleProgress: StageModuleProgressRow[], enrollments: EnrollmentRow[], filters: ReportFilters): ReportSection {
  const enrollmentsById = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]));
  const progressRows = progress.map((entry) => ({ ...entry, source: "stage" }));
  const moduleRows = moduleProgress.map((entry) => ({ ...entry, source: "module" }));
  const rows = [...progressRows, ...moduleRows]
    .filter((entry) => {
      const enrollment = enrollmentsById.get(entry.enrollment_id);
      return matchesEnrollmentFilters(enrollment, entry.stage_id, filters) && matchesStatusDate(entry.status, entry.assessed_at, filters);
    })
    .map((entry) => ({
      progress_id: entry.id,
      enrollment_id: entry.enrollment_id,
      participant_id: getProgressParticipantId(entry, enrollmentsById),
      stage_id: entry.stage_id,
      source: entry.source,
      status: entry.status,
      score: entry.score,
      assessed_at: entry.assessed_at
    }));

  const scoredRows = rows.filter((row) => typeof row.score === "number");

  return {
    summary: {
      updates: rows.length,
      passed: countBy(rows, "status", "passed"),
      completed: countBy(rows, "status", "completed"),
      needs_attention: countBy(rows, "status", "needs_attention"),
      average_score: scoredRows.length > 0 ? Math.round(sum(scoredRows, "score") / scoredRows.length) : 0
    },
    rows
  };
}

function getProgressParticipantId(entry: ProgressRow & { source: string } | StageModuleProgressRow & { source: string }, enrollmentsById: Map<string, EnrollmentRow>) {
  return "participant_id" in entry ? entry.participant_id : enrollmentsById.get(entry.enrollment_id)?.participant_id ?? null;
}

function buildAttendanceSection(attendance: AttendanceRow[], sessions: SessionRow[], groups: GroupRow[], filters: ReportFilters): ReportSection {
  const sessionsById = new Map(sessions.map((session) => [session.id, session]));
  const groupsById = new Map(groups.map((group) => [group.id, group]));
  const rows = attendance
    .filter((entry) => {
      const session = sessionsById.get(entry.session_id);
      const group = session ? groupsById.get(session.group_id) : null;
      return Boolean(session && group && matchesGroupFilters(group, filters, false) && matchesInstructorFilter(session.instructor_id ?? group.instructor_id, filters) && matchesStatusDate(entry.status, entry.recorded_at, filters));
    })
    .map((entry) => {
      const session = sessionsById.get(entry.session_id);
      const group = session ? groupsById.get(session.group_id) : null;

      return {
        attendance_id: entry.id,
        session_id: entry.session_id,
        group_id: session?.group_id ?? null,
        group: group?.name ?? "Onbekende groep",
        participant_id: entry.participant_id,
        status: entry.status,
        session_date: session?.starts_at ?? entry.recorded_at,
        recorded_at: entry.recorded_at
      };
    });

  return {
    summary: {
      records: rows.length,
      present: countBy(rows, "status", "present"),
      absent: countBy(rows, "status", "absent"),
      late: countBy(rows, "status", "late"),
      attendance_rate: percentage(countBy(rows, "status", "present") + countBy(rows, "status", "late"), rows.length)
    },
    rows
  };
}

function buildPaymentsSection(invoices: InvoiceRow[], enrollments: EnrollmentRow[], filters: ReportFilters): ReportSection {
  const enrollmentsById = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]));
  const rows = invoices
    .filter((invoice) => matchesEnrollmentFilters(enrollmentsById.get(invoice.enrollment_id), null, filters) && matchesStatusDate(invoice.status, invoice.issued_on, filters))
    .map((invoice) => ({
      invoice_id: invoice.id,
      invoice_number: invoice.invoice_number,
      enrollment_id: invoice.enrollment_id,
      participant_id: invoice.participant_id,
      status: invoice.status,
      amount_due_cents: invoice.amount_due_cents,
      amount_paid_cents: invoice.amount_paid_cents,
      open_amount_cents: Math.max(0, invoice.amount_due_cents - invoice.amount_paid_cents),
      currency: invoice.currency,
      issued_on: invoice.issued_on,
      due_on: invoice.due_on
    }));

  return {
    summary: {
      invoices: rows.length,
      open: countBy(rows, "status", "open") + countBy(rows, "status", "partially_paid"),
      overdue: countBy(rows, "status", "overdue"),
      paid: countBy(rows, "status", "paid"),
      open_amount_cents: sum(rows, "open_amount_cents")
    },
    rows
  };
}

function buildRevenueSection(invoices: InvoiceRow[], paymentRecords: PaymentRow[], refunds: RefundRow[], enrollments: EnrollmentRow[], filters: ReportFilters): ReportSection {
  const enrollmentsById = new Map(enrollments.map((enrollment) => [enrollment.id, enrollment]));
  const filteredInvoices = invoices.filter((invoice) => matchesEnrollmentFilters(enrollmentsById.get(invoice.enrollment_id), null, filters) && matchesDate(invoice.issued_on, filters));
  const invoiceIds = new Set(filteredInvoices.map((invoice) => invoice.id));
  const filteredPayments = paymentRecords.filter((payment) => invoiceIds.has(payment.invoice_id) && matchesStatusDate(payment.status, payment.received_on ?? payment.created_at, filters));
  const filteredRefunds = refunds.filter((refund) => invoiceIds.has(refund.invoice_id) && matchesStatusDate(refund.status, refund.refunded_on ?? refund.created_at, filters));
  const months = new Map<string, { period: string; invoiced_cents: number; collected_cents: number; refunded_cents: number; net_cents: number }>();

  for (const invoice of filteredInvoices) {
    const month = invoice.issued_on.slice(0, 7);
    const bucket = months.get(month) ?? { period: month, invoiced_cents: 0, collected_cents: 0, refunded_cents: 0, net_cents: 0 };
    bucket.invoiced_cents += invoice.amount_due_cents;
    bucket.net_cents += invoice.amount_due_cents;
    months.set(month, bucket);
  }

  for (const payment of filteredPayments) {
    const month = (payment.received_on ?? payment.created_at).slice(0, 7);
    const bucket = months.get(month) ?? { period: month, invoiced_cents: 0, collected_cents: 0, refunded_cents: 0, net_cents: 0 };
    bucket.collected_cents += payment.amount_cents;
    months.set(month, bucket);
  }

  for (const refund of filteredRefunds) {
    const month = (refund.refunded_on ?? refund.created_at).slice(0, 7);
    const bucket = months.get(month) ?? { period: month, invoiced_cents: 0, collected_cents: 0, refunded_cents: 0, net_cents: 0 };
    bucket.refunded_cents += refund.amount_cents;
    bucket.net_cents -= refund.amount_cents;
    months.set(month, bucket);
  }

  const rows = [...months.values()].sort((a, b) => b.period.localeCompare(a.period));

  return {
    summary: {
      periods: rows.length,
      invoiced_cents: sum(rows, "invoiced_cents"),
      collected_cents: sum(rows, "collected_cents"),
      refunded_cents: sum(rows, "refunded_cents"),
      net_cents: sum(rows, "net_cents")
    },
    rows
  };
}

function matchesGroupFilters(group: GroupRow, filters: ReportFilters, includeStatus: boolean) {
  return (
    matchesOptional(group.program_id, filters.programId) &&
    matchesOptional(group.stage_id, filters.stageId) &&
    matchesOptional(group.id, filters.groupId) &&
    matchesOptional(group.instructor_id, filters.instructorId) &&
    (!includeStatus || matchesOptional(group.status, filters.status))
  );
}

function matchesInstructorFilter(instructorId: string | null, filters: ReportFilters) {
  return matchesOptional(instructorId, filters.instructorId);
}

function matchesEnrollmentFilters(enrollment: EnrollmentRow | undefined, stageId: string | null, filters: ReportFilters) {
  if (!enrollment) {
    return false;
  }

  return matchesOptional(enrollment.program_id, filters.programId) && matchesOptional(stageId ?? enrollment.current_stage_id, filters.stageId);
}

function matchesProgramStageStatusDate(programId: string, stageId: string | null, status: string, dateValue: string, filters: ReportFilters) {
  return matchesOptional(programId, filters.programId) && matchesOptional(stageId, filters.stageId) && matchesStatusDate(status, dateValue, filters);
}

function matchesStatusDate(status: string, dateValue: string, filters: ReportFilters) {
  return matchesOptional(status, filters.status) && matchesDate(dateValue, filters);
}

function matchesDate(value: string, filters: ReportFilters) {
  const date = value.slice(0, 10);
  return (!filters.dateFrom || date >= filters.dateFrom) && (!filters.dateTo || date <= filters.dateTo);
}

function matchesOptional(value: string | null | undefined, expected: string | null) {
  return !expected || value === expected;
}

function readFilter(input: Record<string, unknown> | URLSearchParams | undefined, ...keys: string[]) {
  for (const key of keys) {
    const value = readRaw(input, key);

    if (value) {
      return value;
    }
  }

  return null;
}

function readDateFilter(input: Record<string, unknown> | URLSearchParams | undefined, ...keys: string[]) {
  const value = readFilter(input, ...keys);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function readRaw(input: Record<string, unknown> | URLSearchParams | undefined, key: string) {
  if (!input) {
    return null;
  }

  const value = input instanceof URLSearchParams ? input.get(key) : input[key];
  const raw = Array.isArray(value) ? value[0] : value;

  return typeof raw === "string" && raw.trim() ? raw.trim() : null;
}

function countBy(rows: Array<Record<string, unknown>>, key: string, value: string) {
  return rows.filter((row) => row[key] === value).length;
}

function sum(rows: Array<Record<string, unknown>>, key: string) {
  return rows.reduce((total, row) => total + (typeof row[key] === "number" ? row[key] : 0), 0);
}

function percentage(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}

function daysSince(value: string) {
  const start = new Date(value).getTime();
  return Number.isFinite(start) ? Math.max(0, Math.floor((Date.now() - start) / 86_400_000)) : 0;
}

function throwResultError(error: { message: string } | null) {
  if (error) {
    throw new Error(error.message);
  }
}

function asRows<Row>(rows: unknown): Row[] {
  return Array.isArray(rows) ? (rows as Row[]) : [];
}

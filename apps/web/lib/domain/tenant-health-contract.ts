export type TenantHealthComponentKey =
  | "configuration"
  | "mail"
  | "cron"
  | "admin_activity"
  | "data_quality"
  | "capacity"
  | "incidents"
  | "backup"
  | "scanner"
  | "adoption";

export type TenantHealthComponent = {
  key: TenantHealthComponentKey;
  label: string;
  score: number;
  weight: number;
  status: "healthy" | "watch" | "risk" | "unknown";
  evidence: string;
  actionLabel: string;
  actionHref: string;
};

export type TenantHealthScore = {
  score: number;
  status: "healthy" | "watch" | "risk" | "critical";
  components: TenantHealthComponent[];
  topActions: TenantHealthComponent[];
};

export function calculateTenantHealth(input: {
  tenantId: string;
  configuredChecks: { settings: boolean; verifiedDomain: boolean; admin: boolean; program: boolean; group: boolean; resource: boolean };
  mailHealthy: boolean;
  cron: "pass" | "degraded" | "fail" | "unknown";
  lastAdminLoginAt: string | null;
  openDataIssues: number;
  criticalDataIssues: number;
  lowUtilizationGroups: number;
  activeGroups: number;
  openIncidents: number;
  criticalIncidents: number;
  backup: "pass" | "degraded" | "fail" | "unknown";
  scanner: "pass" | "degraded" | "fail" | "unknown";
  adoptedModules: number;
  availableModules: number;
  now?: Date;
}): TenantHealthScore {
  const now = input.now ?? new Date();
  const configurationDone = Object.values(input.configuredChecks).filter(Boolean).length;
  const configurationTotal = Object.values(input.configuredChecks).length;
  const daysSinceLogin = input.lastAdminLoginAt
    ? Math.floor((now.getTime() - new Date(input.lastAdminLoginAt).getTime()) / 86_400_000)
    : null;
  const capacityRate = input.activeGroups ? input.lowUtilizationGroups / input.activeGroups : 0;
  const adoptionRate = input.availableModules ? input.adoptedModules / input.availableModules : 0;
  const components: TenantHealthComponent[] = [
    component("configuration", "Configuratie compleet", Math.round(configurationDone / configurationTotal * 100), 16, `${configurationDone} van ${configurationTotal} basiscontroles compleet.`, "Configuratie openen", `/platform/organisaties/${input.tenantId}`),
    component("mail", "Mailprovider", input.mailHealthy ? 100 : 20, 10, input.mailHealthy ? "Platformmailprovider is actief en compleet." : "Mailprovider of afzender vraagt controle.", "Mailinstellingen", "/platform/instellingen"),
    serviceComponent("cron", "Cronjobs", input.cron, 10, "Automatisering en lifecyclejobs", "/platform"),
    component("admin_activity", "Laatste beheerlogin", daysSinceLogin === null ? 30 : daysSinceLogin <= 14 ? 100 : daysSinceLogin <= 45 ? 65 : 25, 8, daysSinceLogin === null ? "Nog geen bevestigde beheerlogin gevonden." : `Laatste bevestigde beheerlogin ${daysSinceLogin} dag${daysSinceLogin === 1 ? "" : "en"} geleden.`, "Beheerders bekijken", `/platform/organisaties/${input.tenantId}`),
    component("data_quality", "Datakwaliteit", input.criticalDataIssues ? 10 : input.openDataIssues ? Math.max(40, 90 - input.openDataIssues * 8) : 100, 12, input.openDataIssues ? `${input.openDataIssues} open issue(s), waarvan ${input.criticalDataIssues} kritiek.` : "Geen open datakwaliteitsissues.", "Datakwaliteit openen", `/platform/organisaties/${input.tenantId}`),
    component("capacity", "Capaciteitsbenutting", input.activeGroups ? Math.round(Math.max(0, 100 - capacityRate * 65)) : 55, 8, input.activeGroups ? `${input.lowUtilizationGroups} van ${input.activeGroups} actieve groepen heeft lage benutting.` : "Nog geen actieve groepen om te beoordelen.", "Tenant openen", `/platform/organisaties/${input.tenantId}`),
    component("incidents", "Open incidenten", input.criticalIncidents ? 0 : input.openIncidents ? Math.max(30, 80 - input.openIncidents * 15) : 100, 12, input.openIncidents ? `${input.openIncidents} open incident(en), waarvan ${input.criticalIncidents} kritiek.` : "Geen open tenantincidenten.", "Incidenten bekijken", "/platform"),
    serviceComponent("backup", "Back-upbewijs", input.backup, 8, "Database- en Storage-herstelbewijs", "/platform"),
    serviceComponent("scanner", "Malwarescanner", input.scanner, 8, "Laatste ClamAV-controle", "/platform"),
    component("adoption", "Module-adoptie", Math.round(adoptionRate * 100), 8, `${input.adoptedModules} van ${input.availableModules} kernmodules actief gebruikt.`, "Adoptie bekijken", `/platform/organisaties/${input.tenantId}`)
  ];
  const weighted = components.reduce((total, item) => total + item.score * item.weight, 0);
  const totalWeight = components.reduce((total, item) => total + item.weight, 0);
  const score = Math.round(weighted / totalWeight);
  const status = input.criticalIncidents || input.cron === "fail"
    ? "critical"
    : score >= 85
      ? "healthy"
      : score >= 65
        ? "watch"
        : score >= 45
          ? "risk"
          : "critical";
  return {
    score,
    status,
    components,
    topActions: components.filter((item) => item.score < 85).sort((left, right) => left.score - right.score || right.weight - left.weight).slice(0, 3)
  };
}

function serviceComponent(key: "cron" | "backup" | "scanner", label: string, state: "pass" | "degraded" | "fail" | "unknown", weight: number, evidenceLabel: string, href: string) {
  const score = { pass: 100, degraded: 55, fail: 0, unknown: 35 }[state];
  const evidence = state === "pass"
    ? `${evidenceLabel}: recent bewijs is groen.`
    : state === "unknown"
      ? `${evidenceLabel}: nog geen recent bewijs ontvangen.`
      : `${evidenceLabel}: status ${state}; operationele controle nodig.`;
  return component(key, label, score, weight, evidence, "Bewijs bekijken", href);
}

function component(key: TenantHealthComponentKey, label: string, score: number, weight: number, evidence: string, actionLabel: string, actionHref: string): TenantHealthComponent {
  const bounded = Math.max(0, Math.min(100, Math.round(score)));
  return {
    key,
    label,
    score: bounded,
    weight,
    status: bounded >= 85 ? "healthy" : bounded >= 60 ? "watch" : bounded >= 0 ? "risk" : "unknown",
    evidence,
    actionLabel,
    actionHref
  };
}

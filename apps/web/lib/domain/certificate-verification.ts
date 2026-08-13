import "server-only";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { createAdminClient } from "@/lib/supabase/admin";

export type PublicCertificateVerification = {
  holderLabel: string;
  issuedOn: string;
  organizationName: string;
  programName: string;
  stageName: string;
  status: "valid" | "revoked";
  tenantId: string;
  title: string;
  verifiedAt: string;
};

export async function verifyPublicCertificate(code: string): Promise<PublicCertificateVerification | null> {
  if (!isUuid(code)) return null;
  const admin = createAdminClient();
  const certificate = await admin
    .from("certificate_records")
    .select("id, tenant_id, participant_id, program_id, stage_id, title, issued_on, status, verification_status")
    .eq("verification_public_id", code)
    .maybeSingle();
  if (certificate.error || !certificate.data) return null;
  const [tenant, participant, program, stage] = await Promise.all([
    admin.from("tenants").select("name").eq("id", certificate.data.tenant_id).maybeSingle(),
    admin.from("participants").select("display_name").eq("tenant_id", certificate.data.tenant_id).eq("id", certificate.data.participant_id).maybeSingle(),
    admin.from("programs").select("name").eq("tenant_id", certificate.data.tenant_id).eq("id", certificate.data.program_id).maybeSingle(),
    admin.from("program_stages").select("name").eq("tenant_id", certificate.data.tenant_id).eq("id", certificate.data.stage_id).maybeSingle()
  ]);
  if (tenant.error || participant.error || program.error || stage.error || !tenant.data || !participant.data || !program.data || !stage.data) return null;
  const status = certificate.data.status === "issued" && certificate.data.verification_status === "active" ? "valid" : "revoked";
  const requestHeaders = await headers();
  const fingerprintSource = `${requestHeaders.get("user-agent") ?? "unknown"}|${new Date().toISOString().slice(0, 10)}`;
  await admin.from("certificate_verification_events").insert({
    tenant_id: certificate.data.tenant_id,
    certificate_id: certificate.data.id,
    result: status,
    request_fingerprint: createHash("sha256").update(fingerprintSource).digest("hex").slice(0, 32),
    metadata_json: { channel: "public_verification_page" }
  });

  return {
    holderLabel: privacySafeName(participant.data.display_name),
    issuedOn: certificate.data.issued_on,
    organizationName: tenant.data.name,
    programName: program.data.name,
    stageName: stage.data.name,
    status,
    tenantId: certificate.data.tenant_id,
    title: certificate.data.title,
    verifiedAt: new Date().toISOString()
  };
}

export function isUuid(value: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

function privacySafeName(value: string) {
  const parts = value.trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return "Diplomahouder";
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts.at(-1)?.slice(0, 1).toUpperCase()}.`;
}

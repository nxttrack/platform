#!/usr/bin/env node

import { createRequire } from "node:module";
import { randomBytes, randomInt } from "node:crypto";

const requireFromWeb = createRequire(new URL("../../apps/web/package.json", import.meta.url));
const { createClient } = requireFromWeb("@supabase/supabase-js");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
const email = normalizeEmail(process.env.PLATFORM_OWNER_EMAIL || process.env.BOOTSTRAP_PLATFORM_OWNER_EMAIL || "admin@nxttrack.nl");
const configuredPassword = process.env.PLATFORM_OWNER_TEMP_PASSWORD || process.env.BOOTSTRAP_PLATFORM_OWNER_TEMP_PASSWORD;
const resetExistingPassword = process.env.BOOTSTRAP_PLATFORM_OWNER_RESET_PASSWORD === "true";
const expectExistingUser = process.env.BOOTSTRAP_PLATFORM_OWNER_EXPECT_EXISTING === "true";

if (!supabaseUrl || !secretKey) {
  console.error("[bootstrap-platform-owner] NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SECRET_KEY are required.");
  process.exit(1);
}

const admin = createClient(supabaseUrl, secretKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
});

const existingUserId = await findUserIdByEmail(email);

if (expectExistingUser && !existingUserId) {
  throwFatal("Expected an existing platform owner for this rehearsal; refusing to create a user.");
}

const temporaryPassword = configuredPassword || generateTemporaryPassword();
let userId = existingUserId;
let passwordWasChanged = false;

if (!userId) {
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password: temporaryPassword,
    email_confirm: true
  });

  if (error || !data.user) {
    throwFatal(`Could not create platform owner: ${error?.message ?? "missing user"}`);
  }

  userId = data.user.id;
  passwordWasChanged = true;
} else if (resetExistingPassword) {
  const { error } = await admin.auth.admin.updateUserById(userId, {
    password: temporaryPassword
  });

  if (error) {
    throwFatal(`Could not reset platform owner password: ${error.message}`);
  }

  passwordWasChanged = true;
}

await upsert("profiles", { id: userId, email });
await upsert(
  "user_security",
  passwordWasChanged
    ? {
        user_id: userId,
        email,
        must_change_password: true,
        last_invited_at: new Date().toISOString()
      }
    : {
        user_id: userId,
        email
      }
);
await upsert(
  "platform_memberships",
  {
    user_id: userId,
    role: "platform_owner",
    status: "active"
  },
  "user_id,role"
);

if (passwordWasChanged) {
  const delivered = await maybeSendBootstrapEmail({ email, temporaryPassword });

  if (!configuredPassword && !delivered) {
    throwFatal(
      "Generated credentials could not be delivered. The password was not printed; rerun an explicitly authorized reset with a scoped temporary-password secret."
    );
  }
}

await verifyPlatformOwner({ email, userId });
console.log(`[bootstrap-platform-owner] Platform owner ready: ${email}`);

async function findUserIdByEmail(targetEmail) {
  const [profileResult, securityResult] = await retrySchemaCacheLookup(() =>
    Promise.all([
      admin.from("profiles").select("id").eq("email", targetEmail).maybeSingle(),
      admin.from("user_security").select("user_id").eq("email", targetEmail).maybeSingle()
    ])
  );

  if (profileResult.error && profileResult.error.code !== "PGRST116") {
    throwFatal(`Could not look up profile: ${profileResult.error.message}`);
  }

  if (securityResult.error && securityResult.error.code !== "PGRST116") {
    throwFatal(`Could not look up user security: ${securityResult.error.message}`);
  }

  return profileResult.data?.id ?? securityResult.data?.user_id ?? null;
}

async function retrySchemaCacheLookup(lookup) {
  const attempts = 6;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const result = await lookup();
    const retryable = result.some(({ error }) => isSchemaCacheError(error));

    if (!retryable || attempt === attempts) {
      return result;
    }

    const delayMs = attempt * 1_000;
    console.warn(`[bootstrap-platform-owner] PostgREST schema cache is not ready; retrying in ${delayMs}ms (${attempt}/${attempts}).`);
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error("Unreachable schema-cache retry state.");
}

function isSchemaCacheError(error) {
  if (!error) {
    return false;
  }

  const message = (error.message ?? "").toLowerCase();
  return error.code === "PGRST204" || error.code === "PGRST205" || message.includes("schema cache");
}

async function upsert(table, row, onConflict = undefined) {
  const query = admin.from(table).upsert(row, onConflict ? { onConflict } : undefined);
  const { error } = await query;

  if (error) {
    throwFatal(`Could not upsert ${table}: ${error.message}`);
  }
}

async function verifyPlatformOwner({ email: targetEmail, userId: targetUserId }) {
  const [profileResult, securityResult, membershipResult] = await Promise.all([
    admin.from("profiles").select("id, email").eq("id", targetUserId).single(),
    admin.from("user_security").select("user_id, email").eq("user_id", targetUserId).single(),
    admin
      .from("platform_memberships")
      .select("user_id, role, status")
      .eq("user_id", targetUserId)
      .eq("role", "platform_owner")
      .single()
  ]);

  const failed =
    profileResult.error ||
    securityResult.error ||
    membershipResult.error ||
    profileResult.data?.email !== targetEmail ||
    securityResult.data?.email !== targetEmail ||
    membershipResult.data?.status !== "active";

  if (failed) {
    throwFatal("Platform owner postcondition verification failed.");
  }
}

async function maybeSendBootstrapEmail({ email: targetEmail, temporaryPassword }) {
  const apiKey = process.env.SENDGRID_API_KEY;
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_FROM_EMAIL;
  const fromName = process.env.SMTP_FROM_NAME || "NXTTRACK";

  if (!apiKey || !fromEmail) {
    return false;
  }

  const appUrl = process.env.PLATFORM_ADMIN_URL || process.env.NEXT_PUBLIC_APP_URL || "https://admin.nxttrack.nl";
  const response = await fetch("https://api.sendgrid.com/v3/mail/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      personalizations: [{ to: [{ email: targetEmail }] }],
      from: { email: fromEmail, name: fromName },
      subject: "NXTTRACK platform owner account",
      content: [
        {
          type: "text/plain",
          value: [
            "Je NXTTRACK platform owner account is klaargezet.",
            "",
            `Login: ${appUrl}/login?next=%2Fplatform`,
            `Tijdelijk wachtwoord: ${temporaryPassword}`,
            "",
            "Na je eerste login moet je direct een nieuw wachtwoord kiezen."
          ].join("\n")
        }
      ]
    })
  });

  return response.ok;
}

function generateTemporaryPassword() {
  const prefix = randomBytes(9).toString("base64url");
  const suffix = randomInt(10, 99).toString();

  return `Nxt-${prefix}-${suffix}!`;
}

function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

function throwFatal(message) {
  console.error(`[bootstrap-platform-owner] ${message}`);
  process.exit(1);
}

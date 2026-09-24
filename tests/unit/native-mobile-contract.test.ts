import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import {
  nativeCommandIdempotencyKey,
  parseNativeMobileCommand
} from "../../apps/web/lib/domain/native-command-contract";

const migration = readFileSync(
  new URL(
    "../../supabase/migrations/20260802230000_native_mobile_commands.sql",
    import.meta.url
  ),
  "utf8"
);
const now = new Date("2026-08-02T12:00:00.000Z");
const id = {
  command: "10000000-0000-4000-8000-000000000001",
  participant: "20000000-0000-4000-8000-000000000001",
  enrollment: "30000000-0000-4000-8000-000000000001",
  item: "40000000-0000-4000-8000-000000000001",
  session: "50000000-0000-4000-8000-000000000001",
  actor: "60000000-0000-4000-8000-000000000001"
};

test("native assessments behouden integer 1–5, null-semantiek en actor-gebonden idempotency", () => {
  const parsed = parseNativeMobileCommand(
    {
      client: "instructor",
      commandId: id.command,
      deviceId: "android-instructor-001",
      type: "assessment.finalize",
      payload: {
        participantId: id.participant,
        enrollmentId: id.enrollment,
        curriculumItemId: id.item,
        rating: 5,
        note: null,
        visibility: "parent_visible",
        observedAt: "2026-08-02T11:58:00.000Z",
        sessionId: id.session,
        correctsObservationId: null,
        correctionReason: null
      }
    },
    now
  );
  assert.ok(parsed);
  assert.equal(parsed.type, "assessment.finalize");
  assert.equal(parsed.payload.rating, 5);
  assert.match(
    nativeCommandIdempotencyKey(parsed, id.actor),
    new RegExp(`${id.actor}:${id.command}$`)
  );

  for (const rating of [0, 1.5, 6, "5", null]) {
    const invalid = structuredClone(parsed) as Record<string, unknown>;
    (invalid.payload as Record<string, unknown>).rating = rating;
    assert.equal(parseNativeMobileCommand(invalid, now), null);
  }
});

test("clientrollen kunnen geen mutatie van de andere app smokkelen", () => {
  assert.equal(
    parseNativeMobileCommand({
      client: "parent",
      commandId: id.command,
      deviceId: "android-parent-001",
      type: "attendance.mark",
      payload: {
        sessionId: id.session,
        participantId: id.participant,
        status: "present",
        note: null
      }
    }),
    null
  );
  assert.equal(
    parseNativeMobileCommand({
      client: "instructor",
      commandId: id.command,
      deviceId: "android-instructor-001",
      type: "lesson.cancel",
      payload: {
        sessionId: id.session,
        participantId: id.participant,
        reason: null
      }
    }),
    null
  );
});

test("native ouderflows begrenzen media consent en feedback expliciet", () => {
  const media = parseNativeMobileCommand({
    client: "parent",
    commandId: id.command,
    deviceId: "android-parent-001",
    type: "media.consent",
    payload: {
      participantId: id.participant,
      decision: "granted",
      authority: "guardian",
      humanConfirmed: true
    }
  });
  assert.ok(media);
  assert.equal(media.type, "media.consent");

  const feedback = parseNativeMobileCommand({
    client: "parent",
    commandId: id.command,
    deviceId: "android-parent-001",
    type: "feedback.submit",
    payload: {
      requestId: id.participant,
      score: 10,
      comment: "Fijne begeleiding",
      followUpAllowed: false,
      humanConfirmed: true
    }
  });
  assert.ok(feedback);
  assert.equal(feedback.type, "feedback.submit");

  for (const score of [-1, 10.5, 11, "10"]) {
    assert.equal(
      parseNativeMobileCommand({
        client: "parent",
        commandId: id.command,
        deviceId: "android-parent-001",
        type: "feedback.submit",
        payload: {
          requestId: id.participant,
          score,
          comment: null,
          followUpAllowed: false,
          humanConfirmed: true
        }
      }),
      null
    );
  }
});

test("offline observaties hebben een begrensd tijdvenster en correcties eisen een reden", () => {
  const command = {
    client: "instructor",
    commandId: id.command,
    deviceId: "android-instructor-001",
    type: "assessment.finalize",
    payload: {
      participantId: id.participant,
      enrollmentId: id.enrollment,
      curriculumItemId: id.item,
      rating: 3,
      note: null,
      visibility: "internal",
      observedAt: "2026-06-01T12:00:00.000Z",
      sessionId: null,
      correctsObservationId: null,
      correctionReason: null
    }
  };
  assert.equal(parseNativeMobileCommand(command, now), null);
  command.payload.observedAt = "2026-08-02T11:00:00.000Z";
  command.payload.correctsObservationId =
    "70000000-0000-4000-8000-000000000001";
  assert.equal(parseNativeMobileCommand(command, now), null);
  command.payload.correctionReason = "Trainer corrigeert invoer";
  assert.ok(parseNativeMobileCommand(command, now));
});

test("native SQL-commands hercontroleren actor, rechten, ownership en idempotency", () => {
  for (const command of [
    "mark_native_attendance",
    "cancel_native_lesson",
    "respond_native_graduation_invite",
    "mark_native_notification_read",
    "reply_native_message_thread",
    "record_native_media_consent",
    "submit_native_parent_feedback"
  ]) {
    assert.match(
      migration,
      new RegExp(`create or replace function public\\.${command}`)
    );
  }
  assert.match(migration, /target_actor_user_id is distinct from \(select auth\.uid\(\)\)/);
  assert.match(migration, /current_user_has_swim_permission[\s\S]+'attendance\.record'/);
  assert.match(migration, /Mutable guardian access required/);
  assert.match(migration, /Instructor is not assigned to this session/);
  assert.match(migration, /Idempotency key was already used for another command/);
  assert.match(migration, /tenant_notifications_dedupe_unique/);
  assert.match(migration, /target_human_confirmed/);
  assert.match(migration, /target_policy_version <> '2026-07'/);
  assert.match(migration, /target_score not between 0 and 10/);
  assert.doesNotMatch(
    migration,
    /grant execute on function public\.[\s\S]+to service_role/
  );
});

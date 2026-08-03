export const NATIVE_COMMAND_CONTRACT_VERSION = 1;

export type NativeAssessmentFinalizeCommand = {
  client: "instructor";
  commandId: string;
  deviceId: string;
  type: "assessment.finalize";
  payload: {
    participantId: string;
    enrollmentId: string;
    curriculumItemId: string;
    rating: 1 | 2 | 3 | 4 | 5;
    note: string | null;
    visibility: "internal" | "parent_visible";
    observedAt: string;
    sessionId: string | null;
    correctsObservationId: string | null;
    correctionReason: string | null;
  };
};

export type NativeAttendanceMarkCommand = {
  client: "instructor";
  commandId: string;
  deviceId: string;
  type: "attendance.mark";
  payload: {
    sessionId: string;
    participantId: string;
    status: "present" | "absent" | "late" | "excused" | "trial";
    note: string | null;
  };
};

export type NativeLessonCancelCommand = {
  client: "parent";
  commandId: string;
  deviceId: string;
  type: "lesson.cancel";
  payload: {
    sessionId: string;
    participantId: string;
    reason: string | null;
  };
};

export type NativeGraduationRespondCommand = {
  client: "parent";
  commandId: string;
  deviceId: string;
  type: "graduation.respond";
  payload: {
    eventParticipantId: string;
    response: "confirmed" | "declined";
  };
};

export type NativeNotificationReadCommand = {
  client: "instructor" | "parent";
  commandId: string;
  deviceId: string;
  type: "notification.read";
  payload: {
    notificationId: string;
  };
};

export type NativeMessageReplyCommand = {
  client: "instructor" | "parent";
  commandId: string;
  deviceId: string;
  type: "message.reply";
  payload: {
    threadId: string;
    plainText: string;
    humanConfirmed: true;
  };
};

export type NativeMediaConsentCommand = {
  client: "parent";
  commandId: string;
  deviceId: string;
  type: "media.consent";
  payload: {
    participantId: string;
    decision: "granted" | "denied" | "withdrawn";
    authority: "guardian" | "legal_representative";
    humanConfirmed: true;
  };
};

export type NativeFeedbackSubmitCommand = {
  client: "parent";
  commandId: string;
  deviceId: string;
  type: "feedback.submit";
  payload: {
    requestId: string;
    score: number;
    comment: string | null;
    followUpAllowed: boolean;
    humanConfirmed: true;
  };
};

export type NativeMobileCommand =
  | NativeAssessmentFinalizeCommand
  | NativeAttendanceMarkCommand
  | NativeLessonCancelCommand
  | NativeGraduationRespondCommand
  | NativeNotificationReadCommand
  | NativeMessageReplyCommand
  | NativeMediaConsentCommand
  | NativeFeedbackSubmitCommand;

const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const DEVICE_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/;
const ATTENDANCE_STATUSES = new Set([
  "present",
  "absent",
  "late",
  "excused",
  "trial"
]);

export function parseNativeMobileCommand(
  value: unknown,
  now = new Date()
): NativeMobileCommand | null {
  if (!isRecord(value)) return null;
  const client = value.client;
  const commandId = value.commandId;
  const deviceId = value.deviceId;
  const type = value.type;
  const payload = value.payload;
  if (
    (client !== "instructor" && client !== "parent") ||
    typeof commandId !== "string" ||
    !UUID_PATTERN.test(commandId) ||
    typeof deviceId !== "string" ||
    !DEVICE_ID_PATTERN.test(deviceId) ||
    typeof type !== "string" ||
    !isRecord(payload)
  ) {
    return null;
  }

  if (type === "assessment.finalize" && client === "instructor") {
    const rating = payload.rating;
    const note = optionalText(payload.note, 2_000);
    const correctionReason = optionalText(payload.correctionReason, 2_000);
    const correctsObservationId = optionalUuid(payload.correctsObservationId);
    const observedAt =
      typeof payload.observedAt === "string" &&
      isPlausibleObservationTime(payload.observedAt, now)
        ? payload.observedAt
        : null;
    if (
      !isUuid(payload.participantId) ||
      !isUuid(payload.enrollmentId) ||
      !isUuid(payload.curriculumItemId) ||
      !isFivePointRating(rating) ||
      note === undefined ||
      (payload.visibility !== "internal" &&
        payload.visibility !== "parent_visible") ||
      !observedAt ||
      optionalUuid(payload.sessionId) === undefined ||
      correctsObservationId === undefined ||
      correctionReason === undefined ||
      (correctsObservationId !== null &&
        (correctionReason === null || correctionReason.length < 3))
    ) {
      return null;
    }
    return {
      client,
      commandId,
      deviceId,
      type,
      payload: {
        participantId: payload.participantId,
        enrollmentId: payload.enrollmentId,
        curriculumItemId: payload.curriculumItemId,
        rating,
        note,
        visibility: payload.visibility,
        observedAt,
        sessionId: optionalUuid(payload.sessionId) as string | null,
        correctsObservationId,
        correctionReason
      }
    };
  }

  if (type === "attendance.mark" && client === "instructor") {
    const note = optionalText(payload.note, 2_000);
    if (
      !isUuid(payload.sessionId) ||
      !isUuid(payload.participantId) ||
      typeof payload.status !== "string" ||
      !ATTENDANCE_STATUSES.has(payload.status) ||
      note === undefined
    ) {
      return null;
    }
    return {
      client,
      commandId,
      deviceId,
      type,
      payload: {
        sessionId: payload.sessionId,
        participantId: payload.participantId,
        status: payload.status as NativeAttendanceMarkCommand["payload"]["status"],
        note
      }
    };
  }

  if (type === "lesson.cancel" && client === "parent") {
    const reason = optionalText(payload.reason, 2_000);
    if (
      !isUuid(payload.sessionId) ||
      !isUuid(payload.participantId) ||
      reason === undefined
    ) {
      return null;
    }
    return {
      client,
      commandId,
      deviceId,
      type,
      payload: {
        sessionId: payload.sessionId,
        participantId: payload.participantId,
        reason
      }
    };
  }

  if (type === "graduation.respond" && client === "parent") {
    if (
      !isUuid(payload.eventParticipantId) ||
      (payload.response !== "confirmed" && payload.response !== "declined")
    ) {
      return null;
    }
    return {
      client,
      commandId,
      deviceId,
      type,
      payload: {
        eventParticipantId: payload.eventParticipantId,
        response: payload.response
      }
    };
  }

  if (type === "notification.read") {
    if (!isUuid(payload.notificationId)) return null;
    return {
      client,
      commandId,
      deviceId,
      type,
      payload: { notificationId: payload.notificationId }
    };
  }

  if (type === "message.reply") {
    const plainText = requiredText(payload.plainText, 8_000);
    if (
      !isUuid(payload.threadId) ||
      !plainText ||
      payload.humanConfirmed !== true
    ) {
      return null;
    }
    return {
      client,
      commandId,
      deviceId,
      type,
      payload: {
        threadId: payload.threadId,
        plainText,
        humanConfirmed: true
      }
    };
  }

  if (type === "media.consent" && client === "parent") {
    if (
      !isUuid(payload.participantId) ||
      !["granted", "denied", "withdrawn"].includes(
        String(payload.decision)
      ) ||
      !["guardian", "legal_representative"].includes(
        String(payload.authority)
      ) ||
      payload.humanConfirmed !== true
    ) {
      return null;
    }
    return {
      client,
      commandId,
      deviceId,
      type,
      payload: {
        participantId: payload.participantId,
        decision: payload.decision as NativeMediaConsentCommand["payload"]["decision"],
        authority: payload.authority as NativeMediaConsentCommand["payload"]["authority"],
        humanConfirmed: true
      }
    };
  }

  if (type === "feedback.submit" && client === "parent") {
    const comment = optionalText(payload.comment, 2_000);
    if (
      !isUuid(payload.requestId) ||
      !Number.isInteger(payload.score) ||
      Number(payload.score) < 0 ||
      Number(payload.score) > 10 ||
      comment === undefined ||
      typeof payload.followUpAllowed !== "boolean" ||
      payload.humanConfirmed !== true
    ) {
      return null;
    }
    return {
      client,
      commandId,
      deviceId,
      type,
      payload: {
        requestId: payload.requestId,
        score: Number(payload.score),
        comment,
        followUpAllowed: payload.followUpAllowed,
        humanConfirmed: true
      }
    };
  }

  return null;
}

export function nativeCommandIdempotencyKey(
  command: NativeMobileCommand,
  actorUserId: string
) {
  return `native:${command.type}:${actorUserId}:${command.commandId}`;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_PATTERN.test(value);
}

function optionalUuid(value: unknown): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  return isUuid(value) ? value : undefined;
}

function optionalText(
  value: unknown,
  maximumLength: number
): string | null | undefined {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value !== "string") return undefined;
  const normalized = value.trim();
  if (!normalized) return null;
  return normalized.length <= maximumLength ? normalized : undefined;
}

function requiredText(value: unknown, maximumLength: number) {
  const normalized = optionalText(value, maximumLength);
  return typeof normalized === "string" ? normalized : null;
}

function isFivePointRating(value: unknown): value is 1 | 2 | 3 | 4 | 5 {
  return (
    Number.isInteger(value) &&
    typeof value === "number" &&
    value >= 1 &&
    value <= 5
  );
}

function isPlausibleObservationTime(value: string, now: Date) {
  const parsed = new Date(value);
  if (!Number.isFinite(parsed.getTime())) return false;
  const delta = parsed.getTime() - now.getTime();
  return delta <= 5 * 60_000 && delta >= -30 * 24 * 60 * 60_000;
}

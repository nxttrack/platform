package nl.nxttrack.mobile.domain

enum class ClientKind(val wireValue: String) {
    INSTRUCTOR("instructor"),
    PARENT("parent")
}

data class SessionTokens(
    val accessToken: String,
    val refreshToken: String,
    val expiresAtEpochSeconds: Long?
)

data class ActiveTenant(
    val id: String,
    val name: String,
    val slug: String?,
    val roles: List<String>
)

data class MobileSession(
    val client: ClientKind,
    val userId: String,
    val displayName: String,
    val email: String?,
    val tenant: ActiveTenant,
    val tokens: SessionTokens
)

data class ThemeTokens(
    val canvas: String = "#EEF6FB",
    val surface: String = "#FFFFFF",
    val surfaceAlt: String = "#F6FAFC",
    val text: String = "#09203E",
    val textMuted: String = "#61748B",
    val primary: String = "#0878E5",
    val primaryStrong: String = "#0759B4",
    val secondary: String = "#14B8B1",
    val reward: String = "#F6B744",
    val rail: String = "#071D39",
    val info: String = "#075EA8",
    val success: String = "#146C4C",
    val warning: String = "#7A4B00",
    val danger: String = "#B4233D",
    val cardRadiusDp: Float = 19f,
    val heroRadiusDp: Float = 27f,
    val standardMotionMs: Int = 200
)

data class ThemeBundle(
    val schemaVersion: Int,
    val portalContract: String,
    val themeKey: String,
    val release: String,
    val primaryDestinations: List<String>,
    val routeIds: List<String>,
    val shellRecipe: String,
    val pageRecipes: Map<String, String>,
    val tokens: ThemeTokens
) {
    val cacheKey: String get() = "$themeKey@$release"
}

enum class AssessmentDisplay {
    SMILEYS,
    STARS
}

enum class RingKind {
    STAGE,
    DIPLOMA
}

data class JourneyRing(
    val key: String,
    val kind: RingKind,
    val label: String,
    val progressPercent: Double,
    val coveragePercent: Double,
    val assessedCount: Int,
    val contributingCount: Int,
    val formulaVersion: String
)

data class JourneyItem(
    val id: String,
    val key: String,
    val name: String,
    val description: String?,
    val rating: Int?,
    val positiveLabel: String?,
    val observedAt: String?,
    val carryover: Boolean = false
)

data class LearnerJourney(
    val stageId: String?,
    val stageName: String?,
    val rings: List<JourneyRing>,
    val items: List<JourneyItem>
)

data class EarnedBadge(
    val id: String,
    val awardId: String?,
    val key: String,
    val name: String,
    val description: String?,
    val category: String,
    val artworkPath: String?,
    val earned: Boolean,
    val awardedAt: String?,
    val shareCaption: String?
)

data class Child(
    val id: String,
    val displayName: String,
    val canMutate: Boolean,
    val enrollmentId: String?,
    val programName: String?,
    val stageName: String?,
    val nextLessonId: String?,
    val groupIds: List<String>,
    val journey: LearnerJourney?,
    val badges: List<EarnedBadge>
)

data class Lesson(
    val id: String,
    val groupId: String,
    val groupName: String,
    val startsAt: String,
    val endsAt: String,
    val resourceName: String?,
    val status: String,
    val notes: String?
)

data class Announcement(
    val id: String,
    val title: String,
    val body: String,
    val publishedAt: String?
)

data class InboxMessage(
    val id: String,
    val threadId: String,
    val body: String,
    val senderName: String,
    val mine: Boolean,
    val status: String,
    val createdAt: String
)

data class InboxThread(
    val id: String,
    val subject: String,
    val participantId: String?,
    val status: String,
    val unread: Boolean,
    val lastMessageAt: String?
)

data class MobileNotification(
    val id: String,
    val title: String,
    val message: String,
    val priority: String,
    val status: String,
    val createdAt: String,
    val actionPath: String?
)

data class Inbox(
    val canReply: Boolean,
    val threads: List<InboxThread>,
    val messages: List<InboxMessage>,
    val notifications: List<MobileNotification>
)

data class Invoice(
    val id: String,
    val invoiceNumber: String?,
    val documentType: String,
    val status: String,
    val currency: String,
    val totalCents: Long,
    val vatRateBasisPoints: Int,
    val issuedOn: String?,
    val dueOn: String?,
    val finalizedAt: String?,
    val downloadPath: String?
)

data class Payment(
    val id: String,
    val amountCents: Long,
    val currency: String,
    val status: String,
    val dueOn: String?
)

data class Document(
    val id: String,
    val title: String,
    val description: String?,
    val fileName: String?,
    val mimeType: String?,
    val sizeBytes: Long?,
    val downloadPath: String?,
    val createdAt: String?
)

data class Diploma(
    val id: String,
    val title: String,
    val number: String?,
    val issuedOn: String?,
    val status: String,
    val verificationId: String?,
    val downloadPath: String?
)

data class MediaConsent(
    val participantId: String,
    val participantName: String,
    val status: String,
    val effectiveValid: Boolean,
    val effectiveReason: String,
    val canDecide: Boolean,
    val updatedAt: String?
)

data class ParticipantMedia(
    val id: String,
    val participantId: String,
    val caption: String?,
    val mimeType: String,
    val publishedAt: String?,
    val expiresAt: String,
    val downloadAllowed: Boolean,
    val viewPath: String,
    val downloadPath: String?
)

data class MediaOverview(
    val policyVersion: String,
    val consents: List<MediaConsent>,
    val items: List<ParticipantMedia>
)

data class FeedbackSurvey(
    val id: String,
    val participantId: String,
    val participantName: String,
    val campaignName: String,
    val prompt: String,
    val followUpQuestion: String,
    val status: String,
    val expiresAt: String,
    val completedAt: String?,
    val score: Int?
)

data class GraduationInvite(
    val id: String,
    val eventId: String,
    val participantId: String,
    val inviteStatus: String,
    val status: String,
    val result: String
)

data class ParentBootstrap(
    val contractVersion: Int,
    val generatedAt: String,
    val tenant: ActiveTenant,
    val assessmentDisplay: AssessmentDisplay,
    val theme: ThemeBundle,
    val children: List<Child>,
    val lessons: List<Lesson>,
    val announcements: List<Announcement>,
    val inbox: Inbox,
    val invoices: List<Invoice>,
    val payments: List<Payment>,
    val diplomas: List<Diploma>,
    val graduationInvites: List<GraduationInvite>,
    val documents: List<Document>,
    val media: MediaOverview,
    val feedback: List<FeedbackSurvey>
)

data class RosterMember(
    val participantId: String,
    val participantName: String,
    val enrollmentId: String,
    val attendance: String?
)

data class InstructorSession(
    val id: String,
    val groupId: String,
    val groupName: String,
    val startsAt: String,
    val endsAt: String,
    val resourceName: String?,
    val status: String,
    val roster: List<RosterMember>
)

data class InstructorGroup(
    val id: String,
    val name: String,
    val status: String,
    val capacity: Int,
    val roster: List<RosterMember>
)

data class InstructorLearner(
    val id: String,
    val displayName: String,
    val enrollmentId: String?,
    val journey: LearnerJourney?
)

data class InstructorTask(
    val id: String,
    val title: String,
    val description: String?,
    val participantId: String?,
    val priority: String,
    val status: String,
    val dueOn: String?,
    val updatedAt: String?
)

data class InstructorBootstrap(
    val contractVersion: Int,
    val generatedAt: String,
    val tenant: ActiveTenant,
    val assessmentDisplay: AssessmentDisplay,
    val sessions: List<InstructorSession>,
    val groups: List<InstructorGroup>,
    val learners: List<InstructorLearner>,
    val announcements: List<Announcement>,
    val inbox: Inbox,
    val tasks: List<InstructorTask>,
    val documents: List<Document>
)

data class PendingMutation(
    val commandId: String,
    val client: ClientKind,
    val deviceId: String,
    val type: String,
    val payloadJson: String,
    val createdAtEpochMs: Long,
    val attemptCount: Int = 0,
    val lastErrorCode: String? = null
)

enum class SyncState {
    IDLE,
    SYNCING,
    OFFLINE,
    ERROR
}

sealed interface MobileSnapshot {
    data class Parent(val value: ParentBootstrap) : MobileSnapshot
    data class Instructor(val value: InstructorBootstrap) : MobileSnapshot
}

data class RepositoryState(
    val session: MobileSession? = null,
    val snapshot: MobileSnapshot? = null,
    val syncState: SyncState = SyncState.IDLE,
    val pendingMutationCount: Int = 0,
    val isLoading: Boolean = true,
    val errorCode: String? = null,
    val isUsingOfflineCache: Boolean = false
)

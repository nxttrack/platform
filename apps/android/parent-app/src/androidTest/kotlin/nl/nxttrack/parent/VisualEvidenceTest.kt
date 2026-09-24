package nl.nxttrack.parent

import android.graphics.Bitmap
import androidx.activity.compose.setContent
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import java.io.FileOutputStream
import nl.nxttrack.mobile.design.NxttrackTheme
import nl.nxttrack.mobile.domain.ActiveTenant
import nl.nxttrack.mobile.domain.Announcement
import nl.nxttrack.mobile.domain.AssessmentDisplay
import nl.nxttrack.mobile.domain.Child
import nl.nxttrack.mobile.domain.Document
import nl.nxttrack.mobile.domain.Diploma
import nl.nxttrack.mobile.domain.EarnedBadge
import nl.nxttrack.mobile.domain.FeedbackSurvey
import nl.nxttrack.mobile.domain.GraduationInvite
import nl.nxttrack.mobile.domain.Inbox
import nl.nxttrack.mobile.domain.Invoice
import nl.nxttrack.mobile.domain.JourneyItem
import nl.nxttrack.mobile.domain.JourneyRing
import nl.nxttrack.mobile.domain.LearnerJourney
import nl.nxttrack.mobile.domain.Lesson
import nl.nxttrack.mobile.domain.MediaConsent
import nl.nxttrack.mobile.domain.MediaOverview
import nl.nxttrack.mobile.domain.MobileNotification
import nl.nxttrack.mobile.domain.ParentBootstrap
import nl.nxttrack.mobile.domain.ParticipantMedia
import nl.nxttrack.mobile.domain.Payment
import nl.nxttrack.mobile.domain.PortalTerminology
import nl.nxttrack.mobile.domain.RepositoryState
import nl.nxttrack.mobile.domain.RingKind
import nl.nxttrack.mobile.domain.SyncState
import nl.nxttrack.mobile.domain.ThemeBundle
import nl.nxttrack.mobile.domain.ThemeTokens
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class VisualEvidenceTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun captureCanonicalParentFlows() {
        val data = parentFixture()
        listOf(
            ParentPage.OVERVIEW to "parent-overview",
            ParentPage.PROGRESS to "parent-progress",
            ParentPage.BADGES to "parent-badges",
            ParentPage.PAYMENTS to "parent-payments",
            ParentPage.MEDIA to "parent-media"
        ).forEach { (page, name) ->
            rule.activityRule.scenario.onActivity { activity ->
                val viewModel = ParentViewModel()
                activity.setContent {
                    NxttrackTheme(theme = data.theme, darkTheme = false) {
                        ParentShell(
                            data = data,
                            repositoryState = RepositoryState(
                                syncState = SyncState.IDLE,
                                isLoading = false
                            ),
                            localState = ParentLocalState(
                                page = page,
                                selectedChildId = "child-1"
                            ),
                            viewModel = viewModel,
                            onShareBadge = {}
                        )
                    }
                }
            }
            rule.waitForIdle()
            val output = File(
                rule.activity.filesDir,
                "visual-evidence/$name.png"
            )
            output.parentFile?.mkdirs()
            FileOutputStream(output).use { stream ->
                check(
                    rule.onRoot()
                        .captureToImage()
                        .asAndroidBitmap()
                        .compress(Bitmap.CompressFormat.PNG, 100, stream)
                )
            }
        }
    }
}

private fun parentFixture(): ParentBootstrap {
    val theme = ThemeBundle(
        schemaVersion = 3,
        portalContract = "parent-portal/1.2",
        themeKey = "dolphin-bay",
        release = "3.0.0",
        primaryDestinations = listOf(
            "overview",
            "planning",
            "development",
            "inbox",
            "more"
        ),
        routeIds = listOf(
            "overview",
            "planning",
            "lesson-detail",
            "development",
            "badges",
            "media",
            "diplomas",
            "inbox",
            "payments",
            "documents",
            "feedback",
            "children",
            "profile"
        ),
        shellRecipe = "portal-shell/shared-v1",
        pageRecipes = listOf(
            "overview",
            "planning",
            "lesson-detail",
            "development",
            "badges",
            "media",
            "diplomas",
            "inbox",
            "payments",
            "documents",
            "feedback",
            "children",
            "profile"
        ).associateWith { route ->
            when (route) {
                "overview" -> "overview/journey-engine-v1"
                "planning" -> "planning/timeline-v1"
                "development" -> "development/progress-v1"
                "badges" -> "badges/placeholder-wall-v1"
                else -> "page/data-first-v2"
            }
        },
        tokens = ThemeTokens(
            canvas = "#EAF7FB",
            primary = "#0878E5",
            secondary = "#14B8B1",
            reward = "#F6B744"
        )
    )
    val rings = listOf(
        JourneyRing(
            key = "stage",
            kind = RingKind.STAGE,
            label = "Badje Zeester",
            progressPercent = 66.7,
            coveragePercent = 83.3,
            assessedCount = 5,
            contributingCount = 6,
            formulaVersion = "swim_progress_v3"
        ),
        JourneyRing(
            key = "diploma",
            kind = RingKind.DIPLOMA,
            label = "Reis naar diploma A",
            progressPercent = 41.7,
            coveragePercent = 58.3,
            assessedCount = 7,
            contributingCount = 12,
            formulaVersion = "swim_progress_v3"
        )
    )
    val items = listOf(
        JourneyItem(
            id = "item-1",
            key = "water-vrij",
            name = "Vrij bewegen in het water",
            description = "Zelfstandig en ontspannen bewegen.",
            rating = 5,
            positiveLabel = "Helemaal zelfstandig",
            observedAt = "2026-08-01T14:00:00+02:00"
        ),
        JourneyItem(
            id = "item-2",
            key = "drijven",
            name = "Drijven op buik en rug",
            description = "Rustig de balans vasthouden.",
            rating = 3,
            positiveLabel = "Steeds zekerder",
            observedAt = "2026-08-01T14:05:00+02:00"
        ),
        JourneyItem(
            id = "item-3",
            key = "beenslag",
            name = "Beenslag",
            description = "Met gestrekte benen vooruit.",
            rating = null,
            positiveLabel = null,
            observedAt = null,
            carryover = true
        )
    )
    val badges = listOf(
        badge("badge-1", "award-1", "Eerste sprong", "Moed", true),
        badge("badge-2", "award-2", "Waterheld", "Moed", true),
        badge("badge-3", "award-3", "Drijfkampioen", "Techniek", true),
        badge("badge-4", "award-4", "Sterke benen", "Techniek", true),
        badge("badge-5", null, "Onderwaterkijker", "Ontdekken", false),
        badge("badge-6", null, "Bellenblazer", "Ontdekken", false)
    )
    val child = Child(
        id = "child-1",
        displayName = "Mila",
        canMutate = true,
        enrollmentId = "enrollment-1",
        programName = "Diploma A",
        stageName = "Badje Zeester",
        nextLessonId = "lesson-1",
        groupIds = listOf("group-1"),
        journey = LearnerJourney(
            stageId = "stage-1",
            stageName = "Badje Zeester",
            rings = rings,
            items = items
        ),
        badges = badges
    )
    return ParentBootstrap(
        contractVersion = 1,
        generatedAt = "2026-08-02T12:00:00+02:00",
        tenant = ActiveTenant(
            id = "tenant-1",
            name = "Zwemschool De Waterlijn",
            slug = "waterlijn",
            roles = listOf("guardian")
        ),
        assessmentDisplay = AssessmentDisplay.SMILEYS,
        theme = theme,
        terminology = PortalTerminology(
            activity = "les",
            activities = "lessen",
            finalCredential = "diploma",
            finalCredentials = "diploma's",
            finalMoment = "afzwemmen",
            instructor = "trainer",
            journey = "zwemreis",
            makeUpActivity = "inhaalles",
            makeUpActivities = "inhaallessen",
            organization = "zwemschool",
            route = "zwemroute",
            stage = "badje"
        ),
        children = listOf(child),
        lessons = listOf(
            Lesson(
                id = "lesson-1",
                groupId = "group-1",
                groupName = "Zeester woensdag",
                startsAt = "2026-08-05T15:30:00+02:00",
                endsAt = "2026-08-05T16:15:00+02:00",
                resourceName = "Binnenbad · baan 2",
                status = "scheduled",
                notes = "Neem de blauwe badmuts mee."
            )
        ),
        announcements = listOf(
            Announcement(
                id = "announcement-1",
                title = "Zomerrooster",
                body = "De komende weken zwemmen we volgens het zomerrooster.",
                publishedAt = "2026-08-01T09:00:00+02:00"
            )
        ),
        inbox = Inbox(
            canReply = true,
            threads = emptyList(),
            messages = emptyList(),
            notifications = listOf(
                MobileNotification(
                    id = "notification-1",
                    title = "Twee badges verdiend",
                    message = "Mila verdiende twee nieuwe badges.",
                    priority = "normal",
                    status = "unread",
                    createdAt = "2026-08-01T14:10:00+02:00",
                    actionPath = "/portaal/badges"
                )
            )
        ),
        invoices = listOf(
            Invoice(
                id = "invoice-1",
                invoiceNumber = "2026-0042",
                documentType = "invoice",
                status = "finalized",
                currency = "EUR",
                totalCents = 6250,
                vatRateBasisPoints = 2100,
                issuedOn = "2026-08-01",
                dueOn = "2026-08-15",
                finalizedAt = "2026-08-01T10:00:00+02:00",
                downloadPath = "/api/files/invoice/invoice-1"
            ),
            Invoice(
                id = "credit-1",
                invoiceNumber = "CN-2026-0003",
                documentType = "credit_note",
                status = "finalized",
                currency = "EUR",
                totalCents = -1250,
                vatRateBasisPoints = 2100,
                issuedOn = "2026-08-02",
                dueOn = null,
                finalizedAt = "2026-08-02T10:00:00+02:00",
                downloadPath = "/api/files/invoice/credit-1"
            )
        ),
        payments = listOf(
            Payment(
                id = "payment-1",
                amountCents = 6250,
                currency = "EUR",
                status = "open",
                dueOn = "2026-08-15"
            )
        ),
        diplomas = listOf(
            Diploma(
                id = "diploma-1",
                title = "Diploma A",
                number = "A-2026-0188",
                issuedOn = "2026-07-12",
                status = "issued",
                verificationId = "verify-1",
                downloadPath = "/api/files/certificate/diploma-1"
            )
        ),
        graduationInvites = listOf(
            GraduationInvite(
                id = "invite-1",
                eventId = "event-1",
                participantId = "child-1",
                inviteStatus = "sent",
                status = "invited",
                result = "pending"
            )
        ),
        documents = listOf(
            Document(
                id = "document-1",
                title = "Zwembadregels",
                description = "Veilig en prettig zwemmen.",
                fileName = "zwembadregels.pdf",
                mimeType = "application/pdf",
                sizeBytes = 230_000,
                downloadPath = "/api/files/tenant-document/document-1",
                createdAt = "2026-07-01T09:00:00+02:00"
            )
        ),
        media = MediaOverview(
            policyVersion = "2026-07",
            consents = listOf(
                MediaConsent(
                    participantId = "child-1",
                    participantName = "Mila",
                    status = "granted",
                    effectiveValid = true,
                    effectiveReason = "active",
                    canDecide = true,
                    updatedAt = "2026-07-15T10:00:00+02:00"
                )
            ),
            items = listOf(
                ParticipantMedia(
                    id = "media-1",
                    participantId = "child-1",
                    caption = "Zelfstandig drijven",
                    mimeType = "image/jpeg",
                    publishedAt = "2026-08-01T14:15:00+02:00",
                    expiresAt = "2026-09-01T14:15:00+02:00",
                    downloadAllowed = true,
                    viewPath = "/api/files/participant-media/media-1",
                    downloadPath = "/api/files/participant-media/media-1?download=1"
                )
            )
        ),
        feedback = listOf(
            FeedbackSurvey(
                id = "feedback-1",
                participantId = "child-1",
                participantName = "Mila",
                campaignName = "Eerste maand",
                prompt = "Hoe ervaart Mila de zwemlessen?",
                followUpQuestion = "Wil je iets toelichten?",
                status = "open",
                expiresAt = "2027-01-01T00:00:00+01:00",
                completedAt = null,
                score = null
            )
        )
    )
}

private fun badge(
    id: String,
    awardId: String?,
    name: String,
    category: String,
    earned: Boolean
) = EarnedBadge(
    id = id,
    awardId = awardId,
    key = id,
    name = name,
    description = if (earned) "Behaald tijdens de zwemles." else "Nog te ontdekken.",
    category = category,
    artworkPath = if (earned) "/api/files/badge-studio-asset/$id" else null,
    earned = earned,
    awardedAt = if (earned) "2026-08-01T14:10:00+02:00" else null,
    shareCaption = if (earned) "$name behaald!" else null
)

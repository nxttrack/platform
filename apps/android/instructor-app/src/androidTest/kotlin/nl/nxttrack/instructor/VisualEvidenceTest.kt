package nl.nxttrack.instructor

import android.graphics.Bitmap
import androidx.activity.compose.setContent
import androidx.compose.ui.graphics.asAndroidBitmap
import androidx.compose.ui.test.captureToImage
import androidx.compose.ui.test.junit4.createAndroidComposeRule
import androidx.compose.ui.test.onRoot
import androidx.test.ext.junit.runners.AndroidJUnit4
import java.io.File
import java.io.FileOutputStream
import java.time.OffsetDateTime
import nl.nxttrack.mobile.design.NxttrackTheme
import nl.nxttrack.mobile.domain.ActiveTenant
import nl.nxttrack.mobile.domain.Announcement
import nl.nxttrack.mobile.domain.AssessmentDisplay
import nl.nxttrack.mobile.domain.Document
import nl.nxttrack.mobile.domain.Inbox
import nl.nxttrack.mobile.domain.InstructorBootstrap
import nl.nxttrack.mobile.domain.InstructorGroup
import nl.nxttrack.mobile.domain.InstructorLearner
import nl.nxttrack.mobile.domain.InstructorSession
import nl.nxttrack.mobile.domain.InstructorTask
import nl.nxttrack.mobile.domain.JourneyItem
import nl.nxttrack.mobile.domain.JourneyRing
import nl.nxttrack.mobile.domain.LearnerJourney
import nl.nxttrack.mobile.domain.RepositoryState
import nl.nxttrack.mobile.domain.RingKind
import nl.nxttrack.mobile.domain.RosterMember
import nl.nxttrack.mobile.domain.SyncState
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class VisualEvidenceTest {
    @get:Rule
    val rule = createAndroidComposeRule<MainActivity>()

    @Test
    fun captureCanonicalInstructorFlows() {
        val data = instructorFixture()
        listOf(
            InstructorLocalState(
                page = InstructorPage.SESSION,
                selectedSessionId = "session-1"
            ) to "instructor-session",
            InstructorLocalState(
                page = InstructorPage.LEARNER,
                selectedSessionId = "session-1",
                selectedLearnerId = "child-1"
            ) to "instructor-learner"
        ).forEach { (localState, name) ->
            rule.activityRule.scenario.onActivity { activity ->
                val viewModel = InstructorViewModel()
                activity.setContent {
                    NxttrackTheme(darkTheme = false) {
                        InstructorShell(
                            data = data,
                            repositoryState = RepositoryState(
                                syncState = SyncState.IDLE,
                                isLoading = false
                            ),
                            localState = localState,
                            viewModel = viewModel
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

private fun instructorFixture(): InstructorBootstrap {
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
            label = "Diploma A",
            progressPercent = 41.7,
            coveragePercent = 58.3,
            assessedCount = 7,
            contributingCount = 12,
            formulaVersion = "swim_progress_v3"
        )
    )
    val journey = LearnerJourney(
        stageId = "stage-1",
        stageName = "Badje Zeester",
        rings = rings,
        items = listOf(
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
                observedAt = null
            )
        )
    )
    val roster = listOf(
        RosterMember(
            participantId = "child-1",
            participantName = "Mila",
            enrollmentId = "enrollment-1",
            attendance = "present"
        ),
        RosterMember(
            participantId = "child-2",
            participantName = "Noah",
            enrollmentId = "enrollment-2",
            attendance = null
        )
    )
    val start = OffsetDateTime.now()
        .withHour(15)
        .withMinute(30)
        .withSecond(0)
        .withNano(0)
    val session = InstructorSession(
        id = "session-1",
        groupId = "group-1",
        groupName = "Zeester woensdag",
        startsAt = start.toString(),
        endsAt = start.plusMinutes(45).toString(),
        resourceName = "Binnenbad · baan 2",
        status = "scheduled",
        roster = roster
    )
    return InstructorBootstrap(
        contractVersion = 1,
        generatedAt = OffsetDateTime.now().toString(),
        tenant = ActiveTenant(
            id = "tenant-1",
            name = "Zwemschool De Waterlijn",
            slug = "waterlijn",
            roles = listOf("instructor")
        ),
        assessmentDisplay = AssessmentDisplay.STARS,
        sessions = listOf(session),
        groups = listOf(
            InstructorGroup(
                id = "group-1",
                name = "Zeester woensdag",
                status = "published",
                capacity = 8,
                roster = roster
            )
        ),
        learners = listOf(
            InstructorLearner(
                id = "child-1",
                displayName = "Mila",
                enrollmentId = "enrollment-1",
                journey = journey
            ),
            InstructorLearner(
                id = "child-2",
                displayName = "Noah",
                enrollmentId = "enrollment-2",
                journey = journey.copy(stageName = "Badje Zeester")
            )
        ),
        announcements = listOf(
            Announcement(
                id = "announcement-1",
                title = "Zomerrooster",
                body = "Controleer vandaag de aangepaste badindeling.",
                publishedAt = OffsetDateTime.now().minusDays(1).toString()
            )
        ),
        inbox = Inbox(
            canReply = true,
            threads = emptyList(),
            messages = emptyList(),
            notifications = emptyList()
        ),
        tasks = listOf(
            InstructorTask(
                id = "task-1",
                title = "Beoordelingen afronden",
                description = "Controleer de open onderdelen na de les.",
                participantId = null,
                priority = "normal",
                status = "open",
                dueOn = OffsetDateTime.now().toLocalDate().toString(),
                updatedAt = OffsetDateTime.now().toString()
            )
        ),
        documents = listOf(
            Document(
                id = "document-1",
                title = "Veiligheidsprotocol",
                description = "Actueel protocol voor het binnenbad.",
                fileName = "veiligheidsprotocol.pdf",
                mimeType = "application/pdf",
                sizeBytes = 180_000,
                downloadPath = "/api/files/tenant-document/document-1",
                createdAt = OffsetDateTime.now().minusDays(5).toString()
            )
        )
    )
}

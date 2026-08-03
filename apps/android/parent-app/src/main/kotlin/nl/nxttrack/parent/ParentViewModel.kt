package nl.nxttrack.parent

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import nl.nxttrack.mobile.data.DownloadedFile
import nl.nxttrack.mobile.data.MobileRuntime
import nl.nxttrack.mobile.domain.EarnedBadge

enum class ParentPage(val title: String, val primaryDestination: String) {
    OVERVIEW("Overzicht", "overview"),
    PLANNING("Planning", "planning"),
    LESSON_DETAIL("Les", "planning"),
    PROGRESS("Live Zwemreis", "progress"),
    BADGES("Badges", "progress"),
    MEDIA("Foto's en media", "overview"),
    DIPLOMAS("Diploma's", "overview"),
    INBOX("Inbox", "inbox"),
    PAYMENTS("Betalingen", "payments"),
    DOCUMENTS("Documenten", "overview"),
    FEEDBACK("Feedback", "overview"),
    FAMILY_ACCESS("Gezinstoegang", "overview"),
    PROFILE("Profiel", "overview")
}

data class ParentLocalState(
    val page: ParentPage = ParentPage.OVERVIEW,
    val selectedChildId: String? = null,
    val selectedThreadId: String? = null,
    val selectedLessonId: String? = null,
    val email: String = "",
    val password: String = "",
    val loginError: String? = null
)

sealed interface ParentEvent {
    data class DownloadReady(val file: DownloadedFile) : ParentEvent
    data class ShareBadgeReady(
        val badge: EarnedBadge,
        val artwork: DownloadedFile?
    ) : ParentEvent
    data class Error(val code: String) : ParentEvent
}

class ParentViewModel : ViewModel() {
    private val repository = MobileRuntime.requireRepository()
    val repositoryState = repository.state
    private val mutableLocalState = MutableStateFlow(ParentLocalState())
    val localState = mutableLocalState.asStateFlow()
    private val mutableEvents = MutableSharedFlow<ParentEvent>()
    val events = mutableEvents.asSharedFlow()

    fun setEmail(value: String) {
        mutableLocalState.value = mutableLocalState.value.copy(
            email = value.take(320),
            loginError = null
        )
    }

    fun setPassword(value: String) {
        mutableLocalState.value = mutableLocalState.value.copy(
            password = value.take(1_024),
            loginError = null
        )
    }

    fun signIn() {
        val state = mutableLocalState.value
        viewModelScope.launch {
            repository.signIn(state.email, state.password).onFailure {
                mutableLocalState.value = mutableLocalState.value.copy(
                    loginError = "Inloggen lukt niet. Controleer je gegevens."
                )
            }
        }
    }

    fun navigate(page: ParentPage) {
        mutableLocalState.value = mutableLocalState.value.copy(page = page)
    }

    fun navigatePrimary(id: String) {
        navigate(
            when (id) {
                "planning" -> ParentPage.PLANNING
                "progress" -> ParentPage.PROGRESS
                "inbox" -> ParentPage.INBOX
                "payments" -> ParentPage.PAYMENTS
                else -> ParentPage.OVERVIEW
            }
        )
    }

    fun selectChild(id: String) {
        mutableLocalState.value = mutableLocalState.value.copy(
            selectedChildId = id
        )
    }

    fun selectThread(id: String?) {
        mutableLocalState.value = mutableLocalState.value.copy(
            selectedThreadId = id
        )
    }

    fun openLesson(id: String) {
        mutableLocalState.value = mutableLocalState.value.copy(
            page = ParentPage.LESSON_DETAIL,
            selectedLessonId = id
        )
    }

    fun refresh() {
        viewModelScope.launch { repository.synchronize() }
    }

    fun cancelLesson(sessionId: String, participantId: String, reason: String?) {
        repository.cancelLesson(sessionId, participantId, reason)
    }

    fun respondToGraduation(eventParticipantId: String, response: String) {
        repository.respondToGraduationInvite(eventParticipantId, response)
    }

    fun markNotificationRead(notificationId: String) {
        repository.markNotificationRead(notificationId)
    }

    fun reply(threadId: String, plainText: String) {
        repository.replyToThread(threadId, plainText)
    }

    fun download(path: String) {
        viewModelScope.launch {
            runCatching { repository.download(path) }
                .onSuccess { mutableEvents.emit(ParentEvent.DownloadReady(it)) }
                .onFailure {
                    mutableEvents.emit(ParentEvent.Error("download_failed"))
                }
        }
    }

    fun shareBadge(badge: EarnedBadge) {
        if (!badge.earned || badge.awardId == null) {
            viewModelScope.launch {
                mutableEvents.emit(ParentEvent.Error("share_unavailable"))
            }
            return
        }
        viewModelScope.launch {
            val artwork = badge.artworkPath?.let { path ->
                runCatching { repository.download(path) }.getOrNull()
            }
            mutableEvents.emit(ParentEvent.ShareBadgeReady(badge, artwork))
        }
    }

    fun recordMediaConsent(participantId: String, decision: String) {
        repository.recordMediaConsent(participantId, decision)
    }

    fun submitFeedback(
        requestId: String,
        score: Int,
        comment: String?,
        followUpAllowed: Boolean
    ) {
        repository.submitFeedback(
            requestId = requestId,
            score = score,
            comment = comment,
            followUpAllowed = followUpAllowed
        )
    }

    fun signOut() {
        viewModelScope.launch {
            repository.signOut()
            mutableLocalState.value = ParentLocalState()
        }
    }
}

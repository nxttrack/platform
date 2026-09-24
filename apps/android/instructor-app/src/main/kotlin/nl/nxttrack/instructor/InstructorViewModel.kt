package nl.nxttrack.instructor

import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import kotlinx.coroutines.flow.MutableSharedFlow
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.asSharedFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import nl.nxttrack.mobile.data.DownloadedFile
import nl.nxttrack.mobile.data.MobileRuntime

enum class InstructorPage(val title: String, val primaryDestination: String) {
    TODAY("Vandaag", "today"),
    AGENDA("Agenda", "agenda"),
    GROUPS("Groepen", "groups"),
    LEARNERS("Leerlingen", "learners"),
    INBOX("Inbox", "inbox"),
    SESSION("Lesregistratie", "today"),
    LEARNER("Leerling", "learners"),
    TASKS("Taken", "today"),
    DOCUMENTS("Documenten", "today"),
    PROFILE("Profiel", "today")
}

data class InstructorLocalState(
    val page: InstructorPage = InstructorPage.TODAY,
    val selectedSessionId: String? = null,
    val selectedLearnerId: String? = null,
    val selectedThreadId: String? = null,
    val email: String = "",
    val password: String = "",
    val loginError: String? = null
)

sealed interface InstructorEvent {
    data class DownloadReady(val file: DownloadedFile) : InstructorEvent
    data class Error(val code: String) : InstructorEvent
}

class InstructorViewModel : ViewModel() {
    private val repository = MobileRuntime.requireRepository()
    val repositoryState = repository.state
    private val mutableLocalState = MutableStateFlow(InstructorLocalState())
    val localState = mutableLocalState.asStateFlow()
    private val mutableEvents = MutableSharedFlow<InstructorEvent>()
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

    fun navigate(page: InstructorPage) {
        mutableLocalState.value = mutableLocalState.value.copy(
            page = page,
            selectedLearnerId = null,
            selectedSessionId = null,
            selectedThreadId = if (page == InstructorPage.INBOX) {
                mutableLocalState.value.selectedThreadId
            } else {
                null
            }
        )
    }

    fun navigatePrimary(id: String) {
        navigate(
            when (id) {
                "agenda" -> InstructorPage.AGENDA
                "groups" -> InstructorPage.GROUPS
                "learners" -> InstructorPage.LEARNERS
                "inbox" -> InstructorPage.INBOX
                else -> InstructorPage.TODAY
            }
        )
    }

    fun openSession(id: String) {
        mutableLocalState.value = mutableLocalState.value.copy(
            page = InstructorPage.SESSION,
            selectedSessionId = id
        )
    }

    fun openLearner(id: String) {
        mutableLocalState.value = mutableLocalState.value.copy(
            page = InstructorPage.LEARNER,
            selectedLearnerId = id
        )
    }

    fun selectThread(id: String?) {
        mutableLocalState.value = mutableLocalState.value.copy(
            selectedThreadId = id
        )
    }

    fun markAttendance(
        sessionId: String,
        participantId: String,
        status: String
    ) {
        repository.markAttendance(sessionId, participantId, status)
    }

    fun assess(
        participantId: String,
        enrollmentId: String,
        curriculumItemId: String,
        rating: Int,
        note: String?,
        visibility: String,
        sessionId: String?
    ) {
        repository.finalizeAssessment(
            participantId = participantId,
            enrollmentId = enrollmentId,
            curriculumItemId = curriculumItemId,
            rating = rating,
            note = note,
            visibility = visibility,
            sessionId = sessionId
        )
    }

    fun reply(threadId: String, plainText: String) {
        repository.replyToThread(threadId, plainText)
    }

    fun markNotificationRead(id: String) {
        repository.markNotificationRead(id)
    }

    fun refresh() {
        viewModelScope.launch { repository.synchronize() }
    }

    fun download(path: String) {
        viewModelScope.launch {
            runCatching { repository.download(path) }
                .onSuccess {
                    mutableEvents.emit(InstructorEvent.DownloadReady(it))
                }
                .onFailure {
                    mutableEvents.emit(InstructorEvent.Error("download_failed"))
                }
        }
    }

    fun signOut() {
        viewModelScope.launch {
            repository.signOut()
            mutableLocalState.value = InstructorLocalState()
        }
    }
}

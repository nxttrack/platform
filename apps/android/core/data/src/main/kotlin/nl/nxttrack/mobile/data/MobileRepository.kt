package nl.nxttrack.mobile.data

import android.content.Context
import androidx.work.Constraints
import androidx.work.ExistingPeriodicWorkPolicy
import androidx.work.ExistingWorkPolicy
import androidx.work.NetworkType
import androidx.work.OneTimeWorkRequestBuilder
import androidx.work.PeriodicWorkRequestBuilder
import androidx.work.WorkManager
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.sync.Mutex
import kotlinx.coroutines.sync.withLock
import kotlinx.coroutines.withContext
import nl.nxttrack.mobile.domain.ClientKind
import nl.nxttrack.mobile.domain.MobileSession
import nl.nxttrack.mobile.domain.MobileSnapshot
import nl.nxttrack.mobile.domain.PendingMutation
import nl.nxttrack.mobile.domain.RepositoryState
import nl.nxttrack.mobile.domain.SyncState
import org.json.JSONObject
import java.io.File
import java.time.Instant
import java.util.UUID
import java.util.concurrent.TimeUnit

class MobileRepository internal constructor(
    context: Context,
    private val baseUrl: String,
    val client: ClientKind
) {
    private val appContext = context.applicationContext
    private val namespace = client.wireValue
    private val sessionStore = SecureSessionStore(appContext, namespace)
    private val database = EncryptedMobileDatabase(appContext, namespace)
    private val api = NativeApi(baseUrl, client)
    private val scope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private val syncMutex = Mutex()
    private val mutableState = MutableStateFlow(RepositoryState())
    val state: StateFlow<RepositoryState> = mutableState.asStateFlow()

    init {
        scope.launch {
            restore()
            if (mutableState.value.session != null) synchronize()
        }
        schedulePeriodicSync()
    }

    suspend fun signIn(email: String, password: String): Result<Unit> =
        withContext(Dispatchers.IO) {
            if (
                email.length !in 3..320 ||
                !email.contains('@') ||
                password.length !in 8..1_024
            ) {
                return@withContext Result.failure(
                    NativeApiException("invalid_credentials", 400, false)
                )
            }
            mutableState.value = mutableState.value.copy(
                errorCode = null,
                isLoading = true,
                syncState = SyncState.SYNCING
            )
            val authentication = runCatching {
                val rawSession = api.signIn(email.trim(), password)
                NativeJsonParser.session(rawSession, client).also {
                    sessionStore.saveRawSession(rawSession)
                }
            }
            authentication.exceptionOrNull()?.let { error ->
                mutableState.value = RepositoryState(
                    errorCode = error.safeCode(),
                    isLoading = false,
                    syncState = if (error.isOffline()) {
                        SyncState.OFFLINE
                    } else {
                        SyncState.ERROR
                    }
                )
                return@withContext Result.failure(error)
            }
            mutableState.value = RepositoryState(
                session = authentication.getOrThrow(),
                isLoading = true,
                syncState = SyncState.SYNCING
            )
            synchronize()
        }

    suspend fun signOut() = withContext(Dispatchers.IO) {
        val session = mutableState.value.session
        if (session != null) runCatching { api.signOut(session) }
        database.clearUserData()
        sessionStore.clear()
        File(appContext.cacheDir, "native-documents").deleteRecursively()
        mutableState.value = RepositoryState(isLoading = false)
    }

    suspend fun synchronize(): Result<Unit> = withContext(Dispatchers.IO) {
        syncMutex.withLock {
            val initialSession = mutableState.value.session
                ?: return@withLock Result.failure(
                    NativeApiException("unauthorized", 401, false)
                )
            var activeSession = initialSession
            mutableState.value = mutableState.value.copy(
                errorCode = null,
                isLoading = mutableState.value.snapshot == null,
                syncState = SyncState.SYNCING
            )
            runCatching {
                activeSession = ensureFreshSession(activeSession)
                activeSession = flushMutations(activeSession)
                val bootstrapResult = callWithAuthRetry(activeSession) {
                    api.bootstrap(it)
                }
                activeSession = bootstrapResult.session
                val rawBootstrap = bootstrapResult.value
                val snapshot = parseSnapshot(rawBootstrap, activeSession)
                database.saveBootstrap(
                    bootstrapCacheKey(activeSession),
                    contractVersion = 1,
                    json = rawBootstrap
                )
                cacheValidatedTheme(rawBootstrap, activeSession)
                mutableState.value = RepositoryState(
                    session = activeSession,
                    snapshot = snapshot,
                    syncState = SyncState.IDLE,
                    pendingMutationCount = database.pendingCount(),
                    isLoading = false,
                    isUsingOfflineCache = false
                )
            }.onFailure { error ->
                val unauthorized =
                    error is NativeApiException && error.status == 401
                if (unauthorized) sessionStore.clear()
                val cached = loadCachedSnapshot(activeSession)
                mutableState.value = mutableState.value.copy(
                    session = if (unauthorized) null else activeSession,
                    snapshot = cached ?: mutableState.value.snapshot,
                    syncState = if (error.isOffline()) {
                        SyncState.OFFLINE
                    } else {
                        SyncState.ERROR
                    },
                    pendingMutationCount = database.pendingCount(),
                    isLoading = false,
                    errorCode = if (unauthorized) {
                        "session_expired"
                    } else {
                        error.safeCode()
                    },
                    isUsingOfflineCache = cached != null
                )
            }
        }
    }

    fun markAttendance(
        sessionId: String,
        participantId: String,
        status: String,
        note: String? = null
    ) = enqueueCommand(
        "attendance.mark",
        JSONObject()
            .put("sessionId", sessionId)
            .put("participantId", participantId)
            .put("status", status)
            .put("note", note ?: JSONObject.NULL)
    )

    fun finalizeAssessment(
        participantId: String,
        enrollmentId: String,
        curriculumItemId: String,
        rating: Int,
        visibility: String = "parent_visible",
        sessionId: String? = null,
        note: String? = null,
        observedAt: Instant = Instant.now(),
        correctsObservationId: String? = null,
        correctionReason: String? = null
    ) {
        require(rating in 1..5)
        enqueueCommand(
            "assessment.finalize",
            JSONObject()
                .put("participantId", participantId)
                .put("enrollmentId", enrollmentId)
                .put("curriculumItemId", curriculumItemId)
                .put("rating", rating)
                .put("visibility", visibility)
                .put("sessionId", sessionId ?: JSONObject.NULL)
                .put("note", note ?: JSONObject.NULL)
                .put("observedAt", observedAt.toString())
                .put(
                    "correctsObservationId",
                    correctsObservationId ?: JSONObject.NULL
                )
                .put("correctionReason", correctionReason ?: JSONObject.NULL)
        )
    }

    fun cancelLesson(
        sessionId: String,
        participantId: String,
        reason: String?
    ) = enqueueCommand(
        "lesson.cancel",
        JSONObject()
            .put("sessionId", sessionId)
            .put("participantId", participantId)
            .put("reason", reason ?: JSONObject.NULL)
    )

    fun respondToGraduationInvite(
        eventParticipantId: String,
        response: String
    ) {
        require(response == "confirmed" || response == "declined")
        enqueueCommand(
            "graduation.respond",
            JSONObject()
                .put("eventParticipantId", eventParticipantId)
                .put("response", response)
        )
    }

    fun markNotificationRead(notificationId: String) = enqueueCommand(
        "notification.read",
        JSONObject().put("notificationId", notificationId)
    )

    fun replyToThread(threadId: String, plainText: String) {
        require(plainText.trim().length in 1..8_000)
        enqueueCommand(
            "message.reply",
            JSONObject()
                .put("threadId", threadId)
                .put("plainText", plainText.trim())
                .put("humanConfirmed", true)
        )
    }

    fun recordMediaConsent(
        participantId: String,
        decision: String,
        authority: String = "guardian"
    ) {
        require(decision in listOf("granted", "denied", "withdrawn"))
        require(authority in listOf("guardian", "legal_representative"))
        enqueueCommand(
            "media.consent",
            JSONObject()
                .put("participantId", participantId)
                .put("decision", decision)
                .put("authority", authority)
                .put("humanConfirmed", true)
        )
    }

    fun submitFeedback(
        requestId: String,
        score: Int,
        comment: String?,
        followUpAllowed: Boolean
    ) {
        require(score in 0..10)
        require(comment == null || comment.length <= 2_000)
        enqueueCommand(
            "feedback.submit",
            JSONObject()
                .put("requestId", requestId)
                .put("score", score)
                .put("comment", comment?.trim()?.ifBlank { null } ?: JSONObject.NULL)
                .put("followUpAllowed", followUpAllowed)
                .put("humanConfirmed", true)
        )
    }

    suspend fun download(internalPath: String): DownloadedFile =
        withContext(Dispatchers.IO) {
            val session = mutableState.value.session
                ?: throw NativeApiException("unauthorized", 401, false)
            val result = callWithAuthRetry(ensureFreshSession(session)) {
                api.download(it, internalPath)
            }
            mutableState.value = mutableState.value.copy(session = result.session)
            result.value
        }

    internal suspend fun runBackgroundSync(): Result<Unit> {
        if (mutableState.value.session == null) return Result.success(Unit)
        val result = synchronize()
        return if (mutableState.value.session == null) Result.success(Unit) else result
    }

    private suspend fun restore() {
        val rawSession = sessionStore.readRawSession()
        if (rawSession == null) {
            mutableState.value = RepositoryState(isLoading = false)
            return
        }
        val session = runCatching {
            NativeJsonParser.session(rawSession, client)
        }.getOrElse {
            sessionStore.clear()
            database.clearUserData()
            mutableState.value = RepositoryState(
                errorCode = "session_cache_invalid",
                isLoading = false
            )
            return
        }
        mutableState.value = RepositoryState(
            session = session,
            snapshot = loadCachedSnapshot(session),
            syncState = SyncState.IDLE,
            pendingMutationCount = database.pendingCount(),
            isLoading = false,
            isUsingOfflineCache = true
        )
    }

    private fun enqueueCommand(type: String, payload: JSONObject) {
        check(mutableState.value.session != null) { "Sign-in required" }
        database.enqueue(
            PendingMutation(
                commandId = UUID.randomUUID().toString(),
                client = client,
                deviceId = sessionStore.deviceId(),
                type = type,
                payloadJson = payload.toString(),
                createdAtEpochMs = System.currentTimeMillis()
            )
        )
        mutableState.value = mutableState.value.copy(
            pendingMutationCount = database.pendingCount()
        )
        scheduleImmediateSync()
        scope.launch { synchronize() }
    }

    private fun ensureFreshSession(session: MobileSession): MobileSession {
        val expiresAt = session.tokens.expiresAtEpochSeconds ?: return session
        if (expiresAt - Instant.now().epochSecond > REFRESH_MARGIN_SECONDS) {
            return session
        }
        return refreshSession(session)
    }

    private fun refreshSession(session: MobileSession): MobileSession {
        val rawSession = api.refresh(session)
        val refreshed = NativeJsonParser.session(rawSession, client)
        sessionStore.saveRawSession(rawSession)
        mutableState.value = mutableState.value.copy(session = refreshed)
        return refreshed
    }

    private fun flushMutations(session: MobileSession): MobileSession {
        var activeSession = session
        for (mutation in database.pending()) {
            try {
                val result = callWithAuthRetry(activeSession) {
                    api.submit(it, mutation)
                }
                activeSession = result.session
                database.removeMutation(mutation.commandId)
            } catch (error: NativeApiException) {
                database.markAttempt(mutation.commandId, error.errorCode)
                if (error.status == 401) throw error
                if (!error.retryable) {
                    database.removeMutation(mutation.commandId)
                    mutableState.value = mutableState.value.copy(
                        errorCode = error.errorCode
                    )
                    continue
                }
                throw error
            }
        }
        return activeSession
    }

    private fun <T> callWithAuthRetry(
        session: MobileSession,
        call: (MobileSession) -> T
    ): AuthenticatedResult<T> = try {
        AuthenticatedResult(session, call(session))
    } catch (error: NativeApiException) {
        if (error.status != 401) throw error
        val refreshed = refreshSession(session)
        AuthenticatedResult(refreshed, call(refreshed))
    }

    private fun parseSnapshot(
        rawBootstrap: String,
        session: MobileSession
    ): MobileSnapshot = when (client) {
        ClientKind.PARENT -> MobileSnapshot.Parent(
            NativeJsonParser.parentBootstrap(
                rawBootstrap,
                session,
                fallbackThemeJson = {
                    appContext.assets.open(DEFAULT_THEME_ASSET)
                        .bufferedReader()
                        .use { it.readText() }
                }
            )
        )
        ClientKind.INSTRUCTOR -> MobileSnapshot.Instructor(
            NativeJsonParser.instructorBootstrap(rawBootstrap, session)
        )
    }

    private fun loadCachedSnapshot(session: MobileSession): MobileSnapshot? =
        database.readBootstrap(bootstrapCacheKey(session))?.let { raw ->
            runCatching { parseSnapshot(raw, session) }.getOrNull()
        }

    private fun cacheValidatedTheme(rawBootstrap: String, session: MobileSession) {
        if (client != ClientKind.PARENT) return
        val rawTheme = runCatching {
            JSONObject(rawBootstrap).getJSONObject("theme")
        }.getOrNull() ?: return
        val theme = runCatching { NativeJsonParser.theme(rawTheme) }.getOrNull()
            ?: return
        database.saveBootstrap(
            "${session.tenant.id}+${theme.themeKey}+${theme.release}",
            theme.schemaVersion,
            rawTheme.toString()
        )
    }

    private fun bootstrapCacheKey(session: MobileSession) =
        "bootstrap:${client.wireValue}:${session.tenant.id}"

    private fun scheduleImmediateSync() {
        val request = OneTimeWorkRequestBuilder<MobileSyncWorker>()
            .setConstraints(networkConstraints())
            .build()
        WorkManager.getInstance(appContext).enqueueUniqueWork(
            "nxttrack-${client.wireValue}-immediate-sync",
            ExistingWorkPolicy.KEEP,
            request
        )
    }

    private fun schedulePeriodicSync() {
        val request = PeriodicWorkRequestBuilder<MobileSyncWorker>(
            15,
            TimeUnit.MINUTES
        )
            .setConstraints(networkConstraints())
            .build()
        WorkManager.getInstance(appContext).enqueueUniquePeriodicWork(
            "nxttrack-${client.wireValue}-periodic-sync",
            ExistingPeriodicWorkPolicy.KEEP,
            request
        )
    }

    private fun networkConstraints() = Constraints.Builder()
        .setRequiredNetworkType(NetworkType.CONNECTED)
        .build()

    private fun Throwable.safeCode() =
        (this as? NativeApiException)?.errorCode ?: "sync_unavailable"

    private fun Throwable.isOffline() =
        this is java.io.IOException ||
            (this is NativeApiException && retryable && status == 0)

    private data class AuthenticatedResult<T>(
        val session: MobileSession,
        val value: T
    )

    private companion object {
        const val REFRESH_MARGIN_SECONDS = 5 * 60L
        const val DEFAULT_THEME_ASSET = "nxttrack-default-3.0.0.json"
    }
}

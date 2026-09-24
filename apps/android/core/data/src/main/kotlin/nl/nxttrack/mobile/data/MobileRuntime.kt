package nl.nxttrack.mobile.data

import android.content.Context
import androidx.work.CoroutineWorker
import androidx.work.WorkerParameters
import nl.nxttrack.mobile.domain.ClientKind

object MobileRuntime {
    @Volatile
    private var repository: MobileRepository? = null

    fun initialize(
        context: Context,
        apiBaseUrl: String,
        client: ClientKind
    ): MobileRepository = synchronized(this) {
        repository ?: MobileRepository(
            context.applicationContext,
            apiBaseUrl,
            client
        ).also { repository = it }
    }

    fun requireRepository(): MobileRepository =
        checkNotNull(repository) {
            "MobileRuntime must be initialized by Application"
        }
}

class MobileSyncWorker(
    appContext: Context,
    workerParameters: WorkerParameters
) : CoroutineWorker(appContext, workerParameters) {
    override suspend fun doWork(): Result {
        val result = MobileRuntime.requireRepository().runBackgroundSync()
        return if (result.isSuccess) Result.success() else Result.retry()
    }
}

package nl.nxttrack.instructor

import android.app.Application
import nl.nxttrack.mobile.data.MobileRuntime
import nl.nxttrack.mobile.domain.ClientKind

class NxttrackInstructorApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        MobileRuntime.initialize(
            context = this,
            apiBaseUrl = BuildConfig.API_BASE_URL,
            client = ClientKind.INSTRUCTOR
        )
    }
}

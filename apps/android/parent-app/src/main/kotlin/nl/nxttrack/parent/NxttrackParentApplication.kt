package nl.nxttrack.parent

import android.app.Application
import nl.nxttrack.mobile.data.MobileRuntime
import nl.nxttrack.mobile.domain.ClientKind

class NxttrackParentApplication : Application() {
    override fun onCreate() {
        super.onCreate()
        MobileRuntime.initialize(
            context = this,
            apiBaseUrl = BuildConfig.API_BASE_URL,
            client = ClientKind.PARENT
        )
    }
}

package nl.nxttrack.parent

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import androidx.activity.viewModels
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import nl.nxttrack.mobile.design.LoadingScreen
import nl.nxttrack.mobile.design.NativeLoginScreen
import nl.nxttrack.mobile.design.NxttrackTheme
import nl.nxttrack.mobile.domain.MobileSnapshot

class MainActivity : ComponentActivity() {
    private val viewModel by viewModels<ParentViewModel>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val repositoryState by viewModel.repositoryState
                .collectAsStateWithLifecycle()
            val localState by viewModel.localState.collectAsStateWithLifecycle()
            val parent = (repositoryState.snapshot as? MobileSnapshot.Parent)?.value

            NxttrackTheme(theme = parent?.theme) {
                LaunchedEffect(Unit) {
                    viewModel.events.collect { event ->
                        when (event) {
                            is ParentEvent.DownloadReady ->
                                NativeFileActions.openDownloaded(
                                    this@MainActivity,
                                    event.file
                                )
                            is ParentEvent.ShareBadgeReady ->
                                NativeFileActions.shareBadge(
                                    this@MainActivity,
                                    event.badge,
                                    event.artwork
                                )
                            is ParentEvent.Error -> Toast.makeText(
                                this@MainActivity,
                                if (event.code == "share_unavailable") {
                                    "Deze badge kan nog niet worden gedeeld."
                                } else {
                                    "Document kon niet veilig worden geopend."
                                },
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    }
                }

                when {
                    repositoryState.session == null -> NativeLoginScreen(
                        title = "Ouderportaal",
                        subtitle = "Planning, zwemreis, badges en betalingen in één veilige app.",
                        email = localState.email,
                        password = localState.password,
                        isLoading = repositoryState.isLoading,
                        errorMessage = localState.loginError,
                        onEmail = viewModel::setEmail,
                        onPassword = viewModel::setPassword,
                        onSubmit = viewModel::signIn
                    )
                    parent == null && repositoryState.isLoading ->
                        LoadingScreen()
                    parent == null -> NativeUnavailableScreen(
                        errorCode = repositoryState.errorCode,
                        onRetry = viewModel::refresh,
                        onSignOut = viewModel::signOut
                    )
                    else -> ParentShell(
                        data = parent,
                        repositoryState = repositoryState,
                        localState = localState,
                        viewModel = viewModel,
                        onShareBadge = viewModel::shareBadge
                    )
                }
            }
        }
    }
}

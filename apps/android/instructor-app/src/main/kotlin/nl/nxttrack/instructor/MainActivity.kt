package nl.nxttrack.instructor

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
    private val viewModel by viewModels<InstructorViewModel>()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        setContent {
            val repositoryState by viewModel.repositoryState
                .collectAsStateWithLifecycle()
            val localState by viewModel.localState.collectAsStateWithLifecycle()
            val instructor =
                (repositoryState.snapshot as? MobileSnapshot.Instructor)?.value

            NxttrackTheme {
                LaunchedEffect(Unit) {
                    viewModel.events.collect { event ->
                        when (event) {
                            is InstructorEvent.DownloadReady ->
                                InstructorFileActions.openDownloaded(
                                    this@MainActivity,
                                    event.file
                                )
                            is InstructorEvent.Error -> Toast.makeText(
                                this@MainActivity,
                                "Document kon niet veilig worden geopend.",
                                Toast.LENGTH_LONG
                            ).show()
                        }
                    }
                }

                when {
                    repositoryState.session == null -> NativeLoginScreen(
                        title = "Instructeurapp",
                        subtitle = "Poolside aanwezigheden en vijfpuntsbeoordelingen, ook offline.",
                        email = localState.email,
                        password = localState.password,
                        isLoading = repositoryState.isLoading,
                        errorMessage = localState.loginError,
                        onEmail = viewModel::setEmail,
                        onPassword = viewModel::setPassword,
                        onSubmit = viewModel::signIn
                    )
                    instructor == null && repositoryState.isLoading ->
                        LoadingScreen("Lesgegevens veilig laden")
                    instructor == null -> InstructorUnavailableScreen(
                        repositoryState.errorCode,
                        viewModel::refresh,
                        viewModel::signOut
                    )
                    else -> InstructorShell(
                        data = instructor,
                        repositoryState = repositoryState,
                        localState = localState,
                        viewModel = viewModel
                    )
                }
            }
        }
    }
}

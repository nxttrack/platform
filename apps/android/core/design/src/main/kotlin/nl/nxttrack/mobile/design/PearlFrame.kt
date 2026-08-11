package nl.nxttrack.mobile.design

import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.safeDrawingPadding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CloudDone
import androidx.compose.material.icons.filled.CloudOff
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.Badge
import androidx.compose.material3.BadgedBox
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationRail
import androidx.compose.material3.NavigationRailItem
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.material3.TopAppBar
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.unit.dp
import nl.nxttrack.mobile.domain.SyncState

data class PearlDestination(
    val id: String,
    val label: String,
    val icon: ImageVector
)

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun PearlFrame(
    title: String,
    destinations: List<PearlDestination>,
    selectedId: String,
    onDestinationSelected: (String) -> Unit,
    syncState: SyncState,
    pendingCount: Int,
    onSync: () -> Unit,
    content: @Composable (Modifier) -> Unit
) {
    require(destinations.size in 1..5)
    BoxWithConstraints(
        modifier = Modifier
            .fillMaxSize()
            .safeDrawingPadding()
    ) {
        val expanded = maxWidth >= 840.dp
        if (expanded) {
            Row(Modifier.fillMaxSize()) {
                NavigationRail {
                    destinations.forEach { destination ->
                        NavigationRailItem(
                            selected = destination.id == selectedId,
                            onClick = { onDestinationSelected(destination.id) },
                            icon = {
                                DestinationIcon(
                                    destination = destination,
                                    pendingCount = pendingCount
                                )
                            },
                            label = { Text(destination.label) }
                        )
                    }
                }
                Scaffold(
                    modifier = Modifier.weight(1f),
                    topBar = {
                        TopAppBar(
                            title = { Text(title) },
                            actions = {
                                SyncAction(syncState, onSync)
                            }
                        )
                    }
                ) { padding ->
                    content(Modifier.padding(padding))
                }
            }
        } else {
            Scaffold(
                topBar = {
                    TopAppBar(
                        title = { Text(title) },
                        actions = {
                            SyncAction(syncState, onSync)
                        }
                    )
                },
                bottomBar = {
                    NavigationBar {
                        destinations.forEach { destination ->
                            NavigationBarItem(
                                selected = destination.id == selectedId,
                                onClick = {
                                    onDestinationSelected(destination.id)
                                },
                                icon = {
                                    DestinationIcon(
                                        destination = destination,
                                        pendingCount = pendingCount
                                    )
                                },
                                label = { Text(destination.label) }
                            )
                        }
                    }
                }
            ) { padding ->
                content(Modifier.padding(padding))
            }
        }
    }
}

@Composable
private fun DestinationIcon(
    destination: PearlDestination,
    pendingCount: Int
) {
    if (destination.id == "sync" && pendingCount > 0) {
        BadgedBox(
            badge = {
                Badge {
                    Text(pendingCount.coerceAtMost(99).toString())
                }
            }
        ) {
            Icon(destination.icon, contentDescription = null)
        }
    } else {
        Icon(destination.icon, contentDescription = null)
    }
}

@Composable
private fun SyncAction(syncState: SyncState, onSync: () -> Unit) {
    IconButton(onClick = onSync) {
        val icon = when (syncState) {
            SyncState.SYNCING -> Icons.Default.Sync
            SyncState.OFFLINE, SyncState.ERROR -> Icons.Default.CloudOff
            SyncState.IDLE -> Icons.Default.CloudDone
        }
        Icon(
            imageVector = icon,
            contentDescription = when (syncState) {
                SyncState.SYNCING -> "Synchroniseren"
                SyncState.OFFLINE -> "Offline, opnieuw proberen"
                SyncState.ERROR -> "Synchronisatie mislukt, opnieuw proberen"
                SyncState.IDLE -> "Gesynchroniseerd, opnieuw laden"
            }
        )
    }
}

package nl.nxttrack.instructor

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Groups
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.People
import androidx.compose.material.icons.filled.Today
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import nl.nxttrack.mobile.design.EmptyState
import nl.nxttrack.mobile.design.FivePointScore
import nl.nxttrack.mobile.design.NxtCard
import nl.nxttrack.mobile.design.PearlDestination
import nl.nxttrack.mobile.design.PearlFrame
import nl.nxttrack.mobile.design.PrimaryAction
import nl.nxttrack.mobile.design.ProgressRing
import nl.nxttrack.mobile.design.SectionHeading
import nl.nxttrack.mobile.domain.InstructorBootstrap
import nl.nxttrack.mobile.domain.InstructorLearner
import nl.nxttrack.mobile.domain.InstructorSession
import nl.nxttrack.mobile.domain.JourneyItem
import nl.nxttrack.mobile.domain.JourneyPresentation
import nl.nxttrack.mobile.domain.RepositoryState
import java.time.LocalDate
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private val destinations = listOf(
    PearlDestination("today", "Vandaag", Icons.Default.Today),
    PearlDestination("agenda", "Agenda", Icons.Default.CalendarMonth),
    PearlDestination("groups", "Groepen", Icons.Default.Groups),
    PearlDestination("learners", "Leerlingen", Icons.Default.People),
    PearlDestination("inbox", "Inbox", Icons.Default.Mail)
)

@Composable
fun InstructorShell(
    data: InstructorBootstrap,
    repositoryState: RepositoryState,
    localState: InstructorLocalState,
    viewModel: InstructorViewModel
) {
    PearlFrame(
        title = localState.page.title,
        destinations = destinations,
        selectedId = localState.page.primaryDestination,
        onDestinationSelected = viewModel::navigatePrimary,
        syncState = repositoryState.syncState,
        pendingCount = repositoryState.pendingMutationCount,
        onSync = viewModel::refresh
    ) { contentModifier ->
        when (localState.page) {
            InstructorPage.TODAY -> TodayScreen(
                data,
                repositoryState,
                contentModifier,
                viewModel
            )
            InstructorPage.AGENDA -> AgendaScreen(
                data,
                contentModifier,
                viewModel
            )
            InstructorPage.GROUPS -> GroupsScreen(
                data,
                contentModifier,
                viewModel
            )
            InstructorPage.LEARNERS -> LearnersScreen(
                data,
                contentModifier,
                viewModel
            )
            InstructorPage.INBOX -> InstructorInboxScreen(
                data,
                localState,
                contentModifier,
                viewModel
            )
            InstructorPage.SESSION -> SessionScreen(
                data,
                localState.selectedSessionId,
                contentModifier,
                viewModel
            )
            InstructorPage.LEARNER -> LearnerScreen(
                data,
                localState.selectedLearnerId,
                localState.selectedSessionId,
                contentModifier,
                viewModel
            )
            InstructorPage.TASKS -> TasksScreen(data, contentModifier)
            InstructorPage.DOCUMENTS -> InstructorDocumentsScreen(
                data,
                contentModifier,
                viewModel
            )
            InstructorPage.PROFILE -> InstructorProfileScreen(
                repositoryState,
                contentModifier,
                viewModel
            )
        }
    }
}

@Composable
private fun TodayScreen(
    data: InstructorBootstrap,
    repositoryState: RepositoryState,
    modifier: Modifier,
    viewModel: InstructorViewModel
) {
    val today = LocalDate.now()
    val todaySessions = data.sessions.filter {
        runCatching { OffsetDateTime.parse(it.startsAt).toLocalDate() == today }
            .getOrDefault(false)
    }
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            SectionHeading(
                "Poolside overzicht",
                if (repositoryState.pendingMutationCount > 0) {
                    "${repositoryState.pendingMutationCount} acties staan versleuteld klaar voor sync."
                } else {
                    "Alle acties zijn gesynchroniseerd."
                }
            )
        }
        if (todaySessions.isEmpty()) {
            item {
                EmptyState("Geen lessen vandaag", "Bekijk de agenda voor andere dagen.")
            }
        } else {
            items(todaySessions, key = { it.id }) { session ->
                InstructorSessionCard(session) {
                    viewModel.openSession(session.id)
                }
            }
        }
        item { SectionHeading("Werkvoorraad") }
        item {
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedButton(
                    onClick = { viewModel.navigate(InstructorPage.TASKS) },
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Taken (${data.tasks.count { it.status != "completed" }})")
                }
                OutlinedButton(
                    onClick = { viewModel.navigate(InstructorPage.DOCUMENTS) },
                    modifier = Modifier.weight(1f)
                ) {
                    Text("Documenten")
                }
            }
        }
        if (data.announcements.isNotEmpty()) {
            item { SectionHeading("Mededelingen") }
            items(data.announcements, key = { it.id }) { announcement ->
                NxtCard(Modifier.fillMaxWidth()) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(announcement.title, fontWeight = FontWeight.Bold)
                        Text(announcement.body)
                    }
                }
            }
        }
        item {
            TextButton(onClick = { viewModel.navigate(InstructorPage.PROFILE) }) {
                Text("Profiel en uitloggen")
            }
        }
    }
}

@Composable
private fun AgendaScreen(
    data: InstructorBootstrap,
    modifier: Modifier,
    viewModel: InstructorViewModel
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            SectionHeading(
                "Agenda",
                "Gestructureerde locaties, lestijden en toegewezen groepen."
            )
        }
        if (data.sessions.isEmpty()) {
            item { EmptyState("Lege agenda", "Er zijn geen lessen toegewezen.") }
        }
        items(data.sessions, key = { it.id }) { session ->
            InstructorSessionCard(session) { viewModel.openSession(session.id) }
        }
    }
}

@Composable
private fun GroupsScreen(
    data: InstructorBootstrap,
    modifier: Modifier,
    viewModel: InstructorViewModel
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item { SectionHeading("Mijn groepen") }
        if (data.groups.isEmpty()) {
            item { EmptyState("Geen groepen", "Er zijn geen groepen toegewezen.") }
        }
        items(data.groups, key = { it.id }) { group ->
            NxtCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(group.name, fontWeight = FontWeight.Bold)
                    Text("${group.roster.size} van ${group.capacity} leerlingen")
                    Text(statusLabel(group.status))
                    group.roster.take(6).forEach { member ->
                        TextButton(onClick = {
                            viewModel.openLearner(member.participantId)
                        }) {
                            Text(member.participantName)
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun LearnersScreen(
    data: InstructorBootstrap,
    modifier: Modifier,
    viewModel: InstructorViewModel
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item {
            SectionHeading(
                "Leerlingen",
                "Beoordelingen zijn altijd 1–5 of nog niet beoordeeld."
            )
        }
        if (data.learners.isEmpty()) {
            item {
                EmptyState("Geen leerlingen", "Er zijn geen actieve leerlingen toegewezen.")
            }
        }
        items(data.learners, key = { it.id }) { learner ->
            Card(onClick = { viewModel.openLearner(learner.id) }) {
                Column(Modifier.padding(16.dp)) {
                    Text(learner.displayName, fontWeight = FontWeight.Bold)
                    Text(learner.journey?.stageName ?: "Geen huidig badje")
                }
            }
        }
    }
}

@Composable
private fun SessionScreen(
    data: InstructorBootstrap,
    sessionId: String?,
    modifier: Modifier,
    viewModel: InstructorViewModel
) {
    val session = data.sessions.firstOrNull { it.id == sessionId }
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (session == null) {
            item {
                EmptyState("Les niet gevonden", "Ververs de agenda en probeer opnieuw.")
            }
        } else {
            item {
                SectionHeading(
                    session.groupName,
                    "${formatMoment(session.startsAt)} · ${session.resourceName ?: "Locatie volgt"}"
                )
            }
            items(session.roster, key = { it.participantId }) { member ->
                NxtCard(Modifier.fillMaxWidth()) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(member.participantName, fontWeight = FontWeight.Bold)
                            Text(attendanceLabel(member.attendance))
                        }
                        AttendanceChoices(
                            selected = member.attendance,
                            onSelect = {
                                viewModel.markAttendance(
                                    session.id,
                                    member.participantId,
                                    it
                                )
                            }
                        )
                        TextButton(onClick = {
                            viewModel.openLearner(member.participantId)
                        }) { Text("Beoordelen") }
                    }
                }
            }
        }
    }
}

@Composable
private fun AttendanceChoices(
    selected: String?,
    onSelect: (String) -> Unit
) {
    val choices = listOf(
        "present" to "Aanwezig",
        "absent" to "Afwezig",
        "late" to "Te laat",
        "excused" to "Afmeld"
    )
    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
        choices.chunked(2).forEach { row ->
            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                row.forEach { (value, label) ->
                    if (selected == value) {
                        Button(
                            onClick = { onSelect(value) },
                            modifier = Modifier.weight(1f)
                        ) { Text(label) }
                    } else {
                        OutlinedButton(
                            onClick = { onSelect(value) },
                            modifier = Modifier.weight(1f)
                        ) { Text(label) }
                    }
                }
            }
        }
    }
}

@Composable
private fun LearnerScreen(
    data: InstructorBootstrap,
    learnerId: String?,
    sessionId: String?,
    modifier: Modifier,
    viewModel: InstructorViewModel
) {
    val learner = data.learners.firstOrNull { it.id == learnerId }
    var selectedItem by remember { mutableStateOf<JourneyItem?>(null) }
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        if (learner == null) {
            item {
                EmptyState("Leerling niet gevonden", "Ververs en probeer opnieuw.")
            }
        } else {
            item {
                SectionHeading(
                    learner.displayName,
                    learner.journey?.stageName ?: "Geen actieve leerlijn"
                )
            }
            val journey = learner.journey
            if (journey == null || learner.enrollmentId == null) {
                item {
                    EmptyState(
                        "Geen leerlijn",
                        "Een beheerder moet eerst een curriculumversie koppelen."
                    )
                }
            } else {
                item {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceEvenly
                    ) {
                        JourneyPresentation.visibleRings(journey.rings)
                            .forEach { ProgressRing(it, Modifier.weight(1f)) }
                    }
                }
                items(journey.items, key = { it.id }) { item ->
                    NxtCard(Modifier.fillMaxWidth()) {
                        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                            Text(item.name, fontWeight = FontWeight.Bold)
                            item.description?.let { Text(it) }
                            FivePointScore(
                                rating = item.rating,
                                display = data.assessmentDisplay,
                                readOnly = true
                            )
                            Text(item.positiveLabel ?: "Nog niet beoordeeld")
                            Button(onClick = { selectedItem = item }) {
                                Text("Nieuwe beoordeling")
                            }
                        }
                    }
                }
            }
        }
    }
    val assessmentItem = selectedItem
    val enrollmentId = learner?.enrollmentId
    if (assessmentItem != null && learner != null && enrollmentId != null) {
        AssessmentDialog(
            item = assessmentItem,
            display = data.assessmentDisplay,
            onDismiss = { selectedItem = null },
            onConfirm = { rating, note, visibility ->
                viewModel.assess(
                    participantId = learner.id,
                    enrollmentId = enrollmentId,
                    curriculumItemId = assessmentItem.id,
                    rating = rating,
                    note = note,
                    visibility = visibility,
                    sessionId = sessionId
                )
                selectedItem = null
            }
        )
    }
}

@Composable
private fun AssessmentDialog(
    item: JourneyItem,
    display: nl.nxttrack.mobile.domain.AssessmentDisplay,
    onDismiss: () -> Unit,
    onConfirm: (Int, String?, String) -> Unit
) {
    var rating by remember { mutableIntStateOf(item.rating ?: 3) }
    var note by remember { mutableStateOf("") }
    var parentVisible by remember { mutableStateOf(true) }
    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text(item.name) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                FivePointScore(
                    rating = rating,
                    display = display,
                    readOnly = false,
                    onRating = { rating = it }
                )
                OutlinedTextField(
                    value = note,
                    onValueChange = { note = it.take(2_000) },
                    label = { Text("Notitie (optioneel)") },
                    minLines = 2
                )
                Row(verticalAlignment = Alignment.CenterVertically) {
                    Checkbox(
                        checked = parentVisible,
                        onCheckedChange = { parentVisible = it }
                    )
                    Text("Zichtbaar voor ouder")
                }
                Text(
                    "Deze definitieve observatie wijzigt nooit zelfstandig badje, afzwemstatus of diploma.",
                    style = MaterialTheme.typography.bodySmall
                )
            }
        },
        confirmButton = {
            TextButton(onClick = {
                onConfirm(
                    rating,
                    note.takeIf { it.isNotBlank() },
                    if (parentVisible) "parent_visible" else "internal"
                )
            }) { Text("Definitief opslaan") }
        },
        dismissButton = {
            TextButton(onClick = onDismiss) { Text("Annuleren") }
        }
    )
}

@Composable
private fun InstructorInboxScreen(
    data: InstructorBootstrap,
    localState: InstructorLocalState,
    modifier: Modifier,
    viewModel: InstructorViewModel
) {
    val selectedThread = data.inbox.threads.firstOrNull {
        it.id == localState.selectedThreadId
    }
    var reply by remember(selectedThread?.id) { mutableStateOf("") }
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        if (selectedThread == null) {
            item { SectionHeading("Oudercontact") }
            if (data.inbox.threads.isEmpty()) {
                item {
                    EmptyState("Geen gesprekken", "Toegewezen gesprekken verschijnen hier.")
                }
            }
            items(data.inbox.threads, key = { it.id }) { thread ->
                Card(onClick = { viewModel.selectThread(thread.id) }) {
                    Column(Modifier.padding(16.dp)) {
                        Text(thread.subject, fontWeight = FontWeight.Bold)
                        Text(statusLabel(thread.status))
                        if (thread.unread) {
                            Text("Nieuw", color = MaterialTheme.colorScheme.primary)
                        }
                    }
                }
            }
            if (data.inbox.notifications.isNotEmpty()) {
                item { SectionHeading("Notificaties") }
                items(data.inbox.notifications, key = { it.id }) { notification ->
                    NxtCard(Modifier.fillMaxWidth()) {
                        Column {
                            Text(notification.title, fontWeight = FontWeight.Bold)
                            Text(notification.message)
                            if (notification.status == "unread") {
                                TextButton(onClick = {
                                    viewModel.markNotificationRead(notification.id)
                                }) { Text("Markeer gelezen") }
                            }
                        }
                    }
                }
            }
        } else {
            item {
                TextButton(onClick = { viewModel.selectThread(null) }) {
                    Text("← Alle gesprekken")
                }
            }
            item { SectionHeading(selectedThread.subject) }
            items(
                data.inbox.messages.filter { it.threadId == selectedThread.id },
                key = { it.id }
            ) { message ->
                NxtCard(Modifier.fillMaxWidth()) {
                    Column {
                        Text(message.senderName, fontWeight = FontWeight.Bold)
                        Text(message.body)
                        Text(
                            formatMoment(message.createdAt),
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                }
            }
            if (data.inbox.canReply) {
                item {
                    OutlinedTextField(
                        value = reply,
                        onValueChange = { reply = it.take(8_000) },
                        label = { Text("Antwoord") },
                        modifier = Modifier.fillMaxWidth(),
                        minLines = 3
                    )
                }
                item {
                    PrimaryAction("Bevestig en verstuur") {
                        if (reply.isNotBlank()) {
                            viewModel.reply(selectedThread.id, reply)
                            reply = ""
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun TasksScreen(data: InstructorBootstrap, modifier: Modifier) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item { SectionHeading("Taken") }
        if (data.tasks.isEmpty()) {
            item { EmptyState("Geen taken", "Je werkvoorraad is leeg.") }
        }
        items(data.tasks, key = { it.id }) { task ->
            NxtCard(Modifier.fillMaxWidth()) {
                Column {
                    Text(task.title, fontWeight = FontWeight.Bold)
                    task.description?.let { Text(it) }
                    Text("${priorityLabel(task.priority)} · ${statusLabel(task.status)}")
                    task.dueOn?.let { Text("Uiterlijk $it") }
                }
            }
        }
    }
}

@Composable
private fun InstructorDocumentsScreen(
    data: InstructorBootstrap,
    modifier: Modifier,
    viewModel: InstructorViewModel
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
        item { SectionHeading("Documenten") }
        if (data.documents.isEmpty()) {
            item {
                EmptyState("Geen documenten", "Instructeurdocumenten verschijnen hier.")
            }
        }
        items(data.documents, key = { it.id }) { document ->
            NxtCard(Modifier.fillMaxWidth()) {
                Column {
                    Text(document.title, fontWeight = FontWeight.Bold)
                    document.description?.let { Text(it) }
                    document.downloadPath?.let { path ->
                        OutlinedButton(onClick = { viewModel.download(path) }) {
                            Text("Open document")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun InstructorProfileScreen(
    state: RepositoryState,
    modifier: Modifier,
    viewModel: InstructorViewModel
) {
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        SectionHeading("Profiel")
        NxtCard(Modifier.fillMaxWidth()) {
            Column {
                Text(state.session?.displayName.orEmpty(), fontWeight = FontWeight.Bold)
                state.session?.email?.let { Text(it) }
                Text(state.session?.tenant?.name.orEmpty())
            }
        }
        OutlinedButton(
            onClick = viewModel::signOut,
            modifier = Modifier.fillMaxWidth()
        ) { Text("Uitloggen op dit apparaat") }
    }
}

@Composable
private fun InstructorSessionCard(
    session: InstructorSession,
    onOpen: () -> Unit
) {
    NxtCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(session.groupName, fontWeight = FontWeight.Bold)
            Text(formatMoment(session.startsAt))
            session.resourceName?.let { Text(it) }
            Text("${session.roster.size} leerlingen · ${statusLabel(session.status)}")
            Button(onClick = onOpen) { Text("Open les") }
        }
    }
}

@Composable
fun InstructorUnavailableScreen(
    errorCode: String?,
    onRetry: () -> Unit,
    onSignOut: () -> Unit
) {
    Column(
        modifier = Modifier
            .fillMaxSize()
            .padding(24.dp),
        horizontalAlignment = Alignment.CenterHorizontally,
        verticalArrangement = Arrangement.Center
    ) {
        EmptyState(
            "Lesgegevens niet beschikbaar",
            "De versleutelde cache bevat nog niets bruikbaars. Code: ${errorCode ?: "onbekend"}",
            "Opnieuw proberen",
            onRetry
        )
        TextButton(onClick = onSignOut) { Text("Uitloggen") }
    }
}

private fun formatMoment(value: String): String = runCatching {
    OffsetDateTime.parse(value).format(
        DateTimeFormatter.ofPattern(
            "EEE d MMM · HH:mm",
            Locale.forLanguageTag("nl-NL")
        )
    )
}.getOrDefault(value)

private fun attendanceLabel(value: String?): String = when (value) {
    "present" -> "Aanwezig"
    "absent" -> "Afwezig"
    "late" -> "Te laat"
    "excused" -> "Afgemeld"
    null -> "Niet gemarkeerd"
    else -> statusLabel(value)
}

private fun priorityLabel(value: String): String = when (value) {
    "low" -> "Laag"
    "normal" -> "Normaal"
    "high" -> "Hoog"
    "urgent" -> "Urgent"
    else -> statusLabel(value)
}

private fun statusLabel(value: String): String = when (value) {
    "active" -> "Actief"
    "archived" -> "Gearchiveerd"
    "cancelled" -> "Geannuleerd"
    "closed" -> "Gesloten"
    "completed" -> "Afgerond"
    "dismissed" -> "Afgewezen"
    "draft" -> "Concept"
    "in_progress" -> "In behandeling"
    "open" -> "Open"
    "published" -> "Gepubliceerd"
    "rescheduled" -> "Verplaatst"
    "scheduled" -> "Ingepland"
    else -> value.replace('_', ' ').replaceFirstChar { it.uppercase() }
}

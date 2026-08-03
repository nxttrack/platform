package nl.nxttrack.parent

import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.BoxWithConstraints
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CalendarMonth
import androidx.compose.material.icons.filled.Home
import androidx.compose.material.icons.filled.Mail
import androidx.compose.material.icons.filled.Payments
import androidx.compose.material.icons.filled.Route
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.AssistChip
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.Checkbox
import androidx.compose.material3.Divider
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import nl.nxttrack.mobile.design.BadgeWall
import nl.nxttrack.mobile.design.EmptyState
import nl.nxttrack.mobile.design.FivePointScore
import nl.nxttrack.mobile.design.NxtCard
import nl.nxttrack.mobile.design.PearlDestination
import nl.nxttrack.mobile.design.PearlFrame
import nl.nxttrack.mobile.design.PrimaryAction
import nl.nxttrack.mobile.design.ProgressRing
import nl.nxttrack.mobile.design.SectionHeading
import nl.nxttrack.mobile.domain.Child
import nl.nxttrack.mobile.domain.EarnedBadge
import nl.nxttrack.mobile.domain.JourneyPresentation
import nl.nxttrack.mobile.domain.Lesson
import nl.nxttrack.mobile.domain.ParentBootstrap
import nl.nxttrack.mobile.domain.RepositoryState
import java.time.OffsetDateTime
import java.time.format.DateTimeFormatter
import java.util.Locale

private val destinations = listOf(
    PearlDestination("overview", "Home", Icons.Default.Home),
    PearlDestination("planning", "Planning", Icons.Default.CalendarMonth),
    PearlDestination("progress", "Zwemreis", Icons.Default.Route),
    PearlDestination("inbox", "Inbox", Icons.Default.Mail),
    PearlDestination("payments", "Betalen", Icons.Default.Payments)
)

@Composable
fun ParentShell(
    data: ParentBootstrap,
    repositoryState: RepositoryState,
    localState: ParentLocalState,
    viewModel: ParentViewModel,
    onShareBadge: (EarnedBadge) -> Unit
) {
    val selectedChild = data.children.firstOrNull {
        it.id == localState.selectedChildId
    } ?: data.children.firstOrNull()
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
            ParentPage.OVERVIEW -> OverviewScreen(
                data,
                selectedChild,
                contentModifier,
                viewModel
            )
            ParentPage.PLANNING -> PlanningScreen(
                data,
                selectedChild,
                contentModifier,
                viewModel
            )
            ParentPage.LESSON_DETAIL -> LessonDetailScreen(
                data.lessons.firstOrNull { it.id == localState.selectedLessonId },
                selectedChild,
                contentModifier,
                viewModel
            )
            ParentPage.PROGRESS -> ProgressScreen(
                data,
                selectedChild,
                contentModifier,
                viewModel
            )
            ParentPage.BADGES -> BadgesScreen(
                selectedChild,
                contentModifier,
                onShareBadge
            )
            ParentPage.INBOX -> InboxScreen(
                data,
                localState,
                contentModifier,
                viewModel
            )
            ParentPage.PAYMENTS -> PaymentsScreen(
                data,
                contentModifier,
                viewModel
            )
            ParentPage.DIPLOMAS -> DiplomasScreen(
                data,
                contentModifier,
                viewModel
            )
            ParentPage.DOCUMENTS -> DocumentsScreen(
                data,
                contentModifier,
                viewModel
            )
            ParentPage.FAMILY_ACCESS -> FamilyAccessScreen(
                data,
                contentModifier
            )
            ParentPage.PROFILE -> ProfileScreen(
                repositoryState,
                contentModifier,
                viewModel
            )
            ParentPage.MEDIA -> MediaScreen(
                data,
                selectedChild,
                contentModifier,
                viewModel
            )
            ParentPage.FEEDBACK -> FeedbackScreen(
                data,
                selectedChild,
                contentModifier,
                viewModel
            )
        }
    }
}

@Composable
private fun OverviewScreen(
    data: ParentBootstrap,
    child: Child?,
    modifier: Modifier,
    viewModel: ParentViewModel
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        item {
            SectionHeading(
                "Fijn dat je er bent",
                "De actuele zwemreis, lessen en berichten van ${data.tenant.name}."
            )
        }
        if (data.children.size > 1) {
            item {
                ChildPicker(data.children, child?.id, viewModel::selectChild)
            }
        }
        if (child == null) {
            item {
                EmptyState(
                    "Nog geen leerling gekoppeld",
                    "Vraag de zwemschool om gezinstoegang te controleren."
                )
            }
        } else {
            item {
                NxtCard(Modifier.fillMaxWidth()) {
                    Column(verticalArrangement = Arrangement.spacedBy(14.dp)) {
                        SectionHeading(
                            child.displayName,
                            listOfNotNull(child.programName, child.stageName)
                                .joinToString(" · ")
                        )
                        val rings = child.journey?.rings
                            ?.let(JourneyPresentation::visibleRings)
                            .orEmpty()
                        if (rings.isEmpty()) {
                            Text("De zwemreis wordt klaargezet.")
                        } else {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceEvenly
                            ) {
                                rings.forEach { ring ->
                                    ProgressRing(
                                        ring,
                                        Modifier.weight(1f)
                                    )
                                }
                            }
                        }
                    }
                }
            }
            val nextLesson = data.lessons.firstOrNull {
                it.id == child.nextLessonId
            }
            if (nextLesson != null) {
                item {
                    LessonCard(
                        nextLesson,
                        action = {
                            OutlinedButton(
                                onClick = { viewModel.openLesson(nextLesson.id) }
                            ) {
                                Text("Bekijk les")
                            }
                        }
                    )
                }
            }
            val invite = data.graduationInvites.firstOrNull {
                it.participantId == child.id &&
                    it.inviteStatus in listOf("sent", "draft")
            }
            if (invite != null && child.canMutate) {
                item {
                    NxtCard(Modifier.fillMaxWidth()) {
                        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
                            SectionHeading(
                                "Afzwemuitnodiging",
                                "Bevestig zelf; een percentage geeft nooit automatisch een diploma."
                            )
                            Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                                Button(onClick = {
                                    viewModel.respondToGraduation(
                                        invite.id,
                                        "confirmed"
                                    )
                                }) { Text("Bevestigen") }
                                OutlinedButton(onClick = {
                                    viewModel.respondToGraduation(
                                        invite.id,
                                        "declined"
                                    )
                                }) { Text("Afwijzen") }
                            }
                        }
                    }
                }
            }
        }
        if (data.announcements.isNotEmpty()) {
            item { SectionHeading("Mededelingen") }
            items(data.announcements, key = { it.id }) { announcement ->
                NxtCard(Modifier.fillMaxWidth()) {
                    Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                        Text(announcement.title, fontWeight = FontWeight.Bold)
                        Text(announcement.body)
                    }
                }
            }
        }
        item {
            SectionHeading("Meer")
        }
        item {
            QuickRoutes(viewModel)
        }
    }
}

@Composable
private fun ChildPicker(
    children: List<Child>,
    selectedId: String?,
    onSelect: (String) -> Unit
) {
    LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
        items(children, key = { it.id }) { child ->
            AssistChip(
                onClick = { onSelect(child.id) },
                label = {
                    Text(
                        if (child.id == selectedId) {
                            "✓ ${child.displayName}"
                        } else {
                            child.displayName
                        }
                    )
                }
            )
        }
    }
}

@Composable
private fun QuickRoutes(viewModel: ParentViewModel) {
    Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RouteButton("Badges", Modifier.weight(1f)) {
                viewModel.navigate(ParentPage.BADGES)
            }
            RouteButton("Diploma's", Modifier.weight(1f)) {
                viewModel.navigate(ParentPage.DIPLOMAS)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RouteButton("Documenten", Modifier.weight(1f)) {
                viewModel.navigate(ParentPage.DOCUMENTS)
            }
            RouteButton("Profiel", Modifier.weight(1f)) {
                viewModel.navigate(ParentPage.PROFILE)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            RouteButton("Media", Modifier.weight(1f)) {
                viewModel.navigate(ParentPage.MEDIA)
            }
            RouteButton("Gezinstoegang", Modifier.weight(1f)) {
                viewModel.navigate(ParentPage.FAMILY_ACCESS)
            }
        }
        RouteButton("Feedback", Modifier.fillMaxWidth()) {
            viewModel.navigate(ParentPage.FEEDBACK)
        }
    }
}

@Composable
private fun RouteButton(
    label: String,
    modifier: Modifier,
    onClick: () -> Unit
) {
    OutlinedButton(onClick = onClick, modifier = modifier.height(52.dp)) {
        Text(label)
    }
}

@Composable
private fun PlanningScreen(
    data: ParentBootstrap,
    child: Child?,
    modifier: Modifier,
    viewModel: ParentViewModel
) {
    val lessons = if (child == null) {
        emptyList()
    } else {
        data.lessons.filter { it.groupId in child.groupIds }
    }
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            SectionHeading(
                "Lessen",
                "Roostergeschiedenis blijft bewaard bij annuleringen en vakanties."
            )
        }
        if (lessons.isEmpty()) {
            item {
                EmptyState("Geen lessen", "Er staan geen lessen in deze periode.")
            }
        } else {
            items(lessons, key = { it.id }) { lesson ->
                LessonCard(
                    lesson,
                    action = {
                        OutlinedButton(onClick = { viewModel.openLesson(lesson.id) }) {
                            Text("Details")
                        }
                    }
                )
            }
        }
    }
}

@Composable
private fun LessonDetailScreen(
    lesson: Lesson?,
    child: Child?,
    modifier: Modifier,
    viewModel: ParentViewModel
) {
    var confirmCancellation by remember { mutableStateOf(false) }
    var reason by remember { mutableStateOf("") }
    Column(
        modifier = modifier
            .fillMaxSize()
            .verticalScroll(rememberScrollState())
            .padding(16.dp),
        verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
        if (lesson == null) {
            EmptyState("Les niet gevonden", "Ververs de planning en probeer opnieuw.")
        } else {
            LessonCard(lesson)
            Text(
                "Een annulering wijzigt de historische les niet. Het recht op een inhaalles wordt server-side volgens het organisatiebeleid bepaald.",
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            if (child?.canMutate == true && lesson.status == "scheduled") {
                OutlinedButton(onClick = { confirmCancellation = true }) {
                    Text("Les afmelden")
                }
            }
        }
    }
    if (confirmCancellation && lesson != null && child != null) {
        AlertDialog(
            onDismissRequest = { confirmCancellation = false },
            title = { Text("Les afmelden?") },
            text = {
                OutlinedTextField(
                    value = reason,
                    onValueChange = { reason = it.take(2_000) },
                    label = { Text("Reden (optioneel)") }
                )
            },
            confirmButton = {
                TextButton(onClick = {
                    viewModel.cancelLesson(
                        lesson.id,
                        child.id,
                        reason.takeIf { it.isNotBlank() }
                    )
                    confirmCancellation = false
                    viewModel.navigate(ParentPage.PLANNING)
                }) { Text("Afmelden") }
            },
            dismissButton = {
                TextButton(onClick = { confirmCancellation = false }) {
                    Text("Terug")
                }
            }
        )
    }
}

@Composable
private fun ProgressScreen(
    data: ParentBootstrap,
    child: Child?,
    modifier: Modifier,
    viewModel: ParentViewModel
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            SectionHeading(
                child?.let { "De zwemreis van ${it.displayName}" } ?: "De zwemreis",
                "Alleen definitieve beoordelingen tellen mee; doorstroom en diploma blijven aparte besluiten."
            )
        }
        val journey = child?.journey
        if (journey == null) {
            item {
                EmptyState("Nog geen zwemreis", "De zwemschool zet de leerlijn klaar.")
            }
        } else {
            item {
                val rings = JourneyPresentation.visibleRings(journey.rings)
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceEvenly
                ) {
                    rings.forEach { ProgressRing(it, Modifier.weight(1f)) }
                }
            }
            item {
                OutlinedButton(
                    onClick = { viewModel.navigate(ParentPage.BADGES) },
                    modifier = Modifier.fillMaxWidth()
                ) { Text("Bekijk badgewall") }
            }
            items(journey.items, key = { it.id }) { item ->
                NxtCard(Modifier.fillMaxWidth()) {
                    Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                        Text(item.name, fontWeight = FontWeight.Bold)
                        item.description?.let {
                            Text(
                                it,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        FivePointScore(
                            rating = item.rating,
                            display = data.assessmentDisplay,
                            readOnly = true
                        )
                        Text(
                            item.positiveLabel ?: "Nog niet beoordeeld",
                            style = MaterialTheme.typography.labelMedium
                        )
                        if (item.carryover) {
                            Text(
                                "Openstaand uit vorig badje",
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun BadgesScreen(
    child: Child?,
    modifier: Modifier,
    onShareBadge: (EarnedBadge) -> Unit
) {
    var selectedBadge by remember { mutableStateOf<EarnedBadge?>(null) }
    BoxWithConstraints(modifier.fillMaxSize()) {
        if (child == null || child.badges.isEmpty()) {
            EmptyState(
                "Nog geen badges",
                "Badges verschijnen hier per categorie zodra ze veilig zichtbaar zijn."
            )
        } else {
            BadgeWall(
                badges = child.badges,
                widthDp = maxWidth.value.toInt(),
                onBadge = { selectedBadge = it },
                onShare = onShareBadge,
                modifier = Modifier.fillMaxSize()
            )
        }
    }
    selectedBadge?.let { badge ->
        AlertDialog(
            onDismissRequest = { selectedBadge = null },
            title = { Text(badge.name) },
            text = {
                Text(
                    badge.description ?: if (badge.earned) {
                        "Behaald"
                    } else {
                        "Nog niet behaald"
                    }
                )
            },
            confirmButton = {
                if (badge.earned && badge.awardId != null) {
                    TextButton(onClick = {
                        onShareBadge(badge)
                        selectedBadge = null
                    }) { Text("Delen") }
                } else {
                    TextButton(onClick = { selectedBadge = null }) {
                        Text("Sluiten")
                    }
                }
            }
        )
    }
}

@Composable
private fun InboxScreen(
    data: ParentBootstrap,
    localState: ParentLocalState,
    modifier: Modifier,
    viewModel: ParentViewModel
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
            item { SectionHeading("Berichten") }
            if (data.inbox.threads.isEmpty()) {
                item {
                    EmptyState("Geen gesprekken", "Nieuwe berichten verschijnen hier.")
                }
            }
            items(data.inbox.threads, key = { it.id }) { thread ->
                Card(onClick = { viewModel.selectThread(thread.id) }) {
                    Column(Modifier.padding(16.dp)) {
                        Text(thread.subject, fontWeight = FontWeight.Bold)
                        Text(statusLabel(thread.status))
                        if (thread.unread) {
                            Text(
                                "Nieuw",
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                    }
                }
            }
            if (data.inbox.notifications.isNotEmpty()) {
                item { SectionHeading("Notificaties") }
                items(data.inbox.notifications, key = { it.id }) { notification ->
                    NxtCard(Modifier.fillMaxWidth()) {
                        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
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
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
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
                        modifier = Modifier.fillMaxWidth(),
                        label = { Text("Antwoord") },
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
private fun PaymentsScreen(
    data: ParentBootstrap,
    modifier: Modifier,
    viewModel: ParentViewModel
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            SectionHeading(
                "Betalingen en facturen",
                "Definitieve facturen blijven ongewijzigd; correcties staan als creditnota."
            )
        }
        if (data.payments.isNotEmpty()) {
            item { Text("Openstaand", fontWeight = FontWeight.Bold) }
            items(data.payments, key = { it.id }) { payment ->
                NxtCard(Modifier.fillMaxWidth()) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(statusLabel(payment.status))
                        Text(formatMoney(payment.amountCents, payment.currency))
                    }
                }
            }
        }
        item { Text("Documenten", fontWeight = FontWeight.Bold) }
        if (data.invoices.isEmpty()) {
            item {
                EmptyState("Geen facturen", "Financiële documenten verschijnen hier.")
            }
        }
        items(data.invoices, key = { it.id }) { invoice ->
            NxtCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        if (invoice.documentType == "credit_note") {
                            "Creditnota ${invoice.invoiceNumber.orEmpty()}"
                        } else {
                            "Factuur ${invoice.invoiceNumber.orEmpty()}"
                        },
                        fontWeight = FontWeight.Bold
                    )
                    Text(formatMoney(invoice.totalCents, invoice.currency))
                    Text(
                        "Btw ${formatVatRate(invoice.vatRateBasisPoints)} · ${statusLabel(invoice.status)}"
                    )
                    invoice.downloadPath?.let { path ->
                        OutlinedButton(onClick = { viewModel.download(path) }) {
                            Text("Open PDF")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DiplomasScreen(
    data: ParentBootstrap,
    modifier: Modifier,
    viewModel: ParentViewModel
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            SectionHeading(
                "Diplomakluis",
                "Alleen daadwerkelijk uitgegeven diploma's staan hier."
            )
        }
        if (data.diplomas.isEmpty()) {
            item {
                EmptyState("Nog geen diploma's", "Uitgegeven diploma's verschijnen hier.")
            }
        }
        items(data.diplomas, key = { it.id }) { diploma ->
            NxtCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(diploma.title, fontWeight = FontWeight.Bold)
                    diploma.number?.let { Text("Nummer $it") }
                    diploma.issuedOn?.let { Text("Uitgegeven op $it") }
                    diploma.downloadPath?.let { path ->
                        OutlinedButton(onClick = { viewModel.download(path) }) {
                            Text("Open diploma")
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun DocumentsScreen(
    data: ParentBootstrap,
    modifier: Modifier,
    viewModel: ParentViewModel
) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item { SectionHeading("Documenten") }
        if (data.documents.isEmpty()) {
            item {
                EmptyState("Geen documenten", "Gedeelde documenten verschijnen hier.")
            }
        }
        items(data.documents, key = { it.id }) { document ->
            NxtCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
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
private fun FamilyAccessScreen(data: ParentBootstrap, modifier: Modifier) {
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            SectionHeading(
                "Gezinstoegang",
                "Wijzigrechten worden per leerling door de zwemschool gecontroleerd."
            )
        }
        items(data.children, key = { it.id }) { child ->
            NxtCard(Modifier.fillMaxWidth()) {
                Column {
                    Text(child.displayName, fontWeight = FontWeight.Bold)
                    Text(
                        if (child.canMutate) {
                            "Je kunt acties voor deze leerling uitvoeren."
                        } else {
                            "Alleen-lezen toegang."
                        }
                    )
                }
            }
        }
    }
}

@Composable
private fun MediaScreen(
    data: ParentBootstrap,
    child: Child?,
    modifier: Modifier,
    viewModel: ParentViewModel
) {
    val consents = data.media.consents.filter {
        child == null || it.participantId == child.id
    }
    val media = data.media.items.filter {
        child == null || it.participantId == child.id
    }
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            SectionHeading(
                "Besloten media",
                "Privé opgeslagen, bij iedere weergave opnieuw gecontroleerd en automatisch begrensd door bewaartermijn."
            )
        }
        if (consents.isEmpty()) {
            item {
                EmptyState(
                    "Geen leerling gekoppeld",
                    "Mediatoestemming wordt per leerling beheerd."
                )
            }
        }
        items(consents, key = { it.participantId }) { consent ->
            MediaConsentCard(
                consent = consent,
                policyVersion = data.media.policyVersion,
                onDecision = {
                    viewModel.recordMediaConsent(consent.participantId, it)
                }
            )
        }
        item { SectionHeading("Gepubliceerde momenten") }
        if (media.isEmpty()) {
            item {
                EmptyState(
                    "Nog geen foto's",
                    "Alleen na geldige toestemming gepubliceerde momenten verschijnen hier."
                )
            }
        }
        items(media, key = { it.id }) { item ->
            NxtCard(Modifier.fillMaxWidth()) {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        item.caption ?: "Voortgangsmoment",
                        fontWeight = FontWeight.Bold
                    )
                    item.publishedAt?.let {
                        Text("Gepubliceerd ${formatMoment(it)}")
                    }
                    Text("Beschikbaar tot ${formatMoment(item.expiresAt)}")
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        OutlinedButton(
                            onClick = { viewModel.download(item.viewPath) }
                        ) {
                            Text("Bekijken")
                        }
                        item.downloadPath?.let { path ->
                            OutlinedButton(
                                onClick = { viewModel.download(path) }
                            ) {
                                Text("Downloaden")
                            }
                        }
                    }
                    if (!item.downloadAllowed) {
                        Text(
                            "Bekijken toegestaan; downloaden staat uit.",
                            style = MaterialTheme.typography.labelSmall
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun MediaConsentCard(
    consent: nl.nxttrack.mobile.domain.MediaConsent,
    policyVersion: String,
    onDecision: (String) -> Unit
) {
    var pendingDecision by remember { mutableStateOf<String?>(null) }
    NxtCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Text(consent.participantName, fontWeight = FontWeight.Bold)
            Text(
                if (consent.effectiveValid) {
                    "Toestemming actief"
                } else {
                    "Publicatie geblokkeerd"
                }
            )
            Text(
                "Jouw keuze: ${statusLabel(consent.status)} · beleid $policyVersion",
                style = MaterialTheme.typography.labelSmall
            )
            if (!consent.canDecide) {
                Text("Je hebt alleen-lezen toegang.")
            } else {
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    if (consent.status != "granted") {
                        Button(onClick = { pendingDecision = "granted" }) {
                            Text("Toestemming geven")
                        }
                    } else {
                        OutlinedButton(
                            onClick = { pendingDecision = "withdrawn" }
                        ) {
                            Text("Intrekken")
                        }
                    }
                    if (consent.status == "pending") {
                        TextButton(onClick = { pendingDecision = "denied" }) {
                            Text("Geen toestemming")
                        }
                    }
                }
            }
        }
    }
    pendingDecision?.let { decision ->
        AlertDialog(
            onDismissRequest = { pendingDecision = null },
            title = { Text("Bevestig mediatoestemming") },
            text = {
                Text(
                    if (decision == "granted") {
                        "Je geeft toestemming voor besloten voortgangsmedia volgens beleid $policyVersion. Dit is geen marketingtoestemming."
                    } else {
                        "Deze keuze blokkeert gepubliceerde media voor ${consent.participantName}."
                    }
                )
            },
            confirmButton = {
                Button(onClick = {
                    onDecision(decision)
                    pendingDecision = null
                }) {
                    Text("Bevestigen")
                }
            },
            dismissButton = {
                TextButton(onClick = { pendingDecision = null }) {
                    Text("Annuleren")
                }
            }
        )
    }
}

@Composable
private fun FeedbackScreen(
    data: ParentBootstrap,
    child: Child?,
    modifier: Modifier,
    viewModel: ParentViewModel
) {
    val surveys = data.feedback.filter {
        child == null || it.participantId == child.id
    }
    LazyColumn(
        modifier = modifier.fillMaxSize(),
        contentPadding = androidx.compose.foundation.layout.PaddingValues(16.dp),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        item {
            SectionHeading(
                "Feedback",
                "Vrije tekst blijft persoonlijk en wordt nooit openbaar gemaakt."
            )
        }
        if (surveys.isEmpty()) {
            item {
                EmptyState(
                    "Je bent helemaal bij",
                    "Er staan geen feedbackvragen klaar."
                )
            }
        }
        items(surveys, key = { it.id }) { survey ->
            if (
                survey.status == "open" &&
                runCatching {
                    OffsetDateTime.parse(survey.expiresAt).isAfter(
                        OffsetDateTime.now()
                    )
                }.getOrDefault(false)
            ) {
                FeedbackSurveyCard(survey, viewModel)
            } else if (survey.status == "completed") {
                NxtCard(Modifier.fillMaxWidth()) {
                    Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                        Text(survey.campaignName, fontWeight = FontWeight.Bold)
                        Text("${survey.participantName} · veilig ontvangen")
                        survey.score?.let { Text("Score $it van 10") }
                    }
                }
            }
        }
    }
}

@Composable
private fun FeedbackSurveyCard(
    survey: nl.nxttrack.mobile.domain.FeedbackSurvey,
    viewModel: ParentViewModel
) {
    var score by remember(survey.id) { mutableStateOf<Int?>(null) }
    var comment by remember(survey.id) { mutableStateOf("") }
    var followUpAllowed by remember(survey.id) { mutableStateOf(false) }
    NxtCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(12.dp)) {
            Text(survey.participantName, style = MaterialTheme.typography.labelMedium)
            Text(survey.campaignName, fontWeight = FontWeight.Bold)
            Text(survey.prompt)
            LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                items((0..10).toList()) { value ->
                    AssistChip(
                        onClick = { score = value },
                        label = {
                            Text(if (score == value) "✓ $value" else "$value")
                        }
                    )
                }
            }
            OutlinedTextField(
                value = comment,
                onValueChange = { comment = it.take(2_000) },
                modifier = Modifier.fillMaxWidth(),
                label = { Text(survey.followUpQuestion) },
                minLines = 3
            )
            Row(verticalAlignment = Alignment.CenterVertically) {
                Checkbox(
                    checked = followUpAllowed,
                    onCheckedChange = { followUpAllowed = it }
                )
                Text("De zwemschool mag persoonlijk opvolgen")
            }
            Button(
                enabled = score != null,
                onClick = {
                    score?.let {
                        viewModel.submitFeedback(
                            requestId = survey.id,
                            score = it,
                            comment = comment,
                            followUpAllowed = followUpAllowed
                        )
                    }
                }
            ) {
                Text("Bevestig en verstuur")
            }
        }
    }
}

@Composable
private fun ProfileScreen(
    repositoryState: RepositoryState,
    modifier: Modifier,
    viewModel: ParentViewModel
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
            Column(verticalArrangement = Arrangement.spacedBy(4.dp)) {
                Text(
                    repositoryState.session?.displayName.orEmpty(),
                    fontWeight = FontWeight.Bold
                )
                repositoryState.session?.email?.let { Text(it) }
                Text(repositoryState.session?.tenant?.name.orEmpty())
            }
        }
        OutlinedButton(
            onClick = viewModel::signOut,
            modifier = Modifier.fillMaxWidth()
        ) { Text("Uitloggen op dit apparaat") }
    }
}

@Composable
private fun LessonCard(
    lesson: Lesson,
    action: (@Composable () -> Unit)? = null
) {
    NxtCard(Modifier.fillMaxWidth()) {
        Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Text(lesson.groupName, fontWeight = FontWeight.Bold)
            Text(formatMoment(lesson.startsAt))
            lesson.resourceName?.let { Text(it) }
            Text(statusLabel(lesson.status))
            action?.invoke()
        }
    }
}

@Composable
fun NativeUnavailableScreen(
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
            "Gegevens niet beschikbaar",
            "De veilige cache bevat nog geen bruikbare gegevens. Code: ${errorCode ?: "onbekend"}",
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

private fun formatMoney(cents: Long, currency: String): String =
    "%s %.2f".format(
        Locale.forLanguageTag("nl-NL"),
        currency,
        cents / 100.0
    )

private fun formatVatRate(basisPoints: Int): String =
    if (basisPoints % 100 == 0) {
        "${basisPoints / 100}%"
    } else {
        "%.2f%%".format(Locale.forLanguageTag("nl-NL"), basisPoints / 100.0)
    }

private fun statusLabel(value: String): String = when (value) {
    "active" -> "Actief"
    "archived" -> "Gearchiveerd"
    "cancelled" -> "Geannuleerd"
    "charged_back" -> "Teruggeboekt"
    "closed" -> "Gesloten"
    "completed" -> "Afgerond"
    "credited" -> "Gecrediteerd"
    "denied" -> "Geen toestemming"
    "draft" -> "Concept"
    "expired" -> "Verlopen"
    "failed" -> "Mislukt"
    "finalized" -> "Definitief"
    "granted" -> "Toestemming gegeven"
    "open" -> "Open"
    "overdue" -> "Achterstallig"
    "paid" -> "Betaald"
    "pending" -> "In afwachting"
    "published" -> "Gepubliceerd"
    "refunded" -> "Terugbetaald"
    "rescheduled" -> "Verplaatst"
    "scheduled" -> "Ingepland"
    "sent" -> "Verzonden"
    "void" -> "Vervallen"
    "withdrawn" -> "Ingetrokken"
    else -> value.replace('_', ' ').replaceFirstChar { it.uppercase() }
}

package nl.nxttrack.mobile.data

import nl.nxttrack.mobile.domain.ActiveTenant
import nl.nxttrack.mobile.domain.Announcement
import nl.nxttrack.mobile.domain.AssessmentDisplay
import nl.nxttrack.mobile.domain.Child
import nl.nxttrack.mobile.domain.ClientKind
import nl.nxttrack.mobile.domain.Diploma
import nl.nxttrack.mobile.domain.Document
import nl.nxttrack.mobile.domain.EarnedBadge
import nl.nxttrack.mobile.domain.GraduationInvite
import nl.nxttrack.mobile.domain.Inbox
import nl.nxttrack.mobile.domain.InboxMessage
import nl.nxttrack.mobile.domain.InboxThread
import nl.nxttrack.mobile.domain.InstructorBootstrap
import nl.nxttrack.mobile.domain.InstructorGroup
import nl.nxttrack.mobile.domain.InstructorLearner
import nl.nxttrack.mobile.domain.InstructorSession
import nl.nxttrack.mobile.domain.InstructorTask
import nl.nxttrack.mobile.domain.Invoice
import nl.nxttrack.mobile.domain.JourneyItem
import nl.nxttrack.mobile.domain.JourneyRing
import nl.nxttrack.mobile.domain.LearnerJourney
import nl.nxttrack.mobile.domain.Lesson
import nl.nxttrack.mobile.domain.MobileNotification
import nl.nxttrack.mobile.domain.MobileSession
import nl.nxttrack.mobile.domain.MediaConsent
import nl.nxttrack.mobile.domain.MediaOverview
import nl.nxttrack.mobile.domain.NativeContract
import nl.nxttrack.mobile.domain.ParentBootstrap
import nl.nxttrack.mobile.domain.ParticipantMedia
import nl.nxttrack.mobile.domain.Payment
import nl.nxttrack.mobile.domain.RingKind
import nl.nxttrack.mobile.domain.RosterMember
import nl.nxttrack.mobile.domain.SessionTokens
import nl.nxttrack.mobile.domain.ThemeBundle
import nl.nxttrack.mobile.domain.ThemeTokens
import nl.nxttrack.mobile.domain.FeedbackSurvey
import org.json.JSONArray
import org.json.JSONObject

internal object NativeJsonParser {
    fun session(raw: String, client: ClientKind): MobileSession {
        val root = JSONObject(raw)
        require(root.getInt("contractVersion") == NativeContract.VERSION)
        val session = root.getJSONObject("session")
        val user = root.getJSONObject("user")
        val tenant = root.getJSONObject("activeTenant")
        return MobileSession(
            client = client,
            userId = user.requiredString("id"),
            displayName = user.requiredString("displayName"),
            email = user.nullableString("email"),
            tenant = ActiveTenant(
                id = tenant.requiredString("id"),
                name = tenant.requiredString("name"),
                slug = tenant.nullableString("slug"),
                roles = tenant.getJSONArray("roles").strings()
            ),
            tokens = SessionTokens(
                accessToken = session.requiredString("accessToken"),
                refreshToken = session.requiredString("refreshToken"),
                expiresAtEpochSeconds = session.nullableLong("expiresAt")
            )
        )
    }

    fun parentBootstrap(
        raw: String,
        session: MobileSession,
        fallbackThemeJson: () -> String
    ): ParentBootstrap {
        val root = JSONObject(raw)
        require(root.getInt("contractVersion") == NativeContract.VERSION)
        val theme = runCatching {
            theme(root.getJSONObject("theme"))
        }.getOrElse {
            theme(JSONObject(fallbackThemeJson()))
        }
        require(NativeContract.isCompatible(theme))
        val payments = root.getJSONObject("payments")
        return ParentBootstrap(
            contractVersion = root.getInt("contractVersion"),
            generatedAt = root.requiredString("generatedAt"),
            tenant = session.tenant,
            assessmentDisplay = assessmentDisplay(root),
            theme = theme,
            children = root.getJSONArray("children").objects().map(::child),
            lessons = root.getJSONArray("lessons").objects().map(::lesson),
            announcements = root.getJSONArray("announcements")
                .objects()
                .map(::announcement),
            inbox = inbox(root.getJSONObject("inbox")),
            invoices = payments.getJSONArray("invoices").objects().map(::invoice),
            payments = payments.getJSONArray("openPayments")
                .objects()
                .map(::payment),
            diplomas = root.getJSONArray("diplomas").objects().map(::diploma),
            graduationInvites = root.getJSONArray("graduation")
                .objects()
                .map(::graduationInvite),
            documents = root.getJSONArray("documents").objects().map(::document),
            media = mediaOverview(root.getJSONObject("media")),
            feedback = root.getJSONArray("feedback").objects().map(::feedback)
        )
    }

    fun instructorBootstrap(
        raw: String,
        session: MobileSession
    ): InstructorBootstrap {
        val root = JSONObject(raw)
        require(root.getInt("contractVersion") == NativeContract.VERSION)
        return InstructorBootstrap(
            contractVersion = root.getInt("contractVersion"),
            generatedAt = root.requiredString("generatedAt"),
            tenant = session.tenant,
            assessmentDisplay = assessmentDisplay(root),
            sessions = root.getJSONArray("sessions").objects().map { source ->
                InstructorSession(
                    id = source.requiredString("id"),
                    groupId = source.requiredString("groupId"),
                    groupName = source.requiredString("groupName"),
                    startsAt = source.requiredString("startsAt"),
                    endsAt = source.requiredString("endsAt"),
                    resourceName = source.nullableString("resourceName"),
                    status = source.requiredString("status"),
                    roster = source.getJSONArray("roster")
                        .objects()
                        .map(::rosterMember)
                )
            },
            groups = root.getJSONArray("groups").objects().map { source ->
                InstructorGroup(
                    id = source.requiredString("id"),
                    name = source.requiredString("name"),
                    status = source.requiredString("status"),
                    capacity = source.optInt("capacity"),
                    roster = source.getJSONArray("roster")
                        .objects()
                        .map(::rosterMember)
                )
            },
            learners = root.getJSONArray("learners").objects().map { source ->
                InstructorLearner(
                    id = source.requiredString("id"),
                    displayName = source.requiredString("displayName"),
                    enrollmentId = source.nullableString("enrollmentId"),
                    journey = source.nullableObject("journey")?.let(::journey)
                )
            },
            announcements = root.getJSONArray("announcements")
                .objects()
                .map(::announcement),
            inbox = inbox(root.getJSONObject("inbox")),
            tasks = root.getJSONArray("tasks").objects().map { source ->
                InstructorTask(
                    id = source.requiredString("id"),
                    title = source.requiredString("title"),
                    description = source.nullableString("description"),
                    participantId = source.nullableString("participantId"),
                    priority = source.optString("priority", "normal"),
                    status = source.requiredString("status"),
                    dueOn = source.nullableString("dueOn"),
                    updatedAt = source.nullableString("updatedAt")
                )
            },
            documents = root.getJSONArray("documents").objects().map(::document)
        )
    }

    fun theme(source: JSONObject): ThemeBundle {
        val navigation = source.getJSONObject("navigation")
        val recipes = source.getJSONObject("recipes")
        val pageRecipes = recipes.getJSONObject("pages")
        val tokens = source.getJSONObject("tokens")
        val colors = tokens.getJSONObject("colors")
        val radii = tokens.getJSONObject("radii")
        val motion = tokens.getJSONObject("motionMilliseconds")
        val bundle = ThemeBundle(
            schemaVersion = source.getInt("schemaVersion"),
            portalContract = source.requiredString("portalContract"),
            themeKey = source.requiredString("themeKey"),
            release = source.requiredString("release"),
            primaryDestinations = navigation.getJSONArray("primaryDestinations")
                .strings(),
            routeIds = navigation.getJSONArray("routeIds").strings(),
            shellRecipe = recipes.requiredString("shell"),
            pageRecipes = pageRecipes.keys().asSequence().associateWith {
                pageRecipes.requiredString(it)
            },
            tokens = ThemeTokens(
                canvas = colors.requiredString("canvas"),
                surface = colors.requiredString("surface"),
                surfaceAlt = colors.requiredString("surfaceAlt"),
                text = colors.requiredString("text"),
                textMuted = colors.requiredString("textMuted"),
                primary = colors.requiredString("primary"),
                primaryStrong = colors.requiredString("primaryStrong"),
                secondary = colors.requiredString("secondary"),
                reward = colors.requiredString("reward"),
                rail = colors.requiredString("rail"),
                info = colors.optString("info", "#075EA8"),
                success = colors.optString("success", "#146C4C"),
                warning = colors.optString("warning", "#7A4B00"),
                danger = colors.optString("danger", "#B4233D"),
                cardRadiusDp = radii.requiredString("card").cssPixels(),
                heroRadiusDp = radii.requiredString("hero").cssPixels(),
                standardMotionMs = motion.optInt("standardMs", 200)
            )
        )
        require(NativeContract.isCompatible(bundle))
        return bundle
    }

    private fun assessmentDisplay(root: JSONObject): AssessmentDisplay =
        if (
            root.getJSONObject("assessment")
                .optString("display", "smileys") == "stars"
        ) {
            AssessmentDisplay.STARS
        } else {
            AssessmentDisplay.SMILEYS
        }

    private fun child(source: JSONObject): Child {
        val enrollment = source.nullableObject("activeEnrollment")
        return Child(
            id = source.requiredString("id"),
            displayName = source.requiredString("displayName"),
            canMutate = source.optBoolean("canMutate", false),
            enrollmentId = enrollment?.nullableString("id"),
            programName = enrollment?.nullableString("programName"),
            stageName = enrollment?.nullableString("stageName"),
            nextLessonId = source.nullableString("nextLessonId"),
            groupIds = source.getJSONArray("groupIds").strings(),
            journey = source.nullableObject("journey")?.let(::journey),
            badges = source.getJSONArray("badges").objects().map(::badge)
        )
    }

    private fun journey(source: JSONObject): LearnerJourney {
        val stage = source.nullableObject("currentStage")
        return LearnerJourney(
            stageId = stage?.nullableString("id"),
            stageName = stage?.nullableString("name"),
            rings = source.getJSONArray("rings").objects().map(::ring),
            items = source.getJSONArray("items").objects().map(::journeyItem)
        )
    }

    private fun ring(source: JSONObject) = JourneyRing(
        key = source.requiredString("key"),
        kind = if (source.requiredString("kind") == "stage") {
            RingKind.STAGE
        } else {
            RingKind.DIPLOMA
        },
        label = source.requiredString("label"),
        progressPercent = source.optDouble("progressPercent", 0.0),
        coveragePercent = source.optDouble("coveragePercent", 0.0),
        assessedCount = source.optInt("assessedCount"),
        contributingCount = source.optInt("contributingCount"),
        formulaVersion = source.optString(
            "formulaVersion",
            NativeContract.PROGRESS_FORMULA_VERSION
        )
    )

    private fun journeyItem(source: JSONObject) = JourneyItem(
        id = source.requiredString("id"),
        key = source.requiredString("key"),
        name = source.requiredString("name"),
        description = source.nullableString("description"),
        rating = source.nullableInt("rating")?.also {
            require(it in 1..5)
        },
        positiveLabel = source.nullableString("positiveLabel"),
        observedAt = source.nullableString("observedAt"),
        carryover = source.optBoolean("carryover", false)
    )

    private fun badge(source: JSONObject) = EarnedBadge(
        id = source.requiredString("id"),
        awardId = source.nullableString("awardId"),
        key = source.requiredString("key"),
        name = source.requiredString("name"),
        description = source.nullableString("description"),
        category = source.optString("category", "overig"),
        artworkPath = source.nullableString("artworkPath"),
        earned = source.optBoolean("earned", false),
        awardedAt = source.nullableString("awardedAt"),
        shareCaption = source.nullableString("shareCaption")
    )

    private fun lesson(source: JSONObject) = Lesson(
        id = source.requiredString("id"),
        groupId = source.requiredString("groupId"),
        groupName = source.requiredString("groupName"),
        startsAt = source.requiredString("startsAt"),
        endsAt = source.requiredString("endsAt"),
        resourceName = source.nullableString("resourceName"),
        status = source.requiredString("status"),
        notes = source.nullableString("notes")
    )

    private fun announcement(source: JSONObject) = Announcement(
        id = source.requiredString("id"),
        title = source.requiredString("title"),
        body = source.requiredString("body"),
        publishedAt = source.nullableString("publishedAt")
    )

    private fun inbox(source: JSONObject) = Inbox(
        canReply = source.optBoolean("canReply", false),
        messages = source.getJSONArray("messages").objects().map { message ->
            InboxMessage(
                id = message.requiredString("id"),
                threadId = message.requiredString("threadId"),
                body = message.requiredString("body"),
                senderName = message.requiredString("senderName"),
                mine = message.optBoolean("mine", false),
                status = message.requiredString("status"),
                createdAt = message.requiredString("createdAt")
            )
        },
        notifications = source.getJSONArray("notifications")
            .objects()
            .map { notification ->
                MobileNotification(
                    id = notification.requiredString("id"),
                    title = notification.requiredString("title"),
                    message = notification.requiredString("message"),
                    priority = notification.optString("priority", "normal"),
                    status = notification.requiredString("status"),
                    createdAt = notification.requiredString("createdAt"),
                    actionPath = notification.nullableString("actionPath")
                )
            },
        threads = source.getJSONArray("threads").objects().map { thread ->
            InboxThread(
                id = thread.requiredString("id"),
                subject = thread.requiredString("subject"),
                participantId = thread.nullableString("participantId"),
                status = thread.requiredString("status"),
                unread = thread.optBoolean("unread", false),
                lastMessageAt = thread.nullableString("lastMessageAt")
            )
        }
    )

    private fun invoice(source: JSONObject) = Invoice(
        id = source.requiredString("id"),
        invoiceNumber = source.nullableString("invoiceNumber"),
        documentType = source.requiredString("documentType"),
        status = source.requiredString("status"),
        currency = source.requiredString("currency"),
        totalCents = source.optLong("totalCents"),
        vatRateBasisPoints = source.optInt("vatRateBasisPoints", 2_100),
        issuedOn = source.nullableString("issuedOn"),
        dueOn = source.nullableString("dueOn"),
        finalizedAt = source.nullableString("finalizedAt"),
        downloadPath = source.nullableString("downloadPath")
    )

    private fun payment(source: JSONObject) = Payment(
        id = source.requiredString("id"),
        amountCents = source.optLong("amountCents"),
        currency = source.requiredString("currency"),
        status = source.requiredString("status"),
        dueOn = source.nullableString("dueOn")
    )

    private fun diploma(source: JSONObject) = Diploma(
        id = source.requiredString("id"),
        title = source.requiredString("title"),
        number = source.nullableString("number"),
        issuedOn = source.nullableString("issuedOn"),
        status = source.requiredString("status"),
        verificationId = source.nullableString("verificationId"),
        downloadPath = source.nullableString("downloadPath")
    )

    private fun graduationInvite(source: JSONObject) = GraduationInvite(
        id = source.requiredString("id"),
        eventId = source.requiredString("eventId"),
        participantId = source.requiredString("participantId"),
        inviteStatus = source.requiredString("inviteStatus"),
        status = source.requiredString("status"),
        result = source.requiredString("result")
    )

    private fun document(source: JSONObject) = Document(
        id = source.requiredString("id"),
        title = source.requiredString("title"),
        description = source.nullableString("description"),
        fileName = source.nullableString("fileName"),
        mimeType = source.nullableString("mimeType"),
        sizeBytes = source.nullableLong("sizeBytes"),
        downloadPath = source.nullableString("downloadPath"),
        createdAt = source.nullableString("createdAt")
    )

    private fun mediaOverview(source: JSONObject) = MediaOverview(
        policyVersion = source.requiredString("policyVersion"),
        consents = source.getJSONArray("consents").objects().map { consent ->
            MediaConsent(
                participantId = consent.requiredString("participantId"),
                participantName = consent.requiredString("participantName"),
                status = consent.requiredString("status"),
                effectiveValid = consent.optBoolean("effectiveValid", false),
                effectiveReason = consent.requiredString("effectiveReason"),
                canDecide = consent.optBoolean("canDecide", false),
                updatedAt = consent.nullableString("updatedAt")
            )
        },
        items = source.getJSONArray("items").objects().map { item ->
            ParticipantMedia(
                id = item.requiredString("id"),
                participantId = item.requiredString("participantId"),
                caption = item.nullableString("caption"),
                mimeType = item.requiredString("mimeType"),
                publishedAt = item.nullableString("publishedAt"),
                expiresAt = item.requiredString("expiresAt"),
                downloadAllowed = item.optBoolean("downloadAllowed", false),
                viewPath = item.requiredString("viewPath"),
                downloadPath = item.nullableString("downloadPath")
            )
        }
    )

    private fun feedback(source: JSONObject) = FeedbackSurvey(
        id = source.requiredString("id"),
        participantId = source.requiredString("participantId"),
        participantName = source.requiredString("participantName"),
        campaignName = source.requiredString("campaignName"),
        prompt = source.requiredString("prompt"),
        followUpQuestion = source.requiredString("followUpQuestion"),
        status = source.requiredString("status"),
        expiresAt = source.requiredString("expiresAt"),
        completedAt = source.nullableString("completedAt"),
        score = source.nullableInt("score")?.also { require(it in 0..10) }
    )

    private fun rosterMember(source: JSONObject) = RosterMember(
        participantId = source.requiredString("participantId"),
        participantName = source.requiredString("participantName"),
        enrollmentId = source.requiredString("enrollmentId"),
        attendance = source.nullableString("attendance")
    )

    private fun JSONObject.requiredString(key: String): String =
        getString(key).trim().also { require(it.isNotEmpty()) }

    private fun JSONObject.nullableString(key: String): String? =
        if (!has(key) || isNull(key)) {
            null
        } else {
            getString(key).trim().takeIf(String::isNotEmpty)
        }

    private fun JSONObject.nullableLong(key: String): Long? =
        if (!has(key) || isNull(key)) null else getLong(key)

    private fun JSONObject.nullableInt(key: String): Int? =
        if (!has(key) || isNull(key)) null else getInt(key)

    private fun JSONObject.nullableObject(key: String): JSONObject? =
        if (!has(key) || isNull(key)) null else getJSONObject(key)

    private fun JSONArray.objects(): List<JSONObject> =
        (0 until length()).map(::getJSONObject)

    private fun JSONArray.strings(): List<String> =
        (0 until length()).map(::getString)

    private fun String.cssPixels(): Float =
        removeSuffix("px").toFloat().also { require(it in 0f..96f) }
}

object NativeThemeContractReader {
    fun parse(raw: String): ThemeBundle =
        NativeJsonParser.theme(JSONObject(raw))
}

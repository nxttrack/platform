package nl.nxttrack.mobile.domain

object NativeContract {
    const val VERSION = 1
    const val THEME_SCHEMA_VERSION = 3
    const val PORTAL_CONTRACT = "parent-portal/1.2"
    const val PROGRESS_FORMULA_VERSION = "swim_progress_v3"
    const val ASSESSMENT_SCALE_VERSION = "five_point_v1"

    val primaryDestinations = listOf(
        "overview",
        "planning",
        "development",
        "inbox",
        "more"
    )

    val routeIds = listOf(
        "overview",
        "planning",
        "lesson-detail",
        "development",
        "badges",
        "media",
        "diplomas",
        "inbox",
        "payments",
        "documents",
        "feedback",
        "children",
        "profile"
    )

    val themeKeys = setOf(
        "nxttrack-default",
        "dolphin-bay",
        "turtle-trails",
        "polar-splash",
        "coastal-explorer",
        "nationaal-zwem-abc"
    )

    fun isCompatible(theme: ThemeBundle): Boolean =
        theme.schemaVersion == THEME_SCHEMA_VERSION &&
            theme.portalContract == PORTAL_CONTRACT &&
            theme.themeKey in themeKeys &&
            theme.release == "3.0.0" &&
            theme.primaryDestinations == primaryDestinations &&
            theme.routeIds.toSet() == routeIds.toSet() &&
            theme.routeIds.size == routeIds.size &&
            theme.shellRecipe == "portal-shell/shared-v1" &&
            routeIds.all { theme.pageRecipes.containsKey(it) }
}

object FivePointAssessment {
    val values = 1..5

    fun requireRating(value: Int?): Int? {
        require(value == null || value in values) {
            "Assessment must be an integer from 1 through 5 or null"
        }
        return value
    }

    fun itemProgressFraction(value: Int?): Double? =
        requireRating(value)?.div(5.0)

    fun legacyNormalizedMetric(value: Int?): Double? =
        requireRating(value)?.minus(1)?.div(4.0)
}

object JourneyPresentation {
    fun visibleRings(rings: List<JourneyRing>): List<JourneyRing> {
        val diploma = rings.filter { it.kind == RingKind.DIPLOMA }.take(1)
        val stage = rings.filter { it.kind == RingKind.STAGE }.take(1)
        return if (stage.isEmpty()) diploma else stage + diploma
    }

    fun normalizedPercent(value: Double): Float =
        (value.coerceIn(0.0, 100.0) / 100.0).toFloat()
}

package nl.nxttrack.mobile.design

import androidx.compose.ui.test.assertCountEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onAllNodesWithContentDescription
import androidx.compose.ui.test.onNodeWithContentDescription
import androidx.compose.ui.test.performClick
import nl.nxttrack.mobile.domain.AssessmentDisplay
import org.junit.Assert.assertEquals
import org.junit.Rule
import org.junit.Test

class FivePointScoreTest {
    @get:Rule
    val compose = createComposeRule()

    @Test
    fun exactlyFiveOptionsAreExposedAndOneCanBeSelected() {
        var selected = 0
        compose.setContent {
            NxttrackTheme {
                FivePointScore(
                    rating = null,
                    display = AssessmentDisplay.SMILEYS,
                    readOnly = false,
                    onRating = { selected = it }
                )
            }
        }
        (1..5).forEach { score ->
            compose.onAllNodesWithContentDescription(
                "Score $score van 5",
                substring = true
            ).assertCountEquals(1)
        }
        compose.onNodeWithContentDescription(
            "Score 5 van 5",
            substring = true
        ).performClick()
        assertEquals(5, selected)
    }
}

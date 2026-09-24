package nl.nxttrack.mobile.domain

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Assert.assertThrows
import org.junit.Test

class ContractsTest {
    @Test
    fun `assessment remains integer one through five or null`() {
        assertNull(FivePointAssessment.requireRating(null))
        (1..5).forEach { assertEquals(it, FivePointAssessment.requireRating(it)) }
        assertThrows(IllegalArgumentException::class.java) {
            FivePointAssessment.requireRating(0)
        }
        assertThrows(IllegalArgumentException::class.java) {
            FivePointAssessment.requireRating(6)
        }
    }

    @Test
    fun `product progress and legacy normalization remain separate`() {
        assertEquals(0.2, FivePointAssessment.itemProgressFraction(1)!!, 0.0)
        assertEquals(0.0, FivePointAssessment.legacyNormalizedMetric(1)!!, 0.0)
        assertEquals(1.0, FivePointAssessment.itemProgressFraction(5)!!, 0.0)
    }

    @Test
    fun `one stage ring and one diploma ring are the maximum`() {
        val stage = ring("stage", RingKind.STAGE)
        val diploma = ring("diploma", RingKind.DIPLOMA)
        assertEquals(listOf(diploma), JourneyPresentation.visibleRings(listOf(diploma)))
        assertEquals(
            listOf(stage, diploma),
            JourneyPresentation.visibleRings(listOf(stage, stage, diploma, diploma))
        )
    }

    private fun ring(key: String, kind: RingKind) = JourneyRing(
        key = key,
        kind = kind,
        label = key,
        progressPercent = 16.6666666667,
        coveragePercent = 16.6666666667,
        assessedCount = 1,
        contributingCount = 6,
        formulaVersion = NativeContract.PROGRESS_FORMULA_VERSION
    )
}

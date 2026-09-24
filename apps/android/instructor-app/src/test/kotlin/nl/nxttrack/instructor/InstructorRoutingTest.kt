package nl.nxttrack.instructor

import org.junit.Assert.assertEquals
import org.junit.Test

class InstructorRoutingTest {
    @Test
    fun `five primary destinations own all instructor screens`() {
        assertEquals(
            setOf("today", "agenda", "groups", "learners", "inbox"),
            InstructorPage.entries.map { it.primaryDestination }.toSet()
        )
    }
}

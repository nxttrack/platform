package nl.nxttrack.parent

import org.junit.Assert.assertEquals
import org.junit.Test

class ParentRoutingTest {
    @Test
    fun `all thirteen canonical native routes have an owner`() {
        assertEquals(13, ParentPage.entries.size)
        assertEquals(5, ParentPage.entries.map { it.primaryDestination }.toSet().size)
    }
}

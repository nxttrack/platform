package nl.nxttrack.mobile.design

import org.junit.Assert.assertEquals
import org.junit.Test

class BadgeGridContractTest {
    @Test
    fun `badgewall is exactly two columns on phones and four elsewhere`() {
        assertEquals(2, badgeColumnCount(320))
        assertEquals(2, badgeColumnCount(599))
        assertEquals(4, badgeColumnCount(600))
        assertEquals(4, badgeColumnCount(1_280))
    }
}

package nl.nxttrack.parent

import androidx.test.core.app.ApplicationProvider
import androidx.test.ext.junit.runners.AndroidJUnit4
import nl.nxttrack.mobile.data.NativeThemeContractReader
import nl.nxttrack.mobile.domain.NativeContract
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class FiveThemeContractTest {
    @Test
    fun allFiveImmutableThemeBundlesPassTheNativeContract() {
        val context = ApplicationProvider.getApplicationContext<android.content.Context>()
        val files = context.assets.list("").orEmpty()
            .filter { it.endsWith(".json") }
            .sorted()
        assertEquals(5, files.size)
        files.forEach { file ->
            val raw = context.assets.open(file).bufferedReader().use { it.readText() }
            val theme = NativeThemeContractReader.parse(raw)
            assertTrue(file, NativeContract.isCompatible(theme))
            assertEquals(13, theme.routeIds.size)
            assertEquals(5, theme.primaryDestinations.size)
        }
    }
}

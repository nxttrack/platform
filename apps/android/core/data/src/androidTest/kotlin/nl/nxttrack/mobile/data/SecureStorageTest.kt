package nl.nxttrack.mobile.data

import androidx.test.ext.junit.runners.AndroidJUnit4
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Test
import org.junit.runner.RunWith

@RunWith(AndroidJUnit4::class)
class SecureStorageTest {
    @Test
    fun encryptedValuesDoNotContainTheirPlaintext() {
        val crypto = CryptoBox("instrumented-${System.nanoTime()}")
        val plainText = """{"accessToken":"not-a-real-token"}"""
        val encrypted = crypto.encrypt(plainText)
        assertFalse(encrypted.contains("not-a-real-token"))
        assertEquals(plainText, crypto.decrypt(encrypted))
    }
}

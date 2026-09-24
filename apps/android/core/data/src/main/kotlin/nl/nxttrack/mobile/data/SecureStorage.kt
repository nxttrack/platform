package nl.nxttrack.mobile.data

import android.content.ContentValues
import android.content.Context
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteOpenHelper
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import nl.nxttrack.mobile.domain.ClientKind
import nl.nxttrack.mobile.domain.PendingMutation
import java.security.KeyStore
import java.util.UUID
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

internal class CryptoBox(namespace: String) {
    private val alias = "nxttrack.$namespace.aes-gcm.v1"
    private val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }

    fun encrypt(plainText: String): String {
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.ENCRYPT_MODE, secretKey())
        val encrypted = cipher.doFinal(plainText.toByteArray(Charsets.UTF_8))
        return listOf(cipher.iv, encrypted)
            .joinToString(".") { Base64.encodeToString(it, Base64.NO_WRAP) }
    }

    fun decrypt(cipherText: String): String {
        val parts = cipherText.split(".", limit = 2)
        require(parts.size == 2) { "Invalid encrypted value" }
        val iv = Base64.decode(parts[0], Base64.NO_WRAP)
        val encrypted = Base64.decode(parts[1], Base64.NO_WRAP)
        val cipher = Cipher.getInstance(TRANSFORMATION)
        cipher.init(Cipher.DECRYPT_MODE, secretKey(), GCMParameterSpec(128, iv))
        return cipher.doFinal(encrypted).toString(Charsets.UTF_8)
    }

    private fun secretKey(): SecretKey {
        (keyStore.getKey(alias, null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(
            KeyProperties.KEY_ALGORITHM_AES,
            "AndroidKeyStore"
        ).run {
            init(
                KeyGenParameterSpec.Builder(
                    alias,
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .setKeySize(256)
                    .build()
            )
            generateKey()
        }
    }

    private companion object {
        const val TRANSFORMATION = "AES/GCM/NoPadding"
    }
}

internal class SecureSessionStore(
    context: Context,
    namespace: String
) {
    private val preferences = context.getSharedPreferences(
        "nxttrack.$namespace.secure-session",
        Context.MODE_PRIVATE
    )
    private val crypto = CryptoBox("$namespace.session")

    fun readRawSession(): String? = preferences.getString(SESSION, null)?.let {
        runCatching { crypto.decrypt(it) }.getOrNull()
    }

    fun saveRawSession(json: String) {
        preferences.edit().putString(SESSION, crypto.encrypt(json)).apply()
    }

    fun clear() {
        preferences.edit().clear().apply()
    }

    fun deviceId(): String {
        preferences.getString(DEVICE_ID, null)?.let {
            runCatching { crypto.decrypt(it) }.getOrNull()?.let { id -> return id }
        }
        val id = "android-${UUID.randomUUID()}"
        preferences.edit().putString(DEVICE_ID, crypto.encrypt(id)).apply()
        return id
    }

    private companion object {
        const val SESSION = "session"
        const val DEVICE_ID = "device-id"
    }
}

internal class EncryptedMobileDatabase(
    context: Context,
    namespace: String
) : SQLiteOpenHelper(
    context,
    "nxttrack-$namespace-encrypted.db",
    null,
    VERSION
) {
    private val crypto = CryptoBox("$namespace.database")

    override fun onCreate(database: SQLiteDatabase) {
        database.execSQL(
            """
            CREATE TABLE bootstrap_cache (
              cache_key TEXT PRIMARY KEY,
              encrypted_json TEXT NOT NULL,
              contract_version INTEGER NOT NULL,
              updated_at_epoch_ms INTEGER NOT NULL
            )
            """.trimIndent()
        )
        database.execSQL(
            """
            CREATE TABLE pending_mutations (
              command_id TEXT PRIMARY KEY,
              client TEXT NOT NULL,
              device_id TEXT NOT NULL,
              type TEXT NOT NULL,
              encrypted_payload_json TEXT NOT NULL,
              created_at_epoch_ms INTEGER NOT NULL,
              attempt_count INTEGER NOT NULL DEFAULT 0,
              last_error_code TEXT
            )
            """.trimIndent()
        )
        database.execSQL(
            "CREATE INDEX pending_mutations_created_idx ON pending_mutations(created_at_epoch_ms)"
        )
    }

    override fun onUpgrade(
        database: SQLiteDatabase,
        oldVersion: Int,
        newVersion: Int
    ) {
        if (oldVersion != newVersion) {
            database.execSQL("DELETE FROM bootstrap_cache")
            database.execSQL("DELETE FROM pending_mutations")
        }
    }

    fun saveBootstrap(cacheKey: String, contractVersion: Int, json: String) {
        val values = ContentValues().apply {
            put("cache_key", cacheKey)
            put("encrypted_json", crypto.encrypt(json))
            put("contract_version", contractVersion)
            put("updated_at_epoch_ms", System.currentTimeMillis())
        }
        writableDatabase.insertWithOnConflict(
            "bootstrap_cache",
            null,
            values,
            SQLiteDatabase.CONFLICT_REPLACE
        )
    }

    fun readBootstrap(cacheKey: String): String? =
        readableDatabase.query(
            "bootstrap_cache",
            arrayOf("encrypted_json"),
            "cache_key = ?",
            arrayOf(cacheKey),
            null,
            null,
            null,
            "1"
        ).use { cursor ->
            if (!cursor.moveToFirst()) null else runCatching {
                crypto.decrypt(cursor.getString(0))
            }.getOrNull()
        }

    fun enqueue(mutation: PendingMutation) {
        val values = ContentValues().apply {
            put("command_id", mutation.commandId)
            put("client", mutation.client.wireValue)
            put("device_id", mutation.deviceId)
            put("type", mutation.type)
            put("encrypted_payload_json", crypto.encrypt(mutation.payloadJson))
            put("created_at_epoch_ms", mutation.createdAtEpochMs)
            put("attempt_count", mutation.attemptCount)
            put("last_error_code", mutation.lastErrorCode)
        }
        writableDatabase.insertWithOnConflict(
            "pending_mutations",
            null,
            values,
            SQLiteDatabase.CONFLICT_IGNORE
        )
    }

    fun pending(limit: Int = 100): List<PendingMutation> =
        readableDatabase.query(
            "pending_mutations",
            null,
            null,
            null,
            null,
            null,
            "created_at_epoch_ms ASC",
            limit.coerceIn(1, 500).toString()
        ).use { cursor ->
            buildList {
                while (cursor.moveToNext()) {
                    val payload = runCatching {
                        crypto.decrypt(
                            cursor.getString(
                                cursor.getColumnIndexOrThrow(
                                    "encrypted_payload_json"
                                )
                            )
                        )
                    }.getOrNull() ?: continue
                    add(
                        PendingMutation(
                            commandId = cursor.text("command_id"),
                            client = if (cursor.text("client") == "parent") {
                                ClientKind.PARENT
                            } else {
                                ClientKind.INSTRUCTOR
                            },
                            deviceId = cursor.text("device_id"),
                            type = cursor.text("type"),
                            payloadJson = payload,
                            createdAtEpochMs = cursor.long("created_at_epoch_ms"),
                            attemptCount = cursor.int("attempt_count"),
                            lastErrorCode = cursor.nullableText("last_error_code")
                        )
                    )
                }
            }
        }

    fun markAttempt(commandId: String, errorCode: String) {
        writableDatabase.execSQL(
            """
            UPDATE pending_mutations
            SET attempt_count = attempt_count + 1, last_error_code = ?
            WHERE command_id = ?
            """.trimIndent(),
            arrayOf(errorCode.take(100), commandId)
        )
    }

    fun removeMutation(commandId: String) {
        writableDatabase.delete(
            "pending_mutations",
            "command_id = ?",
            arrayOf(commandId)
        )
    }

    fun pendingCount(): Int =
        readableDatabase.rawQuery(
            "SELECT COUNT(*) FROM pending_mutations",
            null
        ).use { cursor ->
            if (cursor.moveToFirst()) cursor.getInt(0) else 0
        }

    fun clearUserData() {
        writableDatabase.beginTransaction()
        try {
            writableDatabase.delete("bootstrap_cache", null, null)
            writableDatabase.delete("pending_mutations", null, null)
            writableDatabase.setTransactionSuccessful()
        } finally {
            writableDatabase.endTransaction()
        }
    }

    private fun android.database.Cursor.text(column: String) =
        getString(getColumnIndexOrThrow(column))

    private fun android.database.Cursor.nullableText(column: String): String? {
        val index = getColumnIndexOrThrow(column)
        return if (isNull(index)) null else getString(index)
    }

    private fun android.database.Cursor.long(column: String) =
        getLong(getColumnIndexOrThrow(column))

    private fun android.database.Cursor.int(column: String) =
        getInt(getColumnIndexOrThrow(column))

    private companion object {
        const val VERSION = 1
    }
}

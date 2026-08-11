package nl.nxttrack.mobile.data

import nl.nxttrack.mobile.domain.ClientKind
import nl.nxttrack.mobile.domain.MobileSession
import nl.nxttrack.mobile.domain.PendingMutation
import org.json.JSONObject
import java.io.ByteArrayOutputStream
import java.net.HttpURLConnection
import java.net.URI
import java.net.URLEncoder

internal data class ApiResponse(
    val status: Int,
    val body: String
)

data class DownloadedFile(
    val bytes: ByteArray,
    val contentType: String,
    val suggestedName: String?
)

class NativeApiException(
    val errorCode: String,
    val status: Int,
    val retryable: Boolean
) : Exception(errorCode)

internal class NativeApi(
    baseUrl: String,
    private val client: ClientKind
) {
    private val origin = baseUrl.trimEnd('/').also {
        val uri = URI(it)
        require(uri.scheme == "https" && !uri.host.isNullOrBlank()) {
            "Native API requires a valid HTTPS origin"
        }
    }

    fun signIn(
        email: String,
        password: String,
        tenantId: String? = null
    ): String = requestJson(
        method = "POST",
        path = "/api/native/v1/auth/sign-in",
        body = JSONObject()
            .put("client", client.wireValue)
            .put("email", email)
            .put("password", password)
            .put("activeTenantId", tenantId ?: JSONObject.NULL)
            .toString()
    ).body

    fun refresh(session: MobileSession): String = requestJson(
        method = "POST",
        path = "/api/native/v1/auth/refresh",
        body = JSONObject()
            .put("client", client.wireValue)
            .put("refreshToken", session.tokens.refreshToken)
            .put("activeTenantId", session.tenant.id)
            .toString()
    ).body

    fun signOut(session: MobileSession) {
        requestJson(
            method = "POST",
            path = "/api/native/v1/auth/sign-out",
            body = JSONObject().put("client", client.wireValue).toString(),
            accessToken = session.tokens.accessToken,
            tenantId = session.tenant.id
        )
    }

    fun bootstrap(session: MobileSession): String {
        val encodedClient = URLEncoder.encode(
            client.wireValue,
            Charsets.UTF_8.name()
        )
        return requestJson(
            method = "GET",
            path = "/api/native/v1/bootstrap?client=$encodedClient",
            accessToken = session.tokens.accessToken,
            tenantId = session.tenant.id
        ).body
    }

    fun submit(session: MobileSession, mutation: PendingMutation): String {
        val body = JSONObject()
            .put("client", mutation.client.wireValue)
            .put("commandId", mutation.commandId)
            .put("deviceId", mutation.deviceId)
            .put("type", mutation.type)
            .put("payload", JSONObject(mutation.payloadJson))
            .toString()
        return requestJson(
            method = "POST",
            path = "/api/native/v1/commands",
            body = body,
            accessToken = session.tokens.accessToken,
            tenantId = session.tenant.id
        ).body
    }

    fun download(session: MobileSession, internalPath: String): DownloadedFile {
        require(internalPath.startsWith("/") && !internalPath.startsWith("//")) {
            "Only internal file paths are accepted"
        }
        val connection = openConnection(internalPath)
        connection.requestMethod = "GET"
        connection.setRequestProperty(
            "Authorization",
            "Bearer ${session.tokens.accessToken}"
        )
        connection.setRequestProperty("X-NXTTRACK-Tenant-Id", session.tenant.id)
        connection.setRequestProperty("Accept", "application/pdf,image/*")
        val status = connection.responseCode
        if (status !in 200..299) {
            val body = readBody(connection, success = false)
            connection.disconnect()
            throw failure(status, body)
        }
        val expectedLength = connection.contentLengthLong
        if (expectedLength > MAX_DOWNLOAD_BYTES) {
            connection.disconnect()
            throw NativeApiException("file_too_large", 413, false)
        }
        val bytes = connection.inputStream.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            var total = 0L
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                if (total > MAX_DOWNLOAD_BYTES) {
                    throw NativeApiException("file_too_large", 413, false)
                }
                output.write(buffer, 0, read)
            }
            output.toByteArray()
        }
        val contentType = connection.contentType
            ?.substringBefore(';')
            ?.trim()
            ?.takeIf { it.isNotBlank() }
            ?: "application/octet-stream"
        val name = contentDispositionFileName(
            connection.getHeaderField("Content-Disposition")
        )
        connection.disconnect()
        return DownloadedFile(bytes, contentType, name)
    }

    private fun requestJson(
        method: String,
        path: String,
        body: String? = null,
        accessToken: String? = null,
        tenantId: String? = null
    ): ApiResponse {
        val connection = openConnection(path)
        connection.requestMethod = method
        connection.setRequestProperty("Accept", "application/json")
        connection.setRequestProperty("Cache-Control", "no-store")
        if (accessToken != null) {
            connection.setRequestProperty("Authorization", "Bearer $accessToken")
        }
        if (tenantId != null) {
            connection.setRequestProperty("X-NXTTRACK-Tenant-Id", tenantId)
        }
        if (body != null) {
            connection.doOutput = true
            connection.setRequestProperty("Content-Type", "application/json")
            val bytes = body.toByteArray(Charsets.UTF_8)
            require(bytes.size <= MAX_REQUEST_BYTES)
            connection.setFixedLengthStreamingMode(bytes.size)
            connection.outputStream.use { it.write(bytes) }
        }
        val status = connection.responseCode
        val responseBody = readBody(connection, success = status in 200..299)
        val contentType = connection.contentType
            ?.substringBefore(';')
            ?.trim()
        connection.disconnect()
        if (status !in 200..299) throw failure(status, responseBody)
        if (contentType != "application/json") {
            throw NativeApiException("invalid_response_type", 502, true)
        }
        return ApiResponse(status, responseBody)
    }

    private fun openConnection(path: String): HttpURLConnection {
        require(path.startsWith("/") && !path.startsWith("//"))
        return URI("$origin$path").toURL().openConnection().let {
            it as HttpURLConnection
        }.apply {
            connectTimeout = CONNECT_TIMEOUT_MS
            readTimeout = READ_TIMEOUT_MS
            instanceFollowRedirects = false
            useCaches = false
        }
    }

    private fun readBody(
        connection: HttpURLConnection,
        success: Boolean
    ): String {
        val stream = if (success) connection.inputStream else connection.errorStream
        if (stream == null) return ""
        return stream.use { input ->
            val output = ByteArrayOutputStream()
            val buffer = ByteArray(DEFAULT_BUFFER_SIZE)
            var total = 0
            while (true) {
                val read = input.read(buffer)
                if (read < 0) break
                total += read
                if (total > MAX_RESPONSE_BYTES) {
                    throw NativeApiException("response_too_large", 502, true)
                }
                output.write(buffer, 0, read)
            }
            output.toString(Charsets.UTF_8.name())
        }
    }

    private fun failure(status: Int, body: String): NativeApiException {
        val code = runCatching {
            JSONObject(body).optString("error")
        }.getOrNull()?.takeIf { it.matches(ERROR_CODE) } ?: "request_failed"
        return NativeApiException(
            errorCode = code,
            status = status,
            retryable = status == 408 || status == 425 || status == 429 || status >= 500
        )
    }

    private fun contentDispositionFileName(header: String?): String? =
        header
            ?.let { CONTENT_DISPOSITION_FILE_NAME.find(it)?.groupValues?.get(1) }
            ?.trim()
            ?.takeIf {
                it.isNotBlank() &&
                    it != "." &&
                    it != ".." &&
                    !it.contains('/') &&
                    !it.contains('\\')
            }

    private companion object {
        const val CONNECT_TIMEOUT_MS = 15_000
        const val READ_TIMEOUT_MS = 30_000
        const val MAX_REQUEST_BYTES = 64 * 1024
        const val MAX_RESPONSE_BYTES = 5 * 1024 * 1024
        const val MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024L
        val ERROR_CODE = Regex("^[a-z0-9_]{3,100}$")
        val CONTENT_DISPOSITION_FILE_NAME =
            Regex("""(?:^|;)\s*filename="([^"\r\n]{1,180})"""")
    }
}

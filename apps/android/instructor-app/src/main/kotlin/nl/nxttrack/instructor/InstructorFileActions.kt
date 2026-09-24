package nl.nxttrack.instructor

import android.content.ActivityNotFoundException
import android.content.ClipData
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.widget.Toast
import androidx.core.content.FileProvider
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import nl.nxttrack.mobile.data.DownloadedFile
import java.io.File

object InstructorFileActions {
    suspend fun openDownloaded(context: Context, downloaded: DownloadedFile) {
        val prepared = prepareFile(context, downloaded)
        withContext(Dispatchers.Main.immediate) {
            try {
                context.startActivity(
                    Intent.createChooser(
                        Intent(Intent.ACTION_VIEW).apply {
                            setDataAndType(prepared.uri, prepared.contentType)
                            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
                        },
                        "Open document"
                    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
                )
            } catch (_: ActivityNotFoundException) {
                shareFallback(context, prepared)
            }
        }
    }

    private suspend fun prepareFile(
        context: Context,
        downloaded: DownloadedFile
    ): PreparedFile = withContext(Dispatchers.IO) {
        val directory = File(context.cacheDir, "native-documents").apply {
            mkdirs()
        }
        val extension = when (downloaded.contentType) {
            "application/pdf" -> "pdf"
            "image/png" -> "png"
            "image/jpeg" -> "jpg"
            "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ->
                "docx"
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ->
                "xlsx"
            else -> "bin"
        }
        val safeName = downloaded.suggestedName
            ?.replace(Regex("[^A-Za-z0-9._-]"), "_")
            ?.trim('.')
            ?.take(100)
            ?.takeIf { it.isNotBlank() }
            ?: "nxttrack-document.$extension"
        val file = File(directory, safeName)
        check(file.canonicalFile.parentFile == directory.canonicalFile)
        file.writeBytes(downloaded.bytes)
        val uri = FileProvider.getUriForFile(
            context,
            "${context.packageName}.files",
            file
        )
        PreparedFile(uri, downloaded.contentType)
    }

    private fun shareFallback(context: Context, prepared: PreparedFile) {
        val share = Intent(Intent.ACTION_SEND).apply {
            type = prepared.contentType
            putExtra(Intent.EXTRA_STREAM, prepared.uri)
            clipData = ClipData.newUri(
                context.contentResolver,
                "NXTTRACK-document",
                prepared.uri
            )
            addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION)
        }
        try {
            context.startActivity(
                Intent.createChooser(share, "Deel document")
                    .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
            )
        } catch (_: ActivityNotFoundException) {
            Toast.makeText(
                context,
                "Geen geschikte app gevonden voor dit bestand.",
                Toast.LENGTH_LONG
            ).show()
        }
    }

    private data class PreparedFile(
        val uri: Uri,
        val contentType: String
    )
}

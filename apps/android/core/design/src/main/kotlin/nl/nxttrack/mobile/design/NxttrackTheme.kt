package nl.nxttrack.mobile.design

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.ColorScheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import nl.nxttrack.mobile.domain.ThemeBundle
import nl.nxttrack.mobile.domain.ThemeTokens

@Composable
fun NxttrackTheme(
    theme: ThemeBundle? = null,
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val tokens = theme?.tokens ?: ThemeTokens()
    MaterialTheme(
        colorScheme = if (darkTheme) tokens.darkScheme() else tokens.lightScheme(),
        typography = Typography(),
        content = content
    )
}

fun parseSemanticColor(value: String, fallback: Color): Color {
    val normalized = value.trim()
    if (normalized.startsWith("#")) {
        val hex = normalized.removePrefix("#")
        return runCatching {
            when (hex.length) {
                6 -> Color(("FF$hex").toLong(16))
                8 -> Color(hex.toLong(16))
                else -> fallback
            }
        }.getOrDefault(fallback)
    }
    val rgba = Regex(
        """rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*([01](?:\.\d+)?)\s*\)"""
    ).matchEntire(normalized)
    if (rgba != null) {
        val (red, green, blue, alpha) = rgba.destructured
        return Color(
            red = red.toInt().coerceIn(0, 255) / 255f,
            green = green.toInt().coerceIn(0, 255) / 255f,
            blue = blue.toInt().coerceIn(0, 255) / 255f,
            alpha = alpha.toFloat().coerceIn(0f, 1f)
        )
    }
    return fallback
}

private fun ThemeTokens.lightScheme(): ColorScheme = lightColorScheme(
    primary = parseSemanticColor(primary, Color(0xFF0878E5)),
    onPrimary = Color.White,
    primaryContainer = parseSemanticColor(surfaceAlt, Color(0xFFF6FAFC)),
    onPrimaryContainer = parseSemanticColor(text, Color(0xFF09203E)),
    secondary = parseSemanticColor(secondary, Color(0xFF14B8B1)),
    tertiary = parseSemanticColor(reward, Color(0xFFF6B744)),
    background = parseSemanticColor(canvas, Color(0xFFEEF6FB)),
    onBackground = parseSemanticColor(text, Color(0xFF09203E)),
    surface = parseSemanticColor(surface, Color.White),
    onSurface = parseSemanticColor(text, Color(0xFF09203E)),
    surfaceVariant = parseSemanticColor(surfaceAlt, Color(0xFFF6FAFC)),
    onSurfaceVariant = parseSemanticColor(textMuted, Color(0xFF61748B)),
    error = parseSemanticColor(danger, Color(0xFFB4233D)),
    outline = parseSemanticColor(textMuted, Color(0xFF61748B)).copy(alpha = .45f)
)

private fun ThemeTokens.darkScheme(): ColorScheme = darkColorScheme(
    primary = parseSemanticColor(secondary, Color(0xFF14B8B1)),
    onPrimary = Color(0xFF001F2A),
    secondary = parseSemanticColor(primary, Color(0xFF72B7FF)),
    tertiary = parseSemanticColor(reward, Color(0xFFF6B744)),
    background = parseSemanticColor(rail, Color(0xFF071D39)),
    onBackground = Color(0xFFF5F8FC),
    surface = parseSemanticColor(rail, Color(0xFF071D39)).lighten(.08f),
    onSurface = Color(0xFFF5F8FC),
    surfaceVariant = parseSemanticColor(rail, Color(0xFF071D39)).lighten(.14f),
    onSurfaceVariant = Color(0xFFD2DEEA),
    error = Color(0xFFFFB4AB)
)

private fun Color.lighten(amount: Float) = Color(
    red = red + (1f - red) * amount,
    green = green + (1f - green) * amount,
    blue = blue + (1f - blue) * amount,
    alpha = alpha
)

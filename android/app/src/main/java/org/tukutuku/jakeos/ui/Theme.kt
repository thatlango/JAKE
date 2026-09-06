package org.tukutuku.jakeos.ui

import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

val JakePurple = Color(0xFF6D5DFB)
val JakeNavy = Color(0xFF172033)
val JakeMuted = Color(0xFF6D7485)
val JakeCanvas = Color(0xFFF7F7FA)
val JakeSurface = Color(0xFFFFFFFF)
val JakeLavender = Color(0xFFF0EEFF)
val JakeGreen = Color(0xFF1F9D68)
val JakeAmber = Color(0xFFB7791F)
val JakeRed = Color(0xFFCF3F4F)

private val JakeLight = lightColorScheme(
    primary = JakePurple,
    onPrimary = Color.White,
    primaryContainer = JakeLavender,
    onPrimaryContainer = JakeNavy,
    secondary = Color(0xFF4E5A73),
    background = JakeCanvas,
    onBackground = JakeNavy,
    surface = JakeSurface,
    onSurface = JakeNavy,
    surfaceVariant = Color(0xFFF1F2F6),
    onSurfaceVariant = JakeMuted,
    outline = Color(0xFFD8DAE2),
    error = JakeRed
)

@Composable
fun JakeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = JakeLight,
        typography = Typography(),
        content = content
    )
}

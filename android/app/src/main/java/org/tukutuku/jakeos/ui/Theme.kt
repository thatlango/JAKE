package org.tukutuku.jakeos.ui

import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Shapes
import androidx.compose.material3.Typography
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp

val JakePurple = Color(0xFF315F4D)
val JakeNavy = Color(0xFF1F2925)
val JakeMuted = Color(0xFF66726C)
val JakeCanvas = Color(0xFFF7F8F6)
val JakeSurface = Color(0xFFFFFFFF)
val JakeLavender = Color(0xFFE8F1EC)
val JakeGreen = Color(0xFF2F7B58)
val JakeAmber = Color(0xFFBF712A)
val JakeRed = Color(0xFFB54343)

private val JakeLight = lightColorScheme(
    primary = JakePurple,
    onPrimary = Color.White,
    primaryContainer = JakeLavender,
    onPrimaryContainer = Color(0xFF244A3B),
    secondary = JakeAmber,
    onSecondary = Color.White,
    secondaryContainer = Color(0xFFFBEFE3),
    onSecondaryContainer = Color(0xFF6F3D12),
    tertiary = Color(0xFF486B91),
    onTertiary = Color.White,
    background = JakeCanvas,
    onBackground = JakeNavy,
    surface = JakeSurface,
    onSurface = JakeNavy,
    surfaceVariant = Color(0xFFF1F4F1),
    onSurfaceVariant = JakeMuted,
    outline = Color(0xFFCBD4CE),
    outlineVariant = Color(0xFFE1E6E2),
    error = JakeRed,
    onError = Color.White,
    errorContainer = Color(0xFFFDEEEE),
    onErrorContainer = Color(0xFF7F2A2A)
)

private val JakeShapes = Shapes(
    extraSmall = RoundedCornerShape(8.dp),
    small = RoundedCornerShape(10.dp),
    medium = RoundedCornerShape(14.dp),
    large = RoundedCornerShape(20.dp),
    extraLarge = RoundedCornerShape(28.dp)
)

@Composable
fun JakeTheme(content: @Composable () -> Unit) {
    MaterialTheme(
        colorScheme = JakeLight,
        typography = Typography(),
        shapes = JakeShapes,
        content = content
    )
}

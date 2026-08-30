package com.example.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

// Academic Authentic Palette (#1B5E4B, #F8F4ED, #C8956C)
private val AcademicLightColorScheme = lightColorScheme(
  primary = TalibEmerald,
  onPrimary = Color.White,
  primaryContainer = TalibEmeraldContainer,
  onPrimaryContainer = TalibEmeraldOnContainer,
  secondary = TalibBronze,
  onSecondary = Color.White,
  secondaryContainer = TalibBronzeContainer,
  onSecondaryContainer = TalibBronzeDark,
  tertiary = TalibBronzeDark,
  onTertiary = Color.White,
  background = TalibCream,
  onBackground = TextPrimaryLight,
  surface = TalibCreamSurface,
  onSurface = TextPrimaryLight,
  surfaceVariant = TalibCreamCard,
  onSurfaceVariant = TextSecondaryLight,
  outline = TalibCreamBorder
)

private val AcademicDarkColorScheme = darkColorScheme(
  primary = TalibEmeraldLight,
  onPrimary = Color.White,
  primaryContainer = TalibAcademicDarkContainer,
  onPrimaryContainer = TalibEmeraldContainer,
  secondary = TalibBronzeLight,
  onSecondary = Color.Black,
  secondaryContainer = TalibBronzeDark,
  onSecondaryContainer = Color.White,
  tertiary = TalibBronze,
  onTertiary = Color.Black,
  background = TalibAcademicDarkBg,
  onBackground = TalibAcademicDarkText,
  surface = TalibAcademicDarkSurface,
  onSurface = TalibAcademicDarkText,
  surfaceVariant = TalibAcademicDarkContainer,
  onSurfaceVariant = Color(0xFFA7C4B9),
  outline = Color(0xFF264C40)
)

// Modern Purple Palette
private val ModernDarkColorScheme = darkColorScheme(
  primary = TalibCrimson,
  onPrimary = Color.White,
  primaryContainer = TalibCrimsonDark,
  onPrimaryContainer = Color.White,
  secondary = TalibCrimsonLight,
  onSecondary = Color.White,
  background = TalibDarkBg,
  onBackground = TalibDarkText,
  surface = TalibDarkSurface,
  onSurface = TalibDarkText,
  surfaceVariant = TalibDarkContainer,
  onSurfaceVariant = TalibDarkMuted,
  outline = Color(0xFF4B5563)
)

private val ModernLightColorScheme = lightColorScheme(
  primary = TalibPurple,
  onPrimary = Color.White,
  primaryContainer = TalibPurpleContainer,
  onPrimaryContainer = TalibPurpleDark,
  secondary = TalibPurpleDark,
  onSecondary = Color.White,
  background = TalibPurpleBg,
  onBackground = TextPrimaryLight,
  surface = TalibPurpleSurface,
  onSurface = TextPrimaryLight,
  surfaceVariant = Color(0xFFF1F5F9),
  onSurfaceVariant = TextSecondaryLight,
  outline = Color(0xFFE2E8F0)
)

@Composable
fun TalibTheme(
  darkTheme: Boolean = isSystemInDarkTheme(),
  isAcademicTheme: Boolean = true,
  content: @Composable () -> Unit,
) {
  val colorScheme = when {
    isAcademicTheme && darkTheme -> AcademicDarkColorScheme
    isAcademicTheme && !darkTheme -> AcademicLightColorScheme
    !isAcademicTheme && darkTheme -> ModernDarkColorScheme
    else -> ModernLightColorScheme
  }

  MaterialTheme(
    colorScheme = colorScheme,
    typography = Typography,
    content = content
  )
}


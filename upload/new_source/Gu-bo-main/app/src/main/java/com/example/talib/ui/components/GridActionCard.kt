package com.example.talib.ui.components

import androidx.compose.animation.core.FastOutSlowInEasing
import androidx.compose.animation.core.RepeatMode
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ui.theme.TalibCrimson
import com.example.ui.theme.TalibCrimsonDark
import com.example.ui.theme.TalibPurple
import com.example.ui.theme.TalibPurpleDark

@Composable
fun GridActionCard(
  title: String,
  icon: ImageVector,
  badgeText: String? = null,
  isDarkMode: Boolean,
  delayOffsetMs: Int = 0,
  onClick: () -> Unit,
  modifier: Modifier = Modifier
) {
  val infiniteTransition = rememberInfiniteTransition(label = "floating_card_$title")
  val offsetY by infiniteTransition.animateFloat(
    initialValue = 0f,
    targetValue = -5f,
    animationSpec = infiniteRepeatable(
      animation = tween(durationMillis = 2400 + (delayOffsetMs % 800), easing = FastOutSlowInEasing),
      repeatMode = RepeatMode.Reverse
    ),
    label = "offset_anim_$title"
  )

  val gradientBrush = if (isDarkMode) {
    Brush.linearGradient(
      colors = listOf(
        TalibCrimson,
        TalibCrimsonDark
      )
    )
  } else {
    Brush.linearGradient(
      colors = listOf(
        TalibPurple,
        TalibPurpleDark
      )
    )
  }

  Surface(
    modifier = modifier
      .fillMaxWidth()
      .height(78.dp)
      .offset(y = offsetY.dp)
      .shadow(
        elevation = 10.dp,
        shape = RoundedCornerShape(20.dp),
        ambientColor = if (isDarkMode) TalibCrimson.copy(alpha = 0.3f) else TalibPurple.copy(alpha = 0.35f),
        spotColor = if (isDarkMode) TalibCrimsonDark else TalibPurpleDark
      )
      .clip(RoundedCornerShape(20.dp))
      .clickable(onClick = onClick)
      .testTag("action_card_${title.replace(" ", "_")}"),
    shape = RoundedCornerShape(20.dp),
    color = Color.Transparent
  ) {
    Box(
      modifier = Modifier
        .fillMaxSize()
        .background(gradientBrush)
        .padding(horizontal = 14.dp, vertical = 10.dp)
    ) {
      Row(
        modifier = Modifier.fillMaxSize(),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(12.dp)
      ) {
        // Icon Container with frosted glass effect
        Box(
          modifier = Modifier
            .size(44.dp)
            .clip(RoundedCornerShape(14.dp))
            .background(Color.White.copy(alpha = 0.22f)),
          contentAlignment = Alignment.Center
        ) {
          Icon(
            imageVector = icon,
            contentDescription = title,
            tint = Color.White,
            modifier = Modifier.size(22.dp)
          )
        }

        Column(
          modifier = Modifier.weight(1f),
          verticalArrangement = Arrangement.Center
        ) {
          Text(
            text = title,
            style = MaterialTheme.typography.titleMedium.copy(
              color = Color.White,
              fontWeight = FontWeight.ExtraBold,
              fontSize = 14.sp
            ),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
          )

          if (badgeText != null) {
            Text(
              text = badgeText,
              style = MaterialTheme.typography.labelSmall.copy(
                color = Color.White.copy(alpha = 0.85f),
                fontWeight = FontWeight.Medium,
                fontSize = 11.sp
              ),
              maxLines = 1,
              overflow = TextOverflow.Ellipsis
            )
          }
        }
      }
    }
  }
}

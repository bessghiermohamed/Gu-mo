package com.example.talib.ui.components

import androidx.compose.animation.*
import androidx.compose.animation.core.*
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Sync
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.ui.theme.TalibPurple
import com.example.ui.theme.TalibPurpleDark

@Composable
fun GlobalLoadingIndicator(
  isLoading: Boolean,
  message: String? = null,
  isDarkMode: Boolean = false,
  modifier: Modifier = Modifier
) {
  val infiniteTransition = rememberInfiniteTransition(label = "loading_icon_rotation")
  val rotation by infiniteTransition.animateFloat(
    initialValue = 0f,
    targetValue = 360f,
    animationSpec = infiniteRepeatable(
      animation = tween(1200, easing = LinearEasing),
      repeatMode = RepeatMode.Restart
    ),
    label = "rotation_anim"
  )

  Column(
    modifier = modifier
      .fillMaxWidth()
      .testTag("global_loading_indicator")
  ) {
    // 1. Sleek Top Indeterminate Linear Bar
    AnimatedVisibility(
      visible = isLoading,
      enter = fadeIn(tween(200)) + expandVertically(tween(250)),
      exit = fadeOut(tween(200)) + shrinkVertically(tween(250))
    ) {
      LinearProgressIndicator(
        modifier = Modifier
          .fillMaxWidth()
          .height(3.dp)
          .testTag("global_linear_progress_bar"),
        color = MaterialTheme.colorScheme.primary,
        trackColor = MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
      )
    }

    // 2. Floating Pill with Status Message
    AnimatedVisibility(
      visible = isLoading,
      enter = fadeIn(tween(300)) + slideInVertically(
        animationSpec = spring(stiffness = Spring.StiffnessMediumLow),
        initialOffsetY = { -it }
      ),
      exit = fadeOut(tween(250)) + slideOutVertically(
        animationSpec = tween(200),
        targetOffsetY = { -it }
      )
    ) {
      Box(
        modifier = Modifier
          .fillMaxWidth()
          .padding(top = 10.dp, start = 16.dp, end = 16.dp),
        contentAlignment = Alignment.Center
      ) {
        Surface(
          modifier = Modifier
            .shadow(elevation = 12.dp, shape = RoundedCornerShape(24.dp))
            .clip(RoundedCornerShape(24.dp))
            .testTag("global_loading_pill"),
          color = MaterialTheme.colorScheme.surfaceColorAtElevation(4.dp),
          shape = RoundedCornerShape(24.dp),
          tonalElevation = 6.dp,
          border = androidx.compose.foundation.BorderStroke(
            width = 1.dp,
            color = MaterialTheme.colorScheme.primary.copy(alpha = 0.25f)
          )
        ) {
          Row(
            modifier = Modifier
              .padding(horizontal = 16.dp, vertical = 10.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(10.dp)
          ) {
            // Rotating sync icon in colored container
            Box(
              modifier = Modifier
                .size(28.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)),
              contentAlignment = Alignment.Center
            ) {
              Icon(
                imageVector = Icons.Default.Sync,
                contentDescription = "جاري تحميل البيانات الأكاديمية",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                  .size(18.dp)
                  .rotate(rotation)
              )
            }

            Text(
              text = message ?: "جاري جلب المحتوى الأكاديمي من الخادم...",
              style = MaterialTheme.typography.labelMedium.copy(
                fontWeight = FontWeight.SemiBold,
                fontSize = 12.sp,
                color = MaterialTheme.colorScheme.onSurface
              )
            )

            CircularProgressIndicator(
              modifier = Modifier.size(16.dp),
              strokeWidth = 2.dp,
              color = MaterialTheme.colorScheme.primary
            )
          }
        }
      }
    }
  }
}

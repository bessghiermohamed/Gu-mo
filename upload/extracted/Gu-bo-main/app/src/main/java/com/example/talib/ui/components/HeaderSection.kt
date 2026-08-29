package com.example.talib.ui.components

import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.rotate
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.compose.animation.core.animateFloat
import androidx.compose.animation.core.infiniteRepeatable
import androidx.compose.animation.core.rememberInfiniteTransition
import androidx.compose.animation.core.LinearEasing
import com.example.talib.ui.viewmodel.ScreenRoute

@Composable
fun HeaderSection(
  isDarkMode: Boolean,
  onToggleTheme: () -> Unit,
  currentScreen: ScreenRoute,
  onAdminClick: () -> Unit,
  onBackClick: (() -> Unit)? = null,
  isLoading: Boolean = false,
  onRefresh: (() -> Unit)? = null,
  onNotificationsClick: (() -> Unit)? = null,
  unreadNotificationsCount: Int = 2
) {
  val iconRotation by animateFloatAsState(
    targetValue = if (isDarkMode) 180f else 0f,
    animationSpec = tween(durationMillis = 400),
    label = "theme_icon_rotation"
  )

  val infiniteTransition = rememberInfiniteTransition(label = "refresh_rotation")
  val refreshRotation by infiniteTransition.animateFloat(
    initialValue = 0f,
    targetValue = 360f,
    animationSpec = infiniteRepeatable(
      animation = tween(1000, easing = LinearEasing),
      repeatMode = androidx.compose.animation.core.RepeatMode.Restart
    ),
    label = "refresh_anim"
  )

  Surface(
    modifier = Modifier.fillMaxWidth(),
    color = MaterialTheme.colorScheme.surface,
    tonalElevation = 2.dp,
    shadowElevation = 4.dp
  ) {
    Column(
      modifier = Modifier
        .fillMaxWidth()
        .statusBarsPadding()
        .padding(horizontal = 16.dp, vertical = 12.dp)
    ) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          if (onBackClick != null && currentScreen != ScreenRoute.HOME) {
            IconButton(
              onClick = onBackClick,
              modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                .testTag("back_button")
            ) {
              Icon(
                imageVector = Icons.AutoMirrored.Filled.ArrowForward, // In RTL, forward arrow points back
                contentDescription = "الرجوع",
                tint = MaterialTheme.colorScheme.primary
              )
            }
          }

          Column {
            Text(
              text = "طالب | Talib",
              style = MaterialTheme.typography.titleLarge.copy(
                fontWeight = FontWeight.Black,
                color = MaterialTheme.colorScheme.primary,
                fontSize = 20.sp
              )
            )
            Text(
              text = when (currentScreen) {
                ScreenRoute.HOME -> "رفيقك الأكاديمي الشامل"
                ScreenRoute.ADMIN -> "لوحة الإشراف وإدارة النطاقات"
                else -> currentScreen.titleAr
              },
              style = MaterialTheme.typography.bodySmall.copy(
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontWeight = FontWeight.Medium
              )
            )
          }
        }

        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
          // Notification Bell with Unread Badge (ثابت أعلى الهيدر لجميع الشاشات)
          if (onNotificationsClick != null && currentScreen != ScreenRoute.ADMIN) {
            IconButton(
              onClick = onNotificationsClick,
              modifier = Modifier
                .size(42.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f))
                .testTag("header_notifications_button")
            ) {
              BadgedBox(
                badge = {
                  if (unreadNotificationsCount > 0) {
                    Badge(
                      containerColor = Color(0xFFEF4444),
                      contentColor = Color.White
                    ) {
                      Text(
                        text = if (unreadNotificationsCount > 9) "9+" else unreadNotificationsCount.toString(),
                        fontSize = 9.sp,
                        fontWeight = FontWeight.Bold
                      )
                    }
                  }
                }
              ) {
                Icon(
                  imageVector = if (unreadNotificationsCount > 0) Icons.Default.NotificationsActive else Icons.Default.Notifications,
                  contentDescription = "مركز الإشعارات والتنبيهات",
                  tint = if (unreadNotificationsCount > 0) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
                  modifier = Modifier.size(22.dp)
                )
              }
            }
          }

          // If in Admin Screen, provide a clear Exit button
          if (currentScreen == ScreenRoute.ADMIN) {
            FilledTonalButton(
              onClick = onAdminClick,
              shape = RoundedCornerShape(12.dp),
              contentPadding = PaddingValues(horizontal = 10.dp, vertical = 6.dp),
              colors = ButtonDefaults.filledTonalButtonColors(
                containerColor = MaterialTheme.colorScheme.primary,
                contentColor = MaterialTheme.colorScheme.onPrimary
              ),
              modifier = Modifier.testTag("admin_exit_btn")
            ) {
              Icon(
                imageVector = Icons.AutoMirrored.Filled.ExitToApp,
                contentDescription = "الخروج من الإشراف",
                modifier = Modifier.size(16.dp)
              )
              Spacer(modifier = Modifier.width(4.dp))
              Text(
                text = "خروج",
                style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold)
              )
            }
          }

          // Refresh / Sync Button
          if (onRefresh != null && currentScreen != ScreenRoute.ADMIN) {
            IconButton(
              onClick = onRefresh,
              enabled = !isLoading,
              modifier = Modifier
                .size(42.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f))
                .testTag("header_refresh_button")
            ) {
              Icon(
                imageVector = Icons.Default.Refresh,
                contentDescription = "تحديث ومزامنة المحتوى",
                tint = MaterialTheme.colorScheme.primary,
                modifier = Modifier
                  .size(20.dp)
                  .rotate(if (isLoading) refreshRotation else 0f)
              )
            }
          }

          // Theme Toggle Button
          IconButton(
            onClick = onToggleTheme,
            modifier = Modifier
              .size(42.dp)
              .clip(CircleShape)
              .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f))
              .testTag("theme_toggle_button")
          ) {
            Icon(
              imageVector = if (isDarkMode) Icons.Filled.WbSunny else Icons.Filled.NightlightRound,
              contentDescription = "تبديل المظهر",
              tint = MaterialTheme.colorScheme.primary,
              modifier = Modifier
                .size(20.dp)
                .rotate(iconRotation)
            )
          }
        }
      }
    }
  }
}

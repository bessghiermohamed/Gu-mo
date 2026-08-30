package com.example.talib.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.tween
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.interaction.MutableInteractionSource
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material.icons.automirrored.outlined.*
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.shadow
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.example.talib.ui.viewmodel.ScreenRoute

@Composable
fun TalibBottomNavBar(
  currentScreen: ScreenRoute,
  onNavigate: (ScreenRoute) -> Unit,
  modifier: Modifier = Modifier
) {
  Surface(
    modifier = modifier
      .fillMaxWidth()
      .padding(horizontal = 16.dp, vertical = 10.dp)
      .windowInsetsPadding(WindowInsets.navigationBars)
      .shadow(elevation = 16.dp, shape = RoundedCornerShape(24.dp)),
    shape = RoundedCornerShape(24.dp),
    color = MaterialTheme.colorScheme.surface,
    tonalElevation = 4.dp
  ) {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(vertical = 8.dp, horizontal = 12.dp),
      horizontalArrangement = Arrangement.SpaceAround,
      verticalAlignment = Alignment.CenterVertically
    ) {
      NavTabItem(
        title = "الرئيسية",
        iconFilled = Icons.Filled.Home,
        iconOutlined = Icons.Outlined.Home,
        isSelected = currentScreen == ScreenRoute.HOME,
        testTag = "nav_home",
        onClick = { onNavigate(ScreenRoute.HOME) }
      )

      NavTabItem(
        title = "المقررات",
        iconFilled = Icons.AutoMirrored.Filled.MenuBook,
        iconOutlined = Icons.AutoMirrored.Outlined.MenuBook,
        isSelected = currentScreen == ScreenRoute.COURSES || currentScreen == ScreenRoute.LECTURES,
        testTag = "nav_courses",
        onClick = { onNavigate(ScreenRoute.COURSES) }
      )

      NavTabItem(
        title = "الجدول",
        iconFilled = Icons.Filled.CalendarMonth,
        iconOutlined = Icons.Outlined.CalendarMonth,
        isSelected = currentScreen == ScreenRoute.SCHEDULE,
        testTag = "nav_schedule",
        onClick = { onNavigate(ScreenRoute.SCHEDULE) }
      )

      NavTabItem(
        title = "حسابي",
        iconFilled = Icons.Filled.Person,
        iconOutlined = Icons.Outlined.PersonOutline,
        isSelected = currentScreen == ScreenRoute.PROFILE,
        testTag = "nav_profile",
        onClick = { onNavigate(ScreenRoute.PROFILE) }
      )
    }
  }
}

@Composable
private fun NavTabItem(
  title: String,
  iconFilled: ImageVector,
  iconOutlined: ImageVector,
  isSelected: Boolean,
  testTag: String,
  onClick: () -> Unit
) {
  val animColor = animateColorAsState(
    targetValue = if (isSelected) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant,
    animationSpec = tween(250),
    label = "nav_tab_color"
  )

  Column(
    modifier = Modifier
      .clip(RoundedCornerShape(16.dp))
      .clickable(
        interactionSource = remember { MutableInteractionSource() },
        indication = null,
        onClick = onClick
      )
      .padding(horizontal = 14.dp, vertical = 6.dp)
      .testTag(testTag),
    horizontalAlignment = Alignment.CenterHorizontally,
    verticalArrangement = Arrangement.Center
  ) {
    Box(
      modifier = Modifier
        .size(36.dp)
        .clip(CircleShape)
        .background(
          if (isSelected) MaterialTheme.colorScheme.primary.copy(alpha = 0.15f)
          else androidx.compose.ui.graphics.Color.Transparent
        ),
      contentAlignment = Alignment.Center
    ) {
      Icon(
        imageVector = if (isSelected) iconFilled else iconOutlined,
        contentDescription = title,
        tint = animColor.value,
        modifier = Modifier.size(22.dp)
      )
    }

    Spacer(modifier = Modifier.height(2.dp))

    Text(
      text = title,
      style = MaterialTheme.typography.labelSmall.copy(
        fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
        fontSize = 11.sp
      ),
      color = animColor.value
    )
  }
}

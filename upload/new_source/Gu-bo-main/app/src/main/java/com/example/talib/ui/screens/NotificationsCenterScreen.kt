package com.example.talib.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.talib.ui.viewmodel.ScreenRoute
import com.example.talib.ui.viewmodel.TalibViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun NotificationsCenterScreen(
  viewModel: TalibViewModel,
  onNavigate: (ScreenRoute) -> Unit,
  onNavigateBack: () -> Unit
) {
  val announcements by viewModel.allAnnouncements.collectAsStateWithLifecycle()
  val exams by viewModel.allExams.collectAsStateWithLifecycle()
  val assignments by viewModel.allAssignments.collectAsStateWithLifecycle()
  val schedule by viewModel.currentSchedule.collectAsStateWithLifecycle()
  val polls by viewModel.allPolls.collectAsStateWithLifecycle()

  Scaffold(
    modifier = Modifier
      .fillMaxSize()
      .testTag("notifications_center_screen"),
    topBar = {
      TopAppBar(
        title = {
          Column {
            Text("مركز الإشعارات والتنبيهات", fontWeight = FontWeight.Black, fontSize = 18.sp)
            Text(
              text = "شاشة موحدة تجمع كافة التحديثات والاختبارات القادمة",
              style = MaterialTheme.typography.bodySmall,
              color = MaterialTheme.colorScheme.onSurfaceVariant
            )
          }
        },
        navigationIcon = {
          IconButton(onClick = onNavigateBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
          }
        }
      )
    }
  ) { padding ->
    LazyColumn(
      modifier = Modifier
        .fillMaxSize()
        .padding(padding)
        .padding(horizontal = 16.dp),
      verticalArrangement = Arrangement.spacedBy(14.dp),
      contentPadding = PaddingValues(top = 8.dp, bottom = 90.dp)
    ) {
      // 1. Live Polls / Active Class Activity
      if (polls.isNotEmpty()) {
        item {
          Text("استطلاعات الرأي الجارية:", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
        }

        items(polls) { poll ->
          Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.5f)),
            onClick = { onNavigate(ScreenRoute.POLLS) },
            modifier = Modifier.fillMaxWidth()
          ) {
            Row(
              modifier = Modifier.padding(14.dp),
              verticalAlignment = Alignment.CenterVertically,
              horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
              Box(
                modifier = Modifier
                  .size(42.dp)
                  .clip(CircleShape)
                  .background(MaterialTheme.colorScheme.secondary),
                contentAlignment = Alignment.Center
              ) {
                Icon(Icons.Default.Poll, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
              }
              Column(modifier = Modifier.weight(1f)) {
                Text("استطلاع صفي جديد من ${poll.creatorName}", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold))
                Text(poll.question, style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold))
              }
              Icon(Icons.AutoMirrored.Filled.ArrowBackIos, contentDescription = null, modifier = Modifier.size(14.dp))
            }
          }
        }
      }

      // 2. Upcoming Exams
      if (exams.isNotEmpty()) {
        item {
          Text("تنبيهات الامتحانات القادمة:", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
        }

        items(exams) { ex ->
          Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.4f)),
            onClick = { onNavigate(ScreenRoute.EXAMS) },
            modifier = Modifier.fillMaxWidth()
          ) {
            Row(
              modifier = Modifier.padding(14.dp),
              verticalAlignment = Alignment.CenterVertically,
              horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
              Box(
                modifier = Modifier
                  .size(42.dp)
                  .clip(CircleShape)
                  .background(MaterialTheme.colorScheme.error),
                contentAlignment = Alignment.Center
              ) {
                Icon(Icons.Default.NotificationImportant, contentDescription = null, tint = Color.White, modifier = Modifier.size(22.dp))
              }
              Column(modifier = Modifier.weight(1f)) {
                Text(ex.moduleName, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Black))
                Text("${ex.title} • موعد: ${ex.examDate} (${ex.time})", style = MaterialTheme.typography.bodySmall)
                Text("المكان: ${ex.room}", style = MaterialTheme.typography.labelSmall.copy(color = MaterialTheme.colorScheme.error, fontWeight = FontWeight.Bold))
              }
            }
          }
        }
      }

      // 3. Announcements
      if (announcements.isNotEmpty()) {
        item {
          Text("آخر الإعلانات البيداغوجية:", style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
        }

        items(announcements) { ann ->
          Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            onClick = { onNavigate(ScreenRoute.ANNOUNCEMENTS) },
            modifier = Modifier.fillMaxWidth()
          ) {
            Column(
              modifier = Modifier.padding(14.dp),
              verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
              ) {
                Box(
                  modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(if (ann.urgency == "عاجل") Color(0xFFEF4444) else MaterialTheme.colorScheme.primary)
                    .padding(horizontal = 6.dp, vertical = 2.dp)
                ) {
                  Text(ann.urgency, style = MaterialTheme.typography.labelSmall.copy(color = Color.White, fontWeight = FontWeight.Bold))
                }
                Text(ann.date, style = MaterialTheme.typography.labelSmall)
              }
              Text(ann.title, style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold))
              Text(ann.content, style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant))
            }
          }
        }
      }
    }
  }
}

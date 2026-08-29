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
import com.example.talib.data.local.AcademicCalendarEvent
import com.example.talib.ui.viewmodel.TalibViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AcademicCalendarScreen(
  viewModel: TalibViewModel,
  onNavigateBack: () -> Unit
) {
  val events by viewModel.allCalendarEvents.collectAsStateWithLifecycle()
  val profile by viewModel.studentProfile.collectAsStateWithLifecycle()
  var showAddDialog by remember { mutableStateOf(false) }

  if (showAddDialog) {
    var title by remember { mutableStateOf("") }
    var eventType by remember { mutableStateOf("محطة رسمية") }
    var startDate by remember { mutableStateOf("15 فيفري 2027") }
    var endDate by remember { mutableStateOf("25 فيفري 2027") }
    var description by remember { mutableStateOf("") }

    AlertDialog(
      onDismissRequest = { showAddDialog = false },
      title = { Text("إضافة محطة / تاريخ في التقويم", fontWeight = FontWeight.Bold) },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          OutlinedTextField(
            value = title,
            onValueChange = { title = it },
            label = { Text("اسم المحطة الأكاديمية") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            OutlinedTextField(
              value = startDate,
              onValueChange = { startDate = it },
              label = { Text("تاريخ البداية") },
              shape = RoundedCornerShape(12.dp),
              modifier = Modifier.weight(1f)
            )
            OutlinedTextField(
              value = endDate,
              onValueChange = { endDate = it },
              label = { Text("تاريخ النهاية") },
              shape = RoundedCornerShape(12.dp),
              modifier = Modifier.weight(1f)
            )
          }
          OutlinedTextField(
            value = description,
            onValueChange = { description = it },
            label = { Text("تفاصيل وتوجيهات") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
        }
      },
      confirmButton = {
        Button(
          onClick = {
            if (title.isNotBlank()) {
              viewModel.addCalendarEvent(
                title = title,
                eventType = eventType,
                startDate = startDate,
                endDate = endDate,
                description = description
              )
              showAddDialog = false
            }
          },
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("إضافة للتقويم")
        }
      },
      dismissButton = {
        TextButton(onClick = { showAddDialog = false }) { Text("إلغاء") }
      }
    )
  }

  Scaffold(
    modifier = Modifier
      .fillMaxSize()
      .testTag("academic_calendar_screen"),
    topBar = {
      TopAppBar(
        title = {
          Column {
            Text("التقويم الأكاديمي والتواريخ الرسمية", fontWeight = FontWeight.Black, fontSize = 18.sp)
            Text(
              text = profile?.institution ?: "المدرسة العليا للأساتذة - بوزريعة",
              style = MaterialTheme.typography.bodySmall,
              color = MaterialTheme.colorScheme.onSurfaceVariant
            )
          }
        },
        navigationIcon = {
          IconButton(onClick = onNavigateBack) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
          }
        },
        actions = {
          IconButton(onClick = { showAddDialog = true }) {
            Icon(Icons.Default.EventAvailable, contentDescription = "إضافة موعد", tint = MaterialTheme.colorScheme.primary)
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
      // Header Banner
      item {
        Card(
          shape = RoundedCornerShape(20.dp),
          colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
          modifier = Modifier.fillMaxWidth()
        ) {
          Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
          ) {
            Box(
              modifier = Modifier
                .size(48.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary),
              contentAlignment = Alignment.Center
            ) {
              Icon(Icons.Default.CalendarMonth, contentDescription = null, tint = Color.White)
            }
            Column {
              Text(
                text = "السنة الجامعية 2026 - 2027",
                style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Black)
              )
              Text(
                text = "المواعيد الرسمية للسداسيات، العطل وفترات الامتحانات",
                style = MaterialTheme.typography.bodySmall
              )
            }
          }
        }
      }

      items(events) { ev ->
        Card(
          shape = RoundedCornerShape(18.dp),
          colors = CardDefaults.cardColors(
            containerColor = if (ev.isCurrent) MaterialTheme.colorScheme.primary.copy(alpha = 0.08f)
            else MaterialTheme.colorScheme.surface
          ),
          border = if (ev.isCurrent) CardDefaults.outlinedCardBorder().copy(
            brush = androidx.compose.ui.graphics.SolidColor(MaterialTheme.colorScheme.primary)
          ) else null,
          elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
          modifier = Modifier.fillMaxWidth()
        ) {
          Column(
            modifier = Modifier
              .fillMaxWidth()
              .padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
          ) {
            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically
            ) {
              Box(
                modifier = Modifier
                  .clip(RoundedCornerShape(8.dp))
                  .background(
                    when (ev.eventType) {
                      "عطلة جامعية" -> Color(0xFF10B981)
                      "فترة امتحانات" -> Color(0xFFEF4444)
                      "مداولات" -> Color(0xFF8B5CF6)
                      else -> MaterialTheme.colorScheme.primary
                    }
                  )
                  .padding(horizontal = 8.dp, vertical = 3.dp)
              ) {
                Text(
                  text = ev.eventType,
                  style = MaterialTheme.typography.labelSmall.copy(color = Color.White, fontWeight = FontWeight.Bold)
                )
              }

              if (ev.isCurrent) {
                Text(
                  text = "● المحطة الحالية",
                  style = MaterialTheme.typography.labelSmall.copy(
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Black
                  )
                )
              }
            }

            Text(
              text = ev.title,
              style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
            )

            Row(
              verticalAlignment = Alignment.CenterVertically,
              horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
              Icon(Icons.Default.AccessTime, contentDescription = null, tint = MaterialTheme.colorScheme.primary, modifier = Modifier.size(16.dp))
              Text(
                text = if (ev.endDate.isNotBlank() && ev.endDate != ev.startDate) "${ev.startDate} ⟵ ${ev.endDate}" else ev.startDate,
                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold)
              )
            }

            if (ev.description.isNotBlank()) {
              Text(
                text = ev.description,
                style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
              )
            }
          }
        }
      }
    }
  }
}

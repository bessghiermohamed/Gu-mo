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
import com.example.talib.data.local.AttendanceRecord
import com.example.talib.ui.viewmodel.TalibViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AttendanceScreen(
  viewModel: TalibViewModel,
  onNavigateBack: () -> Unit
) {
  val records by viewModel.allAttendanceRecords.collectAsStateWithLifecycle()
  val modules by viewModel.currentModules.collectAsStateWithLifecycle()
  var showAddDialog by remember { mutableStateOf(false) }

  val totalAbsences = records.count { it.status == "غائب" }
  val totalJustified = records.count { it.status == "مبرر" }
  val totalAttended = records.count { it.status == "حاضر" }

  if (showAddDialog) {
    var selectedModule by remember { mutableStateOf(modules.firstOrNull()?.name ?: "النحو والصرف المعمق") }
    var sessionType by remember { mutableStateOf("أعمال موجهة TD") }
    var status by remember { mutableStateOf("غائب") }
    var reason by remember { mutableStateOf("") }
    var date by remember { mutableStateOf("اليوم") }

    AlertDialog(
      onDismissRequest = { showAddDialog = false },
      title = { Text("تسجيل حضور / غياب يدوي", fontWeight = FontWeight.Bold) },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          Text("المقياس الدراسي:", style = MaterialTheme.typography.labelMedium)
          var expanded by remember { mutableStateOf(false) }
          ExposedDropdownMenuBox(expanded = expanded, onExpandedChange = { expanded = !expanded }) {
            OutlinedTextField(
              value = selectedModule,
              onValueChange = {},
              readOnly = true,
              trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = expanded) },
              modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable, true)
            )
            ExposedDropdownMenu(expanded = expanded, onDismissRequest = { expanded = false }) {
              modules.forEach { mod ->
                DropdownMenuItem(
                  text = { Text(mod.name) },
                  onClick = {
                    selectedModule = mod.name
                    expanded = false
                  }
                )
              }
            }
          }

          Text("نوع الحصة:", style = MaterialTheme.typography.labelMedium)
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("أعمال موجهة TD", "محاضرة", "أعمال تطبيقية TP").forEach { type ->
              FilterChip(
                selected = sessionType == type,
                onClick = { sessionType = type },
                label = { Text(type, fontSize = 11.sp) }
              )
            }
          }

          Text("الحالة:", style = MaterialTheme.typography.labelMedium)
          Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
            listOf("حاضر", "غائب", "مبرر").forEach { st ->
              FilterChip(
                selected = status == st,
                onClick = { status = st },
                label = { Text(st) }
              )
            }
          }

          OutlinedTextField(
            value = reason,
            onValueChange = { reason = it },
            label = { Text("السبب أو التبرير (اختياري)") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
        }
      },
      confirmButton = {
        Button(
          onClick = {
            viewModel.recordAttendance(
              moduleName = selectedModule,
              sessionType = sessionType,
              date = date,
              status = status,
              reason = reason
            )
            showAddDialog = false
          },
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("حفظ السجل")
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
      .testTag("attendance_screen"),
    topBar = {
      TopAppBar(
        title = {
          Column {
            Text("سجل الحضور والغياب الذاتي", fontWeight = FontWeight.Black, fontSize = 18.sp)
            Text(
              text = "تتبع غياباتك اليدوية وتجنب عقوبات الإقصاء",
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
            Icon(Icons.Default.AddTask, contentDescription = "تسجيل حصة", tint = MaterialTheme.colorScheme.primary)
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
      // Summary Card
      item {
        Card(
          shape = RoundedCornerShape(20.dp),
          colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
          elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
          modifier = Modifier.fillMaxWidth()
        ) {
          Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(12.dp)
          ) {
            Text(
              text = "ملخص الغيابات التراكمي",
              style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
            )

            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.SpaceAround
            ) {
              Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                  text = "$totalAttended",
                  style = MaterialTheme.typography.headlineMedium.copy(color = Color(0xFF10B981), fontWeight = FontWeight.Black)
                )
                Text("حضور", style = MaterialTheme.typography.labelSmall)
              }

              Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                  text = "$totalAbsences",
                  style = MaterialTheme.typography.headlineMedium.copy(color = Color(0xFFEF4444), fontWeight = FontWeight.Black)
                )
                Text("غياب غير مبرر", style = MaterialTheme.typography.labelSmall)
              }

              Column(horizontalAlignment = Alignment.CenterHorizontally) {
                Text(
                  text = "$totalJustified",
                  style = MaterialTheme.typography.headlineMedium.copy(color = Color(0xFFF59E0B), fontWeight = FontWeight.Black)
                )
                Text("مبرر", style = MaterialTheme.typography.labelSmall)
              }
            }

            if (totalAbsences >= 2) {
              Card(
                shape = RoundedCornerShape(10.dp),
                colors = CardDefaults.cardColors(containerColor = Color(0xFFFEF2F2))
              ) {
                Row(
                  modifier = Modifier.padding(10.dp),
                  verticalAlignment = Alignment.CenterVertically,
                  horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                  Icon(Icons.Default.Warning, contentDescription = null, tint = Color(0xFFEF4444), modifier = Modifier.size(18.dp))
                  Text(
                    text = "تنبيه: اقتربت من الحد الأقصى للغيابات (3 غيابات = إقصاء من المقياس)",
                    color = Color(0xFF991B1B),
                    style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold)
                  )
                }
              }
            }
          }
        }
      }

      item {
        Text(
          text = "السجلات المدخلة:",
          style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
        )
      }

      if (records.isEmpty()) {
        item {
          Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
            modifier = Modifier.fillMaxWidth()
          ) {
            Text(
              text = "لم تسجل أي غيابات أو حضور حتى الآن. اضغط على الزر في الأعلى لتسجيل حضور حصة.",
              modifier = Modifier.padding(16.dp),
              style = MaterialTheme.typography.bodyMedium
            )
          }
        }
      } else {
        items(records) { rec ->
          Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            modifier = Modifier.fillMaxWidth()
          ) {
            Row(
              modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically
            ) {
              Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(12.dp)
              ) {
                Box(
                  modifier = Modifier
                    .size(40.dp)
                    .clip(CircleShape)
                    .background(
                      when (rec.status) {
                        "حاضر" -> Color(0xFF10B981).copy(alpha = 0.15f)
                        "مبرر" -> Color(0xFFF59E0B).copy(alpha = 0.15f)
                        else -> Color(0xFFEF4444).copy(alpha = 0.15f)
                      }
                    ),
                  contentAlignment = Alignment.Center
                ) {
                  Icon(
                    imageVector = when (rec.status) {
                      "حاضر" -> Icons.Default.Check
                      "مبرر" -> Icons.Default.Description
                      else -> Icons.Default.Close
                    },
                    contentDescription = null,
                    tint = when (rec.status) {
                      "حاضر" -> Color(0xFF10B981)
                      "مبرر" -> Color(0xFFF59E0B)
                      else -> Color(0xFFEF4444)
                    }
                  )
                }

                Column {
                  Text(
                    text = rec.moduleName,
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
                  )
                  Text(
                    text = "${rec.sessionType} • ${rec.date}",
                    style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
                  )
                  if (rec.reason.isNotBlank()) {
                    Text(
                      text = "السبب: ${rec.reason}",
                      style = MaterialTheme.typography.labelSmall.copy(color = MaterialTheme.colorScheme.primary)
                    )
                  }
                }
              }

              IconButton(onClick = { viewModel.deleteAttendanceRecord(rec) }) {
                Icon(Icons.Default.DeleteOutline, contentDescription = "حذف", tint = MaterialTheme.colorScheme.outline)
              }
            }
          }
        }
      }
    }
  }
}

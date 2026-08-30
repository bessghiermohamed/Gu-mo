package com.example.talib.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.talib.data.local.Assignment
import com.example.talib.ui.viewmodel.TalibViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun AssignmentsScreen(
  viewModel: TalibViewModel
) {
  val assignments by viewModel.allAssignments.collectAsStateWithLifecycle()
  val modules by viewModel.allModules.collectAsStateWithLifecycle()
  val profile by viewModel.studentProfile.collectAsStateWithLifecycle()

  val currentRole = profile?.userRole ?: "STUDENT"
  val isSupervisor = currentRole in listOf("OWNER", "SPECIALTY_ADMIN", "REPRESENTATIVE")

  var showAddAssignmentDialog by remember { mutableStateOf(false) }
  var reportDialogItem by remember { mutableStateOf<Assignment?>(null) }
  var reportReasonText by remember { mutableStateOf("") }
  var reportSuccessMessage by remember { mutableStateOf<String?>(null) }

  // Dialog: Add New Assignment (For Admins/Representatives)
  if (showAddAssignmentDialog) {
    var title by remember { mutableStateOf("") }
    var desc by remember { mutableStateOf("") }
    var dueDate by remember { mutableStateOf("الخميس القادم") }
    var selectedModName by remember { mutableStateOf(modules.firstOrNull()?.name ?: "مقياس دراسي") }
    var modExpanded by remember { mutableStateOf(false) }

    AlertDialog(
      onDismissRequest = { showAddAssignmentDialog = false },
      title = { Text("إضافة واجب / تكليف جديد 📝", fontWeight = FontWeight.Bold) },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          ExposedDropdownMenuBox(
            expanded = modExpanded,
            onExpandedChange = { modExpanded = !modExpanded }
          ) {
            OutlinedTextField(
              value = selectedModName,
              onValueChange = {},
              readOnly = true,
              label = { Text("المقياس") },
              trailingIcon = { ExposedDropdownMenuDefaults.TrailingIcon(expanded = modExpanded) },
              modifier = Modifier.fillMaxWidth().menuAnchor(MenuAnchorType.PrimaryNotEditable, true)
            )
            ExposedDropdownMenu(
              expanded = modExpanded,
              onDismissRequest = { modExpanded = false }
            ) {
              modules.forEach { mod ->
                DropdownMenuItem(
                  text = { Text(mod.name) },
                  onClick = {
                    selectedModName = mod.name
                    modExpanded = false
                  }
                )
              }
            }
          }

          OutlinedTextField(
            value = title,
            onValueChange = { title = it },
            label = { Text("عنوان التكليف أو البحث") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )

          OutlinedTextField(
            value = dueDate,
            onValueChange = { dueDate = it },
            label = { Text("تاريخ أو آخر أجل للتسليم") },
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )

          OutlinedTextField(
            value = desc,
            onValueChange = { desc = it },
            label = { Text("تفاصيل ومحاور الواجب") },
            minLines = 2,
            shape = RoundedCornerShape(12.dp),
            modifier = Modifier.fillMaxWidth()
          )
        }
      },
      confirmButton = {
        Button(
          onClick = {
            if (title.isNotBlank()) {
              viewModel.addAssignment(
                title = title.trim(),
                courseName = selectedModName,
                dueDate = dueDate.trim(),
                description = desc.ifBlank { "تكليف دراسي موجه" }
              )
              showAddAssignmentDialog = false
            }
          },
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("نشر الواجب")
        }
      },
      dismissButton = {
        TextButton(onClick = { showAddAssignmentDialog = false }) { Text("إلغاء") }
      }
    )
  }

  // Dialog: Report Issue
  if (reportDialogItem != null) {
    val asgn = reportDialogItem!!
    AlertDialog(
      onDismissRequest = { reportDialogItem = null },
      title = { Text("تبليغ عن خطأ في التكليف 🚩", fontWeight = FontWeight.Bold) },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          Text("الواجب: ${asgn.title}", fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
          Text("أدخل الملاحظة لإشعار المشرف وممثل الفوج:")
          OutlinedTextField(
            value = reportReasonText,
            onValueChange = { reportReasonText = it },
            label = { Text("الملاحظة / الخطأ في تاريخ التسليم أو التفاصيل") },
            minLines = 3,
            modifier = Modifier.fillMaxWidth()
          )
        }
      },
      confirmButton = {
        Button(
          onClick = {
            if (reportReasonText.isNotBlank()) {
              viewModel.reportIssue("واجب وتكليف", asgn.title, reportReasonText.trim())
              reportSuccessMessage = "تم إرسال تبليغك للممثل والمشرف لمراجعة التكليف 🚩"
              reportReasonText = ""
              reportDialogItem = null
            }
          },
          shape = RoundedCornerShape(10.dp)
        ) {
          Text("إرسال التبليغ")
        }
      },
      dismissButton = {
        TextButton(onClick = { reportDialogItem = null }) { Text("إلغاء") }
      }
    )
  }

  val completedCount = assignments.count { it.isCompleted }

  LazyColumn(
    modifier = Modifier
      .fillMaxSize()
      .testTag("assignments_screen"),
    contentPadding = PaddingValues(bottom = 90.dp, top = 8.dp, start = 16.dp, end = 16.dp),
    verticalArrangement = Arrangement.spacedBy(14.dp)
  ) {
    // 1. Header Card with progress
    item {
      Card(
        shape = RoundedCornerShape(20.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.7f)),
        modifier = Modifier.fillMaxWidth()
      ) {
        Column(
          modifier = Modifier
            .fillMaxWidth()
            .padding(18.dp),
          verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
          ) {
            Column {
              Text(
                text = "الواجبات والتكليفات الدراسية",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
              )
              Text(
                text = "أعمال موجهة، بحوث، وتقارير",
                style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onPrimaryContainer)
              )
            }

            Box(
              modifier = Modifier
                .size(44.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary),
              contentAlignment = Alignment.Center
            ) {
              Icon(
                imageVector = Icons.Default.EditNote,
                contentDescription = null,
                tint = Color.White
              )
            }
          }

          LinearProgressIndicator(
            progress = { if (assignments.isNotEmpty()) completedCount.toFloat() / assignments.size else 0f },
            modifier = Modifier
              .fillMaxWidth()
              .height(8.dp)
              .clip(RoundedCornerShape(4.dp)),
            color = MaterialTheme.colorScheme.primary,
            trackColor = MaterialTheme.colorScheme.surface
          )

          Text(
            text = "تم إنجاز $completedCount من أصل ${assignments.size} تكليفات",
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold)
          )
        }
      }
    }

    if (reportSuccessMessage != null) {
      item {
        Card(
          shape = RoundedCornerShape(12.dp),
          colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer)
        ) {
          Text(
            text = reportSuccessMessage ?: "",
            modifier = Modifier.padding(12.dp),
            style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.Bold)
          )
        }
      }
    }

    item {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Text(
          text = "قائمة الواجبات المطلوبة",
          style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
        )
        if (isSupervisor) {
          Button(
            onClick = { showAddAssignmentDialog = true },
            shape = RoundedCornerShape(8.dp),
            contentPadding = PaddingValues(horizontal = 12.dp, vertical = 6.dp)
          ) {
            Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(16.dp))
            Spacer(modifier = Modifier.width(4.dp))
            Text("+ واجب جديد", fontSize = 12.sp)
          }
        }
      }
    }

    if (assignments.isEmpty()) {
      item {
        Card(
          shape = RoundedCornerShape(18.dp),
          colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)),
          modifier = Modifier.fillMaxWidth()
        ) {
          Column(
            modifier = Modifier
              .fillMaxWidth()
              .padding(32.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(8.dp)
          ) {
            Icon(
              imageVector = Icons.Default.CheckCircle,
              contentDescription = null,
              tint = MaterialTheme.colorScheme.onSurfaceVariant,
              modifier = Modifier.size(44.dp)
            )
            Text(
              text = "لا توجد واجبات معلقة حالياً",
              style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
            )
          }
        }
      }
    } else {
      items(assignments, key = { it.id }) { assignment ->
        val mod = modules.find { it.id == assignment.moduleId }
        AssignmentCardItem(
          assignment = assignment,
          moduleName = mod?.name ?: "مقياس دراسي",
          onToggle = { viewModel.toggleAssignment(assignment) },
          onReport = { reportDialogItem = assignment }
        )
      }
    }
  }
}

@Composable
fun AssignmentCardItem(
  assignment: Assignment,
  moduleName: String,
  onToggle: () -> Unit,
  onReport: () -> Unit = {}
) {
  Card(
    shape = RoundedCornerShape(18.dp),
    colors = CardDefaults.cardColors(
      containerColor = if (assignment.isCompleted) MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f) else MaterialTheme.colorScheme.surface
    ),
    elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
    modifier = Modifier
      .fillMaxWidth()
      .clickable(onClick = onToggle)
  ) {
    Row(
      modifier = Modifier
        .fillMaxWidth()
        .padding(16.dp),
      verticalAlignment = Alignment.Top,
      horizontalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      Checkbox(
        checked = assignment.isCompleted,
        onCheckedChange = { onToggle() },
        colors = CheckboxDefaults.colors(checkedColor = MaterialTheme.colorScheme.primary)
      )

      Column(
        modifier = Modifier.weight(1f),
        verticalArrangement = Arrangement.spacedBy(6.dp)
      ) {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically
        ) {
          Text(
            text = moduleName,
            style = MaterialTheme.typography.labelSmall.copy(
              color = MaterialTheme.colorScheme.primary,
              fontWeight = FontWeight.Bold
            )
          )
          Row(verticalAlignment = Alignment.CenterVertically, horizontalArrangement = Arrangement.spacedBy(4.dp)) {
            Text(
              text = "آخر أجل: ${assignment.dueDate}",
              style = MaterialTheme.typography.labelSmall.copy(
                color = if (assignment.isCompleted) MaterialTheme.colorScheme.onSurfaceVariant else Color(0xFFEF4444),
                fontWeight = FontWeight.Bold
              )
            )
            IconButton(onClick = onReport, modifier = Modifier.size(24.dp)) {
              Icon(Icons.Default.Flag, contentDescription = "تبليغ", tint = MaterialTheme.colorScheme.error, modifier = Modifier.size(15.dp))
            }
          }
        }

        Text(
          text = assignment.title,
          style = MaterialTheme.typography.titleSmall.copy(
            fontWeight = FontWeight.Bold,
            textDecoration = if (assignment.isCompleted) TextDecoration.LineThrough else TextDecoration.None
          )
        )

        Text(
          text = assignment.description,
          style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant),
          lineHeight = 18.sp
        )
      }
    }
  }
}

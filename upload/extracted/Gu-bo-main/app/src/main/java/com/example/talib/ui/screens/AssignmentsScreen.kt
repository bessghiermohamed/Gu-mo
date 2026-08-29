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
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
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

@Composable
fun AssignmentsScreen(
  viewModel: TalibViewModel
) {
  val assignments by viewModel.allAssignments.collectAsStateWithLifecycle()
  val modules by viewModel.allModules.collectAsStateWithLifecycle()

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
                text = "الواجبات والمهام البيداغوجية",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
              )
              Text(
                text = "أعمال موجهة، بحوث، وتقارير عملية",
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
            text = "تم إنجاز $completedCount من أصل ${assignments.size} واجبات دراسية",
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold)
          )
        }
      }
    }

    item {
      Text(
        text = "قائمة الواجبات المطلوبة",
        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
      )
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
          onToggle = { viewModel.toggleAssignment(assignment) }
        )
      }
    }
  }
}

@Composable
fun AssignmentCardItem(
  assignment: Assignment,
  moduleName: String,
  onToggle: () -> Unit
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
          Text(
            text = "آخر أجل: ${assignment.dueDate}",
            style = MaterialTheme.typography.labelSmall.copy(
              color = if (assignment.isCompleted) MaterialTheme.colorScheme.onSurfaceVariant else Color(0xFFEF4444),
              fontWeight = FontWeight.Bold
            )
          )
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

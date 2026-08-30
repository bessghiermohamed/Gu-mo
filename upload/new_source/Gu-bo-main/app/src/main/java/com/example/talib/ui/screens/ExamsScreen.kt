package com.example.talib.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.talib.data.local.Exam
import com.example.talib.ui.viewmodel.TalibViewModel
import kotlin.math.max

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamsScreen(
  viewModel: TalibViewModel
) {
  val exams by viewModel.allExams.collectAsStateWithLifecycle()
  val modules by viewModel.currentModules.collectAsStateWithLifecycle()
  var showCalculatorSheet by remember { mutableStateOf(false) }

  // What do I need to pass calculator Bottom Sheet
  if (showCalculatorSheet) {
    var selectedModule by remember { mutableStateOf(modules.firstOrNull()?.name ?: "النحو العربي ومسائله") }
    var tdGradeText by remember { mutableStateOf("12.5") }
    var tdWeightPercent by remember { mutableStateOf("40") } // 40% TD, 60% Exam
    var targetAverage by remember { mutableStateOf("10.0") } // Target: 10.0 (نجاح)

    val tdGrade = tdGradeText.toDoubleOrNull() ?: 0.0
    val tdWeight = (tdWeightPercent.toDoubleOrNull() ?: 40.0) / 100.0
    val examWeight = 1.0 - tdWeight
    val target = targetAverage.toDoubleOrNull() ?: 10.0

    // Target Formula: (TD * tdWeight) + (Exam * examWeight) = Target
    // Exam = (Target - (TD * tdWeight)) / examWeight
    val requiredExamGrade = if (examWeight > 0) {
      val raw = (target - (tdGrade * tdWeight)) / examWeight
      max(0.0, String.format(java.util.Locale.US, "%.2f", raw).toDouble())
    } else 0.0

    ModalBottomSheet(
      onDismissRequest = { showCalculatorSheet = false }
    ) {
      Column(
        modifier = Modifier
          .fillMaxWidth()
          .padding(horizontal = 24.dp, vertical = 16.dp),
        verticalArrangement = Arrangement.spacedBy(14.dp)
      ) {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically
        ) {
          Column {
            Text(
              text = "حاسبة: ماذا أحتاج لأنجح؟ 🎯",
              style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
            )
            Text(
              text = "احسب النقطة المطلوبة في الامتحان لاستيفاء المقياس",
              style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
            )
          }
          Icon(Icons.Default.Calculate, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
        }

        OutlinedTextField(
          value = tdGradeText,
          onValueChange = { tdGradeText = it },
          label = { Text("علامة المراقبة المستمرة / الأعمال الموجهة TD (من 20)") },
          modifier = Modifier.fillMaxWidth(),
          singleLine = true
        )

        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.spacedBy(10.dp)
        ) {
          OutlinedTextField(
            value = tdWeightPercent,
            onValueChange = { tdWeightPercent = it },
            label = { Text("نسبة TD (%)") },
            modifier = Modifier.weight(1f),
            singleLine = true
          )
          OutlinedTextField(
            value = targetAverage,
            onValueChange = { targetAverage = it },
            label = { Text("المعدل المستهدف") },
            modifier = Modifier.weight(1f),
            singleLine = true
          )
        }

        // Result Card
        Card(
          shape = RoundedCornerShape(16.dp),
          colors = CardDefaults.cardColors(
            containerColor = if (requiredExamGrade <= 10.0) Color(0xFF10B981).copy(alpha = 0.15f)
            else if (requiredExamGrade <= 15.0) Color(0xFFF59E0B).copy(alpha = 0.15f)
            else Color(0xFFEF4444).copy(alpha = 0.15f)
          ),
          modifier = Modifier.fillMaxWidth()
        ) {
          Column(
            modifier = Modifier.padding(16.dp),
            horizontalAlignment = Alignment.CenterHorizontally,
            verticalArrangement = Arrangement.spacedBy(6.dp)
          ) {
            Text("العلامة المطلوبة في الامتحان النهائي:", style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold))
            Text(
              text = "$requiredExamGrade / 20",
              style = MaterialTheme.typography.headlineMedium.copy(
                fontWeight = FontWeight.Black,
                color = if (requiredExamGrade <= 10.0) Color(0xFF047857)
                else if (requiredExamGrade <= 15.0) Color(0xFFB45309)
                else Color(0xFFB91C1C)
              )
            )
            Text(
              text = if (requiredExamGrade <= 10.0) "الهدف في المتناول بسهولة! استمر في المراجعة."
              else if (requiredExamGrade <= 15.0) "تحتاج لتركيز جيد في مراجعة المقرر."
              else "تحدي يتطلب جهداً مضاعفاً في الامتحان النهائي.",
              style = MaterialTheme.typography.bodySmall
            )
          }
        }

        Spacer(modifier = Modifier.height(20.dp))
      }
    }
  }

  LazyColumn(
    modifier = Modifier
      .fillMaxSize()
      .testTag("exams_screen"),
    contentPadding = PaddingValues(bottom = 90.dp, top = 8.dp, start = 16.dp, end = 16.dp),
    verticalArrangement = Arrangement.spacedBy(14.dp)
  ) {
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
          verticalArrangement = Arrangement.spacedBy(12.dp)
        ) {
          Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.CenterVertically
          ) {
            Column {
              Text(
                text = "جدول الامتحانات والاختبارات",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
              )
              Text(
                text = "برنامج المراقبة المستمرة والامتحانات السداسية",
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
                imageVector = Icons.Default.Science,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(22.dp)
              )
            }
          }

          Button(
            onClick = { showCalculatorSheet = true },
            shape = RoundedCornerShape(12.dp),
            colors = ButtonDefaults.buttonColors(
              containerColor = MaterialTheme.colorScheme.primary
            ),
            modifier = Modifier.fillMaxWidth()
          ) {
            Icon(Icons.Default.Calculate, contentDescription = null, modifier = Modifier.size(18.dp))
            Spacer(modifier = Modifier.width(8.dp))
            Text("ماذا أحتاج لأنجح؟ (حاسبة النقطة المطلوبة)", fontWeight = FontWeight.Bold)
          }
        }
      }
    }

    item {
      Text(
        text = "الاختبارات المبرمجة والعد التنازلي (${exams.size})",
        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
      )
    }

    if (exams.isEmpty()) {
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
              text = "لا توجد امتحانات مبرمجة حالياً",
              style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
            )
          }
        }
      }
    } else {
      items(exams, key = { it.id }) { exam ->
        ExamCardItem(exam = exam)
      }
    }
  }
}

@Composable
fun ExamCardItem(exam: Exam) {
  Card(
    shape = RoundedCornerShape(20.dp),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
    modifier = Modifier.fillMaxWidth()
  ) {
    Column(
      modifier = Modifier
        .fillMaxWidth()
        .padding(16.dp),
      verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), verticalAlignment = Alignment.CenterVertically) {
          Box(
            modifier = Modifier
              .clip(RoundedCornerShape(8.dp))
              .background(Color(0xFFEF4444).copy(alpha = 0.15f))
              .padding(horizontal = 8.dp, vertical = 3.dp)
          ) {
            Text(
              text = "معامل: ${exam.coefficient}",
              style = MaterialTheme.typography.labelSmall.copy(
                color = Color(0xFFEF4444),
                fontWeight = FontWeight.Bold
              )
            )
          }

          Surface(
            color = Color(0xFF3B82F6).copy(alpha = 0.12f),
            shape = RoundedCornerShape(8.dp)
          ) {
            Text(
              text = "⏳ بعد 3 أيام",
              modifier = Modifier.padding(horizontal = 6.dp, vertical = 2.dp),
              style = MaterialTheme.typography.labelSmall.copy(
                color = Color(0xFF1D4ED8),
                fontWeight = FontWeight.Bold
              )
            )
          }
        }

        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
          Icon(
            imageVector = Icons.Default.Event,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(16.dp)
          )
          Text(
            text = exam.examDate,
            style = MaterialTheme.typography.labelMedium.copy(
              fontWeight = FontWeight.Bold,
              color = MaterialTheme.colorScheme.primary
            )
          )
        }
      }

      Text(
        text = exam.title,
        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black, fontSize = 16.sp)
      )

      Text(
        text = "المقياس: ${exam.moduleName}",
        style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.SemiBold)
      )

      HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))

      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
          Icon(
            imageVector = Icons.Default.AccessTime,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(14.dp)
          )
          Text(
            text = exam.time,
            style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
          )
        }

        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
          Icon(
            imageVector = Icons.Default.Place,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(14.dp)
          )
          Text(
            text = exam.room,
            style = MaterialTheme.typography.bodySmall.copy(
              color = MaterialTheme.colorScheme.onSurfaceVariant,
              fontWeight = FontWeight.Bold
            )
          )
        }
      }
    }
  }
}

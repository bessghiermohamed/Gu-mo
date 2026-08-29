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
import com.example.talib.data.local.StudentIssueReport
import com.example.talib.ui.viewmodel.TalibViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ReportIssueScreen(
  viewModel: TalibViewModel,
  onNavigateBack: () -> Unit
) {
  val reports by viewModel.allIssueReports.collectAsStateWithLifecycle()
  val profile by viewModel.studentProfile.collectAsStateWithLifecycle()

  var selectedType by remember { mutableStateOf("ملف تالف أو لا يفتح") }
  var itemTitle by remember { mutableStateOf("") }
  var description by remember { mutableStateOf("") }
  var isSubmitted by remember { mutableStateOf(false) }

  val issueTypes = listOf(
    "ملف تالف أو لا يفتح",
    "خطأ في توقيت الجدول",
    "معلومة أو موعد امتحان غير دقيق",
    "مشكلة في إعلان أو رابط",
    "اقتراح لممثل الفوج"
  )

  Scaffold(
    modifier = Modifier
      .fillMaxSize()
      .testTag("report_issue_screen"),
    topBar = {
      TopAppBar(
        title = {
          Column {
            Text("تبليغ عن مشكلة للممثل", fontWeight = FontWeight.Black, fontSize = 18.sp)
            Text(
              text = "تواصل مباشر مع ممثل ${profile?.groupNumber ?: "الفوج 03"}",
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
      verticalArrangement = Arrangement.spacedBy(16.dp),
      contentPadding = PaddingValues(top = 8.dp, bottom = 90.dp)
    ) {
      item {
        Card(
          shape = RoundedCornerShape(20.dp),
          colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.errorContainer.copy(alpha = 0.5f)),
          modifier = Modifier.fillMaxWidth()
        ) {
          Row(
            modifier = Modifier.padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp)
          ) {
            Icon(Icons.Default.ReportProblem, contentDescription = null, tint = MaterialTheme.colorScheme.error)
            Text(
              text = "أبلغ عن أي رابط تالف، خطأ في توقيت الحصص، أو محتوى غير دقيق ليصل مباشرة إلى لوحة تحكم ممثل فوجك لتصحيحه فوراً.",
              style = MaterialTheme.typography.bodyMedium
            )
          }
        }
      }

      if (isSubmitted) {
        item {
          Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer),
            modifier = Modifier.fillMaxWidth()
          ) {
            Row(
              modifier = Modifier.padding(16.dp),
              verticalAlignment = Alignment.CenterVertically,
              horizontalArrangement = Arrangement.spacedBy(12.dp)
            ) {
              Icon(Icons.Default.CheckCircle, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
              Text(
                text = "تم إرسال تبليغك بنجاح لممثل الفوج! سيتم التعامل معه في أقرب وقت.",
                style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold)
              )
            }
          }
        }
      }

      item {
        Card(
          shape = RoundedCornerShape(20.dp),
          colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
          elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
          modifier = Modifier.fillMaxWidth()
        ) {
          Column(
            modifier = Modifier.padding(18.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
          ) {
            Text(
              text = "نوع المشكلة أو التبليغ:",
              style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
            )

            issueTypes.forEach { type ->
              Row(
                modifier = Modifier.fillMaxWidth(),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
              ) {
                RadioButton(
                  selected = selectedType == type,
                  onClick = { selectedType = type }
                )
                Text(type, style = MaterialTheme.typography.bodyMedium)
              }
            }

            OutlinedTextField(
              value = itemTitle,
              onValueChange = { itemTitle = it },
              label = { Text("عنوان المادة / المحاضرة المعنية (مثال: محاضرة النحو 02)") },
              shape = RoundedCornerShape(12.dp),
              modifier = Modifier.fillMaxWidth()
            )

            OutlinedTextField(
              value = description,
              onValueChange = { description = it },
              label = { Text("شرح تفصيلي للمشكلة أو الخطأ") },
              minLines = 3,
              shape = RoundedCornerShape(12.dp),
              modifier = Modifier.fillMaxWidth()
            )

            Button(
              onClick = {
                if (description.isNotBlank() || itemTitle.isNotBlank()) {
                  viewModel.reportIssue(
                    itemType = selectedType,
                    itemTitle = itemTitle.ifBlank { "بلاغ عام" },
                    description = description.ifBlank { "تم التبليغ عن مشكلة في هذا العنصر" }
                  )
                  isSubmitted = true
                  itemTitle = ""
                  description = ""
                }
              },
              shape = RoundedCornerShape(12.dp),
              modifier = Modifier.fillMaxWidth()
            ) {
              Icon(Icons.Default.Send, contentDescription = null, modifier = Modifier.size(18.dp))
              Spacer(modifier = Modifier.width(8.dp))
              Text("إرسال التبليغ لممثل الفوج", fontWeight = FontWeight.Bold)
            }
          }
        }
      }

      if (reports.isNotEmpty()) {
        item {
          Text(
            text = "تبليغاتي وحالتها:",
            style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
          )
        }

        items(reports) { rep ->
          Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
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
                Text(
                  text = rep.itemType,
                  style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
                )
                Box(
                  modifier = Modifier
                    .clip(RoundedCornerShape(6.dp))
                    .background(
                      when (rep.status) {
                        "تم الحل" -> Color(0xFF10B981)
                        "مرفوض" -> Color(0xFFEF4444)
                        else -> Color(0xFFF59E0B)
                      }
                    )
                    .padding(horizontal = 8.dp, vertical = 2.dp)
                ) {
                  Text(
                    text = rep.status,
                    style = MaterialTheme.typography.labelSmall.copy(color = Color.White, fontWeight = FontWeight.Bold)
                  )
                }
              }

              Text(
                text = "العنصر: ${rep.itemTitle}",
                style = MaterialTheme.typography.bodySmall.copy(fontWeight = FontWeight.SemiBold)
              )

              Text(
                text = rep.description,
                style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
              )

              if (rep.representativeNote.isNotBlank()) {
                Text(
                  text = "رد الممثل: ${rep.representativeNote}",
                  style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.primary, fontWeight = FontWeight.Bold)
                )
              }
            }
          }
        }
      }
    }
  }
}

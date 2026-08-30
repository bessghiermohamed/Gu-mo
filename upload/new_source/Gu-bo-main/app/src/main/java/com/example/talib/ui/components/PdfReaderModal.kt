package com.example.talib.ui.components

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.*
import androidx.compose.material.icons.outlined.*
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
import androidx.compose.ui.window.Dialog
import androidx.compose.ui.window.DialogProperties
import com.example.talib.data.local.Lecture

@Composable
fun PdfReaderModal(
  lecture: Lecture,
  onDismiss: () -> Unit,
  onToggleBookmark: (Lecture) -> Unit,
  onToggleDownload: (Lecture) -> Unit
) {
  var activeTab by remember { mutableStateOf(0) } // 0: ملخص ومحاور, 1: معاينة الملف PDF, 2: أسئلة للمراجعة

  Dialog(
    onDismissRequest = onDismiss,
    properties = DialogProperties(usePlatformDefaultWidth = false)
  ) {
    Surface(
      modifier = Modifier
        .fillMaxSize()
        .padding(top = 28.dp)
        .testTag("pdf_reader_modal"),
      shape = RoundedCornerShape(topStart = 28.dp, topEnd = 28.dp),
      color = MaterialTheme.colorScheme.surface,
      tonalElevation = 6.dp
    ) {
      Column(
        modifier = Modifier.fillMaxSize()
      ) {
        // Top Sheet Bar
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .padding(horizontal = 20.dp, vertical = 14.dp),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically
        ) {
          Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(8.dp)
          ) {
            IconButton(
              onClick = onDismiss,
              modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.surfaceVariant)
            ) {
              Icon(
                imageVector = Icons.Default.Close,
                contentDescription = "إغلاق",
                tint = MaterialTheme.colorScheme.onSurface
              )
            }

            Column {
              Text(
                text = "الأسبوع ${lecture.weekNumber} • محاضرة رقمية",
                style = MaterialTheme.typography.labelSmall.copy(
                  color = MaterialTheme.colorScheme.primary,
                  fontWeight = FontWeight.Bold
                )
              )
              Text(
                text = lecture.title,
                style = MaterialTheme.typography.titleMedium.copy(
                  fontWeight = FontWeight.Black,
                  fontSize = 16.sp
                ),
                maxLines = 1
              )
            }
          }

          Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
            IconButton(
              onClick = { onToggleBookmark(lecture) },
              modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f))
            ) {
              Icon(
                imageVector = if (lecture.isBookmarked) Icons.Filled.Bookmark else Icons.Outlined.BookmarkBorder,
                contentDescription = "حفظ",
                tint = MaterialTheme.colorScheme.primary
              )
            }

            IconButton(
              onClick = { onToggleDownload(lecture) },
              modifier = Modifier
                .size(40.dp)
                .clip(CircleShape)
                .background(if (lecture.isDownloaded) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant)
            ) {
              Icon(
                imageVector = if (lecture.isDownloaded) Icons.Filled.FileDownloadDone else Icons.Default.Download,
                contentDescription = "تحميل",
                tint = if (lecture.isDownloaded) Color.White else MaterialTheme.colorScheme.onSurface
              )
            }
          }
        }

        // Tab Row Selector
        TabRow(
          selectedTabIndex = activeTab,
          containerColor = MaterialTheme.colorScheme.surface,
          contentColor = MaterialTheme.colorScheme.primary
        ) {
          Tab(
            selected = activeTab == 0,
            onClick = { activeTab = 0 },
            text = { Text("المحاور والملخص", fontWeight = FontWeight.Bold) }
          )
          Tab(
            selected = activeTab == 1,
            onClick = { activeTab = 1 },
            text = { Text("معاينة صفحات PDF", fontWeight = FontWeight.Bold) }
          )
          Tab(
            selected = activeTab == 2,
            onClick = { activeTab = 2 },
            text = { Text("تطبيقات واختبار", fontWeight = FontWeight.Bold) }
          )
        }

        // Body Content
        LazyColumn(
          modifier = Modifier
            .fillMaxSize()
            .padding(16.dp),
          verticalArrangement = Arrangement.spacedBy(16.dp)
        ) {
          if (activeTab == 0) {
            // Lecture Info Card
            item {
              Card(
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.6f))
              ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                  Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                  ) {
                    Text(
                      text = "اسم الملف: ${lecture.pdfFileName}",
                      style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                    )
                    Text(
                      text = "المدة: ${lecture.durationMinutes} دقيقة",
                      style = MaterialTheme.typography.labelMedium.copy(color = MaterialTheme.colorScheme.primary)
                    )
                  }
                  HorizontalDivider(color = MaterialTheme.colorScheme.primary.copy(alpha = 0.2f))
                  Text(
                    text = "ملخص المحاضرة الأكاديمية:",
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
                  )
                  Text(
                    text = lecture.summary,
                    style = MaterialTheme.typography.bodyMedium.copy(lineHeight = 22.sp)
                  )
                }
              }
            }

            // Key Study Points
            item {
              Text(
                text = "النقاط الجوهرية ومخرجات التعلم:",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
              )
            }

            items(4) { idx ->
              val points = listOf(
                "التمييز الدقيق بين التغير الإعرابي اللفظي والتقديري والمحلي.",
                "شروط عمل النواسخ وأثرها التركيبي والدلالي في المعنى.",
                "القواعد الضابطة لرتب الكلمات في التراكيب الإسنادية.",
                "نماذج تطبيقية وشواهد إعرابية من أمهات كتب التراث اللغوي."
              )
              Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f))
              ) {
                Row(
                  modifier = Modifier.padding(14.dp),
                  verticalAlignment = Alignment.CenterVertically,
                  horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                  Box(
                    modifier = Modifier
                      .size(28.dp)
                      .clip(CircleShape)
                      .background(MaterialTheme.colorScheme.primary),
                    contentAlignment = Alignment.Center
                  ) {
                    Text(
                      text = "${idx + 1}",
                      style = MaterialTheme.typography.labelSmall.copy(color = Color.White, fontWeight = FontWeight.Bold)
                    )
                  }
                  Text(
                    text = points[idx % points.size],
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Medium)
                  )
                }
              }
            }
          } else if (activeTab == 1) {
            // PDF Visual Simulation Pages
            item {
              Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
              ) {
                Text(
                  text = "المستند الرقمي (وثيقة PDF كاملة)",
                  style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
                )
                AssistChip(
                  onClick = { onToggleDownload(lecture) },
                  label = { Text(if (lecture.isDownloaded) "محفوظ بدون إنترنت" else "تحميل للذاكرة") },
                  leadingIcon = {
                    Icon(
                      imageVector = if (lecture.isDownloaded) Icons.Default.CheckCircle else Icons.Default.Download,
                      contentDescription = null,
                      modifier = Modifier.size(16.dp)
                    )
                  }
                )
              }
            }

            items(3) { page ->
              Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                elevation = CardDefaults.cardElevation(defaultElevation = 4.dp),
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
                    horizontalArrangement = Arrangement.SpaceBetween
                  ) {
                    Text(
                      text = "جامعة الجزائر 1 • مطبوعة بيداغوجية",
                      style = MaterialTheme.typography.labelSmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
                    )
                    Text(
                      text = "الصفحة ${page + 1} من 3",
                      style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold, color = MaterialTheme.colorScheme.primary)
                    )
                  }
                  HorizontalDivider()
                  Text(
                    text = "العنوان: ${lecture.title}",
                    style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
                  )
                  Text(
                    text = when (page) {
                      0 -> "المبحث الأول: تحديد المفاهيم والأسس النظرية للمقياس، مع دراسة تفصيلية للأدلة الشاهدة والتطبيقات."
                      1 -> "المبحث الثاني: دراسة الحالات الخاصة والاستثناءات الواردة في كلام الفصحاء والتحليل الصرفي التركيبي."
                      else -> "المبحث الثالث: خلاصة واستنتاجات منهجية، تليها تمارين تطبيقية مقترحة للمراجعة والتحضير للامتحانات."
                    },
                    style = MaterialTheme.typography.bodyMedium.copy(lineHeight = 22.sp)
                  )
                }
              }
            }
          } else {
            // Self-Test / Quiz tab
            item {
              Text(
                text = "أسئلة تقييم الاستيعاب الذاتي:",
                style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
              )
            }

            items(2) { qIdx ->
              Card(
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.6f)),
                modifier = Modifier.fillMaxWidth()
              ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                  Text(
                    text = "سؤال ${qIdx + 1}: ${if (qIdx == 0) "ما هو الفارق الجوهري بين البناء الأصلي والبناء العارض؟" else "وضح حكم تقديم الخبر على المبتدأ وجوباً في ثلاث حالات مع الشاهد."}",
                    style = MaterialTheme.typography.bodyMedium.copy(fontWeight = FontWeight.Bold)
                  )
                  Text(
                    text = "💡 نصيحة الأستاذ: ركز على التعليل والاستشهاد بالقرآن والشعر العربي في الإجابة.",
                    style = MaterialTheme.typography.labelSmall.copy(color = MaterialTheme.colorScheme.primary)
                  )
                }
              }
            }
          }
        }
      }
    }
  }
}

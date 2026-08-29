package com.example.talib.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
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
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.talib.data.local.Lecture
import com.example.talib.ui.components.PdfReaderModal
import com.example.talib.ui.viewmodel.TalibViewModel

@Composable
fun LecturesScreen(
  viewModel: TalibViewModel
) {
  val lectures by viewModel.allLectures.collectAsStateWithLifecycle()
  val modules by viewModel.allModules.collectAsStateWithLifecycle()
  val selectedModule by viewModel.selectedModule.collectAsStateWithLifecycle()
  val activePdfLecture by viewModel.activePdfLecture.collectAsStateWithLifecycle()

  var selectedWeekFilter by remember { mutableStateOf<Int?>(null) }
  var searchQuery by remember { mutableStateOf("") }

  val filteredLectures = lectures.filter { lecture ->
    (selectedModule == null || lecture.moduleId == selectedModule?.id) &&
      (selectedWeekFilter == null || lecture.weekNumber == selectedWeekFilter) &&
      (searchQuery.isEmpty() || lecture.title.contains(searchQuery, ignoreCase = true) || lecture.summary.contains(searchQuery, ignoreCase = true))
  }

  // Active PDF Viewer modal
  activePdfLecture?.let { lecture ->
    PdfReaderModal(
      lecture = lecture,
      onDismiss = { viewModel.closePdfViewer() },
      onToggleBookmark = { viewModel.toggleBookmark(it) },
      onToggleDownload = { viewModel.toggleDownloaded(it) }
    )
  }

  LazyColumn(
    modifier = Modifier
      .fillMaxSize()
      .testTag("lectures_screen"),
    contentPadding = PaddingValues(bottom = 90.dp, top = 8.dp, start = 16.dp, end = 16.dp),
    verticalArrangement = Arrangement.spacedBy(14.dp)
  ) {
    // 1. Module Filter Header
    item {
      Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
        Row(
          modifier = Modifier.fillMaxWidth(),
          horizontalArrangement = Arrangement.SpaceBetween,
          verticalAlignment = Alignment.CenterVertically
        ) {
          Text(
            text = if (selectedModule != null) "محاضرات: ${selectedModule?.name}" else "جميع المحاضرات والملفات",
            style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
          )

          if (selectedModule != null) {
            TextButton(onClick = { viewModel.selectModule(null) }) {
              Text("عرض الكل")
            }
          }
        }

        // Module filter pills
        LazyRow(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
          item {
            FilterChip(
              selected = selectedModule == null,
              onClick = { viewModel.selectModule(null) },
              label = { Text("الكل (${lectures.size})") },
              shape = RoundedCornerShape(12.dp)
            )
          }
          items(modules) { mod ->
            FilterChip(
              selected = selectedModule?.id == mod.id,
              onClick = { viewModel.selectModule(mod) },
              label = { Text(mod.name, maxLines = 1) },
              shape = RoundedCornerShape(12.dp)
            )
          }
        }
      }
    }

    // 2. Search & Week Filters
    item {
      OutlinedTextField(
        value = searchQuery,
        onValueChange = { searchQuery = it },
        placeholder = { Text("ابحث في عناوين المحاضرات وملخصاتها...") },
        leadingIcon = { Icon(Icons.Default.Search, contentDescription = null) },
        shape = RoundedCornerShape(16.dp),
        modifier = Modifier.fillMaxWidth()
      )
    }

    item {
      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(8.dp),
        verticalAlignment = Alignment.CenterVertically
      ) {
        Text("تصفية بالأسبوع:", style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold))
        LazyRow(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
          item {
            FilterChip(
              selected = selectedWeekFilter == null,
              onClick = { selectedWeekFilter = null },
              label = { Text("جميع الأسابيع") },
              shape = RoundedCornerShape(10.dp)
            )
          }
          items(12) { idx ->
            val wk = idx + 1
            FilterChip(
              selected = selectedWeekFilter == wk,
              onClick = { selectedWeekFilter = if (selectedWeekFilter == wk) null else wk },
              label = { Text("الأسبوع $wk") },
              shape = RoundedCornerShape(10.dp)
            )
          }
        }
      }
    }

    // 3. Lecture List
    if (filteredLectures.isEmpty()) {
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
              imageVector = Icons.Default.Description,
              contentDescription = null,
              tint = MaterialTheme.colorScheme.onSurfaceVariant,
              modifier = Modifier.size(48.dp)
            )
            Text(
              text = "لم يتم العثور على محاضرات",
              style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
            )
            Text(
              text = "يمكنك إضافة محاضرات جديدة مع ملفات الـ PDF عبر لوحة الإدارة.",
              style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
            )
          }
        }
      }
    } else {
      items(filteredLectures, key = { it.id }) { lecture ->
        val mod = modules.find { it.id == lecture.moduleId }
        LectureCardItem(
          lecture = lecture,
          moduleName = mod?.name ?: "مقياس دراسي",
          onOpenPdf = { viewModel.openPdfViewer(lecture) },
          onToggleBookmark = { viewModel.toggleBookmark(lecture) },
          onToggleDownload = { viewModel.toggleDownloaded(lecture) },
          onToggleRead = { viewModel.toggleLectureRead(lecture) }
        )
      }
    }
  }
}

@Composable
fun LectureCardItem(
  lecture: Lecture,
  moduleName: String,
  onOpenPdf: () -> Unit,
  onToggleBookmark: () -> Unit,
  onToggleDownload: () -> Unit,
  onToggleRead: () -> Unit
) {
  Card(
    shape = RoundedCornerShape(20.dp),
    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
    elevation = CardDefaults.cardElevation(defaultElevation = 3.dp),
    modifier = Modifier
      .fillMaxWidth()
      .clickable(onClick = onOpenPdf)
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
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          Box(
            modifier = Modifier
              .clip(RoundedCornerShape(8.dp))
              .background(MaterialTheme.colorScheme.primaryContainer)
              .padding(horizontal = 8.dp, vertical = 3.dp)
          ) {
            Text(
              text = "الأسبوع ${lecture.weekNumber}",
              style = MaterialTheme.typography.labelSmall.copy(
                color = MaterialTheme.colorScheme.primary,
                fontWeight = FontWeight.Bold
              )
            )
          }

          if (!lecture.isRead) {
            Box(
              modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(Color(0xFF10B981))
                .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
              Text(
                text = "جديد",
                style = MaterialTheme.typography.labelSmall.copy(
                  color = Color.White,
                  fontWeight = FontWeight.Bold,
                  fontSize = 10.sp
                )
              )
            }
          }

          Text(
            text = moduleName,
            style = MaterialTheme.typography.labelSmall.copy(
              fontWeight = FontWeight.Bold,
              color = MaterialTheme.colorScheme.onSurfaceVariant
            ),
            maxLines = 1,
            overflow = TextOverflow.Ellipsis
          )

          if (lecture.isCachedOffline || lecture.lastViewedTimestamp > 0) {
            Box(
              modifier = Modifier
                .clip(RoundedCornerShape(8.dp))
                .background(Color(0xFF10B981).copy(alpha = 0.15f))
                .padding(horizontal = 6.dp, vertical = 2.dp)
            ) {
              Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(3.dp)
              ) {
                Icon(
                  imageVector = Icons.Default.OfflinePin,
                  contentDescription = null,
                  tint = Color(0xFF10B981),
                  modifier = Modifier.size(12.dp)
                )
                Text(
                  text = "أوفلاين",
                  style = MaterialTheme.typography.labelSmall.copy(
                    color = Color(0xFF10B981),
                    fontWeight = FontWeight.Bold,
                    fontSize = 10.sp
                  )
                )
              }
            }
          }
        }

        Row(horizontalArrangement = Arrangement.spacedBy(4.dp)) {
          IconButton(onClick = onToggleRead, modifier = Modifier.size(36.dp)) {
            Icon(
              imageVector = if (lecture.isRead) Icons.Default.DoneAll else Icons.Outlined.CheckCircle,
              contentDescription = if (lecture.isRead) "تمت قراءتها" else "تعليم كمقروءة",
              tint = if (lecture.isRead) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.6f),
              modifier = Modifier.size(18.dp)
            )
          }

          IconButton(onClick = onToggleBookmark, modifier = Modifier.size(36.dp)) {
            Icon(
              imageVector = if (lecture.isBookmarked) Icons.Filled.Bookmark else Icons.Outlined.BookmarkBorder,
              contentDescription = "حفظ",
              tint = MaterialTheme.colorScheme.primary,
              modifier = Modifier.size(20.dp)
            )
          }

          IconButton(onClick = onToggleDownload, modifier = Modifier.size(36.dp)) {
            Icon(
              imageVector = if (lecture.isDownloaded) Icons.Filled.FileDownloadDone else Icons.Default.Download,
              contentDescription = "تحميل",
              tint = if (lecture.isDownloaded) Color(0xFF10B981) else MaterialTheme.colorScheme.onSurfaceVariant,
              modifier = Modifier.size(20.dp)
            )
          }
        }
      }

      Text(
        text = lecture.title,
        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black, fontSize = 16.sp)
      )

      Text(
        text = lecture.summary,
        style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant),
        maxLines = 2,
        overflow = TextOverflow.Ellipsis,
        lineHeight = 20.sp
      )

      HorizontalDivider(color = MaterialTheme.colorScheme.outline.copy(alpha = 0.3f))

      Row(
        modifier = Modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
      ) {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
          Icon(
            imageVector = Icons.Default.PictureAsPdf,
            contentDescription = null,
            tint = Color(0xFFEF4444),
            modifier = Modifier.size(16.dp)
          )
          Text(
            text = lecture.pdfFileName,
            style = MaterialTheme.typography.labelSmall.copy(fontWeight = FontWeight.Bold)
          )
        }

        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(4.dp)
        ) {
          Icon(
            imageVector = Icons.Default.Timer,
            contentDescription = null,
            tint = MaterialTheme.colorScheme.onSurfaceVariant,
            modifier = Modifier.size(14.dp)
          )
          Text(
            text = "${lecture.durationMinutes} دقيقة",
            style = MaterialTheme.typography.labelSmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
          )
        }
      }
    }
  }
}

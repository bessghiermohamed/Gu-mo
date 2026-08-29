package com.example.talib.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.*
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
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.example.talib.data.local.CachedCourseMaterial
import com.example.talib.data.local.Lecture
import com.example.talib.ui.components.PdfReaderModal
import com.example.talib.ui.viewmodel.ScreenRoute
import com.example.talib.ui.viewmodel.TalibViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun OfflineVaultScreen(
  viewModel: TalibViewModel,
  onNavigateBack: () -> Unit
) {
  val isOfflineMode by viewModel.isOfflineMode.collectAsStateWithLifecycle()
  val cachedMaterials by viewModel.allCachedMaterials.collectAsStateWithLifecycle()
  val viewedLectures by viewModel.previouslyViewedLectures.collectAsStateWithLifecycle()
  val viewedModules by viewModel.previouslyViewedModules.collectAsStateWithLifecycle()
  val selectedMaterial by viewModel.selectedCachedMaterial.collectAsStateWithLifecycle()
  val activePdfLecture by viewModel.activePdfLecture.collectAsStateWithLifecycle()

  // Active PDF Viewer modal for viewed lectures
  activePdfLecture?.let { lecture ->
    PdfReaderModal(
      lecture = lecture,
      onDismiss = { viewModel.closePdfViewer() },
      onToggleBookmark = { viewModel.toggleBookmark(it) },
      onToggleDownload = { viewModel.toggleDownloaded(it) }
    )
  }

  // Material Detail Modal for cached materials
  selectedMaterial?.let { material ->
    AlertDialog(
      onDismissRequest = { viewModel.closeCachedMaterial() },
      confirmButton = {
        Button(
          onClick = { viewModel.closeCachedMaterial() },
          shape = RoundedCornerShape(12.dp)
        ) {
          Text("إغلاق")
        }
      },
      title = {
        Row(
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(8.dp)
        ) {
          Box(
            modifier = Modifier
              .size(36.dp)
              .clip(CircleShape)
              .background(MaterialTheme.colorScheme.primaryContainer),
            contentAlignment = Alignment.Center
          ) {
            Icon(
              imageVector = Icons.Default.OfflinePin,
              contentDescription = null,
              tint = MaterialTheme.colorScheme.primary,
              modifier = Modifier.size(20.dp)
            )
          }
          Column {
            Text(
              text = material.title,
              style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
            )
            Text(
              text = "${material.moduleName} • ${material.materialType}",
              style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
            )
          }
        }
      },
      text = {
        LazyColumn(
          modifier = Modifier.fillMaxWidth(),
          verticalArrangement = Arrangement.spacedBy(10.dp)
        ) {
          item {
            Card(
              shape = RoundedCornerShape(12.dp),
              colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.5f)
              )
            ) {
              Column(modifier = Modifier.padding(12.dp)) {
                Text(
                  text = "الملخص الأكاديمي:",
                  style = MaterialTheme.typography.labelMedium.copy(fontWeight = FontWeight.Bold)
                )
                Text(
                  text = material.summary,
                  style = MaterialTheme.typography.bodyMedium
                )
              }
            }
          }

          item {
            Text(
              text = "المحتوى الكامل المخزن في الذاكرة (Room DB):",
              style = MaterialTheme.typography.titleSmall.copy(
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.primary
              )
            )
            Surface(
              shape = RoundedCornerShape(12.dp),
              color = MaterialTheme.colorScheme.surface,
              tonalElevation = 2.dp,
              modifier = Modifier.padding(top = 4.dp)
            ) {
              Text(
                text = material.fullText,
                style = MaterialTheme.typography.bodyMedium.copy(lineHeight = 22.sp),
                modifier = Modifier.padding(12.dp)
              )
            }
          }

          if (material.keyConcepts.isNotEmpty()) {
            item {
              Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
              ) {
                Icon(
                  imageVector = Icons.Default.Key,
                  contentDescription = null,
                  tint = MaterialTheme.colorScheme.tertiary,
                  modifier = Modifier.size(16.dp)
                )
                Text(
                  text = "المفاهيم المحورية: ${material.keyConcepts}",
                  style = MaterialTheme.typography.bodySmall.copy(
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.tertiary
                  )
                )
              }
            }
          }
        }
      },
      shape = RoundedCornerShape(20.dp)
    )
  }

  Scaffold(
    topBar = {
      Surface(
        modifier = Modifier.fillMaxWidth(),
        color = MaterialTheme.colorScheme.surface,
        tonalElevation = 3.dp,
        shadowElevation = 4.dp
      ) {
        Row(
          modifier = Modifier
            .fillMaxWidth()
            .statusBarsPadding()
            .padding(horizontal = 12.dp, vertical = 10.dp),
          verticalAlignment = Alignment.CenterVertically
        ) {
          IconButton(
            onClick = onNavigateBack,
            modifier = Modifier.testTag("offline_back_button")
          ) {
            Icon(
              imageVector = Icons.AutoMirrored.Filled.ArrowBack,
              contentDescription = "رجوع"
            )
          }

          Column(modifier = Modifier.weight(1f)) {
            Text(
              text = "المحتوى المحفوظ بدون إنترنت",
              style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
            )
            Text(
              text = "مخزن محلياً في Room Database للوصول 24/7",
              style = MaterialTheme.typography.bodySmall.copy(
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                fontSize = 11.sp
              )
            )
          }

          // Offline mode switch toggle
          Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(6.dp)
          ) {
            Text(
              text = if (isOfflineMode) "وضع غير متصل" else "متصل",
              style = MaterialTheme.typography.labelSmall.copy(
                fontWeight = FontWeight.Bold,
                color = if (isOfflineMode) Color(0xFFD97706) else MaterialTheme.colorScheme.primary
              )
            )
            Switch(
              checked = isOfflineMode,
              onCheckedChange = { viewModel.toggleOfflineMode() },
              modifier = Modifier.testTag("toggle_offline_mode_switch")
            )
          }
        }
      }
    }
  ) { paddingValues ->
    LazyColumn(
      modifier = Modifier
        .fillMaxSize()
        .padding(paddingValues)
        .padding(horizontal = 16.dp)
        .testTag("offline_vault_list"),
      contentPadding = PaddingValues(top = 12.dp, bottom = 90.dp),
      verticalArrangement = Arrangement.spacedBy(16.dp)
    ) {
      // 1. Status Info Banner
      item {
        Card(
          shape = RoundedCornerShape(16.dp),
          colors = CardDefaults.cardColors(
            containerColor = if (isOfflineMode)
              Color(0xFFFEF3C7)
            else
              MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.4f)
          ),
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
                .background(if (isOfflineMode) Color(0xFFF59E0B) else MaterialTheme.colorScheme.primary),
              contentAlignment = Alignment.Center
            ) {
              Icon(
                imageVector = if (isOfflineMode) Icons.Default.WifiOff else Icons.Default.CloudDone,
                contentDescription = null,
                tint = Color.White,
                modifier = Modifier.size(22.dp)
              )
            }

            Column(modifier = Modifier.weight(1f)) {
              Text(
                text = if (isOfflineMode) "العمل في وضع عدم الاتصال (Offline)" else "مزامنة الذاكرة المؤقتة نشطة",
                style = MaterialTheme.typography.titleSmall.copy(
                  fontWeight = FontWeight.Bold,
                  color = if (isOfflineMode) Color(0xFF92400E) else MaterialTheme.colorScheme.onPrimaryContainer
                )
              )
              Text(
                text = "جميع المحاضرات والمقاييس والملخصات التي قمت بعرضها تم حفظها محلياً في الـ SQLite Room Cache، ويمكنك دراستها في أي وقت دون استهلاك بيانات.",
                style = MaterialTheme.typography.bodySmall.copy(
                  color = if (isOfflineMode) Color(0xFF78350F) else MaterialTheme.colorScheme.onSurfaceVariant
                )
              )
            }
          }
        }
      }

      // 2. Previously Viewed Lectures Section
      item {
        Text(
          text = "محاضرات تم عرضها مؤخراً (${viewedLectures.size})",
          style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
        )
      }

      if (viewedLectures.isEmpty()) {
        item {
          Card(
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f)),
            modifier = Modifier.fillMaxWidth()
          ) {
            Text(
              text = "لم تقم بفتح أي محاضرات بعد. عند قراءة أي محاضرة، ستظهر تلقائياً هنا في الذاكرة المؤقتة.",
              modifier = Modifier.padding(14.dp),
              style = MaterialTheme.typography.bodySmall
            )
          }
        }
      } else {
        items(viewedLectures) { lecture ->
          Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
            modifier = Modifier
              .fillMaxWidth()
              .clickable { viewModel.openPdfViewer(lecture) }
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
                  .background(MaterialTheme.colorScheme.primaryContainer),
                contentAlignment = Alignment.Center
              ) {
                Icon(
                  imageVector = Icons.Default.Description,
                  contentDescription = null,
                  tint = MaterialTheme.colorScheme.primary
                )
              }

              Column(modifier = Modifier.weight(1f)) {
                Text(
                  text = lecture.title,
                  style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
                )
                Text(
                  text = "الأسبوع ${lecture.weekNumber} • ${lecture.durationMinutes} دقيقة • مخزنة محلياً",
                  style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
                )
                if (lecture.cachedContentText.isNotEmpty()) {
                  Text(
                    text = lecture.cachedContentText.take(65) + "...",
                    style = MaterialTheme.typography.labelSmall.copy(color = MaterialTheme.colorScheme.primary)
                  )
                }
              }

              Icon(
                imageVector = Icons.Default.OfflinePin,
                contentDescription = "محفوظ محلياً",
                tint = Color(0xFF10B981),
                modifier = Modifier.size(22.dp)
              )
            }
          }
        }
      }

      // 3. Cached Offline Study Materials (Summaries & TD Sheets)
      item {
        Text(
          text = "ملخصات وأعمال موجهة مخزنة (${cachedMaterials.size})",
          style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Black)
        )
      }

      items(cachedMaterials) { material ->
        Card(
          shape = RoundedCornerShape(16.dp),
          colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
          elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
          modifier = Modifier
            .fillMaxWidth()
            .clickable { viewModel.openCachedMaterial(material) }
        ) {
          Column(modifier = Modifier.padding(14.dp)) {
            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically
            ) {
              Box(
                modifier = Modifier
                  .clip(RoundedCornerShape(8.dp))
                  .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.12f))
                  .padding(horizontal = 8.dp, vertical = 4.dp)
              ) {
                Text(
                  text = material.materialType,
                  style = MaterialTheme.typography.labelSmall.copy(
                    color = MaterialTheme.colorScheme.primary,
                    fontWeight = FontWeight.Bold
                  )
                )
              }

              Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
              ) {
                Icon(
                  imageVector = Icons.Default.CheckCircle,
                  contentDescription = null,
                  tint = Color(0xFF10B981),
                  modifier = Modifier.size(16.dp)
                )
                Text(
                  text = material.cachedDate,
                  style = MaterialTheme.typography.labelSmall.copy(
                    color = Color(0xFF10B981),
                    fontWeight = FontWeight.Bold
                  )
                )
              }
            }

            Spacer(modifier = Modifier.height(8.dp))

            Text(
              text = material.title,
              style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
            )

            Text(
              text = "${material.moduleName} • الأسبوع ${material.weekNumber}",
              style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
            )

            Spacer(modifier = Modifier.height(4.dp))

            Text(
              text = material.summary,
              style = MaterialTheme.typography.bodySmall,
              maxLines = 2
            )

            Spacer(modifier = Modifier.height(8.dp))

            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.End
            ) {
              TextButton(
                onClick = { viewModel.openCachedMaterial(material) },
                contentPadding = PaddingValues(horizontal = 8.dp, vertical = 0.dp)
              ) {
                Text("قراءة المحتوى كاملاً")
                Spacer(modifier = Modifier.width(4.dp))
                Icon(Icons.AutoMirrored.Filled.MenuBook, contentDescription = null, modifier = Modifier.size(16.dp))
              }
            }
          }
        }
      }
    }
  }
}

package com.example.talib.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.ArrowBack
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
import com.example.talib.data.local.CachedCourseMaterial
import com.example.talib.data.local.Lecture
import com.example.talib.data.local.StudentNote
import com.example.talib.ui.viewmodel.ScreenRoute
import com.example.talib.ui.viewmodel.TalibViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun MyFilesScreen(
  viewModel: TalibViewModel,
  onNavigate: (ScreenRoute) -> Unit
) {
  val bookmarkedLectures by viewModel.bookmarkedLectures.collectAsStateWithLifecycle()
  val cachedMaterials by viewModel.allCachedMaterials.collectAsStateWithLifecycle()
  val studentNotes by viewModel.allNotes.collectAsStateWithLifecycle()
  val isOfflineMode by viewModel.isOfflineMode.collectAsStateWithLifecycle()

  var selectedTab by remember { mutableIntStateOf(0) }
  val tabs = listOf("المحفوظات (${bookmarkedLectures.size})", "المخزن أوفلاين (${cachedMaterials.size})", "ملاحظاتي (${studentNotes.size})")

  var showAddNoteDialog by remember { mutableStateOf(false) }

  // Add Note Dialog
  if (showAddNoteDialog) {
    var noteTitle by remember { mutableStateOf("") }
    var noteContent by remember { mutableStateOf("") }
    var noteModule by remember { mutableStateOf("النحو العربي ومسائله") }

    AlertDialog(
      onDismissRequest = { showAddNoteDialog = false },
      title = { Text("إضافة ملاحظة أكاديمية جديدة", fontWeight = FontWeight.Bold) },
      text = {
        Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
          OutlinedTextField(
            value = noteTitle,
            onValueChange = { noteTitle = it },
            label = { Text("عنوان الملاحظة") },
            modifier = Modifier.fillMaxWidth()
          )
          OutlinedTextField(
            value = noteModule,
            onValueChange = { noteModule = it },
            label = { Text("المقياس الدراسي المرتبط") },
            modifier = Modifier.fillMaxWidth()
          )
          OutlinedTextField(
            value = noteContent,
            onValueChange = { noteContent = it },
            label = { Text("نص الملاحظة أو التلخيص") },
            minLines = 3,
            maxLines = 5,
            modifier = Modifier.fillMaxWidth()
          )
        }
      },
      confirmButton = {
        Button(
          onClick = {
            if (noteTitle.isNotBlank()) {
              viewModel.addNote(
                title = noteTitle,
                content = noteContent,
                moduleName = noteModule
              )
              showAddNoteDialog = false
            }
          }
        ) {
          Text("حفظ الملاحظة")
        }
      },
      dismissButton = {
        TextButton(onClick = { showAddNoteDialog = false }) {
          Text("إلغاء")
        }
      }
    )
  }

  Scaffold(
    topBar = {
      TopAppBar(
        title = {
          Column {
            Text(
              text = "ملفاتي ومحفوظاتي الأكاديمية",
              style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
            )
            Text(
              text = "المحفوظات، التحميلات بدون إنترنت، والملاحظات الشخصية",
              style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
            )
          }
        },
        navigationIcon = {
          IconButton(onClick = { onNavigate(ScreenRoute.HOME) }) {
            Icon(Icons.AutoMirrored.Filled.ArrowBack, contentDescription = "رجوع")
          }
        },
        actions = {
          if (selectedTab == 2) {
            IconButton(onClick = { showAddNoteDialog = true }) {
              Icon(Icons.Default.Add, contentDescription = "إضافة ملاحظة", tint = MaterialTheme.colorScheme.primary)
            }
          }
        }
      )
    },
    floatingActionButton = {
      if (selectedTab == 2) {
        ExtendedFloatingActionButton(
          onClick = { showAddNoteDialog = true },
          icon = { Icon(Icons.Default.Add, contentDescription = null) },
          text = { Text("ملاحظة جديدة") },
          modifier = Modifier.testTag("add_note_fab")
        )
      }
    }
  ) { padding ->
    Column(
      modifier = Modifier
        .fillMaxSize()
        .padding(padding)
        .testTag("my_files_screen")
    ) {
      // Tab Row
      TabRow(
        selectedTabIndex = selectedTab,
        containerColor = MaterialTheme.colorScheme.surface,
        modifier = Modifier.fillMaxWidth()
      ) {
        tabs.forEachIndexed { index, title ->
          Tab(
            selected = selectedTab == index,
            onClick = { selectedTab = index },
            text = {
              Text(
                text = title,
                fontWeight = if (selectedTab == index) FontWeight.Bold else FontWeight.Normal
              )
            }
          )
        }
      }

      // Tab Content
      when (selectedTab) {
        0 -> BookmarksSection(bookmarkedLectures, viewModel, onNavigate)
        1 -> OfflineCacheSection(cachedMaterials, isOfflineMode, viewModel, onNavigate)
        2 -> NotesSection(studentNotes, viewModel)
      }
    }
  }
}

@Composable
private fun BookmarksSection(
  lectures: List<Lecture>,
  viewModel: TalibViewModel,
  onNavigate: (ScreenRoute) -> Unit
) {
  if (lectures.isEmpty()) {
    EmptySectionPlaceholder(
      icon = Icons.Outlined.BookmarkBorder,
      title = "لا توجد محاضرات محفوظة في المفضلة",
      subtitle = "يمكنك حفظ المحاضرات المهمة للرجوع إليها بسرعة بالضغط على أيقونة الإشارة المرجعية."
    )
  } else {
    LazyColumn(
      contentPadding = PaddingValues(16.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      items(lectures, key = { it.id }) { lecture ->
        Card(
          shape = RoundedCornerShape(16.dp),
          colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
          elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
          modifier = Modifier
            .fillMaxWidth()
            .clickable { viewModel.openPdfViewer(lecture) }
        ) {
          Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically
            ) {
              Box(
                modifier = Modifier
                  .clip(RoundedCornerShape(8.dp))
                  .background(MaterialTheme.colorScheme.primaryContainer)
                  .padding(horizontal = 8.dp, vertical = 4.dp)
              ) {
                Text(
                  text = "الأسبوع ${lecture.weekNumber}",
                  style = MaterialTheme.typography.labelSmall.copy(
                    color = MaterialTheme.colorScheme.onPrimaryContainer,
                    fontWeight = FontWeight.Bold
                  )
                )
              }

              IconButton(
                onClick = { viewModel.toggleBookmark(lecture) },
                modifier = Modifier.size(28.dp)
              ) {
                Icon(
                  imageVector = Icons.Filled.Bookmark,
                  contentDescription = "إلغاء الحفظ",
                  tint = MaterialTheme.colorScheme.primary
                )
              }
            }

            Text(
              text = lecture.title,
              style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
            )

            Text(
              text = lecture.summary,
              style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant),
              maxLines = 2,
              overflow = TextOverflow.Ellipsis
            )

            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically
            ) {
              Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
              ) {
                Icon(Icons.Default.PictureAsPdf, contentDescription = null, tint = Color(0xFFDC2626), modifier = Modifier.size(16.dp))
                Text(lecture.pdfFileName, style = MaterialTheme.typography.labelSmall)
              }

              TextButton(onClick = { viewModel.openPdfViewer(lecture) }) {
                Text("قراءة المحاضرة")
              }
            }
          }
        }
      }
    }
  }
}

@Composable
private fun OfflineCacheSection(
  materials: List<CachedCourseMaterial>,
  isOfflineMode: Boolean,
  viewModel: TalibViewModel,
  onNavigate: (ScreenRoute) -> Unit
) {
  LazyColumn(
    contentPadding = PaddingValues(16.dp),
    verticalArrangement = Arrangement.spacedBy(12.dp)
  ) {
    item {
      Card(
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
          containerColor = if (isOfflineMode) Color(0xFFFEF3C7) else MaterialTheme.colorScheme.surfaceVariant
        ),
        modifier = Modifier.fillMaxWidth()
      ) {
        Row(
          modifier = Modifier.padding(14.dp),
          verticalAlignment = Alignment.CenterVertically,
          horizontalArrangement = Arrangement.spacedBy(12.dp)
        ) {
          Icon(
            imageVector = if (isOfflineMode) Icons.Default.WifiOff else Icons.Default.Wifi,
            contentDescription = null,
            tint = if (isOfflineMode) Color(0xFFD97706) else MaterialTheme.colorScheme.primary,
            modifier = Modifier.size(24.dp)
          )
          Column(modifier = Modifier.weight(1f)) {
            Text(
              text = if (isOfflineMode) "أنت حالياً في وضع عدم الاتصال" else "وضع الاتصال بالإنترنت نشط",
              style = MaterialTheme.typography.titleSmall.copy(fontWeight = FontWeight.Bold)
            )
            Text(
              text = "جميع الملفات أدناه مخزنة محلياً في الذاكرة (Room DB) ومتاحة للقراءة بدون شبكة.",
              style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
            )
          }
          Switch(
            checked = isOfflineMode,
            onCheckedChange = { viewModel.toggleOfflineMode() }
          )
        }
      }
    }

    if (materials.isEmpty()) {
      item {
        EmptySectionPlaceholder(
          icon = Icons.Outlined.CloudDownload,
          title = "لا توجد ملخصات مخزنة محلياً",
          subtitle = "افتح المحاضرات من شاشة المقررات ليتم حفظها تلقائياً للاستعمال دون إنترنت."
        )
      }
    } else {
      items(materials, key = { it.id }) { mat ->
        Card(
          shape = RoundedCornerShape(16.dp),
          colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
          elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
          modifier = Modifier
            .fillMaxWidth()
            .clickable { viewModel.openCachedMaterial(mat) }
        ) {
          Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically
            ) {
              Box(
                modifier = Modifier
                  .clip(RoundedCornerShape(6.dp))
                  .background(Color(0xFF10B981).copy(alpha = 0.15f))
                  .padding(horizontal = 8.dp, vertical = 4.dp)
              ) {
                Text(
                  text = "مخزن محلياً ✓",
                  style = MaterialTheme.typography.labelSmall.copy(
                    color = Color(0xFF047857),
                    fontWeight = FontWeight.Bold
                  )
                )
              }

              Text(
                text = mat.moduleName,
                style = MaterialTheme.typography.labelSmall.copy(
                  color = MaterialTheme.colorScheme.primary,
                  fontWeight = FontWeight.Bold
                )
              )
            }

            Text(
              text = mat.title,
              style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
            )

            Text(
              text = mat.summary,
              style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant),
              maxLines = 2,
              overflow = TextOverflow.Ellipsis
            )

            Row(
              modifier = Modifier.fillMaxWidth(),
              horizontalArrangement = Arrangement.SpaceBetween,
              verticalAlignment = Alignment.CenterVertically
            ) {
              Text(
                text = "جاهز للقراءة بدون نت",
                style = MaterialTheme.typography.labelSmall.copy(color = Color(0xFF047857))
              )

              Button(
                onClick = { viewModel.openCachedMaterial(mat) },
                shape = RoundedCornerShape(8.dp),
                contentPadding = PaddingValues(horizontal = 12.dp, vertical = 4.dp)
              ) {
                Text("قراءة النص كاملاً", style = MaterialTheme.typography.labelSmall)
              }
            }
          }
        }
      }
    }
  }
}

@Composable
private fun NotesSection(
  notes: List<StudentNote>,
  viewModel: TalibViewModel
) {
  if (notes.isEmpty()) {
    EmptySectionPlaceholder(
      icon = Icons.Outlined.EditNote,
      title = "دفتر الملاحظات فارغ",
      subtitle = "سجل ملاحظاتك، أسئلتك للأستاذ، ونقاط المراجعة المهمة هنا."
    )
  } else {
    LazyColumn(
      contentPadding = PaddingValues(16.dp),
      verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
      items(notes, key = { it.id }) { note ->
        Card(
          shape = RoundedCornerShape(16.dp),
          colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
          elevation = CardDefaults.cardElevation(defaultElevation = 2.dp),
          modifier = Modifier.fillMaxWidth()
        ) {
          Column(
            modifier = Modifier.padding(16.dp),
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
                  .background(MaterialTheme.colorScheme.secondaryContainer)
                  .padding(horizontal = 8.dp, vertical = 4.dp)
              ) {
                Text(
                  text = note.moduleName,
                  style = MaterialTheme.typography.labelSmall.copy(
                    color = MaterialTheme.colorScheme.onSecondaryContainer,
                    fontWeight = FontWeight.Bold
                  )
                )
              }

              IconButton(
                onClick = { viewModel.deleteNote(note) },
                modifier = Modifier.size(24.dp)
              ) {
                Icon(
                  Icons.Default.DeleteOutline,
                  contentDescription = "حذف الملاحظة",
                  tint = MaterialTheme.colorScheme.error,
                  modifier = Modifier.size(18.dp)
                )
              }
            }

            Text(
              text = note.title,
              style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
            )

            Text(
              text = note.content,
              style = MaterialTheme.typography.bodyMedium
            )

            Text(
              text = note.createdAt,
              style = MaterialTheme.typography.labelSmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant)
            )
          }
        }
      }
    }
  }
}

@Composable
private fun EmptySectionPlaceholder(
  icon: androidx.compose.ui.graphics.vector.ImageVector,
  title: String,
  subtitle: String
) {
  Box(
    modifier = Modifier
      .fillMaxSize()
      .padding(32.dp),
    contentAlignment = Alignment.Center
  ) {
    Column(
      horizontalAlignment = Alignment.CenterHorizontally,
      verticalArrangement = Arrangement.spacedBy(10.dp)
    ) {
      Box(
        modifier = Modifier
          .size(64.dp)
          .clip(CircleShape)
          .background(MaterialTheme.colorScheme.primary.copy(alpha = 0.1f)),
        contentAlignment = Alignment.Center
      ) {
        Icon(
          imageVector = icon,
          contentDescription = null,
          tint = MaterialTheme.colorScheme.primary,
          modifier = Modifier.size(32.dp)
        )
      }

      Text(
        text = title,
        style = MaterialTheme.typography.titleMedium.copy(fontWeight = FontWeight.Bold)
      )

      Text(
        text = subtitle,
        style = MaterialTheme.typography.bodySmall.copy(color = MaterialTheme.colorScheme.onSurfaceVariant),
        textAlign = androidx.compose.ui.text.style.TextAlign.Center
      )
    }
  }
}
